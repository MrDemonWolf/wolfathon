"use client";

import type { OverlayTheme } from "@wolfathon/api/theme";
import { type WheelDoc, toPublicWheel } from "@wolfathon/api/wheel";

import { WheelView } from "@/components/overlay/wheel-view";

import { PreviewFrame } from "./preview-frame";

/**
 * Live preview of the wheel overlay inside the control panel. Square canvas
 * matches the recommended 1080×1080 OBS source. Shows the enabled slots idle (no `pending`),
 * so it's a static mirror of the OBS source — a real spin still only plays in
 * the overlay itself. Theme is the global overlay theme, passed in so the
 * preview matches what OBS renders.
 */
export function WheelPreview({ doc, theme }: { doc: WheelDoc | undefined; theme?: OverlayTheme }) {
	return (
		<PreviewFrame label="Wheel source" resolution="1080 × 1080" aspectClass="aspect-square">
			<WheelView slots={doc ? toPublicWheel(doc).slots : undefined} theme={theme} pending={null} />
		</PreviewFrame>
	);
}
