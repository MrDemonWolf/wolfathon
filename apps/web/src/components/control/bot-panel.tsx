"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@wolfathon/ui/components/button";
import { Checkbox } from "@wolfathon/ui/components/checkbox";
import { Input } from "@wolfathon/ui/components/input";
import { DYNAMIC_FORMATS, WOLFATHON_PARTS, type BotCommand } from "@wolfathon/api/bot";
import { AlertTriangle, Bot, CheckCircle2, Loader2, Plug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

import {
	CheckingConnection,
	ConnectionCard,
	DisconnectDialog,
	useOAuthCallback,
} from "./connection";

// What the live `{value}` resolves to per command, so the operator knows what a
// preset will actually say in chat.
const VALUE_HINTS: Record<string, string> = {
	timer: "{value} = time left on the clock",
	goals: "{value} = the next reward",
	wheel: "{value} = how many dares are loaded",
	giveaway: "{value} = your Rules / TOS link (set in the Giveaway tab)",
};

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
	const setAnnounceGifts = useMutation(
		controlTrpc.bot.setAnnounceGifts.mutationOptions({ onSuccess: invalidate }),
	);

	// Surface the OAuth redirect result (set by /api/twitch/callback?bot=...).
	useOAuthCallback({
		param: "bot",
		success: "Bot account connected",
		errors: { state_error: "Sign-in expired — try Connect again" },
		fallbackError: "Bot sign-in failed",
		onResult: invalidate,
	});

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
			<ConnectionCard
				accent={connected && needsReconnect ? "warn" : connected ? "ok" : "idle"}
				action={
					connected ? (
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
							<DisconnectDialog
								title="Disconnect the bot account?"
								description="The bot will stop replying to chat until you reconnect. Your command setup is kept."
								onConfirm={() => disconnect.mutate()}
								pending={disconnect.isPending}
								triggerVariant={needsReconnect ? "ghost" : "destructive"}
							/>
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
					)
				}
			>
				{data === undefined && isLoading ? (
					<CheckingConnection />
				) : connected && needsReconnect ? (
					<>
						<AlertTriangle className="size-5 shrink-0 text-amber-400" />
						<div className="min-w-0">
							<div className="truncate font-medium">Bot token expired — reconnect</div>
							<div className="text-xs text-amber-200/90">
								{login}&apos;s sign-in was revoked (password change or de-auth). The bot can&apos;t
								reply until you reconnect it.
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
			</ConnectionCard>

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

					{/* Gift-sub announcements */}
					<div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
						<label className="flex items-center gap-2.5">
							<Checkbox
								checked={config.announceGifts}
								onCheckedChange={(v) => setAnnounceGifts.mutate({ announceGifts: Boolean(v) })}
							/>
							<span>
								<span className="font-medium">Announce gift subs in chat</span>
								<span className="block text-xs text-muted-foreground">
									Posts one line per gift burst — e.g. “🎁 14 subs gifted by 3 people · +28m on the
									clock!”. A sub-train is batched into a single message so chat never spams.
								</span>
							</span>
						</label>
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
const MAX_COOLDOWN_SECONDS = 3600;
function CooldownField({ seconds, onCommit }: { seconds: number; onCommit: (s: number) => void }) {
	const [value, setValue] = useState(String(seconds));
	useEffect(() => setValue(String(seconds)), [seconds]);
	const commit = () => {
		const n = Number(value);
		// Reset to the stored value on junk input; otherwise clamp to the same
		// [0, 3600] range the server enforces and reflect it back so the field
		// doesn't keep showing e.g. 9999 after a silent server clamp.
		if (!Number.isFinite(n)) {
			setValue(String(seconds));
			return;
		}
		const clamped = Math.min(MAX_COOLDOWN_SECONDS, Math.max(0, Math.floor(n)));
		setValue(String(clamped));
		if (clamped !== seconds) onCommit(clamped);
	};
	return (
		<label className="flex items-center gap-2 text-sm">
			<span className="text-muted-foreground">Cooldown</span>
			<Input
				type="number"
				min={0}
				max={MAX_COOLDOWN_SECONDS}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
				className="w-20"
			/>
			<span className="text-muted-foreground">sec (0–3600)</span>
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
						Parts to include (all pulled live from the Wolfathon)
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
					{cmd.dynamic && VALUE_HINTS[cmd.dynamic] && (
						<div className="mt-1 text-xs text-muted-foreground">{VALUE_HINTS[cmd.dynamic]}</div>
					)}
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
