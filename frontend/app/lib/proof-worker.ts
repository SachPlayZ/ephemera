/**
 * Web Worker for ZK proof generation.
 * Runs Barretenberg WASM in a background thread to avoid blocking the UI.
 */

import { Noir } from "@noir-lang/noir_js";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";

let noir: Noir | null = null;
let backend: UltraHonkBackend | null = null;
let api: InstanceType<typeof Barretenberg> | null = null;

async function init(circuit: any) {
  if (noir && backend) return;
  self.postMessage({ type: "status", phase: "Initializing proof system..." });
  api = await Barretenberg.new();
  noir = new Noir(circuit);
  backend = new UltraHonkBackend(circuit.bytecode, api);
}

self.onmessage = async (e: MessageEvent) => {
  const { type, circuit, inputs } = e.data;

  if (type === "prove") {
    try {
      await init(circuit);

      self.postMessage({ type: "status", phase: "Generating witness..." });
      const { witness } = await noir!.execute(inputs);

      self.postMessage({ type: "status", phase: "Generating proof..." });
      const proof = await backend!.generateProof(witness, {
        verifierTarget: "evm",
      });

      self.postMessage({
        type: "proof-generated",
        proof: Array.from(proof.proof),
        publicInputs: proof.publicInputs,
      });
    } catch (err: any) {
      self.postMessage({ type: "error", message: err.message ?? String(err) });
    }
  }

  if (type === "verify") {
    try {
      await init(circuit);

      self.postMessage({ type: "status", phase: "Verifying proof..." });
      const vk = await backend!.getVerificationKey({ verifierTarget: "evm" });
      const isValid = await backend!.verifyProof(
        {
          proof: new Uint8Array(e.data.proof),
          publicInputs: e.data.publicInputs,
          verificationKey: vk,
        } as any,
        { verifierTarget: "evm" }
      );

      self.postMessage({ type: "verified", valid: isValid });
    } catch (err: any) {
      self.postMessage({ type: "error", message: err.message ?? String(err) });
    }
  }
};
