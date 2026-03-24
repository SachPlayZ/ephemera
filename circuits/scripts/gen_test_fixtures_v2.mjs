/**
 * Generate test fixtures using viem for Ethereum-compatible ECDSA.
 * This ensures the signatures are in the exact format expected by
 * Noir's std::ecdsa_secp256k1::verify_signature.
 */
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toBytes, encodePacked, hexToBytes } from "viem";
import { secp256k1 } from "@noble/curves/secp256k1.js";

// --- Test Issuer (Hardhat account #0) ---
const issuerPrivKey =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(issuerPrivKey);

// Get uncompressed public key
const privKeyBytes = hexToBytes(issuerPrivKey);
const pubKeyUncompressed = secp256k1.getPublicKey(privKeyBytes, false);
const pubKeyX = pubKeyUncompressed.slice(1, 33);
const pubKeyY = pubKeyUncompressed.slice(33, 65);

// --- Claim Data ---
const claimType = 0; // VACCINATED
const subjectAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const issuedAt = 1700000000n;
const expiresAt = 1700086400n;

// --- Hash the message using keccak256(abi.encodePacked(...)) ---
// This matches how Solidity would hash it
const messageHash = keccak256(
  encodePacked(
    ["uint8", "address", "uint64", "uint64"],
    [claimType, subjectAddress, issuedAt, expiresAt]
  )
);
const messageHashBytes = hexToBytes(messageHash);

console.log("Message hash:", messageHash);
console.log("Issuer address:", account.address);

// --- Sign the hash directly using noble/curves (low-level, no Ethereum prefix) ---
// Noir's verify_signature expects raw ECDSA over the hash, NOT eth_sign (which adds a prefix)
const sig = secp256k1.sign(messageHashBytes, privKeyBytes, { lowS: true });

// In @noble/curves v2, sign() returns Uint8Array(64) directly
const sigBytes = new Uint8Array(sig);

// Verify in JS
const verified = secp256k1.verify(sigBytes, messageHashBytes, pubKeyUncompressed);
console.log("JS verify:", verified);

// --- Also try signing WITH eth prefix to see if that's what Noir expects ---
// Ethereum personal_sign adds: "\x19Ethereum Signed Message:\n32" + hash
// Let's try both approaches

// --- Output: Prover.toml format ---
console.log("\n=== Prover.toml (raw ECDSA, no eth prefix) ===\n");
console.log(`claim_type = "${claimType}"`);
console.log(
  `subject_address = [${formatByteArray(hexToBytes(subjectAddress))}]`
);
console.log(`issued_at = "${issuedAt}"`);
console.log(`expires_at = "${expiresAt}"`);
console.log(`issuer_pubkey_x = [${formatByteArray(pubKeyX)}]`);
console.log(`issuer_pubkey_y = [${formatByteArray(pubKeyY)}]`);
console.log(`signature = [${formatByteArray(sigBytes)}]`);
console.log(`hashed_message = [${formatByteArray(messageHashBytes)}]`);

// --- Output: Noir test format ---
console.log("\n=== Noir Test Format ===\n");
console.log(`let claim_type: u8 = ${claimType};`);
console.log(
  `let subject_address: [u8; 20] = [${formatByteArrayDec(hexToBytes(subjectAddress))}];`
);
console.log(`let issued_at: u64 = ${issuedAt};`);
console.log(`let expires_at: u64 = ${expiresAt};`);
console.log(
  `let issuer_pubkey_x: [u8; 32] = [${formatByteArrayDec(pubKeyX)}];`
);
console.log(
  `let issuer_pubkey_y: [u8; 32] = [${formatByteArrayDec(pubKeyY)}];`
);
console.log(
  `let signature: [u8; 64] = [${formatByteArrayDec(sigBytes)}];`
);
console.log(
  `let hashed_message: [u8; 32] = [${formatByteArrayDec(messageHashBytes)}];`
);

function formatByteArray(arr) {
  return Array.from(arr)
    .map((b) => `"0x${b.toString(16).padStart(2, "0")}"`)
    .join(", ");
}

function formatByteArrayDec(arr) {
  return Array.from(arr).join(", ");
}
