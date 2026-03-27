/**
 * Chain Service — Interacts with E-PoH Compact contract on the Midnight network.
 *
 * Uses the compiled Compact contract types and the Midnight Wallet SDK to:
 * - Initialize wallets from mnemonics or hex seeds
 * - Deploy the Compact contract
 * - Call circuits (addIssuer, mintBadge, revokeBadge)
 * - Read ledger state via the indexer
 *
 * Prerequisites: Local Midnight network running via docker-compose
 *   - Node:         http://localhost:9944
 *   - Indexer:      http://localhost:8088/api/v3/graphql
 *   - Proof Server: http://localhost:6300
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
  createCircuitContext,
  type CircuitContext,
  type CircuitResults,
  communicationCommitmentRandomness,
  communicationCommitment,
} from "@midnight-ntwrk/compact-runtime";
import { makeWasmProvingService } from "@midnight-ntwrk/wallet-sdk-capabilities/proving";
import { WasmProver } from "@midnight-ntwrk/wallet-sdk-prover-client/effect";
import * as Rx from "rxjs";
import { WebSocket } from "ws";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to compiled contract keys relative to this service file
const KEYS_DIR = resolve(__dirname, "../../../contracts/managed/epoh_badge/keys");
const ZKIR_DIR = resolve(__dirname, "../../../contracts/managed/epoh_badge/zkir");

/**
 * Key material provider that reads proving keys from local compiled contract files.
 * Wraps the default provider (for Zswap/Dust) and adds user-defined circuit keys.
 */
function makeLocalKeyMaterialProvider() {
  const defaultProvider = WasmProver.makeDefaultKeyMaterialProvider();
  return {
    async lookupKey(keyLocation: string) {
      const proverFile = resolve(KEYS_DIR, `${keyLocation}.prover`);
      const verifierFile = resolve(KEYS_DIR, `${keyLocation}.verifier`);
      const irFile = resolve(ZKIR_DIR, `${keyLocation}.bzkir`);

      if (existsSync(proverFile) && existsSync(verifierFile) && existsSync(irFile)) {
        return {
          proverKey: new Uint8Array(readFileSync(proverFile)),
          verifierKey: new Uint8Array(readFileSync(verifierFile)),
          ir: new Uint8Array(readFileSync(irFile)),
        };
      }

      // Fall back to default (Zswap, Dust circuits)
      return defaultProvider.lookupKey(keyLocation);
    },
    // Fetch universal proof parameters from the Midnight S3 bucket
    getParams: defaultProvider.getParams,
  };
}

import {
  Contract,
  ledger as readLedger,
  pureCircuits,
  BadgeState as CompactBadgeState,
  type Ledger,
  type Witnesses,
} from "../../../contracts/managed/epoh_badge/contract/index.js";
import type { SignedClaim } from "./issuer.service.js";

// Enable WebSocket for the SDK
// @ts-expect-error: Needed for apollo client used by wallet SDK
globalThis.WebSocket = WebSocket;

// Re-export the generated enums for external use
export { CompactBadgeState as BadgeState };

export enum ClaimType {
  VACCINATED = 0,
  TEST_NEGATIVE = 1,
  MEDICALLY_FIT = 2,
}

export interface Badge {
  claimType: number;
  expiresAt: bigint;
  subjectHash: Uint8Array;
  issuerHash: Uint8Array;
  state: CompactBadgeState;
}

export interface MidnightConfig {
  nodeUrl: string;
  indexerUrl: string;
  indexerWsUrl: string;
  proofServerUrl: string;
  networkId: string;
  ownerSecretKey: Uint8Array;
  /** Hex seed for the genesis/master wallet (64 bytes hex) */
  walletSeed?: string;
  /** Contract address (hex string from deployment) */
  contractAddress?: string;
}

const DEFAULT_CONFIG: MidnightConfig = {
  nodeUrl: process.env.MIDNIGHT_NODE_URL ?? "http://127.0.0.1:9944",
  indexerUrl: process.env.MIDNIGHT_INDEXER_URL ?? "http://127.0.0.1:8088/api/v3/graphql",
  indexerWsUrl: process.env.MIDNIGHT_INDEXER_WS ?? "ws://127.0.0.1:8088/api/v3/graphql/ws",
  proofServerUrl: process.env.MIDNIGHT_PROOF_SERVER ?? "http://127.0.0.1:6300",
  networkId: "undeployed",
  ownerSecretKey: process.env.EPOH_OWNER_SECRET_KEY
    ? Buffer.from(process.env.EPOH_OWNER_SECRET_KEY, "hex")
    : new Uint8Array(32),
  contractAddress: process.env.EPOH_CONTRACT_ADDRESS,
  walletSeed: process.env.EPOH_WALLET_SEED,
};

