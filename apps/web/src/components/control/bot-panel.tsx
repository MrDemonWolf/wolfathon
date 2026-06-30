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
import { Checkbox } from "@wolfathon/ui/components/checkbox";
import { Input } from "@wolfathon/ui/components/input";
import { DYNAMIC_FORMATS, WOLFATHON_PARTS, type BotCommand } from "@wolfathon/api/bot";
import { AlertTriangle, Bot, CheckCircle2, Loader2, Plug, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

export function BotPanel() {
	const getOptions = controlTrpc.bot.get.queryOptions();
	const { data, isLoading } = useQuery(getOptions);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: getOptions.queryKey });

	const startAuth = useMutation(controlTrpc.bot.startAuth.mutationOptions());
	const disconnect = useMutation(
		controlTrpc.bot.disconnect.mutationOptions({ onSuccess: invalidate }),
	);
	const setEnabled = useMutation(
		controlTrpc.bot.setEnabled.mutationOptions({ onSuccess: invalidate }),
	);
	const setCooldown = useMutation(
		controlTrpc.bot.setCooldown.mutationOptions({ onSuccess: invalidate }),
	);

	// Surface the OAuth redirect result (set by /api/twitch/callback?bot=...).
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const result = params.get("bot");
		if (!result) return;
		if (result === "connected") toast.success("Bot account connected");
		else if (result === "state_error") toast.error("Sign-in expired — try Connect again");
		else toast.error("Bot sign-in failed");
		invalidate();
		window.history.replaceState(null, "", window.location.pathname);
	}, []);

	const connected = data?.connection.connected ?? false;
	const login = data?.connection.login;
	const needsReconnect = data?.connection.needsReconnect ?? false;
	const hasCredentials = data?.hasCredentials ?? false;
	const config = data?.config;

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
			<h2 className="font-heading text-lg font-bold">Chat bot</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Connect a separate bot account so Wolfathon can answer chat commands like{" "}
				<code>!wolfathon</code> and <code>!timer</code>. The bot runs on the server — it keeps
				working after you close this dashboard.
			</p>

			{/* Connection row */}
			<div
				className={`mt-4 flex items-center justify-between gap-3 rounded-xl border p-4 ${
					connected && needsReconnect
						? "border-amber-400/30 bg-amber-400/[0.06]"
						: connected
							? "border-primary/30 bg-primary/[0.06]"
							: "border-border bg-background/40"
				}`}
			>
				<div className="flex min-w-0 items-center gap-2">
					{data === undefined && isLoading ? (
						<>
							<Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
							<div className="text-sm text-muted-foreground">Checking connection…</div>
						</>
					) : connected && needsReconnect ? (
						<>
							<AlertTriangle className="size-5 shrink-0 text-amber-400" />
							<div className="min-w-0">
								<div className="truncate font-medium">Bot token expired — reconnect</div>
								<div className="text-xs text-amber-200/90">
									{login}&apos;s sign-in was revoked (password change or de-auth). The bot
									can&apos;t reply until you reconnect it.
								</div>
							</div>
						</>
					) : connected ? (
						<>
							<CheckCircle2 className="size-5 shrink-0 text-primary" />
							<div className="min-w-0">
								<div className="truncate font-medium">Bot connected as {login}</div>
								<div className="text-xs text-muted-foreground">
									Replies will be sent from this account.
								</div>
							</div>
						</>
					) : hasCredentials ? (
						<>
							<Bot className="size-5 shrink-0 text-muted-foreground" />
							<div className="min-w-0">
								<div className="font-medium">No bot connected</div>
								<div className="text-xs text-muted-foreground">
									Log into Twitch as your <strong>bot account</strong> first, then click Connect.
								</div>
							</div>
						</>
					) : (
						<>
							<AlertTriangle className="size-5 shrink-0 text-destructive" />
							<div className="min-w-0">
								<div className="font-medium">Twitch isn&apos;t configured yet</div>
								<div className="text-xs text-muted-foreground">
									The Twitch app keys haven&apos;t been added on the server. Set them up, then
									refresh.
								</div>
							</div>
						</>
					)}
				</div>
				{connected ? (
					<div className="flex shrink-0 items-center gap-2">
						{needsReconnect ? (
							<Button onClick={connect} disabled={startAuth.isPending}>
								{startAuth.isPending ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<Plug className="size-4" />
								)}
								Reconnect
							</Button>
						) : null}
						<AlertDialog>
							<AlertDialogTrigger
								render={
									<Button
										variant={needsReconnect ? "ghost" : "destructive"}
										disabled={disconnect.isPending}
									>
										{disconnect.isPending ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<Unplug className="size-4" />
										)}
										Disconnect
									</Button>
								}
							/>
							<AlertDialogContent>
								<AlertDialogTitle>Disconnect the bot account?</AlertDialogTitle>
								<AlertDialogDescription>
									The bot will stop replying to chat until you reconnect. Your command setup is
									kept.
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
						{startAuth.isPending ? "Connecting…" : "Connect bot"}
					</Button>
				)}
			</div>

			{config ? (
				<>
					{/* Master switch + cooldown */}
					<div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
						<label className="flex items-center gap-2.5">
							<Checkbox
								checked={config.enabled}
								onCheckedChange={(v) => setEnabled.mutate({ enabled: Boolean(v) })}
							/>
							<span>
								<span className="font-medium">Bot enabled</span>
								<span className="block text-xs text-muted-foreground">
									Master switch — off means the bot ignores all chat.
								</span>
							</span>
						</label>
						<CooldownField
							seconds={config.cooldownSeconds}
							onCommit={(s) => setCooldown.mutate({ seconds: s })}
						/>
					</div>

					{/* Commands */}
					<div className="mt-4 space-y-3">
						<div className="text-sm font-medium">Commands</div>
						{config.commands.map((cmd) => (
							<CommandRow key={cmd.id} cmd={cmd} />
						))}
					</div>
				</>
			) : null}
		</div>
	);
}

