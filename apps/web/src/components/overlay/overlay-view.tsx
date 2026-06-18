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
  const hasGoals = data.goals.length > 0;

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Floating reward card. Hidden until goals exist so an unconfigured
          tracker never broadcasts a false "All Rewards Unlocked". */}
      {hasGoals && (
      <div className="absolute bottom-[4cqw] left-[4cqw] max-w-[48cqw]">
        <div className="relative overflow-hidden rounded-[1.8cqw] border border-[#00aced]/40 bg-gradient-to-br from-[#0b1a3d]/90 to-[#06102a]/90 shadow-[0_0.6cqw_5cqw_rgba(0,0,0,0.45),0_0_3cqw_rgba(0,172,237,0.22)] backdrop-blur-md">
          {/* Glowing accent rail down the left edge. */}
          <div className="absolute inset-y-0 left-0 w-[0.45cqw] bg-gradient-to-b from-[#5bc8f0] via-[#00aced] to-[#00aced]/0 shadow-[0_0_1.6cqw_rgba(0,172,237,0.8)]" />
          {/* Slow sheen sweep. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="wolf-sheen absolute inset-y-0 -left-1/3 w-[35%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/8 to-transparent" />
          </div>

          <div className="relative p-[2.2cqw] pl-[2.6cqw]">
            <div className="flex items-center gap-[1cqw]">
              <WolfMark className="size-[3.4cqw]" />
              <span className="flex items-center gap-[0.7cqw] font-heading text-[1.5cqw] font-semibold tracking-[0.28em] text-[#5bc8f0] uppercase">
                {current && (
                  <span className="relative flex size-[1cqw]">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#00aced] opacity-70" />
                    <span className="relative inline-flex size-full rounded-full bg-[#5bc8f0]" />
                  </span>
                )}
                {current ? "Next Reward" : "All Rewards Unlocked"}
              </span>
            </div>

            {current ? (
              <div
                key={current.id}
                className="animate-wolf-rise mt-[1.4cqw] bg-gradient-to-b from-white to-[#cfeeff] bg-clip-text font-heading text-[5cqw] leading-[1.04] font-extrabold text-transparent [text-shadow:0_0_2.4cqw_rgba(0,172,237,0.45)]"
              >
                {current.reward}
              </div>
            ) : (
              <div className="mt-[1.4cqw] font-heading text-[3.4cqw] leading-tight font-bold text-[#5bc8f0]">
                Thank you 🐺
              </div>
            )}

            {unlocked.length > 0 && (
              <>
                <div className="mt-[1.8cqw] flex items-center gap-[0.7cqw] text-[1.2cqw] font-semibold tracking-[0.18em] text-[#5bc8f0]/70 uppercase">
                  <span className="h-px flex-1 bg-gradient-to-r from-[#00aced]/40 to-transparent" />
                  {unlocked.length} Unlocked
                  <span className="h-px flex-1 bg-gradient-to-l from-[#00aced]/40 to-transparent" />
                </div>
                <div className="mt-[1.1cqw] flex flex-wrap gap-[0.8cqw]">
                  {unlocked.slice(-4).map((g) => (
                    <span
                      key={g.id}
                      className="inline-flex items-center gap-[0.5cqw] rounded-full border border-[#00aced]/20 bg-[#13244d]/70 px-[1.1cqw] py-[0.4cqw] text-[1.35cqw] text-white/70"
                    >
                      <Check className="size-[1.3cqw] text-[#00aced]" />
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
          <div className="animate-wolf-pop rounded-[2.4cqw] border border-[#00aced]/30 bg-[#091533]/85 px-[5cqw] py-[3.4cqw] text-center shadow-[0_0_6cqw_rgba(0,172,237,0.3)] backdrop-blur-md">
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