/**
 * Private state passed through witnesses.
 * Witnesses receive this and return [updatedState, value].
 */
interface EPoHPrivateState {
  ownerSecretKey: Uint8Array;
  issuerSecretKey: Uint8Array;
}

interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

/**
 * ChainService manages the connection to the Midnight network
 * and provides methods to interact with the E-PoH Compact contract.
 */
export class ChainService {
  private config: MidnightConfig;
  private contract: Contract<EPoHPrivateState> | null = null;
  private walletCtx: WalletContext | null = null;
  private initialized = false;
  private lastCircuitContext: CircuitContext<EPoHPrivateState> | null = null;

  constructor(config?: Partial<MidnightConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the wallet SDK and contract.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    setNetworkId(this.config.networkId);

    // Set up the contract with witness implementations
    const witnesses: Witnesses<EPoHPrivateState> = {
      ownerSecretKey: ({ privateState }) => {
        return [privateState, privateState.ownerSecretKey];
      },
      issuerSecretKey: ({ privateState }) => {
        return [privateState, privateState.issuerSecretKey];
      },
    };

    this.contract = new Contract<EPoHPrivateState>(witnesses);

    // Initialize wallet if seed is provided
    if (this.config.walletSeed) {
      this.walletCtx = await this.initWallet(this.config.walletSeed);
    }

    this.initialized = true;
  }

  /**
   * Build a circuit context for executing contract circuits.
   * Requires a deployed contract address and a synced wallet.
   */
  private buildCircuitContext(
    privateState: EPoHPrivateState,
    contractState: any,
  ): CircuitContext<EPoHPrivateState> {
    if (!this.walletCtx) throw new Error("Wallet not initialized");
    if (!this.config.contractAddress) throw new Error("Contract address not set");

    return createCircuitContext(
      this.config.contractAddress,
      this.walletCtx.shieldedSecretKeys.coinPublicKey,
      contractState,
      privateState,
    );
  }

  /**
   * Submit a circuit call result as a transaction to the network.
   */
  private async submitCircuitResult(
    circuitName: string,
    circuitResults: CircuitResults<EPoHPrivateState, any>,
    ledgerState: ledger.ContractState,
  ): Promise<string> {
    if (!this.walletCtx) throw new Error("Wallet not initialized");

    const unprovenTx = this.buildUnprovenTxFromCircuit(circuitName, circuitResults, ledgerState);
    const ttl = new Date(Date.now() + 30 * 60 * 1000);

    const recipe = await this.walletCtx.wallet.balanceUnprovenTransaction(
      unprovenTx,
      {
        shieldedSecretKeys: this.walletCtx.shieldedSecretKeys,
        dustSecretKey: this.walletCtx.dustSecretKey,
      },
      { ttl },
    );

    const signed = await this.walletCtx.wallet.signRecipe(
      recipe,
      (payload: any) => this.walletCtx!.unshieldedKeystore.signData(payload),
    );
    const finalized = await this.walletCtx.wallet.finalizeRecipe(signed);
    return await this.walletCtx.wallet.submitTransaction(finalized);
  }

