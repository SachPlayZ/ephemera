#!/usr/bin/env tsx
/**
 * Deploy the E-PoH Compact contract to the local Midnight network.
 *
 * Flow:
 *   1. Initialize the genesis (master) wallet — holds all minted NIGHT tokens
 *   2. Register DUST for the genesis wallet
 *   3. Deploy the E-PoH Compact contract using the genesis wallet
 *
 * Usage:
 *   pnpm --filter backend exec tsx src/scripts/deploy.ts
 *
 * Requires: docker compose up -d (Midnight node, indexer, proof server)
 */

import * as ledger from "@midnight-ntwrk/ledger-v8";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import {
  type DefaultConfiguration,
  WalletFacade,
} from "@midnight-ntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey as UnshieldedPublicKey,
  type UnshieldedKeystore,
  UnshieldedWallet,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import {
  createConstructorContext,
  sampleSigningKey,
  signatureVerifyingKey,
  signData,
} from "@midnight-ntwrk/compact-runtime";
import * as Rx from "rxjs";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { WebSocket } from "ws";
import { randomBytes } from "crypto";

import {
  Contract,
  type Witnesses,
} from "../../../contracts/managed/epoh_badge/contract/index.js";

// @ts-expect-error: Needed for apollo client used by wallet SDK
globalThis.WebSocket = WebSocket;

// ── Configuration ──────────────────────────────────────────────

const NETWORK_ID = "undeployed";
const NODE_URL = process.env.MIDNIGHT_NODE_URL ?? "http://127.0.0.1:9944";
const INDEXER_URL = process.env.MIDNIGHT_INDEXER_URL ?? "http://127.0.0.1:8088/api/v3/graphql";
const INDEXER_WS = process.env.MIDNIGHT_INDEXER_WS ?? "ws://127.0.0.1:8088/api/v3/graphql/ws";
const PROOF_SERVER = process.env.MIDNIGHT_PROOF_SERVER ?? "http://127.0.0.1:6300";

// Genesis master wallet — seed from midnight-local-dev (holds all minted NIGHT tokens)
const GENESIS_SEED = Buffer.from(
  "0000000000000000000000000000000000000000000000000000000000000001",
  "hex"
);

// ── Wallet helpers ──────────────────────────────────────────────

interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

function makeConfig(): DefaultConfiguration {
  return {
    networkId: NETWORK_ID,
    indexerClientConnection: {
      indexerHttpUrl: INDEXER_URL,
      indexerWsUrl: INDEXER_WS,
    },
    provingServerUrl: new URL(PROOF_SERVER),
    relayURL: new URL(NODE_URL.replace(/^http/, "ws")),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
  };
}

async function initWallet(seed: Buffer): Promise<WalletContext> {
  const hdWallet = HDWallet.fromSeed(seed);
  if (hdWallet.type !== "seedOk") throw new Error("Failed to init HDWallet");

  const derivation = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derivation.type !== "keysDerived") throw new Error("Failed to derive keys");
  hdWallet.hdWallet.clear();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derivation.keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derivation.keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(derivation.keys[Roles.NightExternal], NETWORK_ID);

  const facade = await WalletFacade.init({
    configuration: makeConfig(),
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(UnshieldedPublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await facade.start(shieldedSecretKeys, dustSecretKey);

  return { wallet: facade, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

async function waitForSync(wallet: WalletFacade): Promise<void> {
  await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.tap((s) => console.log(`  Sync status: ${s.isSynced ? "synced" : "syncing..."}`)),
      Rx.filter((s) => s.isSynced),
    )
  );
}

async function getBalance(wallet: WalletFacade): Promise<{ night: bigint; dust: bigint }> {
  const state = await Rx.firstValueFrom(wallet.state());
  const night = (state.unshielded?.balances[ledger.nativeToken().raw] ?? 0n) +
                (state.shielded?.balances[ledger.nativeToken().raw] ?? 0n);
  const dust = state.dust?.balance(new Date()) ?? 0n;
  return { night, dust };
}

// ── Contract deployment ────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_DIR = resolve(__dirname, "../../../contracts/managed/epoh_badge/keys");

function readVerifierKey(circuit: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(KEYS_DIR, `${circuit}.verifier`)));
}

