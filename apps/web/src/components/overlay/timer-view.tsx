"use client";

import type { PublicTimer } from "@wolfathon/api/timer";
import { useEffect, useRef, useState } from "react";

/**
 * Subathon timer overlay — a single horizontal pill "widget". Timestamp-driven:
 * it counts down locally from `endsAt` (correcting browser-clock skew via
 * `serverNow`) and only resyncs on the page's poll — smooth to the frame, no
 * websocket.
 *
 * The bar fills its OBS browser source, so the streamer sizes the source to the
 * bar (recommend ~720×150) rather than floating a card in a 1080 canvas. When
 * remaining time jumps up (a sub/gift/bits added time) the operator's chosen
 * emoji well up and flood the inside of the bar, with a rising "+Xm" token.
 *
 * All sizing is in container-query units (mostly `cqh`, height-relative) so the
 * bar reads identically at any source width and in the control-panel preview.
 */
export function TimerView({ data }: { data: PublicTimer | undefined }) {
	const offsetRef = useRef(0); // serverNow - browserNow, captured per fetch
	const targetRef = useRef<number | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [flash, setFlash] = useState<{ id: number; minutes: number } | null>(null);

	// Resync the clock offset and detect added time on each fresh payload.
	useEffect(() => {
		if (!data) return;
		offsetRef.current = data.serverNow - Date.now();
		const target = data.remainingMs;
		if (targetRef.current != null && target > targetRef.current + 800) {
			setFlash({
				id: data.serverNow,
				minutes: Math.max(1, Math.round((target - targetRef.current) / 60000)),
			});
		}
		targetRef.current = target;
	}, [data]);

	// Local tick.
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(t);
	}, []);

	// Auto-clear the "+Xm" flash + emote flood.
	useEffect(() => {
		if (!flash) return;
		const t = setTimeout(() => setFlash(null), 2400);
		return () => clearTimeout(t);
	}, [flash]);

	const emojis = data?.emojis?.length ? data.emojis : ["🐺"];

	if (!data) return null;

	const remaining =
		data.running && data.endsAt != null
			? Math.max(0, data.endsAt - (now + offsetRef.current))
			: Math.max(0, data.remainingMs);
	const { d, h, m, s } = format(remaining);
	const live = data.running && remaining > 0;
	const accent = live ? "#00aced" : "#f5b94d";

	return (
		<div className="pointer-events-none absolute inset-[5cqh] flex select-none items-center justify-center">
			{/* rising "+Xm" token, sits just above the bar */}
			{flash && (
				<div
					key={`label-${flash.id}`}
					className="animate-wolf-rise absolute bottom-full left-1/2 mb-[3cqh] -translate-x-1/2"
				>
					<div className="rounded-full border border-[#00aced]/40 bg-[#091533]/90 px-[5cqh] py-[1.5cqh] font-heading text-[22cqh] font-extrabold whitespace-nowrap text-[#5bc8f0] shadow-[inset_0_0.12cqh_0_rgba(255,255,255,0.2),0_0_3cqh_rgba(0,172,237,0.45)] backdrop-blur-xl">
						+{flash.minutes}m
					</div>
				</div>
			)}

			<div className="relative h-full w-full">
				{/* animated gradient glow ring behind the bar */}
				<div
					className={`absolute -inset-[2cqh] rounded-full bg-[conic-gradient(from_0deg,#00aced,#5bc8f0,#3a86c9,#00aced)] opacity-50 blur-[2cqh] ${live ? "animate-spin-slow" : ""}`}
				/>

				{/* the pill — overflow-hidden so the emote flood is clipped inside */}
				<div className="relative flex h-full w-full items-center gap-[4cqh] overflow-hidden rounded-full border border-[#5bc8f0]/40 bg-[#091533]/88 pr-[6cqh] pl-[3cqh] shadow-[inset_0_0.12cqh_0_rgba(255,255,255,0.18),0_0_4cqh_rgba(0,172,237,0.25)] backdrop-blur-xl">
					{/* top hairline + inner sheen */}
					<div className="pointer-events-none absolute inset-x-[8cqh] top-0 h-px bg-gradient-to-r from-transparent via-[#5bc8f0] to-transparent" />
					<div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(80%_140%_at_0%_0%,rgba(255,255,255,0.08),transparent_55%)]" />

					{/* cyan flood wash on a time-add event */}
					{flash && (
						<div
							key={`flood-${flash.id}`}
							className="animate-wolf-flood pointer-events-none absolute inset-0 bg-gradient-to-t from-[#00aced]/35 via-[#00aced]/10 to-transparent"
						/>
					)}

					{/* emotes welling up and filling the bar */}
					{flash && (
						<div className="pointer-events-none absolute inset-0">
							{fillParticles(emojis, flash.id).map((p) => (
								<span
									key={p.key}
									className="animate-wolf-fill absolute bottom-[-12cqh] will-change-transform"
									style={
										{
											left: `${p.left}%`,
											filter: "drop-shadow(0 0 0.8cqh rgba(0,172,237,0.6))",
											"--fill-x": `${p.x}cqh`,
											"--fill-spin": `${p.spin}deg`,
											"--fill-dur": `${p.duration}s`,
											"--fill-delay": `${p.delay}s`,
										} as React.CSSProperties
									}
								>
									<Glyph e={p.e} size={p.size} />
								</span>
							))}
						</div>
					)}

					{/* left badge: status orb in a tinted ring (no wolf logo, per #9) */}
					<div
						className="relative grid aspect-square h-[74%] shrink-0 place-items-center rounded-full bg-[#0c1c44]"
						style={{
							boxShadow: `0 0 2.5cqh ${accent}66, inset 0 0 0 0.4cqh ${accent}99`,
						}}
					>
						{live && (
							<span className="absolute inset-0 animate-ping rounded-full border border-[#00aced]/50" />
						)}
						<span
							className="size-[34%] rounded-full"
							style={{ backgroundColor: accent, boxShadow: `0 0 1.6cqh ${accent}` }}
						/>
					</div>

					{/* eyebrow + status, stacked, then the countdown */}
					<div className="relative flex min-w-0 flex-1 flex-col justify-center">
						<div className="flex items-center gap-[2cqh]">
							<span className="font-heading text-[12cqh] leading-none font-bold tracking-[0.45em] text-[#5bc8f0] uppercase">
								Subathon
							</span>
							{live ? (
								<span className="flex items-center gap-[1cqh] text-[10cqh] leading-none font-semibold tracking-widest text-[#00aced]">
									<span className="size-[1.4cqh] animate-pulse rounded-full bg-[#00aced] [box-shadow:0_0_1.2cqh_#00aced]" />
									LIVE
								</span>
							) : (
								<span className="flex items-center gap-[1cqh] text-[10cqh] leading-none font-semibold tracking-widest text-[#f5b94d]">
									<span className="size-[1.4cqh] rounded-full bg-[#f5b94d]" />
									{remaining > 0 ? "PAUSED" : "ENDED"}
								</span>
							)}
						</div>

						<div
							className={`mt-[2cqh] flex items-baseline gap-[3cqh] font-heading font-extrabold tabular-nums text-white ${live ? "wolf-glow" : ""}`}
						>
							{Number(d) > 0 && <Segment value={d} unit="D" />}
							{(Number(d) > 0 || Number(h) > 0) && <Segment value={h} unit="H" />}
							<Segment value={m} unit="M" />
							<Segment value={s} unit="S" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

