/**
 * Giveaway tracker domain.
 *
 * Models the "4 sticker winners" giveaway: the first N viewers to gift
 * `giftThreshold`+ subs win automatically (operator confirms), and M more are
 * drawn by an open chat raffle (`!enter`). All state is one D1 JSON doc; these
 * are pure functions — persistence lives in store.ts.
 *
 * Identity: `login` (lowercase Twitch login) is the dedup key; `name` is the
 * display name. Both come straight from EventSub payloads.
 */

import { secureRandom } from "./random";

export type WinnerSource = "gift" | "raffle";

export type Winner = {
	id: string;
	login: string;
	name: string;
	source: WinnerSource;
	/** Operator marks true once stickers are shipped. */
	shipped: boolean;
	/** Private operator note (shipping address etc.) — never goes public. */
	note?: string;
	drawnAt: number;
};

/** A viewer's running gift-sub total, with when they first crossed the threshold. */
export type Gifter = {
	login: string;
	name: string;
	count: number;
	/** Epoch ms they first reached `giftThreshold` (orders "first to gift 5+"); null until then. */
	qualifiedAt: number | null;
};

export type Entrant = {
	login: string;
	name: string;
	enteredAt: number;
};

export type GiveawayConfig = {
	/** Chat command that enters the raffle (matched case-insensitively, first token). */
	command: string;
	/** Subs a viewer must gift (cumulative) to qualify as a gift winner. */
	giftThreshold: number;
	/** Target counts shown in the panel (soft — not hard-enforced). */
	giftWinnerSlots: number;
	raffleWinnerSlots: number;
	/** Whether `!enter` is currently accepted. Operator opens/closes the window. */
	open: boolean;
	/**
	 * Link to the giveaway rules / TOS — a GitHub gist, a Notion page, any URL.
	 * The `!giveaway` chat command fills its reply with this, so the operator sets
	 * it once and the bot always points viewers at the current rules. Empty = unset.
	 */
	tosUrl: string;
};

export type GiveawayDoc = {
	config: GiveawayConfig;
	/** Epoch ms the operator started the round; null until then. Gifts only count after this. */
	startedAt: number | null;
	gifters: Gifter[];
	entrants: Entrant[];
	winners: Winner[];
};

/** A normalized giveaway-relevant event parsed from an EventSub payload. */
export type GiveawayEvent =
	| { kind: "gift"; login: string; name: string; count: number }
	| { kind: "entry"; login: string; name: string };

// ponytail: cap the raffle pool so a busy chat can't grow the D1 JSON row
// unbounded. Raise if a stream ever needs a bigger window.
export const MAX_ENTRANTS = 5000;
export const MAX_COMMAND_LENGTH = 32;
export const MAX_TOS_URL_LENGTH = 300;

export function defaultGiveawayConfig(): GiveawayConfig {
	return {
		command: "!enter",
		giftThreshold: 5,
		giftWinnerSlots: 2,
		raffleWinnerSlots: 2,
		open: false,
		tosUrl: "",
	};
}

export function defaultGiveawayDoc(): GiveawayDoc {
	return {
		config: defaultGiveawayConfig(),
		startedAt: null,
		gifters: [],
		entrants: [],
		winners: [],
	};
}

/** Mark the round started so gift events begin counting. Idempotent. */
export function startGiveaway(doc: GiveawayDoc, now: number): GiveawayDoc {
	return doc.startedAt == null ? { ...doc, startedAt: now } : doc;
}

/**
 * Map an EventSub payload to a {@link GiveawayEvent}, or null if irrelevant.
 * Anonymous gifters are dropped (no identity to award a prize to).
 */
export function parseGiveawayEvent(
	type: string,
	event: Record<string, unknown>,
	command: string,
): GiveawayEvent | null {
	if (type === "channel.subscription.gift") {
		if (event.is_anonymous === true) return null;
		const login = typeof event.user_login === "string" ? event.user_login.toLowerCase() : "";
		if (!login) return null;
		const name = typeof event.user_name === "string" ? event.user_name : login;
		return { kind: "gift", login, name, count: Number(event.total) || 1 };
	}
	if (type === "channel.chat.message") {
		const text = (event.message as { text?: unknown } | undefined)?.text;
		if (typeof text !== "string") return null;
		const first = text.trim().split(/\s+/)[0]?.toLowerCase();
		if (!first || first !== command.trim().toLowerCase()) return null;
		const login =
			typeof event.chatter_user_login === "string" ? event.chatter_user_login.toLowerCase() : "";
		if (!login) return null;
		const name = typeof event.chatter_user_name === "string" ? event.chatter_user_name : login;
		return { kind: "entry", login, name };
	}
	return null;
}

/** Apply a parsed giveaway event, returning the new doc (pure). */
export function applyGiveawayEvent(doc: GiveawayDoc, ev: GiveawayEvent, now: number): GiveawayDoc {
	if (ev.kind === "gift") {
		// Gifts only count once the operator starts the round — pre-show gifts
		// shouldn't pre-decide the winners.
		if (doc.startedAt == null) return doc;
		const threshold = doc.config.giftThreshold;
		const exists = doc.gifters.some((g) => g.login === ev.login);
		const gifters = exists
			? doc.gifters.map((g) => {
					if (g.login !== ev.login) return g;
					const count = g.count + ev.count;
					// qualifiedAt is sticky — once first reached, it never moves.
					const qualifiedAt = g.qualifiedAt ?? (count >= threshold ? now : null);
					return { ...g, name: ev.name, count, qualifiedAt };
				})
			: [
					...doc.gifters,
					{
						login: ev.login,
						name: ev.name,
						count: ev.count,
						qualifiedAt: ev.count >= threshold ? now : null,
					},
				];
		return { ...doc, gifters };
	}
	// entry
	if (!doc.config.open) return doc;
	if (doc.entrants.length >= MAX_ENTRANTS) return doc;
	if (doc.entrants.some((e) => e.login === ev.login)) return doc; // dedup by login
	return {
		...doc,
		entrants: [...doc.entrants, { login: ev.login, name: ev.name, enteredAt: now }],
	};
}

