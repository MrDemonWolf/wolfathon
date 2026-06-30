import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { DISCLAIMER, SiteFooter } from "@/components/site-footer";
import { WolfMark } from "@/components/wolf-mark";

export default function LandingPage() {
	return (
		<div className="app-bg flex min-h-svh flex-col text-foreground">
			<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
				<div className="flex flex-col items-center gap-4">
					<WolfMark className="size-16" />
					<p className="font-heading text-sm font-semibold uppercase tracking-[0.2em] text-primary">
						MrDemonWolf presents
					</p>
					<h1 className="font-heading text-5xl font-extrabold tracking-tight">
						The Wolf Pack Wolfathon
					</h1>
					<p className="max-w-md text-muted-foreground">
						Join the pack — every sub, cheer, and tip keeps the timer running. Live timers, rewards,
						giveaways, and overlays for MrDemonWolf&apos;s stream.
					</p>
				</div>
				<div className="flex flex-col items-center gap-2">
					<Link
						href="/dashboard"
						className="group inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
					>
						Open the control panel
						<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
					</Link>
					<p className="text-xs text-muted-foreground/80">
						Stream operators only — viewers watch live on Twitch.
					</p>
				</div>
				<p className="max-w-md text-xs leading-relaxed text-muted-foreground/80">{DISCLAIMER}</p>
			</main>
			<SiteFooter />
		</div>
	);
}
