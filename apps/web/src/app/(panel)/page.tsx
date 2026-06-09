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
          A clean subathon reward tracker. Goals unlock one at a time as reward names
          only — no amounts, no ceiling, no timer. Run your countdown separately.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/control"
          className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
        >
          <h2 className="font-heading text-lg font-bold">Control panel</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit goals, unlock the next reward, and import/export your goal list. Gated
            by Cloudflare Access.
          </p>
        </Link>

        <a
          href="/overlay"
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
        >
          <h2 className="font-heading text-lg font-bold">Overlay ↗</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The transparent OBS browser source (1920×1080). Add this URL as a browser
            source with a transparent background.
          </p>
        </a>
      </section>
    </div>
  );
}