/** Per-command cooldown for normal viewers (mods/VIPs/broadcaster bypass). */
function CooldownField({ seconds, onCommit }: { seconds: number; onCommit: (s: number) => void }) {
	const [value, setValue] = useState(String(seconds));
	useEffect(() => setValue(String(seconds)), [seconds]);
	const commit = () => {
		const n = Number(value);
		if (Number.isFinite(n) && n !== seconds) onCommit(n);
	};
	return (
		<label className="flex items-center gap-2 text-sm">
			<span className="text-muted-foreground">Cooldown</span>
			<Input
				type="number"
				min={0}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
				className="w-20"
			/>
			<span className="text-muted-foreground">sec</span>
		</label>
	);
}

function CommandRow({ cmd }: { cmd: BotCommand }) {
	const getOptions = controlTrpc.bot.get.queryOptions();
	const invalidate = () => queryClient.invalidateQueries({ queryKey: getOptions.queryKey });
	const update = useMutation(
		controlTrpc.bot.updateCommand.mutationOptions({ onSuccess: invalidate }),
	);

	const [triggers, setTriggers] = useState(cmd.triggers.join(" "));
	const [response, setResponse] = useState(cmd.response);
	useEffect(() => setTriggers(cmd.triggers.join(" ")), [cmd.triggers]);
	useEffect(() => setResponse(cmd.response), [cmd.response]);

	const commitTriggers = () => {
		const next = triggers.split(/[\s,]+/).filter(Boolean);
		if (next.join(" ") !== cmd.triggers.join(" ")) update.mutate({ id: cmd.id, triggers: next });
	};
	const commitResponse = () => {
		if (response !== cmd.response) update.mutate({ id: cmd.id, response });
	};

	const isComposite = cmd.dynamic === "wolfathon";
	const presets = cmd.dynamic && cmd.dynamic !== "wolfathon" ? DYNAMIC_FORMATS[cmd.dynamic] : null;

	// Toggle one !wolfathon status part; commit the new membership set (canonical order).
	const activeParts = new Set(cmd.parts ?? WOLFATHON_PARTS.map((p) => p.key));
	const togglePart = (key: string, on: boolean) => {
		const next = WOLFATHON_PARTS.map((p) => p.key).filter((k) =>
			k === key ? on : activeParts.has(k),
		);
		update.mutate({ id: cmd.id, parts: next });
	};

	return (
		<div className="rounded-xl border border-border bg-background/40 p-4">
			<div className="flex items-center justify-between gap-3">
				<label className="flex items-center gap-2.5">
					<Checkbox
						checked={cmd.enabled}
						onCheckedChange={(v) => update.mutate({ id: cmd.id, enabled: Boolean(v) })}
					/>
					<span className="font-mono text-sm font-medium">{cmd.triggers[0] ?? cmd.id}</span>
				</label>
				<span className="text-xs text-muted-foreground">
					{cmd.dynamic ? "Live reply" : "Text reply"}
				</span>
			</div>

			{/* Triggers (aliases) */}
			<div className="mt-3">
				<div className="mb-1 text-xs text-muted-foreground">
					Triggers (space-separated, each starts with !)
				</div>
				<Input
					value={triggers}
					onChange={(e) => setTriggers(e.target.value)}
					onBlur={commitTriggers}
					onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
				/>
			</div>

			{/* Body: composite parts, live format presets, OR static text */}
			{isComposite ? (
				<div className="mt-3">
					<div className="mb-1 text-xs text-muted-foreground">
						Parts to include (all pulled live from the subathon)
					</div>
					<div className="space-y-1.5">
						{WOLFATHON_PARTS.map((part) => (
							<label key={part.key} className="flex items-center gap-2.5">
								<Checkbox
									checked={activeParts.has(part.key)}
									onCheckedChange={(v) => togglePart(part.key, Boolean(v))}
								/>
								<span className="text-sm">
									<span className="font-medium">{part.label}</span>
									<span className="block text-xs text-muted-foreground">{part.hint}</span>
								</span>
							</label>
						))}
					</div>
				</div>
			) : presets ? (
				<div className="mt-3">
					<div className="mb-1 text-xs text-muted-foreground">Reply format</div>
					<div className="flex flex-wrap gap-1.5">
						{presets.map((p) => {
							const active = (cmd.formatKey ?? presets[0]?.key) === p.key;
							return (
								<Button
									key={p.key}
									type="button"
									size="sm"
									variant={active ? "default" : "outline"}
									onClick={() => update.mutate({ id: cmd.id, formatKey: p.key })}
								>
									{p.label}
								</Button>
							);
						})}
					</div>
					<div className="mt-2 font-mono text-xs break-words text-muted-foreground">
						{
							(presets.find((p) => p.key === (cmd.formatKey ?? presets[0]?.key)) ?? presets[0])
								?.template
						}
					</div>
				</div>
			) : (
				<div className="mt-3">
					<div className="mb-1 text-xs text-muted-foreground">Reply text</div>
					<textarea
						value={response}
						onChange={(e) => setResponse(e.target.value)}
						onBlur={commitResponse}
						rows={2}
						className="w-full resize-y rounded-[0.6rem] border border-input bg-input/40 px-2.5 py-1.5 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
					/>
				</div>
			)}
		</div>
	);
}
