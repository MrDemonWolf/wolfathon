"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@wolfathon/ui/components/button";
import { AlertTriangle, CheckCircle2, Loader2, Plug, Unplug, Zap } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

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
				if (r.ok)
					toast.success(
						`Test worked — timer added ${Math.round(r.addedMs / 60000)} min. Reset the timer after.`,
					);
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
		else if (result === "partial")
			toast.error("Connected, but some events failed — try Reconnect");
		else if (result === "no_subs") toast.error("Connected, but no events were set up — try Reconnect");
		else if (result === "state_error") toast.error("Sign-in expired — try Connect again");
		else toast.error("Twitch sign-in failed");
		invalidate();
		// Strip the query param so a refresh doesn't re-toast.
		window.history.replaceState(null, "", window.location.pathname);
	}, []);

	const connected = status?.connected ?? false;
	const hasCredentials = status?.hasCredentials ?? false;

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
				className={`mt-4 flex items-center justify-between gap-3 rounded-xl border p-4 ${
					connected ? "border-primary/30 bg-primary/[0.06]" : "border-border bg-background/40"
				}`}
			>
				<div className="flex min-w-0 items-center gap-2">
					{status === undefined && statusLoading ? (
						<>
							<Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
							<div className="text-sm text-muted-foreground">Checking connection…</div>
						</>
					) : connected ? (
						<>
							<CheckCircle2 className="size-5 shrink-0 text-primary" />
							<div className="min-w-0">
								<div className="truncate font-medium">Connected as {status?.broadcasterLogin}</div>
								{status?.failedSubscriptionTypes?.length ? (
									<div className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
										<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
										<span>
											These events aren&apos;t active: {status.failedSubscriptionTypes.join(", ")}.
											Subs, gifts, bits, and channel points only work on Affiliate or Partner
											channels — if yours isn&apos;t one yet, that&apos;s expected. Otherwise click
											Reconnect.
											{status.failedSubscriptionReasons?.length ? (
												<span className="mt-1 block font-mono text-[10px] break-all opacity-70">
													{status.failedSubscriptionReasons.join(" · ")}
												</span>
											) : null}
										</span>
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
						<Button variant="outline" onClick={connect} disabled={startAuth.isPending}>
							{startAuth.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Plug className="size-4" />
							)}
							Reconnect
						</Button>
						<Button
							variant="destructive"
							onClick={() => disconnect.mutate()}
							disabled={disconnect.isPending}
						>
							{disconnect.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Unplug className="size-4" />
							)}
							{disconnect.isPending ? "Disconnecting…" : "Disconnect"}
						</Button>
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
				<div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border p-4">
					<div>
						<div className="font-medium">Test it</div>
						<div className="text-xs text-muted-foreground">
							Sends a fake sub to make sure time is added. Adds a little time, so reset the timer
							after.
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
