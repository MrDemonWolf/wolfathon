"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { env } from "@wolfathon/env/web";
import { Button } from "@wolfathon/ui/components/button";
import {
	AlertTriangle,
	CheckCircle2,
	Copy,
	ExternalLink,
	Loader2,
	Plug,
	Unplug,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

const SCOPES = "channel:read:subscriptions, bits:read, channel:read:redemptions";

/** Full, selectable URL with a one-click copy — the values must be transcribed exactly. */
function CopyUrl({ value, label }: { value: string; label: string }) {
	const [copied, setCopied] = useState(false);
	async function copy() {
		if (!value) return;
		await navigator.clipboard.writeText(value);
		setCopied(true);
		toast.success(`${label} copied`);
		setTimeout(() => setCopied(false), 1500);
	}
	return (
		<div className="flex items-center gap-2">
			<code className="min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs break-all">
				{value || "…"}
			</code>
			<Button
				variant="outline"
				size="sm"
				className="h-9 shrink-0 rounded-lg"
				onClick={copy}
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
	const { data: status } = useQuery(statusOptions);
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

	return (
		<div className="rounded-2xl panel-card p-5">
			<h2 className="font-heading text-lg font-bold">Twitch</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Auto-add time from subs, gifts, bits, and channel points via EventSub.
			</p>

			{status?.connected ? (
				<div className="mt-4 flex flex-col gap-3">
					<div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-4">
						<div className="flex items-center gap-2">
							<CheckCircle2 className="size-5 text-primary" />
							<div>
								<div className="font-medium">Connected as {status.broadcasterLogin}</div>
								<div className="text-xs text-muted-foreground">
									{status.subscriptionCount} EventSub subscriptions active
								</div>
							</div>
						</div>
						<Button
							variant="destructive"
							className="rounded-lg"
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

					{/* Live end-to-end test: signs a real EventSub notification and POSTs it
              to the public webhook, exactly like Twitch does. */}
					<div className="flex items-center justify-between rounded-xl border border-border p-4">
						<div>
							<div className="font-medium">Test EventSub</div>
							<div className="text-xs text-muted-foreground">
								Sends a signed <code className="font-mono">channel.subscribe</code> to your webhook
								— verifies signature, reachability &amp; timer. Adds T1 time, so reset after.
							</div>
						</div>
						<Button
							variant="secondary"
							className="rounded-lg"
							onClick={() => sendTest.mutate()}
							disabled={sendTest.isPending}
						>
							<Zap className="size-4" />
							{sendTest.isPending ? "Sending…" : "Send test"}
						</Button>
					</div>
				</div>
			) : (
				<div className="mt-4 flex flex-col gap-4">
					{/* 1. credentials (from env) */}
					<div>
						<div className="text-xs font-medium text-muted-foreground">
							1. Twitch app credentials
						</div>
						{status?.hasCredentials ? (
							<div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
								<CheckCircle2 className="size-4 text-primary" />
								Loaded from environment
							</div>
						) : (
							<div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
								<AlertTriangle className="mt-0.5 size-4 text-destructive" />
								<span>
									Set <code className="font-mono">TWITCH_CLIENT_ID</code> and{" "}
									<code className="font-mono">TWITCH_CLIENT_SECRET</code> in the environment, then
									redeploy.
								</span>
							</div>
						)}
						<p className="mt-2 text-xs text-muted-foreground">
							Create an app at dev.twitch.tv (Confidential). Set its OAuth Redirect URL to this
							exact value:
						</p>
						<div className="mt-1.5">
							<CopyUrl value={redirectUrl} label="Redirect URL" />
						</div>
						<p className="mt-1.5 text-xs text-muted-foreground">Scopes requested: {SCOPES}.</p>
					</div>

					{/* 2. connect */}
					<div>
						<div className="text-xs font-medium text-muted-foreground">2. Authorize</div>
						<Button
							className="mt-2 h-10 rounded-lg px-4"
							disabled={!status?.hasCredentials || startAuth.isPending}
							onClick={() =>
								startAuth.mutate(undefined, {
									onSuccess: (d) => {
										window.location.href = d.url;
									},
									onError: (e) => toast.error(e.message),
								})
							}
						>
							{startAuth.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Plug className="size-4" />
							)}
							{startAuth.isPending ? "Connecting…" : "Connect Twitch"}
						</Button>
						<p className="mt-1 text-xs text-muted-foreground">
							Sends you to Twitch to approve, then back here.
						</p>
					</div>
				</div>
			)}

			<div className="mt-4 border-t border-border pt-3">
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<ExternalLink className="size-3.5" />
					EventSub callback
				</div>
				<div className="mt-1.5">
					<CopyUrl value={callback} label="EventSub callback" />
				</div>
			</div>
		</div>
	);
}
