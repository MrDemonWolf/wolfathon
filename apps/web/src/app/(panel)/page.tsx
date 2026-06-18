import { Gauge, Sliders, Trophy } from "lucide-react";
import Link from "next/link";

/** Landing page — sets the brand tone, then routes to the two surfaces. */
export default function Home() {
	return (
		<div className="flex flex-col gap-12">
			{/* Hero */}
			<section className="relative flex flex-col items-start gap-5 pt-6">
				<span className="eyebrow text-xs">Subathon toolkit</span>
				<h1 className="font-heading text-5xl font-extrabold tracking-tight sm:text-6xl">
					Run a subathon
					<br />
					<span className="bg-gradient-to-r from-[#5bc8f0] to-[#00aced] bg-clip-text text-transparent">
						that runs itself.
					</span>
				</h1>
				<p className="max-w-xl text-base leading-relaxed text-muted-foreground">
					A Twitch-driven countdown that auto-adds time from subs, gifts, bits, and channel points —
					paired with a reward tracker that unlocks names one at a time. No amounts, no ceiling, no
					spreadsheet.
				</p>
				<div className="flex flex-wrap gap-3 pt-1">
					<Link
						href="/control"
						className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_rgba(0,172,237,0.35)] transition-all hover:shadow-[0_0_32px_rgba(0,172,237,0.55)]"
					>
						<Sliders className="size-4" />
						Open control panel
					</Link>
					<a
						href="/overlay"
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-2 rounded-xl border border-[#00aced]/30 px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-[#13244d]/60"
					>
						Get overlay URLs ↗
					</a>
				</div>
			</section>

			{/* The two surfaces */}
			<section className="grid gap-4 sm:grid-cols-2">
				<Link
					href="/control"
					className="group rounded-2xl panel-card panel-card-rail p-6 transition-all hover:border-[#00aced]/40 hover:shadow-[0_24px_50px_-30px_rgba(0,0,0,0.9),0_0_36px_-12px_rgba(0,172,237,0.4)]"
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

				<a
					href="/overlay"
					target="_blank"
					rel="noreferrer"
					className="group rounded-2xl panel-card panel-card-rail p-6 transition-all hover:border-[#00aced]/40 hover:shadow-[0_24px_50px_-30px_rgba(0,0,0,0.9),0_0_36px_-12px_rgba(0,172,237,0.4)]"
				>
					<div className="flex gap-2">
						<Gauge className="size-6 text-primary" />
						<Trophy className="size-6 text-primary" />
					</div>
					<h2 className="mt-4 font-heading text-xl font-bold">Overlays ↗</h2>
					<p className="mt-1.5 text-sm text-muted-foreground">
						Transparent OBS browser sources (1920×1080): the subathon timer and the rewards tracker.
						Copy each URL straight into OBS.
					</p>
					<span className="mt-4 inline-block text-sm font-medium text-primary transition-transform group-hover:translate-x-1">
						Get URLs →
					</span>
				</a>
			</section>
		</div>
	);
}
