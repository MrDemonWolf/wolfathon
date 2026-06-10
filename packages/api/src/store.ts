import { type Db, trackerState } from "@wolfathon/db";
import { eq } from "drizzle-orm";

import { type Data, recompute, sampleData } from "./state";
import { type TimerDoc, defaultTimerDoc } from "./timer";
import { type TwitchDoc, defaultTwitchDoc } from "./twitch";

/**
 * The whole app is stored as a few singleton JSON rows in `tracker_state`,
 * keyed by id:
 *   "default" → rewards (goals)
 *   "timer"   → subathon timer config + state
 *   "twitch"  → Twitch credentials/tokens (secret; never public)
 */
const STATE_ID = "default";
const TIMER_ID = "timer";
const TWITCH_ID = "twitch";

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

// ---- rewards (goals) ------------------------------------------------------

/** Read the rewards tracker, seeding sample goals on first access. */
export async function readState(db: Db): Promise<Data> {
  return readDoc(db, STATE_ID, sampleData);
}

/**
 * Persist the rewards tracker, re-deriving invariants first (see recompute).
 */
export async function writeState(db: Db, data: Data): Promise<Data> {
  return writeDoc(db, STATE_ID, recompute(data));
}

// ---- timer ----------------------------------------------------------------

export async function readTimer(db: Db): Promise<TimerDoc> {
  return readDoc(db, TIMER_ID, defaultTimerDoc);
}

export async function writeTimer(db: Db, doc: TimerDoc): Promise<TimerDoc> {
  return writeDoc(db, TIMER_ID, doc);
}

// ---- twitch (secret) ------------------------------------------------------

export async function readTwitch(db: Db): Promise<TwitchDoc> {
  return readDoc(db, TWITCH_ID, defaultTwitchDoc);
}

export async function writeTwitch(db: Db, doc: TwitchDoc): Promise<TwitchDoc> {
  return writeDoc(db, TWITCH_ID, doc);
}
