"use client";

import { type WheelDoc, toPublicWheel } from "@wolfathon/api/wheel";

import { WheelView } from "@/components/overlay/wheel-view";

import { PreviewFrame } from "./preview-frame";

/**
 * Live preview of the wheel overlay inside the control panel. Square canvas
 * matches the 900×900 OBS source. Shows the enabled slots idle (no `pending`),
 * so it's a static mirror of the OBS source — a real spin still only plays in
 * the overlay itself.
 */
export function WheelPreview({ doc }: { doc: WheelDoc | undefined }) {
	return (
		<PreviewFrame label="Wheel source" resolution="900 × 900" aspectClass="aspect-square">
			<WheelView slots={doc ? toPublicWheel(doc).slots : undefined} pending={null} />
		</PreviewFrame>
	);
}
