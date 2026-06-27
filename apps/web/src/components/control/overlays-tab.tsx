"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
	AlertDialog,
	AlertDialogClose,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@wolfathon/ui/components/alert-dialog";
import { Button } from "@wolfathon/ui/components/button";
import { useCopyToClipboard } from "@wolfathon/ui/hooks/use-copy-to-clipboard";
import { Check, Copy, Eye, EyeOff, Gauge, Loader2, RotateCcw, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

const SOURCES = [
	{
		icon: Gauge,
		title: "Subathon timer",
		path: "/overlay/timer",
		// Matches the capsule's locked 131:20 aspect so the bar nearly fills the source.
		size: "1310×200",
		blurb:
			"Compact countdown bar that fills its source — auto-adds time from subs, gifts, bits, and channel points; emotes flood the bar on each add.",
	},
	{
		icon: Trophy,
		title: "Rewards",
		path: "/overlay/rewards",
		size: "1920×1080",
		blurb: "Current reward name with unlock celebration. Names only — no numbers.",
	},
] as const;

/**
 * Operator-only overlay URLs. Each URL carries the secret `?t=` token that the
 * public overlay API checks — without it OBS sources serve nothing. Resetting
 * rotates the token and instantly breaks the old URLs (re-paste in OBS).
 */
export function OverlaysTab() {
	const tokenOptions = controlTrpc.settings.get.queryOptions();
	const { data: settings, isLoading } = useQuery(tokenOptions);

	// Overlay pages are served by this web origin; resolve it client-side.
	const [origin, setOrigin] = useState("");
	useEffect(() => setOrigin(window.location.origin), []);

	const rotate = useMutation(
		controlTrpc.settings.rotateOverlayToken.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: tokenOptions.queryKey });
				toast.success("Overlay URLs reset — re-paste them into OBS");
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	const token = settings?.overlayToken;

	return (
		<div className="flex flex-col gap-4">
			<div className="rounded-2xl panel-card p-5">
				<h2 className="font-heading text-lg font-bold">Overlays</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Add each as an OBS <span className="text-foreground">Browser</span> source with a
					transparent background, sized as noted. Each URL holds a secret token — keep them private,
					and reset below if one ever leaks.
				</p>
			</div>

			{SOURCES.map((s) => {
				const url = origin && token ? `${origin}${s.path}?t=${token}` : "";
				return <OverlayCard key={s.path} {...s} url={url} loading={isLoading} />;
			})}

			{/* Danger footer — destructive reset sits directly under the source list. */}
			<div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
				<div className="eyebrow text-[0.65rem] text-destructive">Danger</div>
				<div className="mt-2 flex flex-wrap items-center justify-between gap-3">
					<div className="min-w-0">
						<h3 className="font-heading text-sm font-bold">Reset overlay URLs</h3>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Rotates the token. Use if a URL leaked. Old URLs stop working immediately.
						</p>
					</div>
					<AlertDialog>
						<AlertDialogTrigger
							render={
								<Button
									variant="destructive"
									className="shrink-0 rounded-lg"
									disabled={rotate.isPending}
								>
									{rotate.isPending ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<RotateCcw className="size-4" />
									)}
									Reset
								</Button>
							}
						/>
						<AlertDialogContent>
							<AlertDialogTitle>Reset overlay URLs?</AlertDialogTitle>
							<AlertDialogDescription>
								The current URLs stop working immediately — every OBS source using them goes blank
								until you paste the new ones. Only do this if a URL leaked.
							</AlertDialogDescription>
							<AlertDialogFooter>
								<AlertDialogClose
									render={
										<Button variant="outline" className="rounded-lg">
											Cancel
										</Button>
									}
								/>
								<AlertDialogClose
									onClick={() => rotate.mutate()}
									render={
										<Button variant="destructive" className="rounded-lg">
											Reset URLs
										</Button>
									}
								/>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>
		</div>
	);
}

function OverlayCard({
	icon: Icon,
	title,
	size,
	blurb,
	url,
	loading,
}: {
	icon: typeof Gauge;
	title: string;
	size: string;
	blurb: string;
	url: string;
	loading: boolean;
}) {
	const { copied, copy } = useCopyToClipboard();
	// Mask the token by default — the operator may be screen-sharing this gated
	// panel on stream, and a visible `?t=` would leak the secret to chat.
	const [revealed, setRevealed] = useState(false);
	const display = url ? (revealed ? url : url.replace(/\?t=.*/, "?t=••••••••••••")) : "";
	// Stable id so the Reveal control is programmatically tied to the value it toggles.
	const fieldId = `overlay-url-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

	return (
		<div className="rounded-2xl panel-card p-5">
			<div className="flex items-center gap-2">
				<Icon className="size-5 text-primary" />
				<h3 className="font-heading text-lg font-bold">{title}</h3>
				<span className="ml-auto rounded-full border border-border bg-background/60 px-2 py-0.5 font-mono text-xs text-muted-foreground">
					{size}
				</span>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
			<div className="mt-3 flex items-center gap-2">
				{/* aria-live announces the masked↔revealed swap to assistive tech. */}
				<code
					id={fieldId}
					aria-live="polite"
					className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs"
				>
					{display || (loading ? "Loading…" : "…")}
				</code>
				<Button
					variant="ghost"
					size="sm"
					className="rounded-lg"
					onClick={() => setRevealed((r) => !r)}
					disabled={!url}
					aria-label={revealed ? "Hide token" : "Reveal token"}
					aria-pressed={revealed}
					aria-controls={fieldId}
				>
					{revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
				</Button>
				<Button
					variant="outline"
					className="rounded-lg"
					onClick={() => copy(url, `${title} URL copied`)}
					disabled={!url}
				>
					{copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
					{copied ? "Copied" : "Copy"}
				</Button>
			</div>
		</div>
	);
}
