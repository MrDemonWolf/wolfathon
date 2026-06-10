import Link from "next/link";

import { WolfMark } from "@/components/wolf-mark";

/** Landing page — quick links to the two surfaces. */
export default function Home() {
  return (
    <div className="grid gap-8">
      <section className="flex flex-col items-start gap-3">
        <WolfMark className="size-14" />
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Wolfathon</h1>
        <p className="max-w-xl text-muted-foreground">
          A clean subathon toolkit: a reward tracker that unlocks reward names one at a
          time (no amounts, no ceiling) and a Twitch-driven countdown timer that auto-adds
          time from subs, gifts, bits, and channel points.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/control"
          className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
        >
          <h2 className="font-heading text-lg font-bold">Control panel</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Rewards, timer, and Twitch — edit goals, run the countdown, and connect
            Twitch. Gated by Cloudflare Access.
          </p>
        </Link>

        <a
          href="/overlay"
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
        >
          <h2 className="font-heading text-lg font-bold">Overlays ↗</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a transparent OBS browser source (1920×1080): the subathon timer or the
            rewards tracker. Copy each URL straight into OBS.
          </p>
        </a>
      </section>
    </div>
  );
}
