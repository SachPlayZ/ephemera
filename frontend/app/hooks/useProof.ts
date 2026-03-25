"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export type ProofStatus = "idle" | "proving" | "verified" | "error";

interface ProofResult {
  badgeId: string;
  claimType: number;
  expiresAt: number;
  subjectHash: string;
  issuerHash: string;
  proofGenTimeMs: number;
}

interface UseProofReturn {
  status: ProofStatus;
  phase: string;
  result: ProofResult | null;
  error: string | null;
  prove: (claimId: string) => void;
  reset: () => void;
}

export function useProof(): UseProofReturn {
  const [status, setStatus] = useState<ProofStatus>("idle");
  const [phase, setPhase] = useState("");
  const [result, setResult] = useState<ProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(
      new URL("../lib/proof-worker.ts", import.meta.url)
    );

    worker.onmessage = (e: MessageEvent) => {
      const { type } = e.data;

      if (type === "status") {
        setPhase(e.data.phase);
      } else if (type === "proof-generated") {
        setResult({
          badgeId: e.data.badgeId,
          claimType: e.data.claimType,
          expiresAt: e.data.expiresAt,
          subjectHash: e.data.subjectHash,
          issuerHash: e.data.issuerHash,
          proofGenTimeMs: e.data.proofGenTimeMs,
        });
        setStatus("verified");
        setPhase("Badge minted on Midnight ledger");
      } else if (type === "verified") {
        setStatus("verified");
        setPhase(e.data.valid ? "Badge is valid" : "Badge is invalid or expired");
      } else if (type === "error") {
        setError(e.data.message);
        setStatus("error");
        setPhase("");
      }
    };

    worker.onerror = (err) => {
      setError(err.message ?? "Worker crashed");
      setStatus("error");
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const prove = useCallback(
    (claimId: string) => {
      setStatus("proving");
      setPhase("Starting...");
      setResult(null);
      setError(null);
      workerRef.current?.postMessage({ type: "prove", claimId });
    },
    []
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setPhase("");
    setResult(null);
    setError(null);
  }, []);

  return { status, phase, result, error, prove, reset };
}
