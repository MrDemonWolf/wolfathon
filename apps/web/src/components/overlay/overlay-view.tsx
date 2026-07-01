"use client";

import type { PublicData } from "@wolfathon/api/state";
import {
	expandHex,
	FONT_STACKS,
	gradientCss,
	NEXT_REWARDS_SHOWN,
	type ThemeCorners,
} from "@wolfathon/api/theme";
import { useEffect, useRef, useState } from "react";

/** Card corner radius per style (cqw = % of the source width). */
const CARD_RADII: Record<ThemeCorners, string> = {
	rounded: "4cqw",
	pill: "6.8cqw",
	sharp: "0",
};

/**
 * The visual overlay. Pure presentation of a note-stripped {@link PublicData}.
 *
 * Rules it enforces (no exceptions):
 *  - Shows reward NAMES only. Never a number, amount, total, or ceiling.
 *  - Renders the current reward + a short "Coming up" peek at the next few
 *    upcoming reward NAMES (targets stay hidden — a gifter sees names, not the
 *    numbers behind them).
 *  - On a new unlock, celebrates "Unlocked: <reward>" (glow + scale, no audio),
 *    then settles onto the next reward.
 *
 * The card FILLS its OBS source (recommended 760×380) instead of floating in a
 * corner of a full-screen canvas, so the operator drops a compact browser source
 * anywhere in their scene. All sizing uses container-query units (`cqw`) — % of
 * the source width — so the card scales to whatever size the source is set to.
 */
