/**
 * End-to-end test: issue claim -> generate proof -> mint badge on Midnight.
 *
 * Prerequisites:
 * - Midnight local network running: docker compose up -d
 * - Compact contract compiled: pnpm compact:compile
 * - Contract deployed on the local network
 *
 * This test uses the issuer and proof services directly (no HTTP).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { IssuerService } from "../services/issuer.service.js";
import { ProofService } from "../services/proof.service.js";

// Test issuer secret key (32 bytes, local dev only)
const ISSUER_PRIVATE_KEY =
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// Test subject identifier (32 bytes hex)
const SUBJECT_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

describe("E-PoH E2E: Issue -> Prove -> Mint (Midnight)", () => {
  let proofService: ProofService;

  beforeAll(async () => {
    proofService = new ProofService();
    await proofService.init();
  }, 30000);

  afterAll(async () => {
    await proofService.destroy();
  });

  it("should issue a claim and generate a proof", async () => {
    // Step 1: Issue claim
    const issuer = new IssuerService(ISSUER_PRIVATE_KEY);
    const now = Math.floor(Date.now() / 1000);

    const signedClaim = await issuer.signClaim({
      claimType: 0, // VACCINATED
      subjectAddress: SUBJECT_ADDRESS,
      issuedAt: BigInt(now),
      expiresAt: BigInt(now + 86400), // 24h from now
    });

    expect(signedClaim.issuerSecretKey.length).toBe(32);
    expect(signedClaim.claim.claimType).toBe(0);
    expect(signedClaim.claim.expiresAt).toBe(BigInt(now + 86400));

    // Step 2: Generate ZK proof and mint badge
    const result = await proofService.generateProofAndMint(signedClaim);

    expect(result.claimType).toBe(0);
    expect(result.expiresAt).toBe(BigInt(now + 86400));
    expect(result.proofGenTimeMs).toBeGreaterThanOrEqual(0);
  }, 120000);

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
