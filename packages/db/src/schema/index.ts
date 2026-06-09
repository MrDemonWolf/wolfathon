import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * The entire tracker lives in a single row, stored as a JSON blob in `data`.
 *
 * Keeping the whole tracker in one row (id = "default") makes import / replace
 * trivial: we just overwrite one column instead of diffing rows. The JSON shape
 * is defined and validated in `@wolfathon/api` (see `state.ts`).
 */
export const trackerState = sqliteTable("tracker_state", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export type TrackerStateRow = typeof trackerState.$inferSelect;
