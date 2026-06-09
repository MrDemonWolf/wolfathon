"use client";

import type { PublicData } from "@wolfathon/api/state";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { WolfMark } from "@/components/wolf-mark";

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

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Floating reward card, anchored bottom-left. */}
      <div className="absolute bottom-[4cqw] left-[4cqw] max-w-[48cqw]">
        <div className="rounded-[1.8cqw] border border-[#00aced]/30 bg-[#091533]/85 p-[2.2cqw] shadow-[0_0_4cqw_rgba(0,172,237,0.18)] backdrop-blur-md">
          <div className="flex items-center gap-[1cqw]">
            <WolfMark className="size-[3.4cqw]" />
            <span className="font-heading text-[1.5cqw] font-semibold tracking-[0.28em] text-[#5bc8f0] uppercase">
              {current ? "Next Reward" : "All Rewards Unlocked"}
            </span>
          </div>

          {current ? (
            <div
              key={current.id}
              className="animate-wolf-rise mt-[1.4cqw] font-heading text-[5cqw] leading-[1.04] font-extrabold text-white [text-shadow:0_0_2.4cqw_rgba(0,172,237,0.45)]"
            >
              {current.reward}
            </div>
          ) : (
            <div className="mt-[1.4cqw] font-heading text-[3.4cqw] leading-tight font-bold text-[#5bc8f0]">
              Thank you 🐺
            </div>
          )}

          {unlocked.length > 0 && (
            <div className="mt-[1.8cqw] flex flex-wrap gap-[0.8cqw]">
              {unlocked.map((g) => (
                <span
                  key={g.id}
                  className="inline-flex items-center gap-[0.5cqw] rounded-full bg-[#13244d]/70 px-[1.1cqw] py-[0.4cqw] text-[1.35cqw] text-white/55"
                >
                  <Check className="size-[1.3cqw] text-[#00aced]" />
                  {g.reward}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Unlock celebration. */}
      {celebrate && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-wolf-pop text-center">
            <div className="font-heading text-[2cqw] font-semibold tracking-[0.3em] text-[#5bc8f0] uppercase">
              Unlocked
            </div>
            <div className="wolf-glow mt-[0.6cqw] font-heading text-[6.5cqw] leading-none font-extrabold text-white">
              {celebrate}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
