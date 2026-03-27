"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shield, Menu, X } from "lucide-react";
import {
  connectLace,
  disconnectLace,
  getStoredSubjectAddress,
  isLaceAvailable,
} from "../lib/lace";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [subjectAddress, setSubjectAddress] = useState<string | null>(null);

  useEffect(() => {
    setSubjectAddress(getStoredSubjectAddress());
  }, []);

  async function handleConnect() {
    setConnecting(true);
    try {
      const { subjectAddress: subject } = await connectLace();
      setSubjectAddress(subject);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to connect Lace wallet");
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    disconnectLace();
    setSubjectAddress(null);
  }

  const shortSubject = subjectAddress
    ? `${subjectAddress.slice(0, 8)}...${subjectAddress.slice(-6)}`
    : null;

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight text-primary">
          <Shield className="h-6 w-6" />
          E-PoH
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 sm:flex">
          <Link href="/badges" className="text-sm font-medium text-foreground/70 transition-colors hover:text-primary">
            My Badges
          </Link>
          <Link href="/request" className="text-sm font-medium text-foreground/70 transition-colors hover:text-primary">
            Request Badge
          </Link>
          {subjectAddress ? (
            <button
              onClick={handleDisconnect}
              className="rounded-lg bg-success/10 px-4 py-2 text-sm font-semibold text-success transition-all hover:bg-success/20"
            >
              Connected {shortSubject}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting || !isLaceAvailable()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-light hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
            >
              {connecting ? "Connecting..." : "Connect Lace"}
            </button>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="cursor-pointer rounded-md p-2 text-foreground/70 transition-colors hover:bg-surface-alt sm:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="border-t border-border bg-surface px-4 pb-4 pt-2 sm:hidden">
          <Link href="/badges" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-alt hover:text-primary">
            My Badges
          </Link>
          <Link href="/request" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-alt hover:text-primary">
            Request Badge
          </Link>
          {subjectAddress ? (
            <button
              onClick={() => {
                handleDisconnect();
                setOpen(false);
              }}
              className="mt-2 block w-full rounded-lg bg-success/10 px-4 py-2 text-center text-sm font-semibold text-success"
            >
              Disconnect {shortSubject}
            </button>
          ) : (
            <button
              onClick={() => {
                void handleConnect();
                setOpen(false);
              }}
              disabled={connecting || !isLaceAvailable()}
              className="mt-2 block w-full rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-white disabled:opacity-50"
            >
              {connecting ? "Connecting..." : "Connect Lace"}
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
