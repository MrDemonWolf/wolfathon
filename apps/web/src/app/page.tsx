import {
	ArrowRight,
	Bot,
	Disc3,
	Gift,
	Github,
	MonitorPlay,
	Radio,
	Ticket,
	Timer,
	Zap,
} from "lucide-react";
import Link from "next/link";

import { DISCLAIMER, SiteFooter } from "@/components/site-footer";
import { WolfMark } from "@/components/wolf-mark";

const GITHUB_URL = "https://github.com/MrDemonWolf/wolfathon";

// ── Numbered section kicker ──────────────────────────────────────────────
// One consistent spine down the page: 01 · What's inside, 02 · How it runs …
function Kicker({ index, children }: { index: string; children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center gap-2.5">
			<span className="grid size-7 place-items-center rounded-md border border-primary/25 bg-primary/10 font-mono text-xs font-semibold text-primary">
				{index}
			</span>
			<span className="eyebrow text-xs">{children}</span>
		</span>
	);
}

// What the toolkit actually does. Names map to the shipped domains (timer,
// rewards, wheel, giveaway, bot, overlays) — no aspirational features.
const FEATURES = [
	{
		icon: Timer,
		title: "Subathon timer",
		body: "A timestamp-driven countdown that keeps running while the pack keeps giving. Subs, gifts, bits, and channel points add time automatically over Twitch EventSub.",
	},
	{
		icon: Gift,
		title: "Reward tracker",
		body: "Names, never numbers. The pack sees exactly who unlocked the next reward, updating live on the overlay as goals fall.",
	},
	{
		icon: Disc3,
		title: "Wheel of dares",
		body: "Spin Howlwheel on stream for a random dare — on demand, or auto-spun every few subs. Hidden until it lands so nobody sees it coming.",
	},
	{
		icon: Ticket,
		title: "Giveaways",
		body: "Two-phase prize draws: confirm gift-sub winners, then open an !enter raffle with a fair CSPRNG draw, per-winner reroll, and a clean reset.",
	},
	{
		icon: Bot,
		title: "Chat bot",
		body: "A built-in Twitch chat bot with toggleable commands and cooldowns — reads chat free, replies through Helix. No separate bot to host.",
	},
	{
		icon: MonitorPlay,
		title: "OBS overlays",
		body: "Transparent, token-gated browser sources drop straight into OBS. Timer, rewards, and wheel — legible over any scene, no login required.",
	},
] as const;

// The operator's three-step path from clone to live.
const STEPS = [
	{
		icon: Radio,
		title: "Connect Twitch",
		body: "One OAuth redirect wires up EventSub. Subs, gifts, bits, and points start feeding the timer.",
	},
	{
		icon: MonitorPlay,
		title: "Drop overlays into OBS",
		body: "Copy the tokenized overlay URLs into browser sources. They render transparent, ready for any scene.",
	},
	{
		icon: Zap,
		title: "Go live",
		body: "Run everything from one private operator panel while time adds itself. The pack keeps the clock alive.",
	},
] as const;