interface EPoHPrivateState {
  ownerSecretKey: Uint8Array;
  issuerSecretKey: Uint8Array;
}

async function deployContract(
  ctx: WalletContext,
  ownerSecretKey: Uint8Array,
): Promise<{ contractAddress: ledger.ContractAddress; txId: string; maintenanceSigningKey: Uint8Array }> {
  const privateState: EPoHPrivateState = {
    ownerSecretKey,
    issuerSecretKey: new Uint8Array(32),
  };

  const witnesses: Witnesses<EPoHPrivateState> = {
    ownerSecretKey: ({ privateState: ps }) => [ps, ps.ownerSecretKey],
    issuerSecretKey: ({ privateState: ps }) => [ps, ps.issuerSecretKey],
  };

  const contract = new Contract<EPoHPrivateState>(witnesses);
  const constructorContext = createConstructorContext(
    privateState,
    ctx.shieldedSecretKeys.coinPublicKey,
  );
  const constructorResult = contract.initialState(constructorContext, ownerSecretKey);

  // Cross the WASM module boundary: serialize from onchain-runtime-v3, deserialize into ledger-v8.
  // We create a CLEAN ContractState (without pre-registered circuit operations from the ZKIR)
  // because the node rejects deploys that have operations registered without matching verifier keys.
  // Circuit operations are registered separately via MaintenanceUpdate after deployment.
  const serialized = constructorResult.currentContractState.serialize();
  const sourceState = ledger.ContractState.deserialize(serialized);
  const ledgerContractState = new ledger.ContractState();
  ledgerContractState.data = sourceState.data;
  ledgerContractState.balance = sourceState.balance;

  // Generate a maintenance authority signing key and set it on the contract state
  const maintenanceSigningKey = sampleSigningKey();
  const maintenanceVk = signatureVerifyingKey(maintenanceSigningKey);
  ledgerContractState.maintenanceAuthority = new ledger.ContractMaintenanceAuthority(
    [maintenanceVk],
    1,
    0n,
  );

  const deploy = new ledger.ContractDeploy(ledgerContractState);
  const contractAddress = deploy.address;
  console.log(`  Contract address: ${contractAddress}`);

  const ttl = new Date(Date.now() + 30 * 60 * 1000);

  const unprovenTx = ledger.Transaction.fromPartsRandomized(
    NETWORK_ID,
    undefined,
    undefined,
    ledger.Intent.new(ttl).addDeploy(deploy),
  );

  const recipe = await ctx.wallet.balanceUnprovenTransaction(
    unprovenTx,
    { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
    { ttl },
  );
  const signed = await ctx.wallet.signRecipe(
    recipe,
    (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload),
  );
  const finalizedTx = await ctx.wallet.finalizeRecipe(signed);
  const txId = await ctx.wallet.submitTransaction(finalizedTx);

  return { contractAddress, txId, maintenanceSigningKey };
}

async function registerVerifierKeys(
  ctx: WalletContext,
  contractAddress: ledger.ContractAddress,
  maintenanceSigningKey: Uint8Array,
): Promise<string> {
  const circuits = ["addIssuer", "mintBadge", "revokeBadge"];
  console.log(`  Registering verifier keys for ${circuits.length} circuits...`);

  const updates = circuits.map((name) =>
    new ledger.VerifierKeyInsert(
      name,
      new ledger.ContractOperationVersionedVerifierKey("v3", readVerifierKey(name)),
    )
  );

  // counter must be 0n for first maintenance update after deployment
  const maintenanceUpdate = new ledger.MaintenanceUpdate(contractAddress, updates, 0n);

  // Sign with our maintenance authority key (index 0 in the committee)
  const sig = signData(maintenanceSigningKey, maintenanceUpdate.dataToSign);
  const signedUpdate = maintenanceUpdate.addSignature(0n, sig);

  const ttl = new Date(Date.now() + 30 * 60 * 1000);
  const unprovenTx = ledger.Transaction.fromPartsRandomized(
    NETWORK_ID,
    undefined,
    undefined,
    ledger.Intent.new(ttl).addMaintenanceUpdate(signedUpdate),
  );

  const recipe = await ctx.wallet.balanceUnprovenTransaction(
    unprovenTx,
    { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
    { ttl },
  );
  const signed2 = await ctx.wallet.signRecipe(
    recipe,
    (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload),
  );
  const finalizedTx = await ctx.wallet.finalizeRecipe(signed2);
  const txId = await ctx.wallet.submitTransaction(finalizedTx);
  return txId;
}

async function registerDust(ctx: WalletContext): Promise<void> {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  const unregistered = state.unshielded?.availableCoins.filter(
    (coin: any) => coin.meta.registeredForDustGeneration === false
  ) ?? [];

  if (unregistered.length === 0) {
    console.log("  No unregistered NIGHT UTXOs (already registered or no funds)");
    return;
  }

  console.log(`  Registering ${unregistered.length} NIGHT UTXOs for DUST generation...`);
  const recipe = await ctx.wallet.registerNightUtxosForDustGeneration(
    unregistered,
    ctx.unshieldedKeystore.getPublicKey(),
    (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload),
  );
  const finalized = await ctx.wallet.finalizeRecipe(recipe);
  const txId = await ctx.wallet.submitTransaction(finalized);
  console.log(`  DUST registration tx: ${txId}`);

  await Rx.firstValueFrom(
    ctx.wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.tap((s) => {
        const dust = s.dust?.balance(new Date()) ?? 0n;
        console.log(`  DUST balance: ${dust}`);
      }),
      Rx.filter((s) => (s.dust?.balance(new Date()) ?? 0n) > 0n),
    )
  );
  console.log("  DUST registration complete!");
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  setNetworkId(NETWORK_ID);

  console.log("E-PoH Contract Deployment");
  console.log("=========================");
  console.log(`Node:         ${NODE_URL}`);
  console.log(`Indexer:      ${INDEXER_URL}`);
  console.log(`Proof Server: ${PROOF_SERVER}`);
  console.log();

  console.log("[1/4] Initializing genesis (master) wallet...");
  const genesis = await initWallet(GENESIS_SEED);
  console.log("  Waiting for sync...");
  await waitForSync(genesis.wallet);
  const genesisBalance = await getBalance(genesis.wallet);
  console.log(`  Genesis balance: ${genesisBalance.night} NIGHT, ${genesisBalance.dust} DUST`);

  console.log("\n[2/4] Registering DUST for genesis wallet...");
  await registerDust(genesis);
  const finalBalance = await getBalance(genesis.wallet);
  console.log(`  Genesis balance: ${finalBalance.night} NIGHT, ${finalBalance.dust} DUST`);

  console.log("\n[3/5] Deploying E-PoH Compact contract...");
  const ownerSecretKey = randomBytes(32);
  console.log(`  Owner secret key (save this!): ${ownerSecretKey.toString("hex")}`);
  const { contractAddress, txId: deployTxId, maintenanceSigningKey } = await deployContract(genesis, ownerSecretKey);
  console.log(`  Deploy tx: ${deployTxId}`);
  console.log(`  Contract deployed at: ${contractAddress}`);

  console.log("  Waiting for deployment to be indexed...");
  await new Promise((r) => setTimeout(r, 8000));

  console.log("\n[4/5] Registering ZK verifier keys...");
  const vkTxId = await registerVerifierKeys(genesis, contractAddress, maintenanceSigningKey);
  console.log(`  Verifier key registration tx: ${vkTxId}`);

  console.log("  Waiting for verifier key registration...");
  await waitForSync(genesis.wallet);

  console.log("\n[5/5] Deployment complete!");
  console.log();
  console.log("  ┌─────────────────────────────────────────────────┐");
  console.log("  │  E-PoH Contract Deployed Successfully          │");
  console.log("  ├─────────────────────────────────────────────────┤");
  console.log(`  │  Contract: ${String(contractAddress)}`);
  console.log(`  │  Owner SK: ${ownerSecretKey.toString("hex")}`);
  console.log("  └─────────────────────────────────────────────────┘");
  console.log();
  console.log("  Set these env vars for the backend:");
  console.log(`    EPOH_CONTRACT_ADDRESS=${String(contractAddress)}`);
  console.log(`    EPOH_OWNER_SECRET_KEY=${ownerSecretKey.toString("hex")}`);

  await genesis.wallet.stop();
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
