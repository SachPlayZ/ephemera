/**
 * Issuer Service — Manages issuer identity for Midnight Compact contracts.
 *
 * Instead of ECDSA signatures (EVM pattern), Midnight uses hash-based
 * key derivation. The issuer proves identity by providing their secret key
 * as a witness — the Compact circuit derives the public key via
 * persistentHash and checks it against the on-ledger issuer registry.
 */

export interface ClaimData {
  claimType: number; // 0=VACCINATED, 1=TEST_NEGATIVE, 2=MEDICALLY_FIT
  subjectAddress: string; // 32-byte hex identifier for the subject
  issuedAt: bigint;
  expiresAt: bigint;
}

export interface SignedClaim {
  claim: ClaimData;
  issuerSecretKey: Uint8Array; // 32 bytes — passed as witness to Compact circuit
}

export class IssuerService {
  private secretKey: Uint8Array;

  constructor(secretKeyHex: string) {
    const clean = secretKeyHex.replace(/^0x/, "");
    this.secretKey = hexToBytes(clean);
  }

  get issuerKey(): Uint8Array {
    return this.secretKey;
  }

  async signClaim(claim: ClaimData): Promise<SignedClaim> {
    // Validate claim type
    if (claim.claimType < 0 || claim.claimType > 2) {
      throw new Error(`Invalid claim type: ${claim.claimType}`);
    }
    if (claim.expiresAt <= claim.issuedAt) {
      throw new Error("expiresAt must be after issuedAt");
    }

    // In Midnight, the issuer doesn't need to sign with ECDSA.
    // Instead, the secret key is passed as a witness to the Compact circuit,
    // which derives the public key via persistentHash and checks it against
    // the registered issuer list on the ledger.
    return {
      claim,
      issuerSecretKey: this.secretKey,
    };
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
