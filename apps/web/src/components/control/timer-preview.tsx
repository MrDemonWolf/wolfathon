"use client";

import { defaultOverlayTheme, type OverlayTheme } from "@wolfathon/api/theme";
import { type TimerDoc, toPublicTimer } from "@wolfathon/api/timer";

import { TimerView } from "@/components/overlay/timer-view";
import { OVERLAY_SIZES } from "@/utils/constants";

import { PreviewFrame } from "./preview-frame";

/**
 * Live preview of the timer overlay inside the control panel. The overlay theme
 * is a global setting (Settings → Theme), so it's passed in rather than read
 * from the timer doc. The canvas matches the recommended 1310×200 OBS source
 * (the capsule's locked 131:20 aspect) so the preview is true to what OBS shows.
 */
export function TimerPreview({ doc, theme }: { doc: TimerDoc | undefined; theme?: OverlayTheme }) {
	return (
		<PreviewFrame label="Timer source" aspectClass={OVERLAY_SIZES.timer.aspect}>
			<TimerView
				data={doc ? toPublicTimer(doc, Date.now(), theme ?? defaultOverlayTheme()) : undefined}
			/>
		</PreviewFrame>
	);
}
