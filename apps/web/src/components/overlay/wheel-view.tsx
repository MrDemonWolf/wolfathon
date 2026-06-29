"use client";

import { luma } from "@wolfathon/api/theme";
import {
	computeArcs,
	DEFAULT_MIN_TURNS,
	finalRotation,
	type PendingSpin,
	type PublicWheelSlot,
} from "@wolfathon/api/wheel";
import { useEffect, useRef, useState } from "react";

/**
 * Wheel-of-dares overlay. Renders an SVG wheel of weighted slices (clockwise
 * from a fixed top pointer) and, on a NEW `pendingSpin.spinId`, eases a multi-
 * turn forward rotation that lands `targetIndex` dead-centre under the pointer
 * (geometry from `finalRotation`, the exact inverse the server picked against).
 *
 * Two safety rules make the landing trustworthy:
 *  - Dedupe by `spinId` (a ref), so re-polling the same pending spin never
 *    re-animates.
 *  - FREEZE the slice geometry for the duration of an in-flight spin: the wheel
 *    renders the snapshot it started spinning on, so a mid-spin slot edit can't
 *    shift which slice sits under the pointer when it stops.
 *
 * Distinct idle / spinning / result states; honours prefers-reduced-motion
 * (lands instantly, no whirl) for viewers sensitive to motion.
 */

const CX = 50;
const CY = 50;
const R = 46;
const LABEL_R = R * 0.62;
const SPIN_SECONDS = 5.2;
const RESULT_MS = 6000;
const NAVY = "#091533";

type Phase = "idle" | "spinning" | "result";

export function WheelView({
	slots,
	pending,
}: {
	slots: PublicWheelSlot[] | undefined;
	pending: PendingSpin;
}) {
	const [rotation, setRotation] = useState(0);
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
		const dest = finalRotation(snapshot, pending.targetIndex, rotation, DEFAULT_MIN_TURNS + 1);
		setFrozen(snapshot);
		setResultLabel(target.label);

		if (reduced) {
			// No whirl — land immediately and announce.
			setRotation(dest);
			setPhase("result");
			return;
		}
		setPhase("spinning");
		setRotation(dest);
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

	return (
		<div className="pointer-events-none absolute inset-0 grid select-none place-items-center">
			<div className="relative h-[84cqmin] w-[84cqmin]">
				<svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
					<defs>
						<filter id="wheel-shadow" x="-20%" y="-20%" width="140%" height="140%">
							<feDropShadow
								dx="0"
								dy="0.6"
								stdDeviation="1.2"
								floodColor="#04091a"
								floodOpacity="0.55"
							/>
						</filter>
					</defs>

					{/* The wheel group rotates; the pointer + hub stay fixed. transform-box
					    fill-box pins the spin centre to the wheel's own centre. */}
					<g
						style={{
							transform: `rotate(${rotation}deg)`,
							transformBox: "fill-box",
							transformOrigin: "center",
							transition: spinning
								? `transform ${SPIN_SECONDS}s cubic-bezier(0.17, 0.84, 0.2, 1)`
								: "none",
						}}
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
									strokeWidth={0.4}
									strokeLinejoin="round"
								/>
							);
						})}
						{arcs.map((arc) => {
							const slot = render[arc.index]!;
							const flip = arc.center > 90 && arc.center < 270;
							// Per-slice ink: dark text on a bright slice, light text on a dark
							// one (incl. an operator's custom hex), with the opposite-colour
							// halo. Keeps the label AA-legible on ANY slice colour.
							const dark = luma(slot.color) > 150;
							const ink = dark ? NAVY : "#ffffff";
							const halo = dark ? "#ffffff" : NAVY;
							return (
								<g key={`label-${slot.index}`} transform={`rotate(${arc.center} ${CX} ${CY})`}>
									<text
										x={CX}
										y={CY - LABEL_R}
										transform={flip ? `rotate(180 ${CX} ${CY - LABEL_R})` : undefined}
										textAnchor="middle"
										dominantBaseline="middle"
										fontSize={fontSizeFor(slot.label, arc.sweep)}
										fontWeight={700}
										fill={ink}
										stroke={halo}
										strokeWidth={0.5}
										paintOrder="stroke"
										style={{ fontFamily: "var(--font-montserrat), system-ui, sans-serif" }}
									>
										{clip(slot.label)}
									</text>
								</g>
							);
						})}
						{/* outer rim */}
						<circle
							cx={CX}
							cy={CY}
							r={R}
							fill="none"
							stroke="#ffffff"
							strokeWidth={0.6}
							strokeOpacity={0.25}
						/>
					</g>

					{/* fixed hub */}
					<circle cx={CX} cy={CY} r={6.5} fill={NAVY} stroke="#00aced" strokeWidth={1} />
					<circle cx={CX} cy={CY} r={2.2} fill="#00aced" />

					{/* fixed pointer at top, tip pointing down into the wheel */}
					<path
						d={`M${CX} ${CY - R + 5.5} L${CX - 4} ${CY - R - 4} L${CX + 4} ${CY - R - 4} Z`}
						fill="#00aced"
						stroke={NAVY}
						strokeWidth={0.8}
						strokeLinejoin="round"
						filter="url(#wheel-shadow)"
					/>
				</svg>

				{/* result announcement — opaque navy backing, AA-safe cyan + white text */}
				{phase === "result" && resultLabel && (
					<div className="pointer-events-none absolute inset-x-0 top-[calc(50%+46cqmin*0.5+2cqmin)] flex justify-center">
						<div
							className="animate-wolf-rise max-w-[80cqmin] rounded-2xl px-[4cqmin] py-[2.4cqmin] text-center"
							style={{ background: NAVY, boxShadow: "0 0.6cqmin 3cqmin rgba(0,172,237,0.45)" }}
						>
							<div
								className="text-[2.4cqmin] font-bold tracking-[0.3em] uppercase"
								style={{ color: "#5bc8f0" }}
							>
								Landed on
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

/** Point on the rim at a clockwise-from-top angle (0° = 12 o'clock). */
function polar(angleDeg: number): { x: number; y: number } {
	const rad = (angleDeg * Math.PI) / 180;
	return { x: CX + R * Math.sin(rad), y: CY - R * Math.cos(rad) };
}

/** Shrink the slice label a touch for long text / narrow slices. */
function fontSizeFor(label: string, sweep: number): number {
	const base = sweep < 24 ? 2.4 : 3;
	if (label.length > 18) return base * 0.7;
	if (label.length > 12) return base * 0.85;
	return base;
}

/** Hard cap on slice text — the full label always shows in the result banner. */
function clip(label: string): string {
	return label.length > 26 ? `${label.slice(0, 24)}…` : label;
}
