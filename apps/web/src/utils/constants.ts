/**
 * Live-refresh cadence (ms) for the wheel + giveaway surfaces — the overlay spin
 * channel and the operator's entrant/spin views all poll at this rate so a
 * triggered spin or a new entry shows within one tick. The timer/rewards overlays
 * poll slower (they change rarely or count locally) — see {@link TIMER_POLL_MS} /
 * {@link REWARDS_POLL_MS}.
 */
export const LIVE_POLL_MS = 3000;

/**
 * The timer overlay counts down locally to the frame, so it only polls to resync —
 * a 5s cadence stays smooth while keeping request volume well under the Cloudflare
 * Workers free tier.
 */
export const TIMER_POLL_MS = 5000;

/**
 * Rewards change rarely (only on a sub/unlock), so the rewards overlay polls
 * slowest of all — a 10s cadence is plenty.
 */
export const REWARDS_POLL_MS = 10_000;

/**
 * Overlay OBS source dimensions — the operator-facing size string on each
 * Overlays card AND the literal aspect-ratio class the in-panel preview frame
 * uses, kept in ONE place so they can't drift (they did once: a stale 760×380 in
 * the rewards docs vs the real 760×540). The aspect must stay a literal Tailwind
 * class — the JIT only emits CSS for class strings it sees in source, so it can't
 * be assembled from the numbers at runtime.
 */
export const OVERLAY_SIZES = {
	timer: { size: "1310×200", aspect: "aspect-[131/20]" },
	rewards: { size: "760×540", aspect: "aspect-[38/27]" },
	wheel: { size: "1080×1080", aspect: "aspect-square" },
} as const;

export type OverlayId = keyof typeof OVERLAY_SIZES;