  /**
   * Query the contract's current on-chain state from the indexer.
   * Returns { ocrtState, ledgerState, hexState }.
   */
  async queryContractState(): Promise<{
    ocrtState: any;
    ledgerState: ledger.ContractState;
    hexState: string;
  }> {
    if (!this.config.contractAddress) throw new Error("Contract address not set");

    // Indexer v4 renamed contractState → contractAction
    const response = await fetch(this.config.indexerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query { contractAction(address: "${this.config.contractAddress}") { state } }`,
      }),
    });
    const data = await response.json();
    const hexState: string | undefined = data?.data?.contractAction?.state;
    if (!hexState) throw new Error("Contract state not found on chain");

    const bytes = hexToBytes(hexState);

    // onchain-runtime-v3 ContractState (for circuit context)
    const { ContractState: OcrtContractState } = await import("@midnight-ntwrk/compact-runtime");
    const ocrtState = OcrtContractState.deserialize(bytes);

    // ledger-v8 ContractState (for operations and QueryContext)
    const ledgerState = ledger.ContractState.deserialize(bytes);

    return { ocrtState, ledgerState, hexState };
  }

  /**
   * Build an UnprovenTransaction from a circuit's results.
   * Crosses the onchain-runtime-v3 → ledger-v8 WASM boundary.
   */
  private buildUnprovenTxFromCircuit(
    circuitName: string,
    circuitResults: CircuitResults<EPoHPrivateState, any>,
    ledgerState: ledger.ContractState,
  ): ledger.UnprovenTransaction {
    const address = this.config.contractAddress!;
    const { proofData } = circuitResults;

    const op = ledgerState.operation(circuitName);
    if (!op) throw new Error(`ContractOperation not found for circuit: ${circuitName}`);

    // Build a fresh ledger-v8 QueryContext from the on-chain state
    const queryContext = new ledger.QueryContext(ledgerState.data, address);

    // Generate communication commitment randomness
    const rand = communicationCommitmentRandomness();
    const commComm = communicationCommitment(
      proofData.input as any,
      proofData.output as any,
      rand,
    );

    const preTranscript = new ledger.PreTranscript(
      queryContext,
      proofData.publicTranscript as any,
      commComm,
    );

    const preCall = new ledger.PrePartitionContractCall(
      address,
      circuitName,
      op,
      preTranscript,
      proofData.privateTranscriptOutputs as any,
      proofData.input as any,
      proofData.output as any,
      rand,
      circuitName,
    );

    const ttl = new Date(Date.now() + 30 * 60 * 1000);
    const baseTx = ledger.Transaction.fromPartsRandomized(
      this.config.networkId,
      undefined,
      undefined,
      undefined,
    );
    return baseTx.addCalls(
      { tag: "random" },
      [preCall],
      ledger.LedgerParameters.initialParameters(),
      ttl,
    );
  }

  /**
   * Initialize a Midnight wallet from a hex seed.
   */
  private async initWallet(hexSeed: string): Promise<WalletContext> {
    const seed = Buffer.from(hexSeed, "hex");
    const hdWallet = HDWallet.fromSeed(seed);

    if (hdWallet.type !== "seedOk") {
      throw new Error("Failed to initialize HDWallet from seed");
    }

    const derivationResult = hdWallet.hdWallet
      .selectAccount(0)
      .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
      .deriveKeysAt(0);

    if (derivationResult.type !== "keysDerived") {
      throw new Error("Failed to derive wallet keys");
    }

    hdWallet.hdWallet.clear();

    const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(
      derivationResult.keys[Roles.Zswap]
    );
    const dustSecretKey = ledger.DustSecretKey.fromSeed(
      derivationResult.keys[Roles.Dust]
    );
    const unshieldedKeystore = createKeystore(
      derivationResult.keys[Roles.NightExternal],
      this.config.networkId
    );

    const configuration: DefaultConfiguration = {
      networkId: this.config.networkId,
      indexerClientConnection: {
        indexerHttpUrl: this.config.indexerUrl,
        indexerWsUrl: this.config.indexerWsUrl,
      },
      provingServerUrl: new URL(this.config.proofServerUrl),
      relayURL: new URL(this.config.nodeUrl.replace(/^http/, "ws")),
      costParameters: {
        additionalFeeOverhead: 300_000_000_000_000n,
        feeBlocksMargin: 5,
      },
      txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    };

    const facade = await WalletFacade.init({
      configuration,
      shielded: (cfg) =>
        ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
      unshielded: (cfg) =>
        UnshieldedWallet(cfg).startWithPublicKey(
          UnshieldedPublicKey.fromKeyStore(unshieldedKeystore)
        ),
      dust: (cfg) =>
        DustWallet(cfg).startWithSecretKey(
          dustSecretKey,
          ledger.LedgerParameters.initialParameters().dust
        ),
      // Use WASM prover with local key files for user-defined contract circuits
      provingService: () => makeWasmProvingService({ keyMaterialProvider: makeLocalKeyMaterialProvider() }),
    });

    await facade.start(shieldedSecretKeys, dustSecretKey);

    // Wait for wallet to sync (up to 10 minutes on local dev)
    console.log("Waiting for wallet to sync (this can take up to 10 minutes)...");
    await Rx.firstValueFrom(
      facade.state().pipe(
        Rx.filter((state) => state.isSynced),
        Rx.timeout(600_000),
      )
    );

    return {
      wallet: facade,
      shieldedSecretKeys,
      dustSecretKey,
      unshieldedKeystore,
    };
  }

  /**
   * Derive a public key using the pure circuit (no network needed).
   */
  derivePublicKey(secretKey: Uint8Array, sequence: Uint8Array): Uint8Array {
    return pureCircuits.derivePublicKey(secretKey, sequence);
  }

  /**
   * Hash a subject address using the pure circuit (no network needed).
   */
  hashSubject(subject: Uint8Array): Uint8Array {
    return pureCircuits.hashSubject(subject);
  }

  /**
   * Mint a health badge by calling the mintBadge circuit.
   *
   * The Compact circuit privately verifies:
   * - claim_type is valid (0-2)
   * - expires_at > issued_at
   * - issuer secret key derives to a registered public key
   * - subject hash is correctly computed
   */
  async mintBadge(signedClaim: SignedClaim): Promise<{
    badgeId: bigint;
    proofGenTimeMs: number;
  }> {
    await this.init();

    const start = Date.now();

    const claimType = BigInt(signedClaim.claim.claimType);
    const subjectAddress = hexToBytes32(signedClaim.claim.subjectAddress);
    const issuedAt = signedClaim.claim.issuedAt;
    const expiresAt = signedClaim.claim.expiresAt;

    const privateState: EPoHPrivateState = {
      ownerSecretKey: this.config.ownerSecretKey,
      issuerSecretKey: signedClaim.issuerSecretKey,
    };

    const { ocrtState, ledgerState } = await this.queryContractState();
    const context = this.buildCircuitContext(privateState, ocrtState);

    const circuitResults = this.contract!.circuits.mintBadge(
      context, claimType, subjectAddress, issuedAt, expiresAt,
    );

    // Update cached context for subsequent calls
    this.lastCircuitContext = circuitResults.context;

    const txId = await this.submitCircuitResult("mintBadge", circuitResults, ledgerState);
    console.log(`  mintBadge tx submitted: ${txId}`);

    const elapsed = Date.now() - start;

    // Read the updated badge count from the new context (must pass ChargedState, not QueryContext)
    const updatedState = readLedger((circuitResults.context.currentQueryContext as any).state);
    const badgeId = updatedState.badge_count;

    return {
      badgeId,
      proofGenTimeMs: elapsed,
    };
  }

  /**
   * Read the latest badge from the ledger.
   */
  async getLatestBadge(): Promise<Badge> {
    await this.init();

    const { ocrtState } = await this.queryContractState();
    const ledgerState: Ledger = readLedger(ocrtState.data);

    return {
      claimType: Number(ledgerState.last_badge_claim_type),
      expiresAt: ledgerState.last_badge_expires_at,
      subjectHash: ledgerState.last_badge_subject_hash,
      issuerHash: ledgerState.last_badge_issuer_hash,
      state: ledgerState.last_badge_state,
    };
  }

  /**
   * Check if a badge is valid (active and not expired).
   */
  async isValid(): Promise<boolean> {
    const badge = await this.getLatestBadge();
    if (badge.state !== CompactBadgeState.ACTIVE) return false;
    const now = BigInt(Math.floor(Date.now() / 1000));
    return badge.expiresAt > now;
  }

  /**
   * Get the badge count from the ledger.
   */
  async getBadgeCount(): Promise<bigint> {
    await this.init();

    const { ocrtState } = await this.queryContractState();
    const ledgerState: Ledger = readLedger(ocrtState.data);
    return ledgerState.badge_count;
  }

  /**
   * Register an issuer on the contract (owner-only).
   */
  async addIssuer(issuerPublicKey: Uint8Array): Promise<void> {
    await this.init();

    const privateState: EPoHPrivateState = {
      ownerSecretKey: this.config.ownerSecretKey,
      issuerSecretKey: new Uint8Array(32),
    };

    const { ocrtState, ledgerState } = await this.queryContractState();
    const context = this.buildCircuitContext(privateState, ocrtState);

    const circuitResults = this.contract!.circuits.addIssuer(context, issuerPublicKey);

    this.lastCircuitContext = circuitResults.context;

    const txId = await this.submitCircuitResult("addIssuer", circuitResults, ledgerState);
    console.log(`  addIssuer tx submitted: ${txId}`);
  }

  /**
   * Close the wallet connection.
   */
  async destroy(): Promise<void> {
    if (this.walletCtx) {
      await this.walletCtx.wallet.stop();
      this.walletCtx = null;
    }
    this.initialized = false;
  }
}

function hexToBytes32(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "").padEnd(64, "0");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
