/**
 * Generate and verify an UltraHonk proof for the E-PoH circuit.
 * Uses @noir-lang/noir_js + @aztec/bb.js for in-process proving.
 *
 * Usage: node prove.mjs
 */
import { Noir } from "@noir-lang/noir_js";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const circuitPath = resolve(
  __dirname,
  "../epoh_badge/target/epoh_badge.json"
);

console.log("Loading circuit artifact...");
const circuit = JSON.parse(readFileSync(circuitPath, "utf-8"));

// Initialize Barretenberg API first, then create Noir and backend
console.log("Initializing Barretenberg...");
const api = await Barretenberg.new();
const noir = new Noir(circuit);
const backend = new UltraHonkBackend(circuit.bytecode, api);

// Input values (from Prover.toml)
const inputs = {
  claim_type: "0",
  subject_address: [
    "0x70", "0x99", "0x79", "0x70", "0xc5", "0x18", "0x12", "0xdc",
    "0x3a", "0x01", "0x0c", "0x7d", "0x01", "0xb5", "0x0e", "0x0d",
    "0x17", "0xdc", "0x79", "0xc8",
  ],
  issued_at: "1700000000",
  expires_at: "1700086400",
  issuer_pubkey_x: [
    "0x83", "0x18", "0x53", "0x5b", "0x54", "0x10", "0x5d", "0x4a",
    "0x7a", "0xae", "0x60", "0xc0", "0x8f", "0xc4", "0x5f", "0x96",
    "0x87", "0x18", "0x1b", "0x4f", "0xdf", "0xc6", "0x25", "0xbd",
    "0x1a", "0x75", "0x3f", "0xa7", "0x39", "0x7f", "0xed", "0x75",
  ],
  issuer_pubkey_y: [
    "0x35", "0x47", "0xf1", "0x1c", "0xa8", "0x69", "0x66", "0x46",
    "0xf2", "0xf3", "0xac", "0xb0", "0x8e", "0x31", "0x01", "0x6a",
    "0xfa", "0xc2", "0x3e", "0x63", "0x0c", "0x5d", "0x11", "0xf5",
    "0x9f", "0x61", "0xfe", "0xf5", "0x7b", "0x0d", "0x2a", "0xa5",
  ],
  signature: [
    "0xf6", "0xb8", "0x1f", "0xe6", "0xdd", "0x5f", "0x11", "0xce",
    "0xce", "0x68", "0x55", "0x7b", "0x69", "0x1f", "0xd8", "0x87",
    "0xaf", "0xb7", "0x50", "0xbd", "0xe4", "0x6d", "0xa2", "0x6f",
    "0x4e", "0x69", "0xcf", "0x55", "0x67", "0xe2", "0x50", "0x31",
    "0x57", "0x07", "0x7c", "0xe2", "0xdf", "0x9f", "0x12", "0xb7",
    "0x68", "0x5e", "0xa9", "0x17", "0x9c", "0xe5", "0x8c", "0xcb",
    "0x8e", "0xde", "0x47", "0xb0", "0x75", "0x39", "0xd0", "0x40",
    "0x4e", "0xe9", "0xd5", "0x6f", "0x9b", "0xc5", "0x50", "0xd2",
  ],
  hashed_message: [
    "0x8c", "0x3c", "0xd6", "0x47", "0xc7", "0x4f", "0xa5", "0xb9",
    "0xc3", "0x7e", "0xce", "0x67", "0xd2", "0x02", "0xa5", "0x1a",
    "0x62", "0xd4", "0xb9", "0x82", "0x71", "0x1d", "0x02", "0xf9",
    "0x4c", "0x2d", "0x58", "0xb0", "0x9d", "0x63", "0x7f", "0x16",
  ],
};

console.log("Executing circuit (generating witness)...");
const startExec = Date.now();
const { witness, returnValue } = await noir.execute(inputs);
const execTime = Date.now() - startExec;
console.log(`Witness generated in ${execTime}ms`);
console.log("Public outputs:", returnValue);

console.log("Generating proof...");
const startProve = Date.now();
const proof = await backend.generateProof(witness, {
  verifierTarget: "evm",
});
const proveTime = Date.now() - startProve;
console.log(`Proof generated in ${proveTime}ms`);
console.log(`Proof size: ${proof.proof.length} bytes`);

// Save proof
const proofPath = resolve(__dirname, "../epoh_badge/target/proof.json");
writeFileSync(
  proofPath,
  JSON.stringify({
    proof: Array.from(proof.proof),
    publicInputs: proof.publicInputs,
  })
);
console.log(`Proof saved to ${proofPath}`);

// Compute verification key
console.log("Computing verification key...");
const vk = await backend.getVerificationKey({ verifierTarget: "evm" });
console.log(`Verification key size: ${vk.length} bytes`);

// Verify
console.log("Verifying proof...");
const startVerify = Date.now();
const isValid = await backend.verifyProof(
  { ...proof, verificationKey: vk },
  { verifierTarget: "evm" }
);
const verifyTime = Date.now() - startVerify;
console.log(`Proof valid: ${isValid} (verified in ${verifyTime}ms)`);

console.log("Generating Solidity verifier...");
const verifierContract = await backend.getSolidityVerifier(vk, {
  verifierTarget: "evm",
});
const verifierPath = resolve(
  __dirname,
  "../../contracts/src/Verifier.sol"
);

// Ensure contracts/src directory exists
import { mkdirSync } from "fs";
mkdirSync(dirname(verifierPath), { recursive: true });
writeFileSync(verifierPath, verifierContract);
console.log(`Solidity verifier saved to ${verifierPath}`);

// Benchmarks summary
console.log("\n=== Benchmarks ===");
console.log(`Witness generation: ${execTime}ms`);
console.log(`Proof generation:   ${proveTime}ms`);
console.log(`Proof verification: ${verifyTime}ms`);
console.log(`Proof size:         ${proof.proof.length} bytes`);

await api.destroy();