export function OverlayView({ data }: { data: PublicData | undefined }) {
	const seen = useRef<Set<string> | null>(null);
	const [celebrate, setCelebrate] = useState<string | null>(null);

	useEffect(() => {
		if (!data) return;
		const unlockedIds = data.goals.filter((g) => g.unlocked).map((g) => g.id);

		// First snapshot: remember what's already unlocked, don't celebrate it.
		if (seen.current === null) {
			seen.current = new Set(unlockedIds);
			return;
		}

		const fresh = data.goals.find((g) => g.unlocked && !seen.current!.has(g.id));
		unlockedIds.forEach((id) => seen.current!.add(id));
		if (!fresh) return;

		setCelebrate(fresh.reward);
		const timer = setTimeout(() => setCelebrate(null), 3200);
		return () => clearTimeout(timer);
	}, [data]);

	if (!data) return null;

	const current = data.goals[data.currentIndex]; // first locked goal = next reward
	// The upcoming rewards after the current one — names only, capped so the card
	// stays compact. Goals unlock top-to-bottom, so everything past currentIndex
	// is still locked (see recompute()).
	const next = data.goals.slice(data.currentIndex + 1, data.currentIndex + 1 + NEXT_REWARDS_SHOWN);
	const hasGoals = data.goals.length > 0;

	// Progress toward the NEXT goal only (never future ceilings — see stripNotes).
	const currentSubs = data.currentSubs ?? 0;
	const nextTarget = data.nextTarget;
	const showProgress =
		data.showProgressBar && current != null && nextTarget != null && nextTarget > 0;
	const progressPct = showProgress
		? Math.min(100, Math.round((currentSubs / nextTarget!) * 100))
		: 0;

	// Theme. The card sits on a dark panel (not the gradient), so the gradient is
	// an ACCENT (rail / eyebrow / chips); `auto` text → white on the dark card.
	const stops = data.gradient?.length ? data.gradient : ["#00aced", "#5bc8f0"];
	// Expand 3-digit shorthand so `${accent}AA` alpha suffixes stay valid CSS.
	const accent = expandHex(stops.at(-1) ?? "#5bc8f0");
	const accentDeep = expandHex(stops[0] ?? "#00aced");
	const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(data.textColor);
	const ink = data.textColor === "auto" || !isHex ? "#ffffff" : data.textColor;
	const fontFamily = FONT_STACKS[data.font] ?? FONT_STACKS.montserrat;
	const radius = CARD_RADII[data.corners] ?? CARD_RADII.rounded;

	return (
		<div className="pointer-events-none absolute inset-0 select-none" style={{ fontFamily }}>
			{/* Reward card — fills the source width, anchored top with a small margin
          so the glow/border isn't flush to the edge. Hidden until goals exist so
          an unconfigured tracker never broadcasts a false "All Rewards Unlocked". */}
			{hasGoals && (
				<div className="absolute inset-x-[2.5cqw] top-[2.5cqw]">
					<div
						className="relative overflow-hidden border bg-gradient-to-br from-[#0b1a3d]/90 to-[#060f24]/90 backdrop-blur-xl"
						style={{
							borderColor: `${accent}55`,
							borderRadius: radius,
							// Same glow family as the timer — soft drop + accent halo, no gloss.
							boxShadow: `0 1.6cqw 6cqw rgba(4,9,24,0.5), 0 0 5.2cqw ${accent}33`,
						}}
					>
						{/* one thin top hairline for depth (matches the timer bar) */}
						<div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-white/30" />
						{/* Glowing accent rail down the left edge. */}
						<div
							className="absolute inset-y-0 left-0 w-[1.1cqw]"
							style={{ backgroundImage: gradientCss([accent, accentDeep], 180) }}
						/>

						<div className="relative p-[4.4cqw] pl-[5.2cqw]">
							{(data.showLabel || (current && data.showLiveDot)) && (
								<div className="flex items-center gap-[2cqw]">
									<span
										className="flex items-center gap-[1.4cqw] text-[3cqw] font-semibold tracking-[0.28em] uppercase"
										style={{ color: accent }}
									>
										{current && data.showLiveDot && (
											<span className="relative flex size-[2cqw]">
												<span
													className="absolute inline-flex size-full animate-ping rounded-full opacity-70"
													style={{ backgroundColor: accentDeep }}
												/>
												<span
													className="relative inline-flex size-full rounded-full"
													style={{ backgroundColor: accent }}
												/>
											</span>
										)}
										{data.showLabel && (current ? "Next Reward" : "All Rewards Unlocked")}
									</span>
								</div>
							)}

							{current ? (
								<>
									<div
										key={current.id}
										className="animate-wolf-rise mt-[2.8cqw] text-[10cqw] leading-[1.04] font-extrabold line-clamp-2 [text-shadow:0_0_4.8cqw_rgba(0,0,0,0.45)]"
										style={{ color: ink }}
									>
										{current.reward}
									</div>
									{showProgress && (
										<div className="mt-[2.8cqw]">
											<div className="h-[1.8cqw] w-full overflow-hidden rounded-full bg-white/10">
												<div
													className="h-full rounded-full transition-[width] duration-500"
													style={{ width: `${progressPct}%`, backgroundImage: gradientCss(stops) }}
												/>
											</div>
											<div
												className="mt-[1.4cqw] text-[2.7cqw] font-bold tracking-wide tabular-nums"
												style={{ color: `${accent}d9` }}
											>
												{currentSubs} / {nextTarget} subs
											</div>
										</div>
									)}
								</>
							) : (
								<div
									className="mt-[2.8cqw] text-[6.8cqw] leading-tight font-bold"
									style={{ color: accent }}
								>
									Thank you 🐺
								</div>
							)}

							{data.showNext && next.length > 0 && (
								<>
									<div
										className="mt-[3.6cqw] flex items-center gap-[1.4cqw] text-[2.4cqw] font-semibold tracking-[0.18em] uppercase"
										style={{ color: `${accent}b3` }}
									>
										<span className="h-px flex-1 bg-gradient-to-r from-white/25 to-transparent" />
										Coming up
										<span className="h-px flex-1 bg-gradient-to-l from-white/25 to-transparent" />
									</div>
									<div className="mt-[2.2cqw] flex flex-wrap gap-[1.6cqw]">
										{next.slice(0, 3).map((g) => (
											<span
												key={g.id}
												className="inline-flex items-center rounded-full border border-white/15 bg-[#13244d]/90 px-[5.6cqw] py-[2cqw] text-[2.7cqw] text-white/85"
											>
												{g.reward}
											</span>
										))}
									</div>
								</>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Unlock celebration — opaque backing keeps the peak moment legible.
          Width-capped so a long reward name can't spill past a compact source. */}
			{celebrate && (
				<div className="absolute inset-0 flex items-center justify-center">
					<div
						className="animate-wolf-pop max-w-[90cqw] border bg-[#091533]/88 px-[10cqw] py-[6.8cqw] text-center backdrop-blur-xl"
						style={{
							borderColor: `${accent}4d`,
							borderRadius: radius,
							boxShadow: `0 2cqw 8cqw rgba(4,9,24,0.55), 0 0 8cqw ${accent}40`,
						}}
					>
						<div
							className="text-[4cqw] font-semibold tracking-[0.3em] uppercase"
							style={{ color: accent }}
						>
							Unlocked
						</div>
						<div className="wolf-glow mt-[1.2cqw] text-[13cqw] leading-none font-extrabold text-white line-clamp-2">
							{celebrate}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
