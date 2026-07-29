import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Every tracker document is one row here, stored as a JSON blob in `data` and
 * keyed by a fixed id (`default` = rewards/goals, plus `timer`, `twitch`,
 * `giveaway`, `wheel`, `bot`, `settings` — the map lives in `store.ts`).
 *
 * A whole document per row makes import / replace trivial: overwrite one column
 * instead of diffing rows. The JSON shapes are defined and validated in
 * `@wolfathon/api`. Writes go through the compare-and-swap helpers in `store.ts`,
 * never a blind update.
 */
export const trackerState = sqliteTable("tracker_state", {
	id: text("id").primaryKey(),
	data: text("data").notNull(),
	updatedAt: integer("updated_at")
		.notNull()
		.default(sql`(unixepoch())`),
});

/**
 * Twitch EventSub message ids already processed, for idempotency.
 *
 * This used to be a 50-entry ring buffer inside the `twitch` JSON document, which
 * had three problems: every actionable delivery wrote the single hottest row (so a
 * sub train serialised through one CAS chain), the window was a hard 50 events so a
 * Twitch retry arriving after a burst could be reprocessed, and — worst — that row
 * also holds the OAuth tokens, so the event firehose raced the bot's token refresh.
 * Losing that race discards an already-rotated refresh token and kills the bot until
 * someone reconnects by hand.
 *
 * As its own table the claim is `INSERT … ON CONFLICT DO NOTHING` on a primary key:
 * distinct ids never contend, the window is unbounded, and nothing touches the
 * credentials. Old rows are swept opportunistically (see `claimEventId`).
 */
export const eventsubSeen = sqliteTable("eventsub_seen", {
	messageId: text("message_id").primaryKey(),
	seenAt: integer("seen_at")
		.notNull()
		.default(sql`(unixepoch())`),
});
