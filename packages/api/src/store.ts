import { type Db, trackerState } from "@wolfathon/db";
import { and, eq } from "drizzle-orm";

import { type BotDoc, defaultBotDoc, withBotDefaults } from "./bot";
import { type GiveawayDoc, defaultGiveawayDoc } from "./giveaway";
import { type Data, recompute, sampleData, subsFromEvent } from "./state";
import { type SettingsDoc, defaultSettingsDoc } from "./settings";
import {
	applyEvent,
	defaultTimerDoc,
	type TimerDoc,
	type TimerEvent,
	withTimerConfigDefaults,
} from "./timer";
import { type TwitchDoc, defaultTwitchDoc } from "./twitch";
import { type WheelDoc, defaultWheelDoc, withWheelDefaults } from "./wheel";

/**
 * The whole app is stored as a few singleton JSON rows in `tracker_state`,
 * keyed by id:
 *   "default"  → rewards (goals)
 *   "timer"    → Wolfathon timer config + state
 *   "twitch"   → Twitch credentials/tokens (secret; never public)
 *   "giveaway" → giveaway gifters / entrants / winners (operator-only)
 *   "wheel"    → wheel-of-dares slots / history / live pending spin
 *   "bot"      → chat-bot commands + cooldown (bot OAuth creds live in "twitch")
 */
const STATE_ID = "default";
const TIMER_ID = "timer";
const TWITCH_ID = "twitch";
const SETTINGS_ID = "settings";
const GIVEAWAY_ID = "giveaway";
const WHEEL_ID = "wheel";
const BOT_ID = "bot";

/**
 * Generic doc read with lazy seeding. Returns the parsed JSON, or seeds (and
 * persists) `fallback()` on first access so fresh databases always work.
 */
export async function readDoc<T>(db: Db, id: string, fallback: () => T): Promise<T> {
	const row = await db.select().from(trackerState).where(eq(trackerState.id, id)).get();
	if (!row) {
		const seeded = fallback();
		await writeDoc(db, id, seeded);
		return seeded;
	}
	return JSON.parse(row.data) as T;
}

/** Generic full-overwrite write of one doc row. */
export async function writeDoc<T>(db: Db, id: string, data: T): Promise<T> {
	const payload = JSON.stringify(data);
	const updatedAt = Date.now();
	await db
		.insert(trackerState)
		.values({ id, data: payload, updatedAt })
		.onConflictDoUpdate({ target: trackerState.id, set: { data: payload, updatedAt } });
	return data;
}

/**
 * Storage ops the optimistic-concurrency loop needs, split out so the retry
 * logic ({@link mutateWithCas}) is unit-testable without faking the whole Drizzle
 * query builder. `token` is the compare-and-swap witness (the exact JSON string
 * we read); a write only lands if the row still holds it.
 *
 * ponytail: this tiny interface exists purely to make the lost-update loop
 * testable — the only real impl is the D1 one below.
 */
type CasOps<T> = {
	read: () => Promise<{ value: T; token: string } | null>;
	cas: (token: string, next: T) => Promise<boolean>;
	seed: (value: T) => Promise<void>;
};

/**
 * Read-modify-write retry loop with optimistic concurrency. Reads the current
 * value, applies `fn`, and compare-and-swaps it back; if another writer changed
 * the row in between, the CAS fails and we re-read and re-apply. Pure of any DB
 * specifics — see {@link mutateDoc} for the D1 wiring and store.test.ts for the
 * lost-update regression test.
 */
export async function mutateWithCas<T>(
	ops: CasOps<T>,
	fallback: () => T,
	fn: (current: T) => T,
	maxAttempts = 8,
): Promise<T> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const current = await ops.read();
		if (!current) {
			// Row absent — seed it (ignoring a concurrent seed), then loop to apply.
			await ops.seed(fallback());
			continue;
		}
		const next = fn(current.value);
		if (await ops.cas(current.token, next)) return next;
		// Lost the CAS race; another delivery wrote first — re-read and retry.
	}
	throw new Error(`mutateWithCas: exceeded ${maxAttempts} attempts`);
}

