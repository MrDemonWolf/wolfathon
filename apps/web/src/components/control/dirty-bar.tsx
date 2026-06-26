"use client";

import { Button } from "@wolfathon/ui/components/button";
import { RotateCcw, Save } from "lucide-react";

/**
 * Sticky "you have unsaved changes" bar. Edits update the live preview instantly
 * (the tab holds a local draft); nothing persists until Save. Renders nothing
 * while clean.
 */
export function DirtyBar({
	dirty,
	saving,
	onSave,
	onDiscard,
	summary,
}: {
	dirty: boolean;
	saving: boolean;
	onSave: () => void;
	onDiscard: () => void;
	summary?: string;
}) {
	if (!dirty) return null;
	return (
		<div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-40 mx-auto flex w-[min(720px,calc(100%-2rem))] flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-card/95 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl">
			<div className="text-sm">
				<span className="font-semibold text-primary">Unsaved changes</span>
				{summary ? <span className="text-muted-foreground"> · {summary}</span> : null}
			</div>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					className="rounded-lg"
					onClick={onDiscard}
					disabled={saving}
				>
					<RotateCcw className="size-4" />
					Discard
				</Button>
				<Button size="sm" className="rounded-lg" onClick={onSave} disabled={saving}>
					<Save className="size-4" />
					{saving ? "Saving…" : "Save changes"}
				</Button>
			</div>
		</div>
	);
}
