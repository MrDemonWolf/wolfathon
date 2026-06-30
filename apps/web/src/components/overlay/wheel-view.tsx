"use client";

import {
	clampScale,
	defaultOverlayTheme,
	FONT_STACKS,
	luma,
	type OverlayTheme,
	wheelPalette,
} from "@wolfathon/api/theme";
import {
	computeArcs,
	finalRotation,
	type PendingSpin,
	type PublicWheelSlot,
} from "@wolfathon/api/wheel";
import { type CSSProperties, useEffect, useRef, useState } from "react";

/**
 * Wheel-of-dares overlay ("Howlwheel"). Renders an SVG wheel of weighted slices
 * (clockwise from a fixed top "fang" pointer) and, on a NEW `pendingSpin.spinId`,
 * eases a multi-turn forward rotation that lands `targetIndex` dead-centre under
 * the pointer (geometry from `finalRotation`, the exact inverse the server picked
 * against). Slice ARC SIZE is proportional to weight, so the wheel is honest: a
 * slice's share of the circle equals its share of the odds.
 *
 * Two safety rules make the landing trustworthy:
 *  - Dedupe by `spinId` (a ref), so re-polling the same pending spin never
 *    re-animates.
 *  - FREEZE the slice geometry for the duration of an in-flight spin: the wheel
 *    renders the snapshot it started spinning on, so a mid-spin slot edit can't
 *    shift which slice sits under the pointer when it stops.
 *
 * Wolf dressing is all decoration over that geometry — a moonlit halo, glossy
 * slices with rim studs, a crescent-moon hub and a fang pointer — none of it
 * touches the landing math. Distinct idle / spinning / result states; honours
 * prefers-reduced-motion (lands instantly, no whirl, no idle pulse).
 */

const CX = 50;
const CY = 50;
const R = 46;
/** Radial band a slice label occupies — just outside the hub to just inside the rim. */
const LABEL_INNER = 12.5;
const LABEL_OUTER = R - 3.5;
/** Centre logo hub — 25% smaller than the old r=8/6.9 so the slices read bigger. */
const HUB_R = 6;
const LOGO_R = 5.2;
const SPIN_SECONDS = 6;
/** Whole turns the wheel sweeps before landing — more = a longer, weightier spin. */
const SPIN_TURNS = 8;
const RESULT_MS = 6000;

type Phase = "idle" | "spinning" | "result";

