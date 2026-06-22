/** Canonical, import-ready timer config example (also shown in the panel). */
export const TIMER_EXAMPLE = {
	startMinutes: 60,
	maxMinutes: 0,
	sub: { t1: 5, t2: 10, t3: 25, prime: 5 },
	giftSubMinutes: 5,
	bitsPer100Minutes: 1,
	channelPoints: [{ rewardTitle: "Add 5 minutes", minutes: 5 }],
	theme: {
		preset: "brand",
		gradient: [],
		textColor: "auto",
		font: "montserrat",
		corners: "rounded",
		showLabel: true,
		showStatus: true,
	},
};

export const TIMER_EXAMPLE_JSON = JSON.stringify(TIMER_EXAMPLE, null, 2);

export const TIMER_SCHEMA_BULLETS = [
	"`startMinutes` = time on the clock at reset; `maxMinutes` = cap (0 = no cap).",
	"`sub.t1/t2/t3/prime`, `giftSubMinutes`, `bitsPer100Minutes` are minutes added per event.",
	"`channelPoints` is a list of `{ rewardTitle, minutes, rewardId? }` (max 50).",
	"`theme.preset` = brand|sunset|aurora|mono|custom (`custom` uses `theme.gradient`, 2–6 hex stops). `theme.textColor` = \"auto\" or a hex; `theme.font` = montserrat|roboto|poppins|inter|system; `theme.corners` = rounded|pill|sharp; `theme.showLabel`/`showStatus` toggle the chrome.",
	"Importing replaces the config; a running timer keeps ticking.",
];
