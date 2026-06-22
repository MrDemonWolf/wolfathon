/** Canonical, import-ready example (also rendered in the schema panel). */
export const EXAMPLE_DOC = {
	goals: [
		{ reward: "Q&A", note: "1 sub" },
		{ reward: "Phasmophobia", note: "5 subs" },
		{ reward: "Onesie reveal", note: "10 subs" },
		{ reward: "Cake on cam", note: "15 subs" },
		{ reward: "Confetti chaos", note: "25 subs" },
		{ reward: "Stretch goal", note: "dream" },
	],
};

export const EXAMPLE_JSON = JSON.stringify(EXAMPLE_DOC, null, 2);

export const REWARDS_SCHEMA_BULLETS = [
	"Top-level `goals` is a non-empty array (max 50).",
	"Each goal needs a non-empty `reward` string (max 80 chars).",
	"`note` is optional and internal; unknown keys and any `id` are ignored.",
	"Optional `theme` (colour/font/corners) round-trips on export; omit it and import keeps your current theme.",
	"On import every goal resets to locked and progress returns to the first goal.",
];
