"use client";

import { useState } from "react";
import {
  Syringe,
  TestTube,
  HeartPulse,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";

const CLAIM_TYPES = [
  { value: 0, label: "Vaccinated", icon: Syringe, color: "border-blue-300 bg-blue-50 text-blue-700" },
  { value: 1, label: "Test Negative", icon: TestTube, color: "border-purple-300 bg-purple-50 text-purple-700" },
  { value: 2, label: "Medically Fit", icon: HeartPulse, color: "border-green-300 bg-green-50 text-green-700" },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Step = "select" | "issuing" | "proving" | "done" | "error";

export default function RequestPage() {
  const [step, setStep] = useState<Step>("select");
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [proofHex, setProofHex] = useState("");
  const [publicInputs, setPublicInputs] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  async function handleRequest() {
    if (selectedType === null) return;
    setStep("issuing");
    setPhase("Issuing health claim...");
    setError("");

    try {
      // Step 1: Issue claim
      const now = Math.floor(Date.now() / 1000);
      const issueRes = await fetch(`${API_URL}/issue-claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimType: selectedType,
          subjectAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          issuedAt: now,
          expiresAt: now + 86400,
        }),
      });

      if (!issueRes.ok) {
        throw new Error(`Failed to issue claim: ${issueRes.statusText}`);
      }

      const claim = await issueRes.json();

      // Step 2: Generate proof
      setStep("proving");
      setPhase("Generating zero-knowledge proof...");

      const proveRes = await fetch(`${API_URL}/generate-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: claim.claimId }),
      });

      if (!proveRes.ok) {
        throw new Error(`Failed to generate proof: ${proveRes.statusText}`);
      }

      const proof = await proveRes.json();
      setProofHex(proof.proof);
      setPublicInputs(proof.publicInputs);
      setStep("done");
      setPhase("");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
      setStep("error");
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(proofHex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Request a Badge
      </h1>
      <p className="mb-8 text-sm text-muted">
        Select your health claim type and generate a zero-knowledge proof.
      </p>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {["Select", "Issue", "Prove", "Done"].map((label, i) => {
          const stepIndex = { select: 0, issuing: 1, proving: 2, done: 3, error: -1 }[step];
          const isActive = i <= (stepIndex ?? -1);
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isActive
                    ? "bg-primary text-white"
                    : "bg-surface-alt text-muted"
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-xs font-medium ${isActive ? "text-foreground" : "text-muted"}`}>
                {label}
              </span>
              {i < 3 && (
                <div className={`h-px w-6 ${isActive ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Claim type selection */}
      {step === "select" && (
        <div>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {CLAIM_TYPES.map((ct) => (
              <button
                key={ct.value}
                onClick={() => setSelectedType(ct.value)}
                className={`group cursor-pointer rounded-xl border-2 p-4 text-left transition-all duration-150 hover:shadow-md active:scale-[0.98] ${
                  selectedType === ct.value
                    ? `${ct.color} ring-2 ring-primary/30 shadow-md`
                    : "border-border bg-surface hover:border-primary/20"
                }`}
              >
                <ct.icon className={`mb-3 h-6 w-6 ${selectedType === ct.value ? "" : "text-muted"}`} />
                <span className="block text-sm font-bold">{ct.label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleRequest}
            disabled={selectedType === null}
            className="w-full cursor-pointer rounded-xl bg-primary px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            Generate Proof
          </button>
        </div>
      )}

      {/* Loading states */}
      {(step === "issuing" || step === "proving") && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface py-16">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
          <p className="mb-1 text-base font-semibold text-foreground">{phase}</p>
          <p className="text-sm text-muted">
            {step === "proving"
              ? "This may take a few seconds. Your data stays private."
              : "Contacting the issuer service..."}
          </p>

          {/* Phase-based progress */}
          <div className="mt-6 flex items-center gap-3">
            <div className={`h-2 w-2 rounded-full ${step === "issuing" ? "animate-pulse bg-primary" : "bg-success"}`} />
            <span className="text-xs text-muted">Issue</span>
            <div className={`h-2 w-2 rounded-full ${step === "proving" ? "animate-pulse bg-primary" : "bg-border"}`} />
            <span className="text-xs text-muted">Prove</span>
            <div className="h-2 w-2 rounded-full bg-border" />
            <span className="text-xs text-muted">Done</span>
          </div>
        </div>
      )}

      {/* Success */}
      {step === "done" && (
        <div className="rounded-2xl border border-success/20 bg-success/5 p-6">
          <div className="mb-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <div>
              <h2 className="text-lg font-bold text-foreground">Proof Generated</h2>
              <p className="text-sm text-muted">Your zero-knowledge proof is ready.</p>
            </div>
          </div>

          {/* Public inputs */}
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Public Outputs
            </h3>
            <div className="space-y-1.5">
              {["Claim Type", "Expires At", "Subject Hash", "Issuer Hash"].map(
                (label, i) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 rounded-lg bg-surface px-3 py-2">
                    <span className="text-xs font-medium text-muted">{label}</span>
                    <span className="truncate font-mono text-xs text-foreground">
                      {publicInputs[i] ?? "—"}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Proof hex */}
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Proof ({Math.floor(proofHex.length / 2)} bytes)
            </h3>
            <div className="relative">
              <pre className="max-h-24 overflow-auto rounded-lg bg-surface p-3 font-mono text-[10px] leading-relaxed text-foreground/60">
                {proofHex.slice(0, 200)}...
              </pre>
              <button
                onClick={handleCopy}
                className="absolute right-2 top-2 cursor-pointer rounded-md bg-surface-alt p-1.5 text-muted transition-colors hover:text-foreground"
                aria-label="Copy proof"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              setStep("select");
              setSelectedType(null);
            }}
            className="cursor-pointer rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-all hover:bg-surface-alt"
          >
            Request Another
          </button>
        </div>
      )}

      {/* Error */}
      {step === "error" && (
        <div className="rounded-2xl border border-danger/20 bg-danger/5 p-6">
          <div className="mb-4 flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-danger" />
            <div>
              <h2 className="text-lg font-bold text-foreground">Something Went Wrong</h2>
              <p className="text-sm text-muted">{error}</p>
            </div>
          </div>
          <button
            onClick={() => setStep("select")}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-primary-light"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
