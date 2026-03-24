"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export type ProofStatus = "idle" | "proving" | "verified" | "error";

interface ProofResult {
  proof: number[];
  publicInputs: string[];
}

interface UseProofReturn {
  status: ProofStatus;
  phase: string;
  result: ProofResult | null;
  error: string | null;
  prove: (circuit: any, inputs: Record<string, any>) => void;
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
          proof: e.data.proof,
          publicInputs: e.data.publicInputs,
        });
        setStatus("verified");
        setPhase("Proof generated successfully");
      } else if (type === "verified") {
        setStatus("verified");
        setPhase(e.data.valid ? "Proof is valid" : "Proof is invalid");
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
    (circuit: any, inputs: Record<string, any>) => {
      setStatus("proving");
      setPhase("Starting...");
      setResult(null);
      setError(null);
      workerRef.current?.postMessage({ type: "prove", circuit, inputs });
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
