/**
 * Chat-bot domain ("Wolfathon bot").
 *
 * The bot listens to `channel.chat.message` EventSub — ALREADY subscribed for
 * the giveaway `!enter` raffle — and replies to "!" commands via Helix. All
 * config is ONE D1 JSON doc (id = "bot"): a master switch, a per-command
 * anti-spam cooldown, and a fixed set of commands the operator enables/disables
 * + edits. These are PURE functions; persistence lives in store.ts, and the
 * actual chat send lives in the webhook handler (apps/server) since it needs DB
 * + network.
 *
 * Reading chat is FREE: the broadcaster's `channel.chat.message` subscription
 * already delivers every message to the webhook. The bot only needs to SEND,
 * which uses the separately-connected bot account's user token (`twitch.bot`).
 *
 * Live commands (`!timer`/`!goals`/`!wheel`) don't store reply text — they pick
 * a built-in format preset and the webhook fills `{value}` with freshly-computed
 * live data. The value formatters live here (pure) so they stay tested.
 */

import type { Data } from "./state";
import { currentRemainingMs, splitDuration, type TimerDoc } from "./timer";
import type { WheelDoc } from "./wheel";

/** A built-in command whose reply is computed from live data, not stored text. */
export type DynamicKind = "timer" | "goals" | "wheel";

export type BotCommand = {
	/** Stable id (also the seed key). */
	id: string;
	/** Lowercase "!"-prefixed triggers; the first chat token is matched against these. */
	triggers: string[];
	enabled: boolean;
	/**
	 * Static reply for text commands (operator-editable). Ignored when `dynamic`
	 * is set — those render from live data through the chosen `formatKey`.
	 */
	response: string;
	/** Set for the live commands; picks which live value + preset format to render. */
	dynamic?: DynamicKind;
	/** Which built-in format preset a dynamic command uses (see {@link DYNAMIC_FORMATS}). */
	formatKey?: string;
	/** Epoch ms this command last replied — drives the per-command cooldown. */
	lastRunAt?: number;
};

export type BotDoc = {
	/** Master switch — off = the bot ignores all chat. */
	enabled: boolean;
	/** Seconds a normal viewer must wait between uses of the SAME command. */
	cooldownSeconds: number;
	commands: BotCommand[];
};

export const MAX_RESPONSE_LEN = 400; // Twitch chat caps at 500; leave headroom.
export const MAX_TRIGGERS = 8;
export const MAX_TRIGGER_LEN = 32;
export const MAX_COOLDOWN_SECONDS = 3600;

/**
 * Built-in reply formats for the live commands. The operator picks one per
 * command (`formatKey`); the webhook fills `{value}` with the freshly-computed
 * live string. Fixed wording by design — operators choose a preset, they don't
 * author free text for live commands.
 */
export const DYNAMIC_FORMATS: Record<
	DynamicKind,
	{ key: string; label: string; template: string }[]
> = {
	timer: [
		{ key: "plain", label: "Plain", template: "Time left on the subathon: {value}" },
		{ key: "hype", label: "Hype", template: "⏰ {value} left on the subathon — keep it rolling!" },
		{
			key: "ends",
			label: "Ends in",
			template: "The subathon ends in {value} unless more time gets added.",
		},
	],
	goals: [
		{ key: "plain", label: "Plain", template: "Next reward: {value}" },
		{ key: "hype", label: "Hype", template: "🎯 Next up — {value}. Let's get there!" },
	],
	wheel: [
		{
			key: "explain",
			label: "Explainer",
			template: "Spin the Howlwheel for a random dare — {value} on the wheel right now!",
		},
		{ key: "count", label: "With count", template: "The Howlwheel has {value} ready to spin!" },
	],
};

