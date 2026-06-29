/** Canonical, import-ready timer config example (also shown in the panel). */
export const TIMER_EXAMPLE = {
	startMinutes: 60,
	maxMinutes: 0,
	sub: { t1: 5, t2: 10, t3: 25, prime: 5 },
	giftSubMinutes: 5,
	bitsPer100Minutes: 1,
	channelPoints: [{ rewardTitle: "Add 5 minutes", minutes: 5 }],
	emoteDirection: "up",
};

export const TIMER_EXAMPLE_JSON = JSON.stringify(TIMER_EXAMPLE, null, 2);

export const TIMER_SCHEMA_BULLETS = [
	"`startMinutes` = time on the clock at reset; `maxMinutes` = cap (0 = no cap).",
	"`sub.t1/t2/t3/prime`, `giftSubMinutes`, `bitsPer100Minutes` are minutes added per event.",
	"`channelPoints` is a list of `{ rewardTitle, minutes, rewardId? }` (max 50).",
	"`autoPauseOnOffline` (default true) pauses on stream.offline and resumes on stream.online.",
	"`emoteDirection` = up|left|right — which way the time-add emote burst travels.",
	"Overlay theme (colour/font/corners) is a global setting under Settings → Theme, shared by both overlays — it's not part of this config.",
	"Importing replaces the config; a running timer keeps ticking.",
];
