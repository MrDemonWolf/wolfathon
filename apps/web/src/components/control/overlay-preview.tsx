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
		<div className="overflow-hidden rounded-2xl border border-border bg-[#06112a]">
			{/* Faux OBS-source chrome so the dark canvas reads as an intentional
			    stream surface, not an empty/broken card. */}
			<div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
				<div className="flex items-center gap-1.5">
					<span className="size-2 rounded-full bg-white/15" />
					<span className="size-2 rounded-full bg-white/15" />
					<span className="size-2 rounded-full bg-white/15" />
					<span className="ml-1.5 text-xs font-medium text-muted-foreground">Overlay source</span>
				</div>
				<span className="font-mono text-[0.65rem] tracking-wide text-muted-foreground/70">
					1920 × 1080
				</span>
			</div>
			<div className="@container relative aspect-video w-full overflow-hidden">
				{/* Faux stream backdrop so the transparent overlay reads clearly. */}
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,rgba(0,172,237,0.12),transparent_60%)]" />
				{/* Explains the empty area: the rest of the canvas is transparent. */}
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<span className="rounded-full border border-white/5 px-3 py-1 text-[0.7rem] text-white/20">
						Transparent in OBS — your scene shows through
					</span>
				</div>
				<OverlayView data={data ? stripNotes(data) : undefined} />
			</div>
		</div>
	);
}
