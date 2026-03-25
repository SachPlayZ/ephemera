"use client";

import { useState, useEffect } from "react";
import { BadgeCard } from "../components/BadgeCard";
import { Shield, Plus, Loader2 } from "lucide-react";
import Link from "next/link";

interface Badge {
  tokenId: number;
  claimType: number;
  expiresAt: number;
  subjectHash: string;
  issuerHash: string;
}

// Demo badges for showcase (in production, fetch from chain)
const DEMO_BADGES: Badge[] = [
  {
    tokenId: 0,
    claimType: 0,
    expiresAt: Math.floor(Date.now() / 1000) + 86400, // 24h from now
    subjectHash: "0x066941c7b276ab78294d1e1511090b6df9232b21561f5d203bd047a7d0732108",
    issuerHash: "0x16b085b3d759d330bcf290a3fdbf56595330d4acbd57e8ae9360f09e22206112",
  },
  {
    tokenId: 1,
    claimType: 1,
    expiresAt: Math.floor(Date.now() / 1000) + 3000, // ~50 min (expiring soon)
    subjectHash: "0x066941c7b276ab78294d1e1511090b6df9232b21561f5d203bd047a7d0732108",
    issuerHash: "0x16b085b3d759d330bcf290a3fdbf56595330d4acbd57e8ae9360f09e22206112",
  },
  {
    tokenId: 2,
    claimType: 2,
    expiresAt: Math.floor(Date.now() / 1000) - 3600, // expired 1h ago
    subjectHash: "0x066941c7b276ab78294d1e1511090b6df9232b21561f5d203bd047a7d0732108",
    issuerHash: "0x16b085b3d759d330bcf290a3fdbf56595330d4acbd57e8ae9360f09e22206112",
  },
];

export default function BadgesPage() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading from chain
    const timer = setTimeout(() => {
      setBadges(DEMO_BADGES);
      setLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const activeBadges = badges.filter(
    (b) => b.expiresAt > Math.floor(Date.now() / 1000)
  );
  const expiredBadges = badges.filter(
    (b) => b.expiresAt <= Math.floor(Date.now() / 1000)
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            My Badges
          </h1>
          <p className="mt-1 text-sm text-muted">
            Your active and expired health verification badges.
          </p>
        </div>
        <Link
          href="/request"
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-light hover:shadow-md active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          New Badge
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted">
          <Loader2 className="mb-3 h-8 w-8 animate-spin" />
          <p className="text-sm">Loading badges...</p>
        </div>
      ) : badges.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface py-20">
          <Shield className="mb-4 h-12 w-12 text-muted/40" />
          <h2 className="mb-2 font-heading text-lg font-bold text-foreground">
            No Badges Yet
          </h2>
          <p className="mb-6 max-w-xs text-center text-sm text-muted">
            Request your first health badge to get started with privacy-preserving verification.
          </p>
          <Link
            href="/request"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-light"
          >
            <Plus className="h-4 w-4" />
            Request Badge
          </Link>
        </div>
      ) : (
        <>
          {/* Active badges */}
          {activeBadges.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
                Active ({activeBadges.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeBadges.map((badge) => (
                  <BadgeCard key={badge.tokenId} badge={badge} />
                ))}
              </div>
            </section>
          )}

          {/* Expired badges */}
          {expiredBadges.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
                Expired ({expiredBadges.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {expiredBadges.map((badge) => (
                  <BadgeCard key={badge.tokenId} badge={badge} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