export function WheelView({
	slots,
	theme,
	pending,
}: {
	slots: PublicWheelSlot[] | undefined;
	theme: OverlayTheme | undefined;
	pending: PendingSpin;
}) {
	// Chrome colours + font follow the shared overlay theme; slice fills keep
	// their own per-slot colours. Aliased to the old NAVY/CYAN/MOON names so the
	// rest of the SVG reads unchanged.
	const t = theme ?? defaultOverlayTheme();
	const { accent: CYAN, light: MOON, dark: NAVY, darkDeep: NAVY_DEEP } = wheelPalette(t);
	const fontFamily = FONT_STACKS[t.font];
	const scale = clampScale(t.wheelScale);
	const [rotation, setRotation] = useState(0);
	// The active spin's from/to angles + a restart key. Keying the wheel group on
	// `key` re-arms the CSS keyframe animation for each new spin.
	const [spin, setSpin] = useState<{ from: number; to: number; key: number }>({
		from: 0,
		to: 0,
		key: 0,
	});
	const [phase, setPhase] = useState<Phase>("idle");
	const [resultLabel, setResultLabel] = useState<string | null>(null);
	// The geometry the wheel renders. While a spin is in flight this is frozen to
	// the snapshot the spin started on; otherwise it tracks the live slots.
	const [frozen, setFrozen] = useState<PublicWheelSlot[] | null>(null);

	const lastSpinId = useRef<string | null>(null);
	const reduced = usePrefersReducedMotion();

	// Drive the animation off a new pendingSpin.spinId.
	useEffect(() => {
		if (!pending || !slots) return;
		if (pending.spinId === lastSpinId.current) return; // already handled
		const target = slots[pending.targetIndex];
		if (!target) return; // index out of range (slots changed) — ignore
		lastSpinId.current = pending.spinId;

		const snapshot = slots;
		const dest = finalRotation(snapshot, pending.targetIndex, rotation, SPIN_TURNS);
		setFrozen(snapshot);
		setResultLabel(target.label);

		if (reduced) {
			// No whirl — land immediately and announce.
			setRotation(dest);
			setPhase("result");
			return;
		}
		setSpin((s) => ({ from: rotation, to: dest, key: s.key + 1 }));
		setRotation(dest); // rest angle once the animation finishes (forwards holds it)
		setPhase("spinning");
		const land = setTimeout(() => setPhase("result"), SPIN_SECONDS * 1000);
		return () => clearTimeout(land);
		// `rotation` is intentionally NOT a dependency: it's read once at spin start
		// as the from-angle; depending on it would re-fire this effect mid-spin and
		// restart the animation. The dedupe on `spinId` is what gates re-runs.
	}, [pending, slots, reduced]);

	// Auto-clear the result banner back to idle a few seconds after landing.
	useEffect(() => {
		if (phase !== "result") return;
		const t = setTimeout(() => {
			setPhase("idle");
			setResultLabel(null);
			setFrozen(null);
		}, RESULT_MS);
		return () => clearTimeout(t);
	}, [phase]);

	// While spinning/landing show the frozen snapshot; otherwise the live slots.
	const render = phase === "idle" ? slots : (frozen ?? slots);
	if (!render || render.length === 0) return null;

	const arcs = computeArcs(render);
	const spinning = phase === "spinning";
	// Idle "breathing" glow on the halo + rim — only while waiting, and never
	// under reduced motion (so it doesn't compete with an in-flight spin).
	const pulse = !reduced && phase === "idle" ? "wheel-pulse" : "";
	// Hidden-until-spin: by default the wheel only appears for the reveal (spin +
	// result), then fades back out. `showWheelIdle` parks it on screen permanently.
	const visible = t.showWheelIdle || phase !== "idle";
	// Size of the wheel within its (square) OBS source — operator-tunable for 1080p.
	const wheelSize = `${84 * scale}cqmin`;
	// Result banner sits just below the wheel rim; its offset follows the scale.
	const bannerTop = `calc(50% + ${42 * scale}cqmin + 2cqmin)`;

	return (
		<div
			className="pointer-events-none absolute inset-0 grid select-none place-items-center"
			style={{ opacity: visible ? 1 : 0, transition: reduced ? undefined : "opacity 0.45s ease" }}
		>
			<div className="relative" style={{ height: wheelSize, width: wheelSize }}>
				<svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
					<defs>
						<style>{`
							@keyframes howlHalo { 0%,100% { opacity:.5 } 50% { opacity:.95 } }
							@keyframes howlRim  { 0%,100% { stroke-opacity:.45 } 50% { stroke-opacity:.9 } }
							.wheel-pulse.halo { animation: howlHalo 3.6s ease-in-out infinite; }
							.wheel-pulse.rim  { animation: howlRim  3.6s ease-in-out infinite; }
							/* Spin: a fast whip that decelerates over a long tail, nudges 6°
							   past the landing notch, then settles back — like a real detented
							   wheel. The from/to angles come from inline --spin-from/--spin-to. */
							@keyframes howlSpin {
								0%   { transform: rotate(var(--spin-from)); animation-timing-function: cubic-bezier(0.16, 0.67, 0.05, 1); }
								84%  { transform: rotate(calc(var(--spin-to) + 6deg)); animation-timing-function: cubic-bezier(0.45, 0, 0.4, 1); }
								100% { transform: rotate(var(--spin-to)); }
							}
						`}</style>
						<filter id="wheel-shadow" x="-20%" y="-20%" width="140%" height="140%">
							<feDropShadow
								dx="0"
								dy="0.6"
								stdDeviation="1.2"
								floodColor={NAVY_DEEP}
								floodOpacity="0.55"
							/>
						</filter>
						<filter id="wheel-glow" x="-60%" y="-60%" width="220%" height="220%">
							<feDropShadow dx="0" dy="0" stdDeviation="1.6" floodColor={CYAN} floodOpacity="0.7" />
						</filter>
						{/* Moonlight bloom behind the wheel — fades to fully transparent so the
						    OBS source stays clean outside the disc. */}
						<radialGradient id="moon-glow" cx="50%" cy="50%" r="50%">
							<stop offset="0%" stopColor={CYAN} stopOpacity="0.42" />
							<stop offset="55%" stopColor={CYAN} stopOpacity="0.14" />
							<stop offset="100%" stopColor={CYAN} stopOpacity="0" />
						</radialGradient>
						{/* Glossy rim light: invisible across the body, brightening to a bright
						    ring at the edge so the disc reads as a lit object, not flat paint. */}
						<radialGradient id="disc-sheen" cx="50%" cy="50%" r="50%">
							<stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
							<stop offset="64%" stopColor="#ffffff" stopOpacity="0" />
							<stop offset="90%" stopColor="#ffffff" stopOpacity="0.1" />
							<stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
						</radialGradient>
						{/* Centre vignette — a little depth under the hub. */}
						<radialGradient id="disc-shade" cx="50%" cy="50%" r="50%">
							<stop offset="0%" stopColor={NAVY_DEEP} stopOpacity="0.4" />
							<stop offset="40%" stopColor={NAVY_DEEP} stopOpacity="0" />
						</radialGradient>
						<linearGradient id="fang" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={MOON} />
							<stop offset="45%" stopColor={CYAN} />
							<stop offset="100%" stopColor={CYAN} />
						</linearGradient>
						{/* Round mask for the centre logo hub (rotation-invariant: centred). */}
						<clipPath id="hub-clip">
							<circle cx={CX} cy={CY} r={LOGO_R} />
						</clipPath>
					</defs>

					{/* moon bloom (pulses on idle) */}
					<circle className={`halo ${pulse}`} cx={CX} cy={CY} r={49.5} fill="url(#moon-glow)" />

					{/* rim backing disc behind the slices */}
					<circle cx={CX} cy={CY} r={R + 1.6} fill={NAVY_DEEP} />

					{/* The wheel group rotates (slices, labels AND the centre logo); only the
					    pointer + outer rims stay fixed. transform-box fill-box pins the spin
					    centre to the wheel's own centre. While spinning we run the keyframe
					    animation (keyed so each spin re-arms it); at rest it's a plain rotate
					    held at the landed angle. */}
					<g
						key={spin.key}
						style={
							{
								transformBox: "fill-box",
								transformOrigin: "center",
								...(spinning
									? {
											"--spin-from": `${spin.from}deg`,
											"--spin-to": `${spin.to}deg`,
											animation: `howlSpin ${SPIN_SECONDS}s forwards`,
										}
									: { transform: `rotate(${rotation}deg)` }),
							} as CSSProperties
						}
						filter="url(#wheel-shadow)"
					>
						<circle cx={CX} cy={CY} r={R} fill={NAVY} />
						{arcs.map((arc) => {
							const slot = render[arc.index]!;
							// A lone enabled slot spans the full 360° — an SVG arc whose two
							// endpoints coincide is degenerate and paints nothing, so draw a
							// filled circle instead. Spin/landing is unaffected.
							return arc.end - arc.start >= 359.999 ? (
								<circle key={slot.index} cx={CX} cy={CY} r={R} fill={slot.color} />
							) : (
								<path
									key={slot.index}
									d={slicePath(arc.start, arc.end)}
									fill={slot.color}
									stroke={NAVY}
									strokeWidth={0.35}
									strokeLinejoin="round"
								/>
							);
						})}

						{/* depth passes over the flat slice fills */}
						<circle cx={CX} cy={CY} r={R} fill="url(#disc-shade)" />
						<circle cx={CX} cy={CY} r={R} fill="url(#disc-sheen)" />

						{/* rivet studs at each slice boundary — skipped for a single full slice */}
						{arcs.length > 1 &&
							arcs.map((arc) => {
								const p = polar(arc.start, R - 1.4);
								return (
									<circle
										key={`stud-${arc.index}`}
										cx={p.x}
										cy={p.y}
										r={0.55}
										fill={MOON}
										fillOpacity={0.55}
									/>
								);
							})}

						{arcs.map((arc) => {
							const slot = render[arc.index]!;
							// Radial labels: text runs ALONG the spoke (hub → rim), so a long
							// dare uses the wheel's full radius instead of spilling sideways
							// into its neighbours. The baseline's screen angle is
							// `center + spin`; with spin = -90 that stays upright (within ±90°
							// of horizontal) for the top half and only flips upside-down past
							// the BOTTOM, so the boundary is 180°, not the sides. Flipped
							// slices read inward from the rim; the font is fitted to the band.
							const flip = arc.center > 180;
							const anchorR = flip ? LABEL_OUTER : LABEL_INNER;
							const spin = flip ? 90 : -90;
							// Per-slice ink: dark text on a bright slice, light text on a dark
							// one (incl. an operator's custom hex), with the opposite-colour
							// halo. Keeps the label AA-legible on ANY slice colour.
							const dark = luma(slot.color) > 150;
							const ink = dark ? NAVY : "#ffffff";
							const halo = dark ? "#ffffff" : NAVY;
							// Size from the clipped text that actually renders, so a label
							// past the clip cap isn't shrunk for characters it never shows.
							const text = clip(slot.label);
							return (
								<g
									key={`label-${slot.index}`}
									transform={`rotate(${arc.center} ${CX} ${CY}) translate(${CX} ${CY - anchorR}) rotate(${spin})`}
								>
									<text
										x={0}
										y={0}
										textAnchor="start"
										dominantBaseline="central"
										fontSize={fontSizeFor(text, arc.sweep)}
										fontWeight={700}
										fill={ink}
										stroke={halo}
										strokeWidth={0.45}
										paintOrder="stroke"
										style={{ fontFamily }}
									>
										{text}
									</text>
								</g>
							);
						})}

						{/* centre logo hub — spins WITH the wheel; the operator's mark on a dark
						    disc with an accent ring, 25% smaller than before so slices read big */}
						<circle
							cx={CX}
							cy={CY}
							r={HUB_R}
							fill={NAVY_DEEP}
							stroke={CYAN}
							strokeWidth={0.9}
							filter="url(#wheel-glow)"
						/>
						<image
							href="/logo.svg"
							x={CX - LOGO_R}
							y={CY - LOGO_R}
							width={LOGO_R * 2}
							height={LOGO_R * 2}
							clipPath="url(#hub-clip)"
							preserveAspectRatio="xMidYMid meet"
						/>
						<circle
							cx={CX}
							cy={CY}
							r={LOGO_R}
							fill="none"
							stroke={CYAN}
							strokeWidth={0.35}
							strokeOpacity={0.5}
						/>
					</g>

					{/* fixed double rim — outer glow ring (pulses on idle) + crisp inner edge */}
					<circle
						className={`rim ${pulse}`}
						cx={CX}
						cy={CY}
						r={R + 0.4}
						fill="none"
						stroke={CYAN}
						strokeWidth={1}
						strokeOpacity={0.55}
						filter="url(#wheel-glow)"
					/>
					<circle
						cx={CX}
						cy={CY}
						r={R}
						fill="none"
						stroke="#ffffff"
						strokeWidth={0.5}
						strokeOpacity={0.3}
					/>

					{/* fixed fang pointer at top, tip biting down into the wheel */}
					<g filter="url(#wheel-shadow)">
						<path
							d={`M${CX - 3.6} ${CY - R - 4.5}
							    Q${CX} ${CY - R - 6.5} ${CX + 3.6} ${CY - R - 4.5}
							    Q${CX + 1.9} ${CY - R + 2} ${CX} ${CY - R + 5.5}
							    Q${CX - 1.9} ${CY - R + 2} ${CX - 3.6} ${CY - R - 4.5} Z`}
							fill="url(#fang)"
							stroke={NAVY}
							strokeWidth={0.7}
							strokeLinejoin="round"
						/>
						{/* highlight down the fang's spine */}
						<path
							d={`M${CX} ${CY - R - 4.8} Q${CX - 0.6} ${CY - R} ${CX} ${CY - R + 4.6}`}
							fill="none"
							stroke="#eafbff"
							strokeWidth={0.5}
							strokeOpacity={0.8}
							strokeLinecap="round"
						/>
					</g>
				</svg>

				{/* result announcement — opaque navy glass, AA-safe cyan + white text */}
				{phase === "result" && resultLabel && (
					<div
						className="pointer-events-none absolute inset-x-0 flex justify-center"
						style={{ top: bannerTop }}
					>
						<div
							className={`${reduced ? "" : "animate-wolf-rise"} max-w-[80cqmin] rounded-2xl border px-[4cqmin] py-[2.4cqmin] text-center`}
							style={{
								background: NAVY,
								borderColor: "rgba(0,172,237,0.55)",
								boxShadow: "0 0.6cqmin 3.4cqmin rgba(0,172,237,0.5)",
							}}
						>
							<div
								className="flex items-center justify-center gap-[1.4cqmin] text-[2.4cqmin] font-bold tracking-[0.3em] uppercase"
								style={{ color: CYAN }}
							>
								{/* tiny crescent to echo the hub */}
								<svg width="2.6cqmin" height="2.6cqmin" viewBox="0 0 10 10" aria-hidden>
									<circle cx="5" cy="5" r="4.4" fill={CYAN} />
									<circle cx="6.6" cy="4" r="3.9" fill={NAVY} />
								</svg>
								The pack lands on
							</div>
							<div className="mt-[0.6cqmin] text-[5cqmin] leading-tight font-extrabold text-white">
								{resultLabel}
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/** Read prefers-reduced-motion, updating live if the OS setting changes. */
function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		const apply = () => setReduced(mq.matches);
		apply();
		mq.addEventListener("change", apply);
		return () => mq.removeEventListener("change", apply);
	}, []);
	return reduced;
}

/** SVG path for a pie slice between two clockwise-from-top angles (degrees). */
function slicePath(startDeg: number, endDeg: number): string {
	const a = polar(startDeg);
	const b = polar(endDeg);
	const large = endDeg - startDeg > 180 ? 1 : 0;
	return `M${CX} ${CY} L${a.x.toFixed(3)} ${a.y.toFixed(3)} A${R} ${R} 0 ${large} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)} Z`;
}

/** Point at radius `r` (default rim) on a clockwise-from-top angle (0° = 12 o'clock). */
function polar(angleDeg: number, r: number = R): { x: number; y: number } {
	const rad = (angleDeg * Math.PI) / 180;
	return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

/**
 * Fit a radial label to the hub→rim band: scale down so the text fits the radial
 * length (~0.6em per glyph), and cap harder on narrow slices so a thin wedge's
 * label never grows fat enough to touch its neighbours.
 */
function fontSizeFor(label: string, sweep: number): number {
	const budget = LABEL_OUTER - LABEL_INNER;
	const byLength = budget / (Math.max(label.length, 1) * 0.6);
	const cap = sweep < 14 ? 2 : sweep < 24 ? 2.5 : 2.9;
	return Math.max(1.4, Math.min(cap, byLength));
}

/** Hard cap on slice text — the full label always shows in the result banner. */
function clip(label: string): string {
	return label.length > 26 ? `${label.slice(0, 24)}…` : label;
}
