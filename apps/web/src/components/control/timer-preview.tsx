"use client";

import { defaultOverlayTheme, type OverlayTheme } from "@wolfathon/api/theme";
import { type TimerDoc, toPublicTimer } from "@wolfathon/api/timer";

import { TimerView } from "@/components/overlay/timer-view";

/**
 * Live preview of the timer overlay inside the control panel. The overlay theme
 * is a global setting (Settings → Theme), so it's passed in rather than read
 * from the timer doc.
 */
export function TimerPreview({ doc, theme }: { doc: TimerDoc | undefined; theme?: OverlayTheme }) {
	return (
		// 720×150 OBS source aspect (24:5) — matching it keeps the bar's cqh-sized
		// elements proportionate instead of ballooning in a 16:9 box.
		<div className="@container relative aspect-[24/5] w-full overflow-hidden rounded-xl border border-border bg-[#06112a]">
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(0,172,237,0.12),transparent_60%)]" />
			<TimerView
				data={doc ? toPublicTimer(doc, Date.now(), theme ?? defaultOverlayTheme()) : undefined}
			/>
		</div>
	);
}
