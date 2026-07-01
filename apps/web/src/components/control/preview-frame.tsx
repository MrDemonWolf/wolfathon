/**
 * Faux OBS-source window around a live overlay preview — three-dot chrome and a
 * source label, then a dark "stream" canvas with a soft top glow so the
 * transparent overlay reads as an intentional surface. The recommended browser
 * source size lives on Settings → Overlays, so the preview stays uncluttered.
 *
 * Shared by the timer, rewards, and wheel previews; only the aspect ratio differs.
 */
export function PreviewFrame({
	label,
	aspectClass,
	children,
}: {
	label: string;
	/** Tailwind aspect class for the canvas, e.g. `aspect-video` or `aspect-[2/1]`. */
	aspectClass: string;
	children: React.ReactNode;
}) {
	return (
		<div className="overflow-hidden rounded-2xl border border-border bg-[#06112a] shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
			<div className="flex items-center gap-1.5 border-b border-white/5 bg-white/[0.02] px-3 py-2">
				<span className="size-2 rounded-full bg-white/15" />
				<span className="size-2 rounded-full bg-white/15" />
				<span className="size-2 rounded-full bg-white/15" />
				<span className="ml-1.5 text-xs font-medium text-muted-foreground">{label}</span>
			</div>
			<div className={`@container relative w-full overflow-hidden ${aspectClass}`}>
				{/* Faux stream backdrop so the transparent overlay reads clearly. */}
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(0,172,237,0.12),transparent_60%)]" />
				{children}
			</div>
		</div>
	);
}
