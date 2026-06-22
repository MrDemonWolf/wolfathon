"use client";

import { expandHex, FONT_STACKS, gradientCss, type ThemeCorners } from "@wolfathon/api/theme";
import type { PublicTimer } from "@wolfathon/api/timer";
import { Flag, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Capsule corner radius per style. cqw = % of the OUTER source width (a capsule
 * element isn't its own query container, so cqh would resolve against the source
 * height — wrong). The bar is ~6.9cqw tall, so pill ≈ half that.
 */
const CORNER_RADII: Record<ThemeCorners, string> = {
	pill: "9999px",
	rounded: "4.4cqw",
	sharp: "1.4cqw",
};

/**
 * Subathon timer overlay — a single horizontal gradient capsule. Timestamp-
 * driven: it counts down locally from `endsAt` (correcting browser-clock skew
 * via `serverNow`) and only resyncs on the page's poll — smooth to the frame,
 * no websocket.
 *
 * The capsule has a LOCKED aspect ratio and a capped width, centred near the
 * top of the source. That's the fix for the old "fills the whole screen" bug:
 * sizing used to be `h-full` of the source, so a 1920×1080 OBS source stretched
 * the bar to ~1000px tall. Now the pill is its own `@container`, every interior
 * size is a `%` of the pill, and the pill keeps its shape at any source size —
 * identical in the 24:5 control preview and a full 16:9 browser source.
 *
 * When remaining time jumps up (a sub/gift/bits added time) the operator's
 * chosen emotes well up and flood the inside of the capsule with a rising "+Xm".
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

	// Auto-clear the "+Xm" flash + emote flood. Long enough that the (slowed)
	// emotes finish their rise before they're unmounted.
	useEffect(() => {
		if (!flash) return;
		const t = setTimeout(() => setFlash(null), 8800);
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
	const ended = !live && remaining <= 0;

	// Three distinct backgrounds so the timer state is never ambiguous: themed
	// sweep when live, cool slate when paused, warm maroon when ended.
	const capsule = live
		? gradientCss(data.gradient)
		: ended
			? "linear-gradient(100deg,#4a2030 0%,#5a2740 50%,#4a2030 100%)"
			: "linear-gradient(100deg,#2b3346 0%,#3a4456 50%,#2b3346 100%)";
	// Text colour is resolved server-side (auto → dark/white from gradient
	// brightness, or the operator's explicit hex); paused forces white over slate.
	const ink = live ? data.textColor : "#ffffff";
	const fontFamily = FONT_STACKS[data.font] ?? FONT_STACKS.montserrat;
	const radius = CORNER_RADII[data.corners] ?? CORNER_RADII.rounded;
	// Soft coloured glow from the brightest stop — replaces the old halo element
	// (a second rounded rect that read as a clumsy double border).
	const accent = data.gradient.at(-1) ?? "#5bc8f0";
	const glow = live
		? withAlpha(accent, "5c")
		: ended
			? "rgba(120,40,70,0.5)"
			: "rgba(58,68,92,0.45)";
	const boxShadow = `0 0.8cqw 2.6cqw rgba(4,9,24,0.5), 0 0 2.6cqw ${glow}`;

	return (
		<div
			className="pointer-events-none absolute inset-0 flex select-none items-center justify-center"
			style={{ fontFamily }}
		>
			<div className="relative w-[86cqw] max-w-[1560px]">
				{/* the capsule — its OWN container, fixed aspect, clips the emote flood.
				    Glow is a box-shadow (no second rounded element → no double border). */}
				<div
					className="@container relative aspect-[131/20] w-full overflow-hidden"
					style={{ backgroundImage: capsule, borderRadius: radius, boxShadow }}
				>
					{/* one thin top hairline for depth — no muddy gloss overlay */}
					<div className="pointer-events-none absolute inset-x-[6%] top-0 h-px bg-white/35" />
					{/* slow sheen sweep — life without a busy animation */}
					{live && (
						<div
							className="pointer-events-none absolute inset-0 overflow-hidden"
							style={{ borderRadius: radius }}
						>
							<div className="wolf-sheen absolute inset-y-0 -left-1/3 w-[26%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
						</div>
					)}

					{/* white wash + emote flood on a time-add event */}
					{flash && (
						<div
							key={`flood-${flash.id}`}
							className="animate-wolf-flood pointer-events-none absolute inset-0 bg-gradient-to-t from-white/30 via-white/10 to-transparent"
						/>
					)}
					{flash && (
						<div className="pointer-events-none absolute inset-0">
							{fillParticles(emojis, flash.id, data.emoteCount).map((p) => (
								<span
									key={p.key}
									className="animate-wolf-fill absolute bottom-0 will-change-transform"
									style={
										{
											left: `${p.left}%`,
											filter: "drop-shadow(0 0.3cqh 0.6cqh rgba(0,0,0,0.35))",
											"--fill-x": `${p.x}cqw`,
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

					{/* status chip pinned left — a play (running) / pause (stopped) icon
					    on its own dark plate, so it reads on any gradient */}
					{data.showStatus && (
						<div
							className="absolute top-1/2 left-[3cqw] grid aspect-square h-[58%] -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md"
							role="img"
							aria-label={live ? "Running" : ended ? "Ended" : "Paused"}
							title={live ? "Running" : ended ? "Ended" : "Paused"}
						>
							{live ? (
								<Play className="size-[55%] fill-current" />
							) : ended ? (
								<Flag className="size-[55%] fill-current" />
							) : (
								<Pause className="size-[55%] fill-current" />
							)}
						</div>
					)}

					{/* "+Xm" badge — inside the bar (top-right) so it's never clipped by a
					    tightly-cropped source; pops in on a time-add event */}
					{flash && (
						<div
							key={`label-${flash.id}`}
							className="animate-wolf-rise absolute top-[12%] right-[2.5cqw] z-10 rounded-full bg-black/45 px-[1.8cqw] py-[0.5cqw] text-[2.6cqw] font-extrabold whitespace-nowrap text-white backdrop-blur-md"
							style={{ boxShadow: `0 0 2cqw ${glow}` }}
						>
							+{flash.minutes}m
						</div>
					)}

					{/* eyebrow above the countdown, top-centre */}
					{data.showLabel && (
						<span
							className="absolute top-[1.6cqh] left-1/2 -translate-x-1/2 text-[1.7cqw] leading-none font-bold tracking-[0.5em] uppercase opacity-70"
							style={{ color: ink }}
						>
							{ended ? "Ended" : "Subathon"}
						</span>
					)}

					{/* the countdown, dead-centre (ink resolved server-side from the theme) */}
					<div
						className="absolute inset-0 grid place-items-center font-extrabold tabular-nums"
						style={{ color: ink }}
					>
						<div className="mt-[1cqh] flex items-baseline gap-[2.4cqw] [text-shadow:0_0.2cqh_0.7cqw_rgba(0,0,0,0.3)]">
							{Number(d) > 0 && <Segment value={d} unit="D" />}
							{Number(d) > 0 || Number(h) > 0 ? <Segment value={h} unit="H" /> : null}
							{remaining >= 60000 && <Segment value={m} unit="M" />}
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
				style={{ width: `${size}cqw`, height: `${size}cqw` }}
			/>
		);
	}
	return <span style={{ fontSize: `${size}cqw`, lineHeight: 1 }}>{e}</span>;
}

/** Display segment: numeric value + small subscript unit. */
function Segment({ value, unit }: { value: string; unit: string }) {
	return (
		<span className="relative inline-flex items-baseline">
			<span className="text-[8.6cqw] leading-none">{value}</span>
			<span className="ml-[0.5cqw] text-[2.4cqw] font-bold opacity-70">{unit}</span>
		</span>
	);
}

/** Append a 2-digit alpha to a #rgb / #rrggbb colour (→ #rrggbbaa). */
function withAlpha(hex: string, aa: string): string {
	return `${expandHex(hex)}${aa}`;
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

/** Emotes welling up across the capsule width when time is added (seeded by flash id). */
function fillParticles(emojis: string[], seed: number, count = 26) {
	// Clamp defensively — the server validates, but never spawn an absurd count.
	const n = Math.max(0, Math.min(80, Math.round(count)));
	return Array.from({ length: n }, (_, i) => ({
		key: `${seed}-${i}`,
		e: emojis[i % emojis.length] ?? "🐺",
		left: 2 + rand(seed, i) * 96, // %
		size: 3 + rand(seed, i + 40) * 3.4, // cqw
		x: rand(seed, i + 80) * 10 - 5, // cqw horizontal drift
		spin: rand(seed, i + 120) * 180 - 90, // deg
		duration: 5.0 + rand(seed, i + 160) * 2.0, // s — slow, floaty rise so the flood is unmissable
		delay: rand(seed, i + 200) * 1.4, // s, staggered so the bar fills gradually
	}));
}
