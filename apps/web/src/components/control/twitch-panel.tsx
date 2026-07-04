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
import { AlertTriangle, CheckCircle2, Loader2, Plug, Unplug, Zap } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

/** Human label per EventSub type, for the "these events aren't active" list. */
const EVENT_LABELS: Record<string, string> = {
	"channel.subscribe": "new subs",
	"channel.subscription.message": "resub messages",
	"channel.subscription.gift": "gift subs",
	"channel.cheer": "bits / cheers",
	"channel.channel_points_custom_reward_redemption.add": "channel point redemptions",
	"channel.chat.message": "chat reading (giveaway !enter)",
	"stream.online": "auto-resume when you go live",
	"stream.offline": "auto-pause when you go offline",
};

/**
 * Subs, gifts, bits, and channel points require an Affiliate/Partner channel —
 * a failure here is often just "not Affiliate yet". Everything else (chat read,
 * stream up/down) works on any channel, so those failures mean a missing
 * permission and call for a Reconnect-and-approve, NOT the Affiliate caveat.
 */
const AFFILIATE_GATED = new Set([
	"channel.subscribe",
	"channel.subscription.message",
	"channel.subscription.gift",
	"channel.cheer",
	"channel.channel_points_custom_reward_redemption.add",
]);

const labelFor = (type: string) => EVENT_LABELS[type] ?? type;