/**
 * Concurrency-safe read-modify-write of one singleton doc row.
 *
 * Cloudflare Workers serve many requests in one isolate and every D1 `await`
 * yields the event loop, so a burst of Twitch EventSub deliveries can interleave:
 * two handlers that both `readDoc` before either writes would each compute from
 * the same stale value, and the second `writeDoc` would clobber the first —
 * silently dropping a timer add or a sub. {@link mutateDoc} compare-and-swaps on
 * the previously-read JSON blob (the `data` column), so a write only lands if the
 * row is unchanged; otherwise it re-reads and re-applies.
 *
 * ponytail: CAS-per-doc fixes the real hazard (the per-row lost update). It does
 * NOT make the webhook's multi-doc write (timer + state + giveaway + twitch) a
 * single atomic transaction — that would need a Durable Object. Each doc
 * converges independently, which is what the headline timer/sub numbers need.
 */
export function mutateDoc<T>(
	db: Db,
	id: string,
	fallback: () => T,
	fn: (current: T) => T,
): Promise<T> {
	return mutateWithCas<T>(
		{
			read: async () => {
				const row = await db.select().from(trackerState).where(eq(trackerState.id, id)).get();
				return row ? { value: JSON.parse(row.data) as T, token: row.data } : null;
			},
			cas: async (token, next) => {
				const res = await db
					.update(trackerState)
					.set({ data: JSON.stringify(next), updatedAt: Date.now() })
					.where(and(eq(trackerState.id, id), eq(trackerState.data, token)))
					.run();
				return res.meta.changes > 0;
			},
			seed: async (value) => {
				await db
					.insert(trackerState)
					.values({ id, data: JSON.stringify(value), updatedAt: Date.now() })
					.onConflictDoNothing();
			},
		},
		fallback,
		fn,
	);
}

// ---- rewards (goals) ------------------------------------------------------

/**
 * Read the rewards tracker, seeding sample goals on first access. Runs the raw
 * stored doc through `recompute` so rows persisted before a field existed (e.g.
 * `theme`) are backfilled to defaults — otherwise the operator UI dereferences
 * `theme.preset` on undefined and white-screens.
 */
export async function readState(db: Db): Promise<Data> {
	return recompute(await readDoc(db, STATE_ID, sampleData));
}

/**
 * Persist the rewards tracker, re-deriving invariants first (see recompute).
 */
export async function writeState(db: Db, data: Data): Promise<Data> {
	return writeDoc(db, STATE_ID, recompute(data));
}

/** Concurrency-safe rewards mutation (recompute on read and write, like read/writeState). */
export function mutateState(db: Db, fn: (data: Data) => Data): Promise<Data> {
	return mutateDoc(db, STATE_ID, sampleData, (raw) => recompute(fn(recompute(raw))));
}

// ---- timer ----------------------------------------------------------------

export async function readTimer(db: Db): Promise<TimerDoc> {
	return withTimerConfigDefaults(await readDoc(db, TIMER_ID, defaultTimerDoc));
}

export async function writeTimer(db: Db, doc: TimerDoc): Promise<TimerDoc> {
	return writeDoc(db, TIMER_ID, doc);
}

/** Concurrency-safe timer mutation (config defaults backfilled on read, like readTimer). */
export function mutateTimer(db: Db, fn: (doc: TimerDoc) => TimerDoc): Promise<TimerDoc> {
	return mutateDoc(db, TIMER_ID, defaultTimerDoc, (raw) => fn(withTimerConfigDefaults(raw)));
}

// ---- twitch (secret) ------------------------------------------------------

export async function readTwitch(db: Db): Promise<TwitchDoc> {
	return readDoc(db, TWITCH_ID, defaultTwitchDoc);
}

export async function writeTwitch(db: Db, doc: TwitchDoc): Promise<TwitchDoc> {
	return writeDoc(db, TWITCH_ID, doc);
}