/** Gifters who reached the threshold, in the order they got there ("first to gift N+"). */
export function qualifyingGifters(doc: GiveawayDoc): Gifter[] {
	return doc.gifters
		.filter((g) => g.qualifiedAt != null)
		.sort((a, b) => (a.qualifiedAt ?? 0) - (b.qualifiedAt ?? 0));
}

/** Add a winner if that login hasn't already won. */
export function addWinner(
	doc: GiveawayDoc,
	pick: { login: string; name: string; source: WinnerSource },
	now: number,
): GiveawayDoc {
	if (doc.winners.some((w) => w.login === pick.login)) return doc;
	const winner: Winner = {
		id: crypto.randomUUID(),
		login: pick.login,
		name: pick.name,
		source: pick.source,
		shipped: false,
		drawnAt: now,
	};
	return { ...doc, winners: [...doc.winners, winner] };
}

/**
 * Draw one raffle winner from entrants not already won. Returns the new doc and
 * the picked entrant (null if the pool is empty). Defaults to a crypto CSPRNG so
 * a real prize draw can't be predicted/rigged; `rand` is injectable for tests.
 */
export function drawRaffle(
	doc: GiveawayDoc,
	now: number,
	rand: () => number = secureRandom,
): { doc: GiveawayDoc; winner: Entrant | null } {
	const taken = new Set(doc.winners.map((w) => w.login));
	const pool = doc.entrants.filter((e) => !taken.has(e.login));
	if (pool.length === 0) return { doc, winner: null };
	const pick = pool[Math.floor(rand() * pool.length)]!;
	return { doc: addWinner(doc, { ...pick, source: "raffle" }, now), winner: pick };
}

/**
 * Replace a raffle winner with a fresh draw (the "reroll" button). Removes the
 * winner `id`, then draws someone new — excluding the just-removed login so a
 * reroll always yields a different person. If no other entrant is left, the
 * original winner is kept (returns the doc unchanged with winner null).
 */
export function rerollRaffle(
	doc: GiveawayDoc,
	id: string,
	now: number,
	rand: () => number = secureRandom,
): { doc: GiveawayDoc; winner: Entrant | null } {
	const target = doc.winners.find((w) => w.id === id);
	if (!target || target.source !== "raffle") return { doc, winner: null };
	const without = removeWinner(doc, id);
	const taken = new Set(without.winners.map((w) => w.login));
	taken.add(target.login); // don't re-pick the person we just rerolled out
	const pool = without.entrants.filter((e) => !taken.has(e.login));
	if (pool.length === 0) return { doc, winner: null };
	const pick = pool[Math.floor(rand() * pool.length)]!;
	return { doc: addWinner(without, { ...pick, source: "raffle" }, now), winner: pick };
}

export function setShipped(doc: GiveawayDoc, id: string, shipped: boolean): GiveawayDoc {
	return { ...doc, winners: doc.winners.map((w) => (w.id === id ? { ...w, shipped } : w)) };
}

export function setWinnerNote(doc: GiveawayDoc, id: string, note: string): GiveawayDoc {
	const clean = note.trim();
	return {
		...doc,
		winners: doc.winners.map((w) => (w.id === id ? { ...w, note: clean ? clean : undefined } : w)),
	};
}

export function removeWinner(doc: GiveawayDoc, id: string): GiveawayDoc {
	return { ...doc, winners: doc.winners.filter((w) => w.id !== id) };
}

/**
 * Clear gifters, entrants, and winners for a fresh round. Config is kept but
 * entries are closed and the round is un-started (so gifts wait for Start).
 */
export function resetRound(doc: GiveawayDoc): GiveawayDoc {
	return {
		...doc,
		startedAt: null,
		config: { ...doc.config, open: false },
		gifters: [],
		entrants: [],
		winners: [],
	};
}

export type ConfigPatch = Partial<GiveawayConfig>;

/** Normalize a TOS link: trim, cap length, and add `https://` if the operator
 * pasted a bare domain so the chat link is always clickable. Empty stays empty. */
export function normalizeTosUrl(raw: string): string {
	const v = raw.trim().slice(0, MAX_TOS_URL_LENGTH);
	if (!v) return "";
	return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** Validate + merge a config patch (clamps to sane ranges). */
export function applyConfig(doc: GiveawayDoc, patch: ConfigPatch): GiveawayDoc {
	const c = doc.config;
	const command =
		patch.command !== undefined
			? patch.command.trim().slice(0, MAX_COMMAND_LENGTH) || c.command
			: c.command;
	const clampInt = (v: number | undefined, fallback: number, min: number, max: number) =>
		v === undefined || !Number.isFinite(v) ? fallback : Math.max(min, Math.min(max, Math.round(v)));
	return {
		...doc,
		config: {
			command,
			giftThreshold: clampInt(patch.giftThreshold, c.giftThreshold, 1, 1000),
			giftWinnerSlots: clampInt(patch.giftWinnerSlots, c.giftWinnerSlots, 0, 100),
			raffleWinnerSlots: clampInt(patch.raffleWinnerSlots, c.raffleWinnerSlots, 0, 100),
			open: patch.open ?? c.open,
			tosUrl: patch.tosUrl !== undefined ? normalizeTosUrl(patch.tosUrl) : (c.tosUrl ?? ""),
		},
	};
}
