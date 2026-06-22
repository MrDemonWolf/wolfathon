"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@wolfathon/ui/components/button";
import { Input } from "@wolfathon/ui/components/input";
import { AlertTriangle, CheckCircle2, HandCoins, Loader2, Plug, Unplug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

function fmtAgo(ts: number): string {
	const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
	if (s < 60) return `${s}s ago`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	return `${Math.round(m / 60)}h ago`;
}

export function StreamElementsPanel() {
	const statusOptions = controlTrpc.streamElements.getStatus.queryOptions();
	const { data: status, isLoading } = useQuery({
		...statusOptions,
		// Poll while a token is set but not yet authenticated, so the card flips to
		// "Connected" once the listener DO comes up (within ~1 min of saving).
		refetchInterval: (q) => (q.state.data && !q.state.data.connected ? 4000 : false),
	});
	const invalidate = () => queryClient.invalidateQueries({ queryKey: statusOptions.queryKey });

	const [jwt, setJwt] = useState("");
	const [channelId, setChannelId] = useState("");

	const connect = useMutation(
		controlTrpc.streamElements.connect.mutationOptions({
			onSuccess: () => {
				setJwt("");
				setChannelId("");
				toast.success("Saved — the listener connects within a minute");
				invalidate();
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const disconnect = useMutation(
		controlTrpc.streamElements.disconnect.mutationOptions({
			onSuccess: () => {
				toast.success("StreamElements disconnected");
				invalidate();
			},
		}),
	);

	return (
		<div className="rounded-xl panel-card p-5">
			<div className="flex items-center gap-2">
				<HandCoins className="size-5 text-primary" />
				<h2 className="font-heading text-lg font-bold">StreamElements</h2>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Tips add time and advance the reward goals (rates live in the Timer tab). The channel token
				is stored server-side — paste a new one here anytime to rotate, no redeploy.
			</p>

			<div className="mt-4 flex flex-col gap-3">
				{status === undefined && isLoading ? (
					<div className="flex items-center gap-2 rounded-lg border border-border p-4 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Checking StreamElements connection…
					</div>
				) : status?.connected ? (
					<div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
						<div className="flex items-center gap-2">
							<CheckCircle2 className="size-5 text-primary" />
							<div>
								<div className="font-medium">Connected</div>
								<div className="text-xs text-muted-foreground">
									{status.channelId ? `Channel ${status.channelId} · ` : ""}
									{status.lastTipAt ? `last tip ${fmtAgo(status.lastTipAt)}` : "listening for tips"}
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
				) : status?.hasJwt ? (
					<div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
						<div className="flex items-center gap-2 text-sm">
							<Loader2 className="size-4 animate-spin text-amber-400" />
							<div>
								<div className="font-medium">Connecting…</div>
								<div className="text-xs text-muted-foreground">
									{status.lastError
										? `Last error: ${status.lastError}`
										: "Token saved — the listener authenticates within a minute."}
								</div>
							</div>
						</div>
						<Button
							variant="ghost"
							onClick={() => disconnect.mutate()}
							disabled={disconnect.isPending}
						>
							Clear
						</Button>
					</div>
				) : (
					<form
						className="flex flex-col gap-3 rounded-lg border border-border p-4"
						onSubmit={(e) => {
							e.preventDefault();
							const token = jwt.trim();
							if (token.length < 20) {
								toast.error("Paste your StreamElements channel JWT.");
								return;
							}
							connect.mutate({ jwt: token, channelId: channelId.trim() || undefined });
						}}
					>
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<AlertTriangle className="size-5" />
							Not connected
						</div>
						<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
							Channel JWT token
							<Input
								className="h-9 rounded-lg font-mono"
								type="password"
								autoComplete="off"
								placeholder="eyJhbGciOi…"
								value={jwt}
								onChange={(e) => setJwt(e.target.value)}
							/>
						</label>
						<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
							Channel ID <span className="font-normal">(optional)</span>
							<Input
								className="h-9 rounded-lg font-mono"
								autoComplete="off"
								placeholder="5e8f27…"
								value={channelId}
								onChange={(e) => setChannelId(e.target.value)}
							/>
						</label>
						<Button type="submit" size="lg" className="self-start" disabled={connect.isPending}>
							{connect.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Plug className="size-4" />
							)}
							{connect.isPending ? "Saving…" : "Connect StreamElements"}
						</Button>
					</form>
				)}

				{/* where to find the token */}
				<p className="text-xs text-muted-foreground">
					Get the token at streamelements.com → <span className="text-foreground">Account</span> →{" "}
					<span className="text-foreground">Channel JWT Token</span> (Show secrets). It is stored
					server-side and never shown again — rotate it by pasting a new one.
				</p>
			</div>
		</div>
	);
}
