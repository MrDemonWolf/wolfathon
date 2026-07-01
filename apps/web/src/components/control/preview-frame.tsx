/**
 * Faux OBS-source window around a live overlay preview — three-dot chrome, a
 * source label and the source resolution, then a dark "stream" canvas with a
 * soft top glow so the transparent overlay reads as an intentional surface.
 *
 * Shared by the timer and rewards previews so both panes look identical apart
 * from their aspect ratio and resolution.
 */
export function PreviewFrame({
	label,
	resolution,
	aspectClass,
	children,
}: {
	label: string;
	resolution: string;
	/** Tailwind aspect class for the canvas, e.g. `aspect-video` or `aspect-[24/5]`. */
	aspectClass: string;
	children: React.ReactNode;
}) {
	return (
		<div className="overflow-hidden rounded-2xl border border-border bg-[#06112a] shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
			<div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-3 py-2">
				<div className="flex items-center gap-1.5">
					<span className="size-2 rounded-full bg-white/15" />
					<span className="size-2 rounded-full bg-white/15" />
					<span className="size-2 rounded-full bg-white/15" />
					<span className="ml-1.5 text-xs font-medium text-muted-foreground">{label}</span>
				</div>
				<span className="font-mono text-[0.65rem] tracking-wide text-muted-foreground/70">
					{resolution}
				</span>
			</div>
			<div className={`@container relative w-full overflow-hidden ${aspectClass}`}>
				{/* Faux stream backdrop so the transparent overlay reads clearly. */}
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(0,172,237,0.12),transparent_60%)]" />
				{children}
			</div>
			{/* Tell the operator exactly what to size the OBS browser source to. */}
			<div className="border-t border-white/5 bg-white/[0.02] px-3 py-1.5 text-center text-[0.7rem] text-muted-foreground">
				Set your OBS browser source to{" "}
				<span className="font-mono text-foreground">{resolution}</span>
			</div>
		</div>
	);
}