/** One emote glyph: a Twitch emote image (https URL) or a unicode emoji. */
function Glyph({ e, size }: { e: string; size: number }) {
	if (e.startsWith("https://")) {
		return (
			// eslint-disable-next-line @next/next/no-img-element
			<img
				src={e}
				alt=""
				className="block object-contain"
				style={{ width: `${size}cqh`, height: `${size}cqh` }}
			/>
		);
	}
	return <span style={{ fontSize: `${size}cqh`, lineHeight: 1 }}>{e}</span>;
}

/** Display segment: numeric value + small subscript unit. */
function Segment({ value, unit }: { value: string; unit: string }) {
	return (
		<span className="relative inline-flex items-baseline">
			<span className="text-[44cqh] leading-none [text-shadow:0_0_2.4cqh_rgba(0,172,237,0.45)]">
				{value}
			</span>
			<span className="ml-[0.4cqh] font-heading text-[12cqh] font-bold text-[#5bc8f0]">{unit}</span>
		</span>
	);
}

function format(ms: number): { d: string; h: string; m: string; s: string } {
	const total = Math.max(0, Math.floor(ms / 1000));
	const pad = (n: number) => String(n).padStart(2, "0");
	return {
		d: String(Math.floor(total / 86400)),
		h: pad(Math.floor((total % 86400) / 3600)),
		m: pad(Math.floor((total % 3600) / 60)),
		s: pad(total % 60),
	};
}

/** Deterministic pseudo-random in [0,1) — keeps SSR/client markup identical. */
function rand(seed: number, salt: number): number {
	const x = Math.sin(seed * 99.13 + salt * 12.7) * 43758.5453;
	return x - Math.floor(x);
}

/** Emotes welling up across the bar width when time is added (seeded by flash id). */
function fillParticles(emojis: string[], seed: number, count = 26) {
	return Array.from({ length: count }, (_, i) => ({
		key: `${seed}-${i}`,
		e: emojis[i % emojis.length] ?? "🐺",
		left: 2 + rand(seed, i) * 96, // %
		size: 7 + rand(seed, i + 40) * 8, // cqh
		x: rand(seed, i + 80) * 16 - 8, // cqh horizontal drift
		spin: rand(seed, i + 120) * 220 - 110, // deg
		duration: 1.1 + rand(seed, i + 160) * 0.7, // s
		delay: rand(seed, i + 200) * 0.85, // s, staggered so the bar "fills"
	}));
}
