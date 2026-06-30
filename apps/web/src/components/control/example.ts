/** Canonical, import-ready example (also rendered in the schema panel). */
export const EXAMPLE_DOC = {
	currentSubs: 0,
	goals: [
		{ reward: "Q&A", note: "1 sub", target: 1 },
		{ reward: "Phasmophobia", note: "5 subs", target: 5 },
		{ reward: "Onesie reveal", note: "10 subs", target: 10 },
		{ reward: "Cake on cam", note: "15 subs", target: 15 },
		{ reward: "Confetti chaos", note: "25 subs", target: 25 },
		{ reward: "Stretch goal", note: "dream" },
	],
};

export const EXAMPLE_JSON = JSON.stringify(EXAMPLE_DOC, null, 2);

export const REWARDS_SCHEMA_BULLETS = [
	"Top-level `goals` is a non-empty array (max 50).",
	"Each goal needs a non-empty `reward` string (max 80 chars).",
	"`note` is optional and internal; unknown keys and any `id` are ignored.",
	"`target` (optional, number) is the sub milestone — drives the next-goal progress bar; only the next goal's target is ever exposed.",
	"`hidden: true` (optional, boolean) keeps a goal operator-only — it never shows on the overlay (a secret/surprise reward).",
	"Top-level `currentSubs` (optional) seeds the running sub count.",
	"Optional `theme` (colour/font/corners/`label`) round-trips on export; omit it and import keeps your current theme. `theme.label` is the timer eyebrow text.",
	"On import every goal resets to locked and progress returns to the first goal.",
];