export function defaultBotDoc(): BotDoc {
	return {
		enabled: false,
		cooldownSeconds: 15,
		commands: [
			{
				id: "wolfathon",
				triggers: ["!wolfathon", "!subathon", "!wolf", "!about"],
				enabled: true,
				response:
					"This is a Wolfathon subathon — every sub, gift, and cheer adds time to the clock! Type !timer to see how long is left.",
			},
			{
				id: "giveaway",
				triggers: ["!giveaway", "!gw", "!giveaways"],
				enabled: true,
				// Operator pastes the gist link here from the dashboard.
				response: "Giveaway details + rules: (set this link in the dashboard Bot tab)",
			},
			{
				id: "timer",
				triggers: ["!timer", "!time"],
				enabled: true,
				response: "",
				dynamic: "timer",
				formatKey: "plain",
			},
			{
				id: "goals",
				triggers: ["!goals", "!goal"],
				enabled: true,
				response: "",
				dynamic: "goals",
				formatKey: "plain",
			},
			{
				id: "wheel",
				triggers: ["!wheel", "!dares"],
				enabled: true,
				response: "",
				dynamic: "wheel",
				formatKey: "explain",
			},
		],
	};
}

/**
 * Backfill missing fields on rows persisted before a field existed, so the
 * operator UI + webhook never dereference an absent field. The command set is
 * fixed (no add/remove), so a legacy doc with no commands is re-seeded; a doc
 * that already has them is kept verbatim.
 */
export function withBotDefaults(doc: BotDoc): BotDoc {
	const base = defaultBotDoc();
	return {
		enabled: typeof doc.enabled === "boolean" ? doc.enabled : base.enabled,
		cooldownSeconds:
			typeof doc.cooldownSeconds === "number" && Number.isFinite(doc.cooldownSeconds)
				? doc.cooldownSeconds
				: base.cooldownSeconds,
		commands: Array.isArray(doc.commands) && doc.commands.length ? doc.commands : base.commands,
	};
}

/** Find the enabled command a chat line triggers, or null. `text` is the raw message. */
export function matchCommand(doc: BotDoc, text: string): BotCommand | null {
	if (!doc.enabled) return null;
	const first = text.trim().split(/\s+/)[0]?.toLowerCase();
	if (!first || !first.startsWith("!")) return null;
	return (
		doc.commands.find((c) => c.enabled && c.triggers.some((t) => t.toLowerCase() === first)) ?? null
	);
}

/**
 * Whether a command may fire now. Privileged chatters (broadcaster / mod / VIP)
 * bypass the cooldown entirely; everyone else waits `cooldownSeconds` between
 * uses of the SAME command.
 */
export function canRun(
	cmd: BotCommand,
	cooldownSeconds: number,
	now: number,
	privileged: boolean,
): boolean {
	if (privileged) return true;
	if (cmd.lastRunAt === undefined) return true; // never run → always allowed
	return now - cmd.lastRunAt >= cooldownSeconds * 1000;
}

/** Stamp a command's last-run time (pure) — only normal-viewer runs need this. */
export function markRun(doc: BotDoc, id: string, now: number): BotDoc {
	return {
		...doc,
		commands: doc.commands.map((c) => (c.id === id ? { ...c, lastRunAt: now } : c)),
	};
}

/**
 * Whether the chatter bypasses the cooldown (broadcaster / mod / VIP). Reads the
 * EventSub `channel.chat.message` payload: the broadcaster is matched by id,
 * mods + VIPs by their chat badge. Everyone else is a normal viewer.
 */
export function isPrivileged(event: Record<string, unknown>): boolean {
	const chatter = typeof event.chatter_user_id === "string" ? event.chatter_user_id : "";
	const broadcaster =
		typeof event.broadcaster_user_id === "string" ? event.broadcaster_user_id : "";
	if (chatter && chatter === broadcaster) return true;
	const badges = Array.isArray(event.badges) ? event.badges : [];
	return badges.some((b) => {
		const setId = (b as { set_id?: unknown })?.set_id;
		return setId === "broadcaster" || setId === "moderator" || setId === "vip";
	});
}

