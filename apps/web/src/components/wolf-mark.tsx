"use client";

import { useState } from "react";

import { cn } from "@wolfathon/ui/lib/utils";

/**
 * The Wolfathon mark.
 *
 * Prefers your real logo at `public/logo.svg` (drop it in and it's used
 * everywhere automatically). If that file is missing, it falls back to a
 * built-in brand SVG so nothing ever renders broken — handy on the OBS overlay.
 *
 * Size is controlled entirely by `className` (e.g. `size-8` or `size-[4cqw]`).
 */
export function WolfMark({ className }: { className?: string }) {
	const [useLogo, setUseLogo] = useState(true);

	return (
		// `inline-block` so width/height classes (`size-*`) always constrain the
		// mark, even when it isn't a flex item. A caller's own display class wins
		// via tailwind-merge.
		<span className={cn("inline-block", className)} role="img" aria-label="Wolfathon">
			{useLogo ? (
				// Plain <img> (not next/image) so a missing file degrades gracefully.
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src="/logo.svg"
					alt=""
					className="h-full w-full object-contain"
					onError={() => setUseLogo(false)}
				/>
			) : (
				<WolfMarkSvg />
			)}
		</span>
	);
}

function WolfMarkSvg() {
	return (
		<svg viewBox="0 0 64 64" className="h-full w-full" fill="none" aria-hidden="true">
			{/* ears */}
			<path
				d="M14 6 L26 20 L14 27 Z"
				fill="#0c1b40"
				stroke="#00aced"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
			<path
				d="M50 6 L38 20 L50 27 Z"
				fill="#0c1b40"
				stroke="#00aced"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
			{/* head */}
			<path
				d="M12 22 L32 13 L52 22 L46 44 L32 57 L18 44 Z"
				fill="#0c1b40"
				stroke="#00aced"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
			{/* eyes */}
			<path d="M22 31 L28 29 L26 35 Z" fill="#5bc8f0" />
			<path d="M42 31 L36 29 L38 35 Z" fill="#5bc8f0" />
			{/* snout */}
			<path d="M28 43 L36 43 L32 51 Z" fill="#00aced" />
		</svg>
	);
}
