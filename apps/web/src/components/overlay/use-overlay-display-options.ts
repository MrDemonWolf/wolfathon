"use client";

import { useEffect, useState } from "react";

type DisplayOptions = {
	ready: boolean;
	demo: boolean;
	minimal: boolean;
	align: "left" | "right";
};

/** Read presentation-only query options after hydration, before enabling live reads. */
export function useOverlayDisplayOptions(): DisplayOptions {
	const [options, setOptions] = useState<DisplayOptions>({
		ready: false,
		demo: false,
		minimal: false,
		align: "left",
	});

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		setOptions({
			ready: true,
			demo: params.get("demo") === "1",
			minimal: params.get("minimal") === "1",
			align: params.get("side") === "right" ? "right" : "left",
		});
	}, []);

	return options;
}
