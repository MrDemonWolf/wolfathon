"use client";

import type { PublicData } from "@wolfathon/api/state";
import { FONT_STACKS, gradientCss, type ThemeCorners } from "@wolfathon/api/theme";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Card corner radius per style (cqw = % of the source width). */
const CARD_RADII: Record<ThemeCorners, string> = {
	rounded: "2cqw",
	pill: "3.4cqw",
	sharp: "0.4cqw",
};

/**
 * The visual overlay. Pure presentation of a note-stripped {@link PublicData}.
 *
 * Rules it enforces (no exceptions):
 *  - Shows reward NAMES only. Never a number, amount, total, or ceiling.
 *  - Renders the current reward + already-unlocked rewards. Future goals are
 *    hidden entirely, so a big gifter never sees a "final" target.
 *  - On a new unlock, celebrates "Unlocked: <reward>" (glow + scale, no audio),
 *    then settles onto the next reward.
 *
 * All sizing uses container-query units (`cqw`) so it looks identical full-screen
 * in OBS (1920×1080) and shrunk into the control panel preview.
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

	const unlocked = data.goals.filter((g) => g.unlocked);
	const current = data.goals[data.currentIndex]; // first locked goal = next reward
	const hasGoals = data.goals.length > 0;

	// Theme. The card sits on a dark panel (not the gradient), so the gradient is
	// an ACCENT (rail / eyebrow / chips); `auto` text → white on the dark card.
	const stops = data.gradient?.length ? data.gradient : ["#00aced", "#5bc8f0"];
	const accent = stops.at(-1) ?? "#5bc8f0";
	const accentDeep = stops[0] ?? "#00aced";
	const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(data.textColor);
	const ink = data.textColor === "auto" || !isHex ? "#ffffff" : data.textColor;
	const fontFamily = FONT_STACKS[data.font] ?? FONT_STACKS.montserrat;
	const radius = CARD_RADII[data.corners] ?? CARD_RADII.rounded;

	return (
		<div className="pointer-events-none absolute inset-0 select-none" style={{ fontFamily }}>
			{/* Floating reward card. Hidden until goals exist so an unconfigured
          tracker never broadcasts a false "All Rewards Unlocked". */}
			{hasGoals && (
				<div className="absolute bottom-[4cqw] left-[4cqw] max-w-[48cqw]">
					<div
						className="relative overflow-hidden border bg-gradient-to-br from-[#0b1a3d]/90 to-[#060f24]/90 backdrop-blur-xl"
						style={{
							borderColor: `${accent}55`,
							borderRadius: radius,
							// Same glow family as the timer — soft drop + accent halo, no gloss.
							boxShadow: `0 0.8cqw 3cqw rgba(4,9,24,0.5), 0 0 2.6cqw ${accent}33`,
						}}
					>
						{/* one thin top hairline for depth (matches the timer bar) */}
						<div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-white/30" />
						{/* Glowing accent rail down the left edge. */}
						<div
							className="absolute inset-y-0 left-0 w-[0.55cqw]"
							style={{ backgroundImage: gradientCss([accent, accentDeep], 180) }}
						/>

						<div className="relative p-[2.2cqw] pl-[2.6cqw]">
							{(data.showLabel || (current && data.showStatus)) && (
								<div className="flex items-center gap-[1cqw]">
									<span
										className="flex items-center gap-[0.7cqw] text-[1.5cqw] font-semibold tracking-[0.28em] uppercase"
										style={{ color: accent }}
									>
										{current && data.showStatus && (
											<span className="relative flex size-[1cqw]">
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
								<div
									key={current.id}
									className="animate-wolf-rise mt-[1.4cqw] text-[5cqw] leading-[1.04] font-extrabold [text-shadow:0_0_2.4cqw_rgba(0,0,0,0.45)]"
									style={{ color: ink }}
								>
									{current.reward}
								</div>
							) : (
								<div
									className="mt-[1.4cqw] text-[3.4cqw] leading-tight font-bold"
									style={{ color: accent }}
								>
									Thank you 🐺
								</div>
							)}

							{unlocked.length > 0 && (
								<>
									<div
										className="mt-[1.8cqw] flex items-center gap-[0.7cqw] text-[1.2cqw] font-semibold tracking-[0.18em] uppercase"
										style={{ color: `${accent}b3` }}
									>
										<span className="h-px flex-1 bg-gradient-to-r from-white/25 to-transparent" />
										{unlocked.length} Unlocked
										<span className="h-px flex-1 bg-gradient-to-l from-white/25 to-transparent" />
									</div>
									<div className="mt-[1.1cqw] flex flex-wrap gap-[0.8cqw]">
										{unlocked.slice(-4).map((g) => (
											<span
												key={g.id}
												className="inline-flex items-center gap-[0.5cqw] rounded-full border border-white/15 bg-[#13244d]/70 px-[1.1cqw] py-[0.4cqw] text-[1.35cqw] text-white/70"
											>
												<Check className="size-[1.3cqw]" style={{ color: accent }} />
												{g.reward}
											</span>
										))}
										{unlocked.length > 4 && (
											<span className="inline-flex items-center rounded-full bg-[#13244d]/50 px-[1.1cqw] py-[0.4cqw] text-[1.35cqw] text-white/45">
												+{unlocked.length - 4}
											</span>
										)}
									</div>
								</>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Unlock celebration — opaque backing keeps the peak moment legible. */}
			{celebrate && (
				<div className="absolute inset-0 flex items-center justify-center">
					<div
						className="animate-wolf-pop border bg-[#091533]/88 px-[5cqw] py-[3.4cqw] text-center backdrop-blur-xl"
						style={{
							borderColor: `${accent}4d`,
							borderRadius: radius,
							boxShadow: `0 1cqw 4cqw rgba(4,9,24,0.55), 0 0 4cqw ${accent}40`,
						}}
					>
						<div
							className="text-[2cqw] font-semibold tracking-[0.3em] uppercase"
							style={{ color: accent }}
						>
							Unlocked
						</div>
						<div className="wolf-glow mt-[0.6cqw] text-[6.5cqw] leading-none font-extrabold text-white">
							{celebrate}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
