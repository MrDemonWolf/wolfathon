"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { env } from "@wolfathon/env/web";
import { Button } from "@wolfathon/ui/components/button";
import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	Copy,
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
		<div className="rounded-xl panel-card p-5">
			<h2 className="font-heading text-lg font-bold">Twitch</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Auto-add time from subs, gifts, bits, and channel points via EventSub.
			</p>

			<div className="mt-4 flex flex-col gap-3">
				{/* status + connect/disconnect */}
				{status?.connected ? (
					<div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
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
					<div className="flex items-center justify-between gap-3 rounded-lg border border-border p-4">
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<AlertTriangle className="size-5" />
							Not connected
						</div>
						<Button
							size="lg"
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
					</div>
				)}

				{/* credentials missing — can't connect until set in env */}
				{!status?.connected && !status?.hasCredentials && (
					<div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
						<AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
						<span>
							Set <code className="font-mono">TWITCH_CLIENT_ID</code> and{" "}
							<code className="font-mono">TWITCH_CLIENT_SECRET</code> in the environment, then
							redeploy.
						</span>
					</div>
				)}

				{/* test button — a real signed EventSub round-trip to the public webhook */}
				<div className="flex items-center justify-between gap-3 rounded-lg border border-border p-4">
					<div>
						<div className="font-medium">Test EventSub</div>
						<div className="text-xs text-muted-foreground">
							Sends a signed channel.subscribe to your webhook — verifies signature, reachability,
							and timer. Adds T1 time, so reset after.
						</div>
					</div>
					<Button
						variant="secondary"
						onClick={() => sendTest.mutate()}
						disabled={!status?.connected || sendTest.isPending}
					>
						<Zap className="size-4" />
						{sendTest.isPending ? "Sending…" : "Send test"}
					</Button>
				</div>
			</div>

			{/* setup details — only needed when first wiring up the Twitch app */}
			<details className="group mt-4 rounded-lg border border-border">
				<summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium select-none">
					Twitch app setup and URLs
					<ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
				</summary>
				<div className="flex flex-col gap-4 border-t border-border p-4">
					<div>
						<div className="text-xs font-medium text-muted-foreground">App credentials</div>
						{status?.hasCredentials ? (
							<div className="mt-1.5 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
								<CheckCircle2 className="size-4 text-primary" />
								Loaded from environment
							</div>
						) : (
							<div className="mt-1.5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
								<AlertTriangle className="mt-0.5 size-4 text-destructive" />
								<span>
									Set <code className="font-mono">TWITCH_CLIENT_ID</code> and{" "}
									<code className="font-mono">TWITCH_CLIENT_SECRET</code>, then redeploy.
								</span>
							</div>
						)}
					</div>
					<div>
						<p className="text-xs text-muted-foreground">
							Create an app at dev.twitch.tv (Confidential). Set its OAuth Redirect URL to this
							exact value:
						</p>
						<div className="mt-1.5">
							<CopyUrl value={redirectUrl} label="Redirect URL" />
						</div>
						<p className="mt-1.5 text-xs text-muted-foreground">Scopes requested: {SCOPES}.</p>
					</div>
					<div>
						<div className="text-xs font-medium text-muted-foreground">EventSub callback</div>
						<div className="mt-1.5">
							<CopyUrl value={callback} label="EventSub callback" />
						</div>
					</div>
				</div>
			</details>
		</div>
	);
}
