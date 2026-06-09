"use client";

import { type Data, stripNotes } from "@wolfathon/api/state";

import { OverlayView } from "@/components/overlay/overlay-view";

/**
 * Live preview of the overlay inside the control panel. Reuses the exact same
 * {@link OverlayView} the OBS source renders, fed the note-stripped state, so
 * what the operator sees here is what stream viewers see.
 */
export function OverlayPreview({ data }: { data: Data | undefined }) {
  return (
    <div className="@container relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-[#06112a]">
      {/* Faux stream backdrop so the transparent overlay reads clearly. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,rgba(0,172,237,0.12),transparent_60%)]" />
      <OverlayView data={data ? stripNotes(data) : undefined} />
    </div>
  );
}