export default function LandingPage() {
	return (
		<div className="app-bg flex min-h-svh flex-col text-foreground">
			<main className="flex-1">
				{/* ═══════════════ HERO ═══════════════ */}
				<section className="relative overflow-hidden">
					{/* Localized brand glow behind the hero copy. */}
					<div
						aria-hidden
						className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[420px] max-w-4xl rounded-full bg-primary/15 blur-[120px]"
					/>
					<div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-8 px-4 pb-20 pt-24 text-center sm:pt-32">
						<span
							className="animate-wolf-rise inline-flex items-center gap-2.5 rounded-full border border-border bg-card/60 px-3.5 py-1.5 backdrop-blur"
							style={{ animationDelay: "0ms" }}
						>
							<WolfMark className="size-5" />
							<span className="eyebrow text-[0.7rem]">MrDemonWolf presents</span>
						</span>

						<h1
							className="animate-wolf-rise font-heading text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl"
							style={{ animationDelay: "60ms" }}
						>
							The Wolf Pack
							<br />
							<span className="text-primary">Wolfathon.</span>
						</h1>

						<p
							className="animate-wolf-rise max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
							style={{ animationDelay: "120ms" }}
						>
							One subathon toolkit for MrDemonWolf&apos;s stream. A timer that never stops while the
							pack keeps giving — plus rewards, dares, giveaways, and OBS overlays, all run from a
							single operator panel.
						</p>

						<div
							className="animate-wolf-rise flex flex-col items-center gap-3 sm:flex-row"
							style={{ animationDelay: "180ms" }}
						>
							<Link
								href="/dashboard"
								className="group inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
							>
								Open the control panel
								<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
							</Link>
							<a
								href={GITHUB_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-7 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
							>
								<Github className="size-4" />
								View on GitHub
								<span className="sr-only">(opens in a new tab)</span>
							</a>
						</div>

						<p
							className="animate-wolf-rise text-xs text-muted-foreground/80"
							style={{ animationDelay: "220ms" }}
						>
							Stream operators only — viewers watch live on Twitch.
						</p>

						<div
							className="animate-wolf-rise flex flex-wrap items-center justify-center gap-2"
							style={{ animationDelay: "260ms" }}
						>
							{["Twitch EventSub auto-time", "Transparent OBS overlays", "Open source"].map(
								(pill) => (
									<span
										key={pill}
										className="rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground"
									>
										{pill}
									</span>
								),
							)}
						</div>
					</div>
				</section>

				{/* ═══════════════ 01 · WHAT'S INSIDE ═══════════════ */}
				<section className="mx-auto w-full max-w-6xl px-4 py-20 sm:py-28">
					<div className="mx-auto max-w-2xl text-center">
						<div className="flex justify-center">
							<Kicker index="01">What&apos;s inside</Kicker>
						</div>
						<h2 className="mt-5 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
							Everything a subathon needs, in one place.
						</h2>
						<p className="mt-4 text-base leading-relaxed text-muted-foreground">
							Six tools that share one Twitch connection and one live state — so the timer, the
							overlays, and the panel always agree.
						</p>
					</div>

					<div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{FEATURES.map(({ icon: Icon, title, body }) => (
							<div
								key={title}
								className="panel-card group flex flex-col rounded-2xl p-6 transition-colors hover:border-primary/40"
							>
								<div className="mb-5 inline-flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary transition-transform group-hover:scale-105">
									<Icon className="size-5" />
								</div>
								<h3 className="font-heading text-lg font-semibold">{title}</h3>
								<p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
							</div>
						))}
					</div>
				</section>

				{/* ═══════════════ 02 · HOW IT RUNS ═══════════════ */}
				<section className="border-y border-border/60 bg-card/30">
					<div className="mx-auto w-full max-w-6xl px-4 py-20 sm:py-28">
						<div className="mx-auto max-w-2xl text-center">
							<div className="flex justify-center">
								<Kicker index="02">How it runs</Kicker>
							</div>
							<h2 className="mt-5 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
								Clone, connect, and let it run.
							</h2>
							<p className="mt-4 text-base leading-relaxed text-muted-foreground">
								The operator panel sits behind Cloudflare Access; overlays are gated by a secret
								token so OBS can read them without a login. Viewers never touch any of it — they
								just watch the count climb.
							</p>
						</div>

						<div className="mt-14 grid gap-4 md:grid-cols-3">
							{STEPS.map(({ icon: Icon, title, body }, i) => (
								<div
									key={title}
									className="relative rounded-2xl border border-border bg-background/40 p-6"
								>
									<div className="flex items-center gap-3">
										<span className="grid size-8 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
											<Icon className="size-4" />
										</span>
										<span className="font-mono text-xs font-semibold text-muted-foreground/70">
											0{i + 1}
										</span>
									</div>
									<h3 className="mt-4 font-heading text-lg font-semibold">{title}</h3>
									<p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* ═══════════════ CTA ═══════════════ */}
				<section className="mx-auto w-full max-w-4xl px-4 py-24 text-center sm:py-32">
					<WolfMark className="mx-auto size-14" />
					<h2 className="mt-6 font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
						Ready to run your subathon?
					</h2>
					<p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
						Fire up the control panel, connect Twitch, and drop the overlays into OBS. The pack
						takes it from there.
					</p>
					<div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
						<Link
							href="/dashboard"
							className="group inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
						>
							Open the control panel
							<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
						</Link>
					</div>
					<p className="mx-auto mt-8 max-w-md text-xs leading-relaxed text-muted-foreground/80">
						{DISCLAIMER}
					</p>
				</section>
			</main>
			<SiteFooter />
		</div>
	);
}
