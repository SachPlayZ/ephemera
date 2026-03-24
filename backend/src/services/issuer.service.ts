/**
 * Issuer Service — Signs health claims using ECDSA secp256k1.
 *
 * Uses @noble/secp256k1 v1 for Noir-compatible signatures.
 * The message hash is keccak256(abi.encodePacked(claimType, subjectAddress, issuedAt, expiresAt)).
 */
import * as secp from "@noble/secp256k1";
import {
  keccak256,
  encodePacked,
  hexToBytes,
  type Hex,
  type Address,
} from "viem";

export interface ClaimData {
  claimType: number; // 0=VACCINATED, 1=TEST_NEGATIVE, 2=MEDICALLY_FIT
  subjectAddress: Address;
  issuedAt: bigint;
  expiresAt: bigint;
}

export interface SignedClaim {
  claim: ClaimData;
  issuerPubkeyX: Uint8Array;
  issuerPubkeyY: Uint8Array;
  signature: Uint8Array; // 64 bytes, compact (r||s)
  hashedMessage: Uint8Array; // 32 bytes, keccak256
}

export class IssuerService {
  private privateKey: string;
  private pubkeyX: Uint8Array;
  private pubkeyY: Uint8Array;

  constructor(privateKeyHex: string) {
    // Strip 0x prefix if present
    this.privateKey = privateKeyHex.replace(/^0x/, "");
    const pubKey = secp.getPublicKey(this.privateKey, false); // uncompressed
    this.pubkeyX = pubKey.slice(1, 33);
    this.pubkeyY = pubKey.slice(33, 65);
  }

  get publicKeyX(): Uint8Array {
    return this.pubkeyX;
  }

  get publicKeyY(): Uint8Array {
    return this.pubkeyY;
  }

  async signClaim(claim: ClaimData): Promise<SignedClaim> {
    // Validate claim type
    if (claim.claimType < 0 || claim.claimType > 2) {
      throw new Error(`Invalid claim type: ${claim.claimType}`);
    }
    if (claim.expiresAt <= claim.issuedAt) {
      throw new Error("expiresAt must be after issuedAt");
    }

    // Hash: keccak256(abi.encodePacked(uint8, address, uint64, uint64))
    const messageHash = keccak256(
      encodePacked(
        ["uint8", "address", "uint64", "uint64"],
        [
          claim.claimType,
          claim.subjectAddress,
          claim.issuedAt,
          claim.expiresAt,
        ]
      )
    );
    const hashedMessage = hexToBytes(messageHash);

    // Sign with @noble/secp256k1 v1 (returns DER)
    const sigDER = await secp.sign(hashedMessage, this.privateKey, {
      canonical: true,
    });

    // Convert DER to compact (r||s) for Noir compatibility
    const signature = derToCompact(sigDER);

    return {
      claim,
      issuerPubkeyX: this.pubkeyX,
      issuerPubkeyY: this.pubkeyY,
      signature,
      hashedMessage,
    };
  }
}

/** Convert DER-encoded ECDSA signature to 64-byte compact (r||s) format. */
function derToCompact(der: Uint8Array): Uint8Array {
  let offset = 2; // skip 30 <total_len>
  offset++; // skip 02 (integer tag for r)
  const rLen = der[offset++];
  const r = der.slice(offset, offset + rLen);
  offset += rLen;
  offset++; // skip 02 (integer tag for s)
  const sLen = der[offset++];
  const s = der.slice(offset, offset + sLen);

  const rPadded = new Uint8Array(32);
  const sPadded = new Uint8Array(32);
  if (r.length <= 32) {
    rPadded.set(r, 32 - r.length);
  } else {
    rPadded.set(r.slice(r.length - 32));
  }
  if (s.length <= 32) {
    sPadded.set(s, 32 - s.length);
  } else {
    sPadded.set(s.slice(s.length - 32));
  }

  const compact = new Uint8Array(64);
  compact.set(rPadded, 0);
  compact.set(sPadded, 32);
  return compact;
}
