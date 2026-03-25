/**
 * Web Worker for ZK proof generation — Midnight Edition.
 *
 * In the Midnight architecture, ZK proof generation is handled by the
 * proof server (Docker container on port 6300), NOT in the browser.
 *
 * The Compact runtime + proof server handle:
 *   1. Witness execution (private inputs)
 *   2. Circuit evaluation
 *   3. ZK proof generation
 *   4. Transaction submission
 *
 * This worker now delegates proof generation to the backend API,
 * which coordinates with the Midnight proof server.
 */

const API_URL = "http://localhost:3001";

self.onmessage = async (e: MessageEvent) => {
  const { type, claimId } = e.data;

  if (type === "prove") {
    try {
      self.postMessage({ type: "status", phase: "Submitting to Midnight proof server..." });

      const res = await fetch(`${API_URL}/generate-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? `Proof generation failed: ${res.statusText}`);
      }

      const result = await res.json();

      self.postMessage({
        type: "proof-generated",
        badgeId: result.badgeId,
        claimType: result.claimType,
        expiresAt: result.expiresAt,
        subjectHash: result.subjectHash,
        issuerHash: result.issuerHash,
        proofGenTimeMs: result.proofGenTimeMs,
      });
    } catch (err: any) {
      self.postMessage({ type: "error", message: err.message ?? String(err) });
    }
  }

  if (type === "verify") {
    try {
      self.postMessage({ type: "status", phase: "Verifying badge on Midnight ledger..." });

      const res = await fetch(`${API_URL}/verify/${e.data.badgeId}`);
      if (!res.ok) {
        throw new Error("Badge not found on ledger");
      }

      const badge = await res.json();
      self.postMessage({ type: "verified", valid: badge.valid, badge });
    } catch (err: any) {
      self.postMessage({ type: "error", message: err.message ?? String(err) });
    }
  }
};
