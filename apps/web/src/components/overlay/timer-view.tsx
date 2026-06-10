"use client";

import type { PublicTimer } from "@wolfathon/api/timer";
import { useEffect, useRef, useState } from "react";

import { WolfMark } from "@/components/wolf-mark";

/**
 * Subathon timer overlay. Timestamp-driven: it counts down locally from
 * `endsAt` (correcting browser-clock skew via `serverNow`) and only resyncs on
 * the page's poll — smooth to the frame, no websocket. A brief "+Xm" token
 * rises whenever the remaining time jumps up (a sub/gift/bits added time).
 *
 * All sizing is in container-query width units (`cqw`) so it reads identically
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

  // Auto-clear the "+Xm" flash.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(t);
  }, [flash]);

  if (!data) return null;

  const remaining =
    data.running && data.endsAt != null
      ? Math.max(0, data.endsAt - (now + offsetRef.current))
      : Math.max(0, data.remainingMs);
  const { h, m, s } = format(remaining);
  const live = data.running && remaining > 0;

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute top-[6%] left-1/2 -translate-x-1/2">
        <div className="relative rounded-[2cqw] border border-[#00aced]/30 bg-[#091533]/85 px-[3.4cqw] py-[2cqw] shadow-[0_0_4cqw_rgba(0,172,237,0.20)] backdrop-blur-md">
          {/* cyan top hairline */}
          <div className="absolute inset-x-[2cqw] top-0 h-px bg-gradient-to-r from-transparent via-[#00aced] to-transparent" />

          {/* eyebrow */}
          <div className="flex items-center justify-center gap-[1cqw]">
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
            className={`mt-[1cqw] flex items-baseline justify-center gap-[1.2cqw] font-heading font-extrabold tabular-nums text-white ${live ? "wolf-glow" : ""}`}
          >
            {Number(h) > 0 && <Segment value={h} unit="H" />}
            <Segment value={m} unit="M" />
            <Segment value={s} unit="S" />
          </div>
        </div>
      </div>

      {flash && (
        <div
          key={flash.id}
          className="animate-wolf-rise absolute top-[26%] left-1/2 -translate-x-1/2 font-heading text-[3.2cqw] font-extrabold text-[#5bc8f0] [text-shadow:0_0_2cqw_rgba(0,172,237,0.6)]"
        >
          +{flash.minutes}m
        </div>
      )}
    </div>
  );
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
