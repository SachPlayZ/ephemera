/**
 * Proof Service — Generates UltraHonk ZK proofs using @noir-lang/noir_js + @aztec/bb.js.
 */
import { Noir } from "@noir-lang/noir_js";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { SignedClaim } from "./issuer.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ProofResult {
  proof: Uint8Array;
  publicInputs: string[];
}

export class ProofService {
  private circuit: any;
  private noir: Noir | null = null;
  private backend: UltraHonkBackend | null = null;
  private api: InstanceType<typeof Barretenberg> | null = null;
  private initialized = false;

  constructor(circuitPath?: string) {
    const path =
      circuitPath ??
      resolve(__dirname, "../../../circuits/epoh_badge/target/epoh_badge.json");
    this.circuit = JSON.parse(readFileSync(path, "utf-8"));
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.api = await Barretenberg.new();
    this.noir = new Noir(this.circuit);
    this.backend = new UltraHonkBackend(this.circuit.bytecode, this.api);
    this.initialized = true;
  }

  async generateProof(signedClaim: SignedClaim): Promise<ProofResult> {
    await this.init();

    const inputs = {
      claim_type: signedClaim.claim.claimType.toString(),
      subject_address: toHexArray(
        hexToBytes20(signedClaim.claim.subjectAddress)
      ),
      issued_at: signedClaim.claim.issuedAt.toString(),
      expires_at: signedClaim.claim.expiresAt.toString(),
      issuer_pubkey_x: toHexArray(signedClaim.issuerPubkeyX),
      issuer_pubkey_y: toHexArray(signedClaim.issuerPubkeyY),
      signature: toHexArray(signedClaim.signature),
      hashed_message: toHexArray(signedClaim.hashedMessage),
    };

    const { witness } = await this.noir!.execute(inputs);
    const proof = await this.backend!.generateProof(witness, {
      verifierTarget: "evm",
    });

    return {
      proof: proof.proof,
      publicInputs: proof.publicInputs,
    };
  }

  async verifyProof(proofResult: ProofResult): Promise<boolean> {
    await this.init();
    const vk = await this.backend!.getVerificationKey({
      verifierTarget: "evm",
    });
    return this.backend!.verifyProof(
      {
        proof: proofResult.proof,
        publicInputs: proofResult.publicInputs,
        verificationKey: vk,
      } as any,
      { verifierTarget: "evm" }
    );
  }

  async destroy(): Promise<void> {
    if (this.api) {
      await this.api.destroy();
      this.api = null;
      this.noir = null;
      this.backend = null;
      this.initialized = false;
    }
  }
}

function toHexArray(bytes: Uint8Array): string[] {
  return Array.from(bytes).map(
    (b) => "0x" + b.toString(16).padStart(2, "0")
  );
}

function hexToBytes20(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
