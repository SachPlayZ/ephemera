"use client";

import { useState, useEffect } from "react";
import { BadgeCard } from "../components/BadgeCard";
import { Shield, Plus, Loader2 } from "lucide-react";
import Link from "next/link";
import { getStoredSubjectAddress } from "../lib/lace";

interface Badge {
  tokenId: number;
  claimType: number;
  expiresAt: number;
  subjectHash: string;
  issuerHash: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function BadgesPage() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletConnected, setWalletConnected] = useState(false);

  useEffect(() => {
    async function loadBadges() {
      setLoading(true);
      const subjectAddress = getStoredSubjectAddress();
      if (!subjectAddress) {
        setWalletConnected(false);
        setBadges([]);
        setLoading(false);
        return;
      }

      setWalletConnected(true);
      try {
        const res = await fetch(
          `${API_URL}/badges?subjectAddress=${encodeURIComponent(subjectAddress)}`
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch badges: ${res.statusText}`);
        }
        const data = (await res.json()) as Badge[];
        setBadges(data);
      } catch (e) {
        console.error(e);
        setBadges([]);
      } finally {
        setLoading(false);
      }
    }

    void loadBadges();
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
      ) : !walletConnected ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface py-20">
          <Shield className="mb-4 h-12 w-12 text-muted/40" />
          <h2 className="mb-2 font-heading text-lg font-bold text-foreground">
            Connect Lace Wallet
          </h2>
          <p className="mb-6 max-w-xs text-center text-sm text-muted">
            Connect your Lace wallet from the top-right button to view only your badges.
          </p>
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
