"use client";

import { type Data, stripNotes } from "@wolfathon/api/state";

import { OverlayView } from "@/components/overlay/overlay-view";

import { PreviewFrame } from "./preview-frame";

/**
 * Live preview of the overlay inside the control panel. Reuses the exact same
 * {@link OverlayView} the OBS source renders, fed the note-stripped state, so
 * what the operator sees here is what stream viewers see.
 */
export function OverlayPreview({ data }: { data: Data | undefined }) {
	// The overlay only paints its card once there are goals; until then the
	// canvas is empty. Show the transparency hint ONLY then, so it never sits on
	// top of the live card or the centered unlock celebration.
	const empty = !data || data.goals.length === 0;
	return (
		<PreviewFrame label="Rewards source" resolution="1920 × 1080" aspectClass="aspect-video">
			{/* Explains the empty canvas — only while nothing is rendered. */}
			{empty && (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<span className="rounded-full border border-white/5 px-3 py-1 text-[0.7rem] text-white/20">
						Transparent in OBS — your scene shows through
					</span>
				</div>
			)}
			<OverlayView data={data ? stripNotes(data) : undefined} />
		</PreviewFrame>
	);
}
