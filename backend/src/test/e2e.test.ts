/**
 * End-to-end test: issue claim -> generate proof -> verify on-chain via Anvil.
 *
 * Prerequisites:
 * - Anvil running: anvil --code-size-limit 50000
 * - Contracts deployed (via forge script)
 *
 * This test uses the issuer and proof services directly (no HTTP).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { IssuerService } from "../services/issuer.service.js";
import { ProofService } from "../services/proof.service.js";

// Hardhat account #0 (issuer)
const ISSUER_PRIVATE_KEY =
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// Hardhat account #1 (subject)
const SUBJECT_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

describe("E-PoH E2E: Issue -> Prove -> Verify", () => {
  let proofService: ProofService;

  beforeAll(async () => {
    proofService = new ProofService();
    await proofService.init();
  }, 30000);

  afterAll(async () => {
    await proofService.destroy();
  });

  it("should issue a claim, generate a proof, and verify it off-chain", async () => {
    // Step 1: Issue claim
    const issuer = new IssuerService(ISSUER_PRIVATE_KEY);
    const now = Math.floor(Date.now() / 1000);

    const signedClaim = await issuer.signClaim({
      claimType: 0, // VACCINATED
      subjectAddress: SUBJECT_ADDRESS,
      issuedAt: BigInt(now),
      expiresAt: BigInt(now + 86400), // 24h from now
    });

    expect(signedClaim.signature.length).toBe(64);
    expect(signedClaim.hashedMessage.length).toBe(32);
    expect(signedClaim.issuerPubkeyX.length).toBe(32);
    expect(signedClaim.issuerPubkeyY.length).toBe(32);

    // Step 2: Generate ZK proof
    const proofResult = await proofService.generateProof(signedClaim);

    expect(proofResult.proof.length).toBeGreaterThan(0);
    expect(proofResult.publicInputs.length).toBe(4);

    // Public input 0 = claim_type = 0
    expect(BigInt(proofResult.publicInputs[0])).toBe(0n);
    // Public input 1 = expires_at
    expect(BigInt(proofResult.publicInputs[1])).toBe(BigInt(now + 86400));

    // Step 3: Verify proof off-chain
    const isValid = await proofService.verifyProof(proofResult);
    expect(isValid).toBe(true);
  }, 60000);

  it("should reject invalid claim type", async () => {
    const issuer = new IssuerService(ISSUER_PRIVATE_KEY);
    await expect(
      issuer.signClaim({
        claimType: 5,
        subjectAddress: SUBJECT_ADDRESS,
        issuedAt: 1700000000n,
        expiresAt: 1700086400n,
      })
    ).rejects.toThrow("Invalid claim type");
  });

  it("should reject expiresAt before issuedAt", async () => {
    const issuer = new IssuerService(ISSUER_PRIVATE_KEY);
    await expect(
      issuer.signClaim({
        claimType: 0,
        subjectAddress: SUBJECT_ADDRESS,
        issuedAt: 1700086400n,
        expiresAt: 1700000000n,
      })
    ).rejects.toThrow("expiresAt must be after issuedAt");
  });
});
