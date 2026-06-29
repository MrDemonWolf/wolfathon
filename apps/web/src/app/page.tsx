import Link from "next/link";

import { WolfMark } from "@/components/wolf-mark";

export default function LandingPage() {
	return (
		<div className="app-bg flex min-h-svh flex-col items-center justify-center gap-8 px-4 text-foreground">
			<div className="flex flex-col items-center gap-4 text-center">
				<WolfMark className="size-16" />
				<p className="font-heading text-sm font-semibold uppercase tracking-[0.2em] text-primary">
					MrDemonWolf presents
				</p>
				<h1 className="font-heading text-5xl font-extrabold tracking-tight">
					The Wolf Pack Subathon
				</h1>
				<p className="max-w-md text-muted-foreground">
					Join the pack — every sub, cheer, and tip keeps the timer running. Live timers, rewards,
					giveaways, and overlays for MrDemonWolf&apos;s stream.
				</p>
			</div>
			<Link
				href="/dashboard"
				className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
			>
				Enter the den
			</Link>
		</div>
	);
}
