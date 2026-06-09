import { type Db, trackerState } from "@wolfathon/db";
import { eq } from "drizzle-orm";

import { type Data, recompute, sampleData } from "./state";

/** The tracker is a singleton row. */
const STATE_ID = "default";

/**
 * Read the tracker. Lazily seeds the sample goals on first access so a fresh
 * D1 database always returns a usable state (and the overlay shows something).
 */
export async function readState(db: Db): Promise<Data> {
  const row = await db.select().from(trackerState).where(eq(trackerState.id, STATE_ID)).get();
  if (!row) {
    const seeded = sampleData();
    await writeState(db, seeded);
    return seeded;
  }
  return JSON.parse(row.data) as Data;
}

/**
 * Persist the tracker, re-deriving invariants first (see {@link recompute}).
 * Always a full overwrite of the single row — no partial writes.
 */
export async function writeState(db: Db, data: Data): Promise<Data> {
  const next = recompute(data);
  const payload = JSON.stringify(next);
  const updatedAt = Date.now();
  await db
    .insert(trackerState)
    .values({ id: STATE_ID, data: payload, updatedAt })
    .onConflictDoUpdate({ target: trackerState.id, set: { data: payload, updatedAt } });
  return next;
}
