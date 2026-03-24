/**
 * Generate test fixtures for the E-PoH Noir circuit.
 * Uses @noble/secp256k1 v1 for ECDSA signing (compatible with Noir's verify_signature).
 * Uses viem for keccak256/encodePacked (Ethereum-style message hashing).
 *
 * Usage: node gen_test_fixtures.mjs
 */
import * as secp from "@noble/secp256k1";
import { keccak256, encodePacked, hexToBytes } from "viem";

// --- Test Issuer (Hardhat account #0) ---
const issuerPrivKey =
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const pubKey = secp.getPublicKey(issuerPrivKey, false);
const pubKeyX = pubKey.slice(1, 33);
const pubKeyY = pubKey.slice(33, 65);

// --- Test Subject (Hardhat account #1) ---
const subjectAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// --- Claim Data ---
const claimType = 0; // VACCINATED
const issuedAt = 1700000000n;
const expiresAt = 1700086400n;

// --- Hash: keccak256(abi.encodePacked(claimType, subjectAddress, issuedAt, expiresAt)) ---
const messageHash = keccak256(
  encodePacked(
    ["uint8", "address", "uint64", "uint64"],
    [claimType, subjectAddress, issuedAt, expiresAt]
  )
);
const messageHashBytes = hexToBytes(messageHash);

console.log("Message hash:", messageHash);

// --- Sign with @noble/secp256k1 v1 ---
const sigDER = await secp.sign(messageHashBytes, issuerPrivKey, {
  canonical: true,
});

// Convert DER to compact (r || s, 32 bytes each)
const compact = derToCompact(sigDER);

// Verify
console.log("JS verify:", secp.verify(compact, messageHashBytes, pubKey));

// --- Output Prover.toml ---
console.log("\n=== Prover.toml ===\n");
console.log(`claim_type = "${claimType}"`);
console.log(
  `subject_address = [${fmtHex(hexToBytes(subjectAddress))}]`
);
console.log(`issued_at = "${issuedAt}"`);
console.log(`expires_at = "${expiresAt}"`);
console.log(`issuer_pubkey_x = [${fmtHex(pubKeyX)}]`);
console.log(`issuer_pubkey_y = [${fmtHex(pubKeyY)}]`);
console.log(`signature = [${fmtHex(compact)}]`);
console.log(`hashed_message = [${fmtHex(messageHashBytes)}]`);

// --- Output Noir test format ---
console.log("\n=== Noir Test Format ===\n");
console.log(`let claim_type: u8 = ${claimType};`);
console.log(
  `let subject_address: [u8; 20] = [${fmtDec(hexToBytes(subjectAddress))}];`
);
console.log(`let issued_at: u64 = ${issuedAt};`);
console.log(`let expires_at: u64 = ${expiresAt};`);
console.log(`let issuer_pubkey_x: [u8; 32] = [${fmtDec(pubKeyX)}];`);
console.log(`let issuer_pubkey_y: [u8; 32] = [${fmtDec(pubKeyY)}];`);
console.log(`let signature: [u8; 64] = [${fmtDec(compact)}];`);
console.log(
  `let hashed_message: [u8; 32] = [${fmtDec(messageHashBytes)}];`
);

// --- Helpers ---

function derToCompact(der) {
  // DER: 30 <len> 02 <rlen> <r> 02 <slen> <s>
  let offset = 2; // skip 30 <len>
  offset++; // skip 02
  const rLen = der[offset++];
  const r = der.slice(offset, offset + rLen);
  offset += rLen;
  offset++; // skip 02
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

function fmtHex(arr) {
  return Array.from(arr)
    .map((b) => `"0x${b.toString(16).padStart(2, "0")}"`)
    .join(", ");
}

function fmtDec(arr) {
  return Array.from(arr).join(", ");
}