/** Fill the single `{value}` placeholder in a preset template. */
export function fillTemplate(template: string, value: string): string {
	return template.replaceAll("{value}", value);
}

/** Resolve the chosen format template for a dynamic command (falls back to the first preset). */
export function dynamicTemplate(kind: DynamicKind, formatKey: string | undefined): string {
	const presets = DYNAMIC_FORMATS[kind];
	return (presets.find((p) => p.key === formatKey) ?? presets[0]!).template;
}

// ---- live value formatters (pure) -----------------------------------------

/** "2d 3h 12m" style; always shows minutes, drops leading zero days/hours. */
export function formatDuration(ms: number): string {
	const { d, h, m } = splitDuration(ms);
	const parts: string[] = [];
	if (d) parts.push(`${d}d`);
	if (h) parts.push(`${h}h`);
	parts.push(`${m}m`);
	return parts.join(" ");
}

export function timerValue(timer: TimerDoc, now: number): string {
	const left = formatDuration(currentRemainingMs(timer.state, now));
	return timer.state.running ? left : `${left} (paused)`;
}

/**
 * The next reward + its progress. Only the NEXT goal's target is revealed (never
 * future ceilings — mirrors the public overlay projection in state.ts).
 */
export function goalsValue(data: Data): string {
	const next = data.goals[data.currentIndex];
	if (!next) return "all rewards unlocked!";
	if (next.target == null) return next.reward;
	return `${next.reward} at ${next.target} subs (${data.currentSubs}/${next.target})`;
}

export function wheelValue(wheel: WheelDoc): string {
	const n = wheel.slots.filter((s) => s.enabled).length;
	return n === 0 ? "no dares yet" : `${n} ${n === 1 ? "dare" : "dares"}`;
}

// ---- operator edits (pure, validated) -------------------------------------

export type CommandPatch = {
	enabled?: boolean;
	response?: string;
	triggers?: string[];
	formatKey?: string;
};

/** Lowercase, "!"-prefixed, deduped, capped. Never returns empty (a command with
 * no triggers is unreachable), falling back to the previous triggers. */
function normalizeTriggers(raw: string[], fallback: string[]): string[] {
	const cleaned = raw
		.map((t) => t.trim().toLowerCase())
		.filter((t) => t.startsWith("!") && t.length >= 2 && t.length <= MAX_TRIGGER_LEN);
	const deduped = Array.from(new Set(cleaned)).slice(0, MAX_TRIGGERS);
	return deduped.length ? deduped : fallback;
}

/** Apply an operator edit to one command (validated/clamped). */
export function updateCommand(doc: BotDoc, id: string, patch: CommandPatch): BotDoc {
	return {
		...doc,
		commands: doc.commands.map((c) => {
			if (c.id !== id) return c;
			const next: BotCommand = { ...c };
			if (patch.enabled !== undefined) next.enabled = patch.enabled;
			// Static text only applies to text commands; dynamic replies ignore it.
			if (patch.response !== undefined && !c.dynamic) {
				next.response = patch.response.slice(0, MAX_RESPONSE_LEN);
			}
			if (patch.triggers !== undefined)
				next.triggers = normalizeTriggers(patch.triggers, c.triggers);
			// Only accept a format key that exists for this command's dynamic kind.
			if (patch.formatKey !== undefined && c.dynamic) {
				if (DYNAMIC_FORMATS[c.dynamic].some((p) => p.key === patch.formatKey)) {
					next.formatKey = patch.formatKey;
				}
			}
			return next;
		}),
	};
}

export function setEnabled(doc: BotDoc, enabled: boolean): BotDoc {
	return { ...doc, enabled };
}

export function setCooldown(doc: BotDoc, seconds: number): BotDoc {
	const clamped = Number.isFinite(seconds)
		? Math.max(0, Math.min(MAX_COOLDOWN_SECONDS, Math.round(seconds)))
		: doc.cooldownSeconds;
	return { ...doc, cooldownSeconds: clamped };
}
