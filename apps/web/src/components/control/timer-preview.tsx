"use client";

import { defaultOverlayTheme, type OverlayTheme } from "@wolfathon/api/theme";
import { type TimerDoc, toPublicTimer } from "@wolfathon/api/timer";

import { TimerView } from "@/components/overlay/timer-view";

import { PreviewFrame } from "./preview-frame";

/**
 * Live preview of the timer overlay inside the control panel. The overlay theme
 * is a global setting (Settings → Theme), so it's passed in rather than read
 * from the timer doc. The 24:5 canvas matches a 720×150 OBS source so the bar's
 * cqh-sized elements stay proportionate instead of ballooning in a 16:9 box.
 */
export function TimerPreview({ doc, theme }: { doc: TimerDoc | undefined; theme?: OverlayTheme }) {
	return (
		<PreviewFrame label="Timer source" resolution="720 × 150" aspectClass="aspect-[24/5]">
			<TimerView
				data={doc ? toPublicTimer(doc, Date.now(), theme ?? defaultOverlayTheme()) : undefined}
			/>
		</PreviewFrame>
	);
}