/** Concurrency-safe Twitch-doc mutation (used for the EventSub idempotency marker). */
export function mutateTwitch(db: Db, fn: (doc: TwitchDoc) => TwitchDoc): Promise<TwitchDoc> {
	return mutateDoc(db, TWITCH_ID, defaultTwitchDoc, fn);
}

// ---- settings (overlay token) ---------------------------------------------

export async function readSettings(db: Db): Promise<SettingsDoc> {
	return readDoc(db, SETTINGS_ID, defaultSettingsDoc);
}

export async function writeSettings(db: Db, doc: SettingsDoc): Promise<SettingsDoc> {
	return writeDoc(db, SETTINGS_ID, doc);
}

// ---- giveaway -------------------------------------------------------------

export async function readGiveaway(db: Db): Promise<GiveawayDoc> {
	return readDoc(db, GIVEAWAY_ID, defaultGiveawayDoc);
}

export async function writeGiveaway(db: Db, doc: GiveawayDoc): Promise<GiveawayDoc> {
	return writeDoc(db, GIVEAWAY_ID, doc);
}

/** Concurrency-safe giveaway mutation (gifters / entrants / winners). */
export function mutateGiveaway(
	db: Db,
	fn: (doc: GiveawayDoc) => GiveawayDoc,
): Promise<GiveawayDoc> {
	return mutateDoc(db, GIVEAWAY_ID, defaultGiveawayDoc, fn);
}

// ---- wheel of dares -------------------------------------------------------

export async function readWheel(db: Db): Promise<WheelDoc> {
	return withWheelDefaults(await readDoc(db, WHEEL_ID, defaultWheelDoc));
}

export async function writeWheel(db: Db, doc: WheelDoc): Promise<WheelDoc> {
	return writeDoc(db, WHEEL_ID, doc);
}

// ---- chat bot -------------------------------------------------------------

export async function readBot(db: Db): Promise<BotDoc> {
	return withBotDefaults(await readDoc(db, BOT_ID, defaultBotDoc));
}

export async function writeBot(db: Db, doc: BotDoc): Promise<BotDoc> {
	return writeDoc(db, BOT_ID, doc);
}

/**
 * Concurrency-safe bot mutation. The webhook stamps each command's `lastRunAt`
 * (the cooldown) on every reply, so this shares the EventSub firehose with the
 * giveaway/timer writers and MUST compare-and-swap (config defaults backfilled
 * on read, like readBot).
 */
export function mutateBot(db: Db, fn: (doc: BotDoc) => BotDoc): Promise<BotDoc> {
	return mutateDoc(db, BOT_ID, defaultBotDoc, (raw) => fn(withBotDefaults(raw)));
}

// ---- combined apply -------------------------------------------------------

/**
 * Apply one timer event and bump the goals' running sub count, the way both the
 * tRPC `timer.applyEvent` mutation and the EventSub webhook need it. Goes through
 * the concurrency-safe mutate* helpers so overlapping Twitch deliveries can't
 * drop a time-add or a sub.
 *
 * Returns the updated timer doc plus the running sub count before/after this
 * event. The before/after are captured INSIDE the CAS apply, so they're the true
 * sequential values (not a racy post-read) — the webhook uses them to decide
 * whether the count actually moved (a gift-sub announcement only fires then).
 */
export async function applyTimerEventAndBumpSubs(
	db: Db,
	event: TimerEvent,
	now: number,
	preview = false,
): Promise<{ timer: TimerDoc; subsBefore: number; subsAfter: number }> {
	const timer = await mutateTimer(db, (doc) => ({
		...doc,
		state: applyEvent(doc.config, doc.state, event, now, preview).state,
	}));
	// Sub/gift events also advance the reward goals' running sub count — but a
	// preview (test button) must not move that either.
	const subs = preview ? 0 : subsFromEvent(event);
	let subsBefore = 0;
	let subsAfter = 0;
	if (subs > 0) {
		await mutateState(db, (data) => {
			subsBefore = data.currentSubs ?? 0;
			subsAfter = subsBefore + subs;
			return { ...data, currentSubs: subsAfter };
		});
	}
	return { timer, subsBefore, subsAfter };
}
