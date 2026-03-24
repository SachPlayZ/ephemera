"use client";

import Link from "next/link";
import { useState } from "react";
import { Shield, Menu, X } from "lucide-react";

export function Navbar() {
  const [open, setOpen] = useState(false);

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
          <Link
            href="/request"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-light hover:shadow-md active:scale-[0.98]"
          >
            Get Started
          </Link>
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
          <Link
            href="/request"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-white"
          >
            Get Started
          </Link>
        </div>
      )}
    </nav>
  );
}
