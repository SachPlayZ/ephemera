#!/usr/bin/env tsx
/**
 * Deploy the E-PoH Compact contract to the local Midnight network.
 *
 * Flow:
 *   1. Initialize the genesis (master) wallet — holds all minted NIGHT tokens
 *   2. Initialize the Lace wallet from user's mnemonic
 *   3. Transfer NIGHT from genesis → Lace
 *   4. Register DUST for the Lace wallet
 *   5. Use the Lace wallet for contract operations
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
import * as Rx from "rxjs";
import { WebSocket } from "ws";
import { mnemonicToSeedSync } from "@scure/bip39";

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

// Lace wallet mnemonic
const LACE_MNEMONIC =
  process.env.LACE_MNEMONIC ??
  "humble release science section casino reopen glow isolate dilemma correct symbol glow ocean inherit hedgehog green behind shoe ceiling tooth metal bamboo dirt layer";

const NIGHT_AMOUNT = 50_000n * 10n ** 6n; // 50,000 NIGHT

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

async function waitForFunds(wallet: WalletFacade): Promise<void> {
  await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.tap((s) => {
        const bal = (s.unshielded?.balances[ledger.nativeToken().raw] ?? 0n) +
                    (s.shielded?.balances[ledger.nativeToken().raw] ?? 0n);
        console.log(`  Balance: ${bal} NIGHT (synced: ${s.isSynced})`);
      }),
      Rx.filter((s) => s.isSynced),
      Rx.map((s) => (s.unshielded?.balances[ledger.nativeToken().raw] ?? 0n) +
                     (s.shielded?.balances[ledger.nativeToken().raw] ?? 0n)),
      Rx.filter((balance) => balance > 0n),
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

async function transferNight(
  from: WalletContext,
  toAddress: any,
  amount: bigint,
): Promise<string> {
  const ttl = new Date(Date.now() + 30 * 60 * 1000);
  const recipe = await from.wallet.transferTransaction(
    [{
      type: "unshielded",
      outputs: [{
        type: ledger.nativeToken().raw,
        receiverAddress: toAddress,
        amount,
      }],
    }],
    {
      shieldedSecretKeys: from.shieldedSecretKeys,
      dustSecretKey: from.dustSecretKey,
    },
    { ttl },
  );
  const signed = await from.wallet.signRecipe(
    recipe,
    (payload: any) => from.unshieldedKeystore.signData(payload),
  );
  const finalized = await from.wallet.finalizeRecipe(signed);
  return await from.wallet.submitTransaction(finalized);
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
  console.log("[1/5] Initializing genesis (master) wallet...");
  const genesis = await initWallet(GENESIS_SEED);
  console.log("  Waiting for sync (this takes ~10 minutes on first run)...");
  await waitForSync(genesis.wallet);
  const genesisBalance = await getBalance(genesis.wallet);
  console.log(`  Genesis balance: ${genesisBalance.night} NIGHT, ${genesisBalance.dust} DUST`);

  // Step 2: Initialize Lace wallet
  console.log("\n[2/5] Initializing Lace wallet...");
  const laceSeed = Buffer.from(mnemonicToSeedSync(LACE_MNEMONIC));
  const lace = await initWallet(laceSeed);
  const laceAddr = await lace.wallet.unshielded.getAddress();
  console.log(`  Lace address: ${lace.unshieldedKeystore.getBech32Address().asString()}`);

  // Step 3: Transfer NIGHT from genesis to Lace
  console.log("\n[3/5] Transferring 50,000 NIGHT from genesis to Lace...");
  const txId = await transferNight(genesis, laceAddr, NIGHT_AMOUNT);
  console.log(`  Transfer tx: ${txId}`);

  // Wait for Lace to receive funds
  console.log("  Waiting for Lace wallet to receive funds...");
  await waitForSync(lace.wallet);
  await waitForFunds(lace.wallet);
  const laceBalance = await getBalance(lace.wallet);
  console.log(`  Lace balance: ${laceBalance.night} NIGHT`);

  // Step 4: Register DUST for Lace
  console.log("\n[4/5] Registering DUST for Lace wallet...");
  await registerDust(lace);
  const finalBalance = await getBalance(lace.wallet);
  console.log(`  Lace final balance: ${finalBalance.night} NIGHT, ${finalBalance.dust} DUST`);

  // Step 5: Done
  console.log("\n[5/5] Wallet funded and ready!");
  console.log("  The Lace wallet now has NIGHT + DUST to deploy contracts and submit transactions.");

  // Cleanup
  await genesis.wallet.stop();
  await lace.wallet.stop();
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
