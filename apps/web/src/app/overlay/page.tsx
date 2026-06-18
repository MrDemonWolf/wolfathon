"use client";

import { Button } from "@wolfathon/ui/components/button";
import { Copy, ExternalLink, Gauge, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { WolfMark } from "@/components/wolf-mark";

/**
 * Overlay chooser. Each card is a separate OBS browser source — copy its URL
 * straight into OBS (1920×1080, transparent background).
 */
export default function OverlayChooser() {
	return (
		<div className="app-bg min-h-svh text-foreground">
			<div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
				<header className="flex flex-col items-start gap-3">
					<WolfMark className="size-14" />
					<span className="eyebrow text-xs">OBS browser sources</span>
					<h1 className="font-heading text-4xl font-extrabold tracking-tight">Overlays</h1>
					<p className="text-muted-foreground">
						Add each as an OBS <span className="text-foreground">Browser</span> source at 1920×1080
						with a transparent background.
					</p>
				</header>

				<div className="grid gap-4">
					<SourceCard
						icon={<Gauge className="size-5 text-primary" />}
						title="Subathon timer"
						path="/overlay/timer"
						blurb="Big countdown that auto-adds time from subs, gifts, bits, and channel points."
					/>
					<SourceCard
						icon={<Trophy className="size-5 text-primary" />}
						title="Rewards"
						path="/overlay/rewards"
						blurb="Current reward name with unlock celebration. Names only — no numbers."
					/>
				</div>
			</div>
		</div>
	);
}

function SourceCard({
	icon,
	title,
	path,
	blurb,
}: {
	icon: React.ReactNode;
	title: string;
	path: string;
	blurb: string;
}) {
	const [copied, setCopied] = useState(false);
	const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;

	async function copy() {
		await navigator.clipboard.writeText(url);
		setCopied(true);
		toast.success(`${title} URL copied`);
		setTimeout(() => setCopied(false), 1500);
	}

	return (
		<div className="rounded-2xl panel-card p-5">
			<div className="flex items-center gap-2">
				{icon}
				<h2 className="font-heading text-lg font-bold">{title}</h2>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
			<div className="mt-3 flex items-center gap-2">
				<code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs">
					{url}
				</code>
				<Button variant="outline" className="rounded-lg" onClick={copy}>
					<Copy className="size-4" />
					{copied ? "Copied" : "Copy"}
				</Button>
				<a href={path} target="_blank" rel="noreferrer">
					<Button variant="ghost" className="rounded-lg" aria-label="Open in new tab">
						<ExternalLink className="size-4" />
					</Button>
				</a>
			</div>
		</div>
	);
}
