import { TRPCError } from "@trpc/server";
import { type Db, eventsubSeen, trackerState } from "@wolfathon/db";
import { and, eq, lt } from "drizzle-orm";

import { type BotDoc, defaultBotDoc, withBotDefaults } from "./bot";
import { type GiveawayDoc, defaultGiveawayDoc } from "./giveaway";
import { type Data, recompute, sampleData, subsFromEvent } from "./state";
import { type SettingsDoc, defaultSettingsDoc } from "./settings";
import {
	applyEvent,
	defaultTimerDoc,
	reconcileRewardId,
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
 *   "settings" → operator settings (the overlay token in the OBS source URLs)
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
	// Sustained contention on one row. Surfaced as a typed CONFLICT rather than a
	// bare Error so the operator sees something actionable instead of a generic 500
	// with an internal function name in it — this is reachable during a big gift
	// bomb, and a silently dropped write means lost Wolfathon time.
	throw new TRPCError({
		code: "CONFLICT",
		message: "Too many updates at once — that didn't save. Try again in a moment.",
	});
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
				const data = JSON.stringify(next);
				// The apply produced exactly what we read — there is nothing to write, so
				// don't. D1 counts a same-value UPDATE as a change, so without this every
				// `!command` in chat rewrote the whole giveaway doc (up to MAX_ENTRANTS
				// entrants), every stream.online/offline rewrote the timer with auto-pause
				// off, and every cooldown-blocked reply rewrote the bot doc — pure write
				// amplification on the hottest rows. Comparing serialized content rather
				// than object identity is what makes this fire through the read-boundary
				// normalizers (`recompute`, `withTimerConfigDefaults`, …), which always
				// hand back a fresh object even when nothing changed.
				//
				// Contract: skipping the write means a no-op apply returns the value it
				// READ, which a concurrent writer may already have superseded. That is
				// consistent with what mutate* guarantees — "your change was applied
				// atomically", never "this is the newest row" (any returned value is stale
				// the instant it returns under concurrency). Callers that need freshness
				// must re-read; none currently do on a no-op path.
				if (data === token) return true;
				const res = await db
					.update(trackerState)
					.set({ data, updatedAt: Date.now() })
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

// ---- optimistic concurrency for operator saves -----------------------------

/**
 * Next revision for one guarded REGION of a document — bumped only when that
 * region actually changed.
 *
 * Scoped per region rather than per document on purpose: `mutateTimer` runs on
 * every timer event and `mutateState` on every counted sub, so a whole-document
 * revision would make the Timer and Rewards tabs conflict constantly during any
 * live stream. Guarding only `goals` and `config` — the parts a human edits —
 * means a save is rejected when someone else edited the same thing, and never
 * because Twitch moved the clock.
 */
export function nextRev(prev: unknown, next: unknown, prevRev: number | undefined): number {
	const base = prevRev ?? 0;
	return JSON.stringify(prev) === JSON.stringify(next) ? base : base + 1;
}

/**
 * Does an operator's save still apply to the document it was built from?
 * `expected === undefined` opts out entirely, which is how backup restores and
 * any non-panel caller keep working unchanged. A missing stored rev reads as 0,
 * so documents written before this shipped are not all treated as conflicts.
 */
export function revMatches(expected: number | undefined, actual: number | undefined): boolean {
	return expected === undefined || expected === (actual ?? 0);
}

/** Thrown from inside a CAS apply when the operator's base revision is stale. */
export function staleRevError(what: string): TRPCError {
	return new TRPCError({
		code: "CONFLICT",
		message: `These ${what} changed on the server after you opened this page.`,
	});
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

/**
 * Concurrency-safe rewards mutation (recompute on read and write, like
 * read/writeState). Bumps `goalsRev` whenever the goals actually change — done
 * here rather than in the routers so it is automatic for `state.import`,
 * `resetForNextSubathon` and every future writer.
 */
export function mutateState(db: Db, fn: (data: Data) => Data): Promise<Data> {
	return mutateDoc(db, STATE_ID, sampleData, (raw) => {
		const prev = recompute(raw);
		const next = recompute(fn(prev));
		return { ...next, goalsRev: nextRev(prev.goals, next.goals, prev.goalsRev) };
	});
}

// ---- timer ----------------------------------------------------------------

export async function readTimer(db: Db): Promise<TimerDoc> {
	return withTimerConfigDefaults(await readDoc(db, TIMER_ID, defaultTimerDoc));
}

export async function writeTimer(db: Db, doc: TimerDoc): Promise<TimerDoc> {
	return writeDoc(db, TIMER_ID, doc);
}

/**
 * Concurrency-safe timer mutation (config defaults backfilled on read, like
 * readTimer). Bumps `configRev` whenever the CONFIG changes — deliberately not on
 * a `state` change, or every sub during a live stream would invalidate the panel's
 * open draft.
 */
export function mutateTimer(db: Db, fn: (doc: TimerDoc) => TimerDoc): Promise<TimerDoc> {
	return mutateDoc(db, TIMER_ID, defaultTimerDoc, (raw) => {
		const prev = withTimerConfigDefaults(raw);
		const next = fn(prev);
		return { ...next, configRev: nextRev(prev.config, next.config, prev.configRev) };
	});
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

/** Concurrency-safe wheel mutation (missing keys backfilled on read, like readWheel). */
export function mutateWheel(db: Db, fn: (doc: WheelDoc) => WheelDoc): Promise<WheelDoc> {
	return mutateDoc(db, WHEEL_ID, defaultWheelDoc, (raw) => fn(withWheelDefaults(raw)));
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
	// Sub/gift events also advance the reward goals' running sub count — but a
	// preview (test button) must not move that either.
	const subs = preview ? 0 : subsFromEvent(event);
	let subsBefore = 0;
	let subsAfter = 0;
	// Different rows, no data dependency between them — run the two CAS loops
	// concurrently so a gift sub doesn't pay two sequential D1 waves on the
	// webhook's critical path.
	const [timer] = await Promise.all([
		mutateTimer(db, (doc) => {
			// Self-heal a channel-point rule whose stored reward id went stale (the reward
			// was deleted and recreated on Twitch). Folded into the apply that already
			// runs, so it costs no extra read or write. Skipped on a preview so the test
			// button can never rewrite stored ids.
			const config = preview ? doc.config : reconcileRewardId(doc.config, event);
			return { ...doc, config, state: applyEvent(config, doc.state, event, now, preview).state };
		}),
		subs > 0
			? mutateState(db, (data) => {
					subsBefore = data.currentSubs ?? 0;
					subsAfter = subsBefore + subs;
					return { ...data, currentSubs: subsAfter };
				})
			: undefined,
	]);
	return { timer, subsBefore, subsAfter };
}

// ---- EventSub idempotency --------------------------------------------------

/** How long a processed message id is remembered. Twitch retries for far less. */
const EVENT_ID_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Claim a Twitch EventSub message id. Returns true the FIRST time an id is seen
 * and false for a retry of the same delivery.
 *
 * `INSERT … ON CONFLICT DO NOTHING` on a primary key makes this a single write with
 * no row contention — distinct ids never touch the same row, so a sub train no
 * longer serialises through one CAS chain the way the old in-document ring buffer
 * did. It also keeps the credential row out of the hot path entirely: that ring
 * lived in the `twitch` doc, so the event firehose raced the bot's token refresh,
 * and losing that race threw away an already-rotated refresh token.
 */
export async function claimEventId(db: Db, messageId: string): Promise<boolean> {
	const res = await db
		.insert(eventsubSeen)
		.values({ messageId, seenAt: Date.now() })
		.onConflictDoNothing()
		.run();
	return res.meta.changes > 0;
}

/**
 * Drop message ids past the TTL. Cheap and unimportant, so callers fire it from
 * `waitUntil` on a small fraction of deliveries rather than on every one — the
 * table is correct whether or not it ever runs.
 */
export async function sweepSeenEventIds(db: Db, now: number): Promise<void> {
	await db
		.delete(eventsubSeen)
		.where(lt(eventsubSeen.seenAt, now - EVENT_ID_TTL_MS))
		.run();
}

/**
 * One-release compatibility shim: ids recorded by the previous deploy still live in
 * the `twitch` document's ring buffer, so a delivery retried across the deploy must
 * still be recognised. Drop this (and `TwitchDoc.recentEventIds`) one release after
 * the table ships — by then no in-flight retry can predate it.
 */
export function seenInLegacyRing(doc: TwitchDoc, messageId: string): boolean {
	return (doc.recentEventIds ?? []).includes(messageId);
}
