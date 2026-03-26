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

import * as ledger from "@midnight-ntwrk/ledger-v7";
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
import { createConstructorContext } from "@midnight-ntwrk/compact-runtime";
import * as Rx from "rxjs";
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
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
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

interface EPoHPrivateState {
  ownerSecretKey: Uint8Array;
  issuerSecretKey: Uint8Array;
}

async function deployContract(
  ctx: WalletContext,
  ownerSecretKey: Uint8Array,
): Promise<{ contractAddress: string; txId: string }> {
  const privateState: EPoHPrivateState = {
    ownerSecretKey,
    issuerSecretKey: new Uint8Array(32),
  };

  // Set up contract with witness implementations
  const witnesses: Witnesses<EPoHPrivateState> = {
    ownerSecretKey: ({ privateState: ps }) => [ps, ps.ownerSecretKey],
    issuerSecretKey: ({ privateState: ps }) => [ps, ps.issuerSecretKey],
  };

  const contract = new Contract<EPoHPrivateState>(witnesses);

  // Create constructor context using the wallet's coin public key
  const constructorContext = createConstructorContext(
    privateState,
    ctx.shieldedSecretKeys.coinPublicKey,
  );

  // Execute the constructor to get initial contract state
  const constructorResult = contract.initialState(constructorContext, ownerSecretKey);

  // The compact runtime returns a ContractState from onchain-runtime-v3, but
  // ledger.ContractDeploy expects one from ledger-v7. Serialize → deserialize
  // to cross the WASM module boundary.
  const serialized = constructorResult.currentContractState.serialize();
  const ledgerContractState = ledger.ContractState.deserialize(serialized);
  const deploy = new ledger.ContractDeploy(ledgerContractState);
  const contractAddress = deploy.address;
  console.log(`  Contract address: ${contractAddress}`);

  // Build the deployment transaction:
  // 1. Create an intent with the deploy action
  const ttl = new Date(Date.now() + 30 * 60 * 1000);
  const intent = ledger.Intent.new(ttl).addDeploy(deploy);

  // 2. Build an unproven transaction with the intent
  const unprovenTx = ledger.Transaction.fromPartsRandomized(
    NETWORK_ID,
    undefined, // no guaranteed offer
    undefined, // no fallible offer
    intent,
  );

  // 3. Balance the transaction (adds fee inputs/outputs)
  const recipe = await ctx.wallet.balanceUnprovenTransaction(
    unprovenTx,
    {
      shieldedSecretKeys: ctx.shieldedSecretKeys,
      dustSecretKey: ctx.dustSecretKey,
    },
    { ttl },
  );

  // 4. Sign the recipe
  const signed = await ctx.wallet.signRecipe(
    recipe,
    (payload: any) => ctx.unshieldedKeystore.signData(payload),
  );

  // 5. Finalize (prove) and submit
  const finalizedTx = await ctx.wallet.finalizeRecipe(signed);
  const txId = await ctx.wallet.submitTransaction(finalizedTx);

  return { contractAddress: contractAddress.toString(), txId };
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
    (payload: any) => ctx.unshieldedKeystore.signData(payload),
  );
  const finalized = await ctx.wallet.finalizeRecipe(recipe);
  const txId = await ctx.wallet.submitTransaction(finalized);
  console.log(`  DUST registration tx: ${txId}`);

  // Wait for DUST to appear
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

  // Step 1: Initialize genesis wallet
  console.log("[1/4] Initializing genesis (master) wallet...");
  const genesis = await initWallet(GENESIS_SEED);
  console.log("  Waiting for sync (this takes ~10 minutes on first run)...");
  await waitForSync(genesis.wallet);
  const genesisBalance = await getBalance(genesis.wallet);
  console.log(`  Genesis balance: ${genesisBalance.night} NIGHT, ${genesisBalance.dust} DUST`);

  // Step 2: Register DUST for genesis wallet
  console.log("\n[2/4] Registering DUST for genesis wallet...");
  await registerDust(genesis);
  const finalBalance = await getBalance(genesis.wallet);
  console.log(`  Genesis balance: ${finalBalance.night} NIGHT, ${finalBalance.dust} DUST`);

  // Step 3: Deploy the E-PoH contract
  console.log("\n[3/4] Deploying E-PoH Compact contract...");
  const ownerSecretKey = randomBytes(32);
  console.log(`  Owner secret key (save this!): ${ownerSecretKey.toString("hex")}`);
  const { contractAddress, txId: deployTxId } = await deployContract(genesis, ownerSecretKey);
  console.log(`  Deploy tx: ${deployTxId}`);
  console.log(`  Contract deployed at: ${contractAddress}`);

  // Wait for the deployment to be confirmed
  console.log("  Waiting for deployment confirmation...");
  await waitForSync(genesis.wallet);

  // Step 4: Done
  console.log("\n[4/4] Deployment complete!");
  console.log();
  console.log("  ┌─────────────────────────────────────────────────┐");
  console.log("  │  E-PoH Contract Deployed Successfully          │");
  console.log("  ├─────────────────────────────────────────────────┤");
  console.log(`  │  Contract: ${contractAddress}`);
  console.log(`  │  Owner SK: ${ownerSecretKey.toString("hex")}`);
  console.log("  └─────────────────────────────────────────────────┘");
  console.log();
  console.log("  Set these env vars for the backend:");
  console.log(`    EPOH_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`    EPOH_OWNER_SECRET_KEY=${ownerSecretKey.toString("hex")}`);

  // Cleanup
  await genesis.wallet.stop();
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