export function TwitchPanel() {
	const statusOptions = controlTrpc.twitch.getStatus.queryOptions();
	const { data: status, isLoading: statusLoading } = useQuery(statusOptions);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: statusOptions.queryKey });

	const startAuth = useMutation(controlTrpc.twitch.startAuth.mutationOptions());
	const disconnect = useMutation(
		controlTrpc.twitch.disconnect.mutationOptions({ onSuccess: invalidate }),
	);
	const sendTest = useMutation(
		controlTrpc.twitch.sendTestEvent.mutationOptions({
			onSuccess: (r) => {
				if (r.ok) toast.success("Test passed — Twitch reaches Wolfathon. No time added.");
				else toast.error(`Test failed (HTTP ${r.status})`);
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	// Surface the result of the redirect round-trip (set by /api/twitch/callback).
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const result = params.get("twitch");
		if (!result) return;
		if (result === "connected") toast.success("Twitch connected");
		else if (result === "partial") toast.error("Connected, but some events failed — try Reconnect");
		else if (result === "no_subs")
			toast.error("Connected, but no events were set up — try Reconnect");
		else if (result === "state_error") toast.error("Sign-in expired — try Connect again");
		else toast.error("Twitch sign-in failed");
		invalidate();
		// Strip the query param so a refresh doesn't re-toast.
		window.history.replaceState(null, "", window.location.pathname);
	}, []);

	const connected = status?.connected ?? false;
	const hasCredentials = status?.hasCredentials ?? false;
	const failedTypes = status?.failedSubscriptionTypes ?? [];
	const failedReasons = status?.failedSubscriptionReasons ?? [];
	const degraded = connected && failedTypes.length > 0;
	const affiliateFails = failedTypes.filter((t) => AFFILIATE_GATED.has(t));
	const permissionFails = failedTypes.filter((t) => !AFFILIATE_GATED.has(t));

	function connect() {
		startAuth.mutate(undefined, {
			onSuccess: (d) => {
				window.location.href = d.url;
			},
			onError: (e) => toast.error(e.message),
		});
	}

	return (
		<div className="rounded-2xl panel-card p-5">
			<h2 className="font-heading text-lg font-bold">Twitch</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Connect your channel so subs, gifts, bits, and channel points automatically add time to the
				timer and advance reward goals.
			</p>

			{/* Status row — renders in every state so reconnecting never swaps the whole screen. */}
			<div
				className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
					degraded
						? "border-amber-400/30 bg-amber-400/[0.06]"
						: connected
							? "border-primary/30 bg-primary/[0.06]"
							: "border-border bg-background/40"
				}`}
			>
				<div role="status" aria-live="polite" className="flex min-w-0 items-center gap-2">
					{status === undefined && statusLoading ? (
						<>
							<Loader2
								className="size-5 shrink-0 animate-spin text-muted-foreground"
								aria-label="Checking connection"
							/>
							<div className="text-sm text-muted-foreground">Checking connection…</div>
						</>
					) : connected ? (
						<>
							{degraded ? (
								<AlertTriangle className="size-5 shrink-0 text-amber-400" />
							) : (
								<CheckCircle2 className="size-5 shrink-0 text-primary" />
							)}
							<div className="min-w-0">
								<div className="truncate font-medium">
									{degraded
										? `Connected as ${status?.broadcasterLogin} — some events need attention`
										: `Connected as ${status?.broadcasterLogin}`}
								</div>
								{degraded ? (
									<div className="mt-1 space-y-1 text-xs text-amber-200/90">
										<div>
											These events aren&apos;t active: {failedTypes.map(labelFor).join(", ")}.
										</div>
										{permissionFails.length ? (
											<div>
												{permissionFails.length === failedTypes.length
													? "This usually means a permission wasn't granted — click Reconnect and approve every box on Twitch."
													: "Some of these need a permission — click Reconnect and approve every box on Twitch."}
											</div>
										) : null}
										{affiliateFails.length ? (
											<div>
												Subs, gifts, bits, and channel points only work on Affiliate or Partner
												channels — if yours isn&apos;t one yet, that&apos;s expected.
											</div>
										) : null}
										{failedReasons.length ? (
											<details className="group">
												<summary className="cursor-pointer text-amber-300 underline-offset-2 hover:underline">
													Technical details
												</summary>
												<div className="mt-1 font-mono text-xs break-all text-muted-foreground">
													{failedReasons.join(" · ")}
												</div>
											</details>
										) : null}
									</div>
								) : (
									<div className="text-xs text-muted-foreground">Everything&apos;s set up.</div>
								)}
							</div>
						</>
					) : hasCredentials ? (
						<>
							<AlertTriangle className="size-5 shrink-0 text-muted-foreground" />
							<div className="min-w-0">
								<div className="font-medium">Not connected</div>
								<div className="text-xs text-muted-foreground">
									Click Connect and sign in with your Twitch account.
								</div>
							</div>
						</>
					) : (
						<>
							<AlertTriangle className="size-5 shrink-0 text-destructive" />
							<div className="min-w-0">
								<div className="font-medium">Twitch isn&apos;t configured yet</div>
								<div className="text-xs text-muted-foreground">
									Your Twitch app keys haven&apos;t been added on the server. Ask whoever deployed
									Wolfathon to set them up, then refresh.
								</div>
							</div>
						</>
					)}
				</div>
				{connected ? (
					<div className="flex shrink-0 items-center gap-2">
						{/* In the degraded state Reconnect is the recommended fix, so it leads
						    (primary) and Disconnect steps back (ghost). */}
						<Button
							variant={degraded ? "default" : "outline"}
							onClick={connect}
							disabled={startAuth.isPending}
						>
							{startAuth.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Plug className="size-4" />
							)}
							Reconnect
						</Button>
						<AlertDialog>
							<AlertDialogTrigger
								render={
									<Button
										variant={degraded ? "ghost" : "destructive"}
										disabled={disconnect.isPending}
									>
										{disconnect.isPending ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<Unplug className="size-4" />
										)}
										{disconnect.isPending ? "Disconnecting…" : "Disconnect"}
									</Button>
								}
							/>
							<AlertDialogContent>
								<AlertDialogTitle>Disconnect Twitch?</AlertDialogTitle>
								<AlertDialogDescription>
									Time will stop being added from subs, gifts, bits, and channel points until you
									reconnect. Your timer keeps its current value.
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
										onClick={() => disconnect.mutate()}
										render={
											<Button variant="destructive" className="rounded-lg">
												Disconnect
											</Button>
										}
									/>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				) : (
					<Button
						size="lg"
						className="shrink-0"
						disabled={!hasCredentials || startAuth.isPending}
						onClick={connect}
					>
						{startAuth.isPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Plug className="size-4" />
						)}
						{startAuth.isPending ? "Connecting…" : "Connect Twitch"}
					</Button>
				)}
			</div>

			{connected ? (
				<div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
					<div>
						<div className="font-medium">Test it</div>
						<div className="text-xs text-muted-foreground">
							Sends a signed test event to confirm Twitch can reach Wolfathon. Safe to run anytime —
							it doesn&apos;t add time.
						</div>
					</div>
					<Button
						variant="secondary"
						className="shrink-0"
						onClick={() => sendTest.mutate()}
						disabled={sendTest.isPending}
					>
						<Zap className="size-4" />
						{sendTest.isPending ? "Sending…" : "Send test"}
					</Button>
				</div>
			) : null}
		</div>
	);
}
