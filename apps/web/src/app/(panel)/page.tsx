import { Gauge, Sliders, Trophy } from "lucide-react";
import Link from "next/link";

/** Landing page — sets the brand tone, then routes to the two surfaces. */
export default function Home() {
	return (
		<div className="flex flex-col gap-10">
			{/* Hero */}
			<section className="flex flex-col items-start gap-5 pt-6">
				<span className="eyebrow text-xs">Subathon toolkit</span>
				<h1 className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
					Run a subathon
					<br />
					<span className="text-primary">that runs itself.</span>
				</h1>
				<p className="max-w-xl text-base leading-relaxed text-muted-foreground">
					A Twitch-driven countdown that auto-adds time from subs, gifts, bits, and channel points —
					paired with a reward tracker that unlocks names one at a time. No amounts, no ceiling, no
					spreadsheet.
				</p>
				<div className="flex flex-wrap gap-3 pt-1">
					<Link
						href="/control"
						className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
					>
						<Sliders className="size-4" />
						Open control panel
					</Link>
					<Link
						href="/control/overlays"
						className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
					>
						Get overlay URLs →
					</Link>
				</div>
			</section>

			{/* The two surfaces */}
			<section className="grid gap-4 sm:grid-cols-2">
				<Link
					href="/control"
					className="group rounded-xl panel-card p-6 transition-colors hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<Sliders className="size-6 text-primary" />
					<h2 className="mt-4 font-heading text-xl font-bold">Control panel</h2>
					<p className="mt-1.5 text-sm text-muted-foreground">
						Edit reward goals, run the countdown, set time rules, and connect Twitch. Gated by
						Cloudflare Access.
					</p>
					<span className="mt-4 inline-block text-sm font-medium text-primary transition-transform group-hover:translate-x-1">
						Open →
					</span>
				</Link>

				<Link
					href="/control/overlays"
					className="group rounded-xl panel-card p-6 transition-colors hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<div className="flex gap-2">
						<Gauge className="size-6 text-primary" />
						<Trophy className="size-6 text-primary" />
					</div>
					<h2 className="mt-4 font-heading text-xl font-bold">Overlays</h2>
					<p className="mt-1.5 text-sm text-muted-foreground">
						Transparent OBS browser sources: the subathon timer and the rewards tracker. Tokenized
						URLs live in the control panel — copy each straight into OBS.
					</p>
					<span className="mt-4 inline-block text-sm font-medium text-primary transition-transform group-hover:translate-x-1">
						Get URLs →
					</span>
				</Link>
			</section>
		</div>
	);
}
