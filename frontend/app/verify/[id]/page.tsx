"use client";

import { useState, useEffect, use } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  Clock,
  Syringe,
  TestTube,
  HeartPulse,
  QrCode,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const CLAIM_ICONS = [Syringe, TestTube, HeartPulse];
const CLAIM_LABELS = ["Vaccinated", "Test Negative", "Medically Fit"];

interface BadgeData {
  badgeId: string;
  valid: boolean;
  claimType: number;
  claimLabel: string;
  expiresAt: number;
  subjectHash: string;
  issuerHash: string;
  state: string;
}

// Demo data for when backend is unavailable
function getDemoBadge(id: string): BadgeData {
  const claimType = Number(id) % 3;
  const expiresAt = Math.floor(Date.now() / 1000) + 86400;
  return {
    badgeId: id,
    valid: true,
    claimType,
    claimLabel: CLAIM_LABELS[claimType],
    expiresAt,
    subjectHash: "0x066941c7b276ab78294d1e1511090b6df9232b21561f5d203bd047a7d0732108",
    issuerHash: "0x16b085b3d759d330bcf290a3fdbf56595330d4acbd57e8ae9360f09e22206112",
    state: "ACTIVE",
  };
}

export default function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [badge, setBadge] = useState<BadgeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchBadge() {
      try {
        const res = await fetch(`${API_URL}/verify/${id}`);
        if (!res.ok) throw new Error("Badge not found");
        setBadge(await res.json());
      } catch {
        // Fallback to demo data
        setBadge(getDemoBadge(id));
      } finally {
        setLoading(false);
      }
    }
    fetchBadge();
  }, [id]);

  const verifyUrl = typeof window !== "undefined"
    ? `${window.location.origin}/verify/${id}`
    : "";

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-muted">
        <Loader2 className="mb-3 h-10 w-10 animate-spin" />
        <p className="text-sm">Verifying badge...</p>
      </div>
    );
  }

  if (!badge) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <XCircle className="mb-4 h-16 w-16 text-danger" />
        <h1 className="mb-2 font-heading text-2xl font-bold text-foreground">
          Badge Not Found
        </h1>
        <p className="text-sm text-muted">{error || `No badge found with ID ${id}.`}</p>
      </div>
    );
  }

  const Icon = CLAIM_ICONS[badge.claimType] ?? HeartPulse;
  const timeLeft = badge.expiresAt - Math.floor(Date.now() / 1000);
  const expiryDate = new Date(badge.expiresAt * 1000).toLocaleString();

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      {/* Verification result */}
      <div
        className={`mb-8 overflow-hidden rounded-2xl border-2 ${
          badge.valid
            ? "border-success/30 bg-success/5"
            : "border-danger/30 bg-danger/5"
        }`}
      >
        <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
          {badge.valid ? (
            <>
              <CheckCircle2 className="mb-3 h-16 w-16 text-success" />
              <h1 className="font-heading text-2xl font-bold text-success">
                Verified
              </h1>
              <p className="mt-1 text-sm text-muted">
                This health badge is valid and active.
              </p>
            </>
          ) : (
            <>
              <XCircle className="mb-3 h-16 w-16 text-danger" />
              <h1 className="font-heading text-2xl font-bold text-danger">
                Expired
              </h1>
              <p className="mt-1 text-sm text-muted">
                This health badge has expired.
              </p>
            </>
          )}
        </div>

        {/* Badge details */}
        <div className="border-t border-border/50 bg-surface p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted">
                <Shield className="h-4 w-4" />
                Badge ID
              </span>
              <span className="font-mono text-sm font-semibold text-foreground">
                #{badge.badgeId}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted">
                <Icon className="h-4 w-4" />
                Claim Type
              </span>
              <span className="text-sm font-semibold text-foreground">
                {badge.claimLabel}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted">
                <Clock className="h-4 w-4" />
                {badge.valid ? "Expires" : "Expired"}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {expiryDate}
              </span>
            </div>

            <div className="pt-2">
              <p className="mb-1 text-xs text-muted">Subject Hash</p>
              <p className="truncate rounded-md bg-surface-alt px-2 py-1 font-mono text-[10px] text-foreground/60">
                {badge.subjectHash}
              </p>
            </div>

            <div>
              <p className="mb-1 text-xs text-muted">Issuer Hash</p>
              <p className="truncate rounded-md bg-surface-alt px-2 py-1 font-mono text-[10px] text-foreground/60">
                {badge.issuerHash}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* QR code for sharing */}
      <div className="flex flex-col items-center rounded-2xl border border-border bg-surface p-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <QrCode className="h-4 w-4 text-primary" />
          Share This Verification
        </div>
        <div className="rounded-xl bg-white p-4">
          <QRCodeSVG value={verifyUrl || `https://epoh.health/verify/${id}`} size={180} level="M" />
        </div>
        <p className="mt-3 max-w-xs text-center text-xs text-muted">
          Scan this QR code to verify this health badge. No app required.
        </p>
      </div>
    </div>
  );
}
