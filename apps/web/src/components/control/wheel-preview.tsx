"use client";

import type { OverlayTheme } from "@wolfathon/api/theme";
import { type WheelControlDoc, toPublicWheel } from "@wolfathon/api/wheel";

import { WheelView } from "@/components/overlay/wheel-view";
import { OVERLAY_SIZES } from "@/utils/constants";

import { PreviewFrame } from "./preview-frame";

/**
 * Live preview of the wheel overlay inside the control panel. Square canvas
 * matches the recommended 1080×1080 OBS source. It follows new spins while
 * staying visible between them, so operators can see the current stream state.
 * Theme is the global overlay theme, passed in so the preview matches OBS.
 */
export function WheelPreview({
	doc,
	theme,
}: {
	doc: WheelControlDoc | undefined;
	theme?: OverlayTheme;
}) {
	const pendingSpin = doc?.pendingSpin;
	const previewSpin = pendingSpin
		? {
				spinId: pendingSpin.spinId,
				targetIndex: pendingSpin.targetIndex,
				at: pendingSpin.at,
			}
		: null;

	return (
		<div data-testid="wheel-live-preview">
			<PreviewFrame label="Wheel source" aspectClass={OVERLAY_SIZES.wheel.aspect}>
				<WheelView
					slots={doc ? toPublicWheel(doc).slots : undefined}
					theme={theme}
					pending={previewSpin}
					showWhileIdle
				/>
			</PreviewFrame>
		</div>
	);
}
