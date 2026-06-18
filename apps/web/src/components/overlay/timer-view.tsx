"use client";

import type { PublicTimer } from "@wolfathon/api/timer";
import { useEffect, useRef, useState } from "react";

import { WolfMark } from "@/components/wolf-mark";

/**
 * Subathon timer overlay. Timestamp-driven: it counts down locally from
 * `endsAt` (correcting browser-clock skew via `serverNow`) and only resyncs on
 * the page's poll — smooth to the frame, no websocket.
 *
 * The operator's chosen emoji do two things: a slow ambient drift up the screen
 * behind the timer, and a celebratory burst whenever remaining time jumps up (a
 * sub/gift/bits added time), alongside the rising "+Xm" token.
 *
 * All sizing is in container-query units (`cqw`/`cqh`) so it reads identically
 * at 1920×1080 in OBS and shrunk into the control-panel preview.
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
      setFlash({ id: data.serverNow, minutes: Math.max(1, Math.round((target - targetRef.current) / 60000)) });
    }
    targetRef.current = target;
  }, [data]);

  // Local tick.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Auto-clear the "+Xm" flash + burst.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(t);
  }, [flash]);

  const emojis = data?.emojis?.length ? data.emojis : ["🐺"];
  const drift = driftParticles(emojis);

  if (!data) return null;

  const remaining =
    data.running && data.endsAt != null
      ? Math.max(0, data.endsAt - (now + offsetRef.current))
      : Math.max(0, data.remainingMs);
  const { h, m, s } = format(remaining);
  const live = data.running && remaining > 0;

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      {/* Ambient emoji drifting up behind everything. */}
      <div className="absolute inset-0">
        {drift.map((p) => (
          <span
            key={p.key}
            className="animate-wolf-drift absolute bottom-[-8cqh] will-change-transform"
            style={
              {
                left: `${p.left}%`,
                filter: "drop-shadow(0 0 0.6cqw rgba(0,172,237,0.45))",
                "--drift-duration": `${p.duration}s`,
                "--drift-delay": `${p.delay}s`,
                "--drift-sway": `${p.sway}cqw`,
                "--drift-spin": `${p.spin}deg`,
                "--drift-opacity": p.opacity,
              } as React.CSSProperties
            }
          >
            <Glyph e={p.e} size={p.size} />
          </span>
        ))}
      </div>

      <div className="absolute top-[6%] left-1/2 -translate-x-1/2">
        <div className="relative">
          {/* animated gradient glow ring behind the pill */}
          <div
            className={`absolute -inset-[0.6cqw] rounded-[2.6cqw] bg-[conic-gradient(from_0deg,#00aced,#5bc8f0,#7c4dff,#00aced)] opacity-60 blur-[1.4cqw] ${live ? "animate-spin-slow" : ""}`}
          />
          <div className="relative rounded-[2cqw] border border-[#5bc8f0]/40 bg-[#091533]/85 px-[3.4cqw] py-[2cqw] shadow-[0_0_4cqw_rgba(0,172,237,0.25)] backdrop-blur-md">
            {/* cyan top hairline */}
            <div className="absolute inset-x-[2cqw] top-0 h-px bg-gradient-to-r from-transparent via-[#5bc8f0] to-transparent" />
            {/* soft inner sheen */}
            <div className="pointer-events-none absolute inset-0 rounded-[2cqw] bg-gradient-to-b from-white/[0.06] to-transparent" />

            {/* eyebrow */}
            <div className="relative flex items-center justify-center gap-[1cqw]">
              <WolfMark className="size-[2.6cqw]" />
              <span className="font-heading text-[1.35cqw] font-bold tracking-[0.5em] text-[#5bc8f0] uppercase">
                Subathon
              </span>
              {live ? (
                <span className="flex items-center gap-[0.5cqw] text-[1.05cqw] font-semibold tracking-widest text-[#00aced]">
                  <span className="size-[0.85cqw] animate-pulse rounded-full bg-[#00aced] [box-shadow:0_0_1.2cqw_#00aced]" />
                  LIVE
                </span>
              ) : (
                <span className="text-[1.05cqw] font-semibold tracking-widest text-white/40">
                  {remaining > 0 ? "PAUSED" : "ENDED"}
                </span>
              )}
            </div>

            {/* countdown */}
            <div
              className={`relative mt-[1cqw] flex items-baseline justify-center gap-[1.2cqw] font-heading font-extrabold tabular-nums text-white ${live ? "wolf-glow" : ""}`}
            >
              {Number(h) > 0 && <Segment value={h} unit="H" />}
              <Segment value={m} unit="M" />
              <Segment value={s} unit="S" />
            </div>
          </div>
        </div>
      </div>

      {/* Added-time celebration: rising "+Xm" + an emoji burst from the timer. */}
      {flash && (
        <>
          <div
            key={`label-${flash.id}`}
            className="animate-wolf-rise absolute top-[26%] left-1/2 -translate-x-1/2 font-heading text-[3.2cqw] font-extrabold text-[#5bc8f0] [text-shadow:0_0_2cqw_rgba(0,172,237,0.6)]"
          >
            +{flash.minutes}m
          </div>
          <div className="absolute top-[12%] left-1/2 -translate-x-1/2">
            {burstParticles(emojis, flash.id).map((p) => (
              <span
                key={p.key}
                className="animate-wolf-burst absolute will-change-transform"
                style={
                  {
                    filter: "drop-shadow(0 0 0.8cqw rgba(0,172,237,0.6))",
                    "--burst-x": `${p.x}cqw`,
                    "--burst-y": `${p.y}cqh`,
                    "--burst-spin": `${p.spin}deg`,
                  } as React.CSSProperties
                }
              >
                <Glyph e={p.e} size={p.size} />
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** One drifter/burst glyph: a Twitch emote image (https URL) or a unicode emoji. */
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
  return <span style={{ fontSize: `${size}cqw` }}>{e}</span>;
}

function Segment({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="relative inline-flex items-baseline">
      <span className="text-[7cqw] leading-none [text-shadow:0_0_2.4cqw_rgba(0,172,237,0.45)]">{value}</span>
      <span className="ml-[0.25cqw] font-heading text-[1.4cqw] font-bold text-[#5bc8f0]/70">{unit}</span>
    </span>
  );
}

function format(ms: number): { h: string; m: string; s: string } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    h: String(Math.floor(total / 3600)),
    m: pad(Math.floor((total % 3600) / 60)),
    s: pad(total % 60),
  };
}

/** Deterministic pseudo-random in [0,1) — keeps SSR/client markup identical. */
function rand(seed: number, salt: number): number {
  const x = Math.sin(seed * 99.13 + salt * 12.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Stable set of ambient drifters, cycling through the chosen emoji. */
function driftParticles(emojis: string[], count = 16) {
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    e: emojis[i % emojis.length] ?? "🐺",
    left: 3 + rand(i, 1) * 94, // %
    size: 1.8 + rand(i, 2) * 2.8, // cqw
    duration: 7 + rand(i, 3) * 9, // s
    delay: -rand(i, 4) * 14, // negative → already mid-flight on load
    sway: rand(i, 5) * 9 - 4.5, // cqw
    spin: rand(i, 6) * 70 - 35, // deg
    opacity: 0.16 + rand(i, 7) * 0.34,
  }));
}

/** Radial burst fired from the timer when time is added (seeded by flash id). */
function burstParticles(emojis: string[], seed: number, count = 14) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + rand(seed, i) * 0.5;
    const dist = 14 + rand(seed, i + 50) * 16; // cqw radius
    return {
      key: `${seed}-${i}`,
      e: emojis[i % emojis.length] ?? "🐺",
      size: 2.4 + rand(seed, i + 100) * 2.2, // cqw
      x: Math.cos(angle) * dist, // cqw
      y: Math.sin(angle) * dist - 6, // cqh-ish, biased upward
      spin: rand(seed, i + 150) * 240 - 120, // deg
    };
  });
}
