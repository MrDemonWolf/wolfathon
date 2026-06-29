import Link from "next/link";

import { WolfMark } from "@/components/wolf-mark";

export default function LandingPage() {
	return (
		<div className="app-bg flex min-h-svh flex-col items-center justify-center gap-8 px-4 text-foreground">
			<div className="flex flex-col items-center gap-4 text-center">
				<WolfMark className="size-16" />
				<h1 className="font-heading text-4xl font-extrabold tracking-tight">Wolfathon</h1>
				<p className="max-w-sm text-muted-foreground">
					Twitch subathon toolkit — timers, rewards, giveaways, and overlays for your stream.
				</p>
			</div>
			<Link
				href="/dashboard"
				className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
			>
				Open dashboard
			</Link>
		</div>
	);
}
