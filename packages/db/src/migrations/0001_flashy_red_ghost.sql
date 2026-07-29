CREATE TABLE `eventsub_seen` (
	`message_id` text PRIMARY KEY NOT NULL,
	`seen_at` integer DEFAULT (unixepoch()) NOT NULL
);
