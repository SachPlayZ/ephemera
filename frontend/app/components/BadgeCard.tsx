"use client";

import { useEffect, useState } from "react";
import { Syringe, TestTube, HeartPulse, Clock, QrCode } from "lucide-react";
import Link from "next/link";

interface Badge {
  tokenId: number;
  claimType: number;
  expiresAt: number;
  subjectHash: string;
  issuerPubkeyHash: string;
}

const CLAIM_ICONS = [Syringe, TestTube, HeartPulse];
const CLAIM_LABELS = ["Vaccinated", "Test Negative", "Medically Fit"];
const CLAIM_COLORS = [
  { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600" },
  { bg: "bg-purple-50", border: "border-purple-200", icon: "text-purple-600" },
  { bg: "bg-green-50", border: "border-green-200", icon: "text-green-600" },
];

export function BadgeCard({ badge }: { badge: Badge }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [status, setStatus] = useState<"valid" | "expiring" | "expired">("valid");

  useEffect(() => {
    function update() {
      const now = Math.floor(Date.now() / 1000);
      const diff = badge.expiresAt - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        setStatus("expired");
        return;
      }

      if (diff < 3600) {
        setStatus("expiring");
      } else {
        setStatus("valid");
      }

      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        setTimeLeft(`${days}d ${hours % 24}h`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`);
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [badge.expiresAt]);

  const Icon = CLAIM_ICONS[badge.claimType] ?? HeartPulse;
  const label = CLAIM_LABELS[badge.claimType] ?? "Unknown";
  const colors = CLAIM_COLORS[badge.claimType] ?? CLAIM_COLORS[0];

  const statusStyles = {
    valid: "ring-2 ring-success/20",
    expiring: "ring-2 ring-warning/30 animate-pulse",
    expired: "opacity-50 grayscale",
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border ${colors.border} ${colors.bg} p-6 shadow-sm transition-all duration-300 hover:shadow-lg ${statusStyles[status]}`}
    >
      {/* Status indicator */}
      <div className="absolute right-4 top-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            status === "valid"
              ? "bg-success/10 text-success"
              : status === "expiring"
              ? "bg-warning/10 text-warning"
              : "bg-foreground/10 text-muted"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === "valid"
                ? "bg-success"
                : status === "expiring"
                ? "bg-warning animate-pulse"
                : "bg-muted"
            }`}
          />
          {status === "valid" ? "Active" : status === "expiring" ? "Expiring" : "Expired"}
        </span>
      </div>

      {/* Icon + label */}
      <div className="mb-4 flex items-center gap-3">
        <div className={`rounded-xl bg-surface p-3 shadow-sm ${colors.icon}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-foreground/80">
            {label}
          </h3>
          <p className="text-xs text-muted">Badge #{badge.tokenId}</p>
        </div>
      </div>

      {/* Timer */}
      <div className="mb-4 flex items-center gap-2 text-foreground/70">
        <Clock className="h-4 w-4" />
        <span className="font-body text-sm font-medium tabular-nums">{timeLeft}</span>
      </div>

      {/* QR link */}
      <Link
        href={`/verify/${badge.tokenId}`}
        className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs font-semibold text-primary shadow-sm transition-all hover:bg-primary hover:text-white active:scale-[0.97]"
      >
        <QrCode className="h-3.5 w-3.5" />
        Verify / Share
      </Link>
    </div>
  );
}
