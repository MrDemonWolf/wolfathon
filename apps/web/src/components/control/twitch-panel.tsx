"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { env } from "@wolfathon/env/web";
import { Button } from "@wolfathon/ui/components/button";
import { useCopyToClipboard } from "@wolfathon/ui/hooks/use-copy-to-clipboard";
import { AlertTriangle, CheckCircle2, Copy, Loader2, Plug, Unplug, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

const SCOPES = "channel:read:subscriptions, bits:read, channel:read:redemptions, user:read:chat";

/** Full, selectable URL with a one-click copy — the values must be transcribed exactly. */
function CopyUrl({ value, label }: { value: string; label: string }) {
	const { copied, copy } = useCopyToClipboard();
	return (
		<div className="flex items-center gap-2">
			<code className="min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs break-all">
				{value || "…"}
			</code>
			<Button
				variant="outline"
				size="sm"
				className="h-9 shrink-0 rounded-lg"
				onClick={() => copy(value, `${label} copied`)}
				disabled={!value}
			>
				<Copy className="size-3.5" />
				{copied ? "Copied" : "Copy"}
			</Button>
		</div>
	);
}

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
						`Webhook OK (${r.status}) — timer +${Math.round(r.addedMs / 60000)}m. Full chain verified.`,
					);
				else toast.error(`Webhook rejected the event (HTTP ${r.status})`);
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	// Same-origin OAuth redirect URL the user registers in the Twitch app.
	const [redirectUrl, setRedirectUrl] = useState("");
	useEffect(() => setRedirectUrl(`${window.location.origin}/api/twitch/callback`), []);

	// Surface the result of the redirect round-trip (set by /api/twitch/callback).
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const result = params.get("twitch");
		if (!result) return;
		if (result === "connected") toast.success("Twitch connected");
		else if (result === "partial")
			toast.error("Connected, but some EventSub subscriptions failed — try reconnecting");
		else if (result === "no_subs")
			toast.error("Connected, but no EventSub subscriptions were created");
		else if (result === "state_error") toast.error("Authorization expired — try Connect again");
		else toast.error("Twitch authorization failed");
		invalidate();
		// Strip the query param so a refresh doesn't re-toast.
		window.history.replaceState(null, "", window.location.pathname);
	}, []);

	const callback = `${env.NEXT_PUBLIC_SERVER_URL}/twitch/eventsub`;

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
				Auto-add time from subs, gifts, bits, and channel points via EventSub. Sub &amp; gift events
				also advance the reward goal progress.
			</p>

			{/* Stable status row — renders in BOTH states so reconnecting never swaps the whole
			    screen. Only the body below it changes between connected and setup. */}
			<div
				className={`mt-4 flex items-center justify-between gap-3 rounded-xl border p-4 ${
					connected ? "border-primary/30 bg-primary/[0.06]" : "border-border bg-background/40"
				}`}
			>
				<div className="flex min-w-0 items-center gap-2">
					{status === undefined && statusLoading ? (
						<>
							<Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
							<div className="text-sm text-muted-foreground">Checking Twitch connection…</div>
						</>
					) : connected ? (
						<>
							<CheckCircle2 className="size-5 shrink-0 text-primary" />
							<div className="min-w-0">
								<div className="truncate font-medium">Connected as {status?.broadcasterLogin}</div>
								<div className="text-xs text-muted-foreground">
									{status?.subscriptionCount} of {status?.expectedSubscriptionCount} EventSub
									subscriptions active
								</div>
								{status?.failedSubscriptionTypes?.length ? (
									<div className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
										<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
										<span>
											Missing: {status.failedSubscriptionTypes.join(", ")} — reconnect to retry.
										</span>
									</div>
								) : null}
							</div>
						</>
					) : (
						<>
							<AlertTriangle className="size-5 shrink-0 text-muted-foreground" />
							<div className="min-w-0">
								<div className="font-medium">Not connected</div>
								<div className="text-xs text-muted-foreground">
									Follow the setup steps below to connect.
								</div>
							</div>
						</>
					)}
				</div>
				{connected ? (
					<Button
						variant="destructive"
						className="shrink-0"
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
				/* CONNECTED body — live test + reference URLs, no setup noise. */
				<div className="mt-3 flex flex-col gap-3">
					{/* test button — a real signed EventSub round-trip to the public webhook */}
					<div className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
						<div>
							<div className="font-medium">Test EventSub</div>
							<div className="text-xs text-muted-foreground">
								Sends a signed channel.subscribe to your webhook — verifies signature, reachability,
								and timer. Adds T1 time, so reset after.
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

					{/* EventSub callback — a first-class labeled item, not a buried footer. */}
					<div className="rounded-xl border border-border p-4">
						<div className="text-xs font-medium text-muted-foreground">EventSub callback URL</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Where Twitch delivers events. Already wired up — copy if you need to verify it.
						</p>
						<div className="mt-2">
							<CopyUrl value={callback} label="EventSub callback" />
						</div>
					</div>
				</div>
			) : (
				/* SETUP body — explicit numbered steps, ending in Connect. */
				<ol className="mt-3 flex flex-col gap-3">
					{/* Step 1 — create the Twitch app. */}
					<li className="rounded-xl border border-border p-4">
						<div className="flex items-start gap-3">
							<span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 font-heading text-xs font-bold text-primary">
								1
							</span>
							<div className="min-w-0">
								<div className="font-medium">Create a Twitch application</div>
								<p className="mt-0.5 text-sm text-muted-foreground">
									At <code className="font-mono text-xs">dev.twitch.tv/console/apps</code>, register
									a new app of type <span className="text-foreground">Confidential</span>. Set its
									Client ID &amp; Secret as{" "}
									<code className="font-mono text-xs">TWITCH_CLIENT_ID</code> and{" "}
									<code className="font-mono text-xs">TWITCH_CLIENT_SECRET</code> in the
									environment, then redeploy.
								</p>
								{status &&
									(hasCredentials ? (
										<div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm">
											<CheckCircle2 className="size-4 text-primary" />
											Credentials loaded from environment
										</div>
									) : (
										<div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-sm">
											<AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
											<span>
												<code className="font-mono">TWITCH_CLIENT_ID</code> /{" "}
												<code className="font-mono">TWITCH_CLIENT_SECRET</code> not set yet — add
												them and redeploy.
											</span>
										</div>
									))}
							</div>
						</div>
					</li>

					{/* Step 2 — paste the OAuth Redirect URL (copy button inline at this step). */}
					<li className="rounded-xl border border-border p-4">
						<div className="flex items-start gap-3">
							<span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 font-heading text-xs font-bold text-primary">
								2
							</span>
							<div className="min-w-0 flex-1">
								<div className="font-medium">Paste the OAuth Redirect URL</div>
								<p className="mt-0.5 text-sm text-muted-foreground">
									In your Twitch app, set the OAuth Redirect URL to this exact value:
								</p>
								<div className="mt-2">
									<CopyUrl value={redirectUrl} label="Redirect URL" />
								</div>
								<p className="mt-1.5 text-xs text-muted-foreground">Scopes requested: {SCOPES}.</p>
							</div>
						</div>
					</li>

					{/* Step 3 — connect. */}
					<li className="rounded-xl border border-border p-4">
						<div className="flex items-start gap-3">
							<span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 font-heading text-xs font-bold text-primary">
								3
							</span>
							<div className="min-w-0 flex-1">
								<div className="font-medium">Connect your channel</div>
								<p className="mt-0.5 text-sm text-muted-foreground">
									Authorize the app. We persist the webhook secret and create the EventSub
									subscriptions automatically.
								</p>
								<Button
									size="lg"
									className="mt-2"
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
								{!hasCredentials && (
									<p className="mt-1.5 text-xs text-muted-foreground">
										Set the credentials in step 1 first.
									</p>
								)}
							</div>
						</div>
					</li>

					{/* EventSub callback — clearly labeled item, available during setup too. */}
					<li className="rounded-xl border border-border p-4">
						<div className="text-xs font-medium text-muted-foreground">EventSub callback URL</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Where Twitch delivers events. Wired up automatically on connect — no action needed.
						</p>
						<div className="mt-2">
							<CopyUrl value={callback} label="EventSub callback" />
						</div>
					</li>
				</ol>
			)}
		</div>
	);
}
