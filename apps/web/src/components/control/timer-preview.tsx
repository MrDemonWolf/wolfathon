"use client";

import { type TimerDoc, toPublicTimer } from "@wolfathon/api/timer";

import { TimerView } from "@/components/overlay/timer-view";

/** Live preview of the timer overlay inside the control panel. */
export function TimerPreview({ doc }: { doc: TimerDoc | undefined }) {
  return (
    <div className="@container relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-[#06112a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(0,172,237,0.12),transparent_60%)]" />
      <TimerView data={doc ? toPublicTimer(doc.state, Date.now()) : undefined} />
    </div>
  );
}
