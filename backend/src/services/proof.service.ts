/**
 * Proof Service — Generates ZK proofs via the Midnight Compact runtime.
 *
 * In Midnight, proof generation happens through the contract's circuit calls.
 * The Compact runtime + proof server handle witness execution and ZK proof
 * generation automatically — no manual Barretenberg/Noir setup needed.
 *
 * Flow:
 *   1. Contract.circuits.mintBadge(context, ...args) executes the circuit
 *   2. The runtime generates the witness and proof transcript
 *   3. The proof server (Docker, port 6300) produces the ZK proof
 *   4. The proven transaction is submitted to the Midnight node
 */

import type { SignedClaim } from "./issuer.service.js";
import { ChainService, type MidnightConfig } from "./chain.service.js";

export interface ProofResult {
  badgeId: bigint;
  claimType: number;
  expiresAt: bigint;
  subjectHash: string;
  issuerHash: string;
  proofGenTimeMs: number;
}

export class ProofService {
  private chainService: ChainService;
  private initialized = false;

  constructor(config?: Partial<MidnightConfig>) {
    this.chainService = new ChainService(config);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.chainService.init();
    this.initialized = true;
  }

  /**
   * Generate a ZK proof and mint a badge in one step.
   *
   * In Midnight, proof generation and on-chain submission are unified:
   * the contract circuit call generates the proof, and the wallet SDK
   * submits the proven transaction to the network.
   */
  async generateProofAndMint(signedClaim: SignedClaim): Promise<ProofResult> {
    await this.init();

    const { badgeId, proofGenTimeMs } = await this.chainService.mintBadge(signedClaim);

    return {
      badgeId,
      claimType: signedClaim.claim.claimType,
      expiresAt: signedClaim.claim.expiresAt,
      subjectHash: signedClaim.claim.subjectAddress,
      issuerHash: toHex(signedClaim.issuerSecretKey), // In production, this would be the derived public key
      proofGenTimeMs,
    };
  }

  async destroy(): Promise<void> {
    this.initialized = false;
  }
}

function toHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
