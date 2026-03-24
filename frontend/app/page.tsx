import { Shield, Lock, Clock, QrCode, ArrowRight, Fingerprint, Eye } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            <Lock className="h-3.5 w-3.5" />
            Zero-Knowledge Verified
          </div>

          <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Prove Your Health.
            <br />
            <span className="text-primary">Protect Your Privacy.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
            E-PoH issues temporary, cryptographically verified health badges on-chain.
            Prove vaccination, test results, or medical fitness without revealing any
            personal medical data.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/request"
              className="group inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary-light hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]"
            >
              Request a Badge
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/badges"
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-6 py-3.5 text-base font-semibold text-foreground shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.98]"
            >
              View My Badges
            </Link>
          </div>
        </div>

        {/* Decorative grid */}
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, var(--primary) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      </section>

      {/* How It Works */}
      <section className="border-t border-border bg-surface px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            How It Works
          </h2>
          <p className="mx-auto mb-14 max-w-xl text-center text-muted">
            Three steps from health claim to verifiable on-chain badge.
          </p>

          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "01",
                icon: Fingerprint,
                title: "Issue Claim",
                desc: "An authorized healthcare provider signs your health claim using their cryptographic key.",
              },
              {
                step: "02",
                icon: Eye,
                title: "Generate Proof",
                desc: "A zero-knowledge proof is generated in your browser. No medical data leaves your device.",
              },
              {
                step: "03",
                icon: QrCode,
                title: "Mint & Share",
                desc: "Your soulbound badge is minted on-chain. Share a QR code for instant verification.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="group relative rounded-2xl border border-border bg-background p-6 transition-all duration-200 hover:border-primary/30 hover:shadow-lg"
              >
                <span className="mb-3 block font-heading text-xs font-bold text-primary/40">
                  STEP {item.step}
                </span>
                <div className="mb-4 inline-flex rounded-xl bg-primary/5 p-3 text-primary">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 font-heading text-base font-bold tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-14 text-center font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Privacy by Design
          </h2>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Lock,
                title: "Zero Knowledge",
                desc: "Proofs reveal nothing about your medical records. Only the validity of the claim is verified.",
              },
              {
                icon: Clock,
                title: "Ephemeral Badges",
                desc: "Badges auto-expire after a set period. No permanent health records stored on-chain.",
              },
              {
                icon: Shield,
                title: "Soulbound NFTs",
                desc: "Badges are non-transferable and bound to your wallet. No buying or selling credentials.",
              },
              {
                icon: QrCode,
                title: "Instant Verification",
                desc: "Anyone can verify a badge by scanning a QR code. No app required.",
              },
              {
                icon: Fingerprint,
                title: "Issuer Registry",
                desc: "Only whitelisted healthcare providers can issue claims. Transparent trust model.",
              },
              {
                icon: Eye,
                title: "Client-Side Proving",
                desc: "Proofs generated in your browser via WebAssembly. Your data never leaves your device.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-border bg-surface p-5 transition-all duration-200 hover:border-primary/20 hover:shadow-md"
              >
                <div className="mb-3 inline-flex rounded-lg bg-primary/5 p-2.5 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-1.5 text-sm font-bold text-foreground">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-gradient-to-b from-primary/5 to-background px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Ready to Get Verified?
          </h2>
          <p className="mb-8 text-muted">
            Request your first privacy-preserving health badge in minutes.
          </p>
          <Link
            href="/request"
            className="group inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-8 py-4 text-lg font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary-light hover:shadow-xl active:scale-[0.98]"
          >
            Get Started
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
