import { ImageResponse } from "next/og";

// Social share card for every route (links currently unfurl blank). Rendered at
// request time by next/og — no binary asset to ship or keep in sync. The mark is
// inlined as an SVG data URI (satori renders <img>, not arbitrary SVG children).
export const alt = "The Wolf Pack Wolfathon — MrDemonWolf";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const WOLF_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><g stroke-linejoin="round"><path d="M14 6 L26 20 L14 27 Z" fill="#0c1b40" stroke="#00aced" stroke-width="2"/><path d="M50 6 L38 20 L50 27 Z" fill="#0c1b40" stroke="#00aced" stroke-width="2"/><path d="M12 22 L32 13 L52 22 L46 44 L32 57 L18 44 Z" fill="#0c1b40" stroke="#00aced" stroke-width="2"/><path d="M22 31 L28 29 L26 35 Z" fill="#5bc8f0"/><path d="M42 31 L36 29 L38 35 Z" fill="#5bc8f0"/><path d="M28 43 L36 43 L32 51 Z" fill="#00aced"/></g></svg>`;

export default function OpengraphImage() {
	const mark = `data:image/svg+xml;base64,${btoa(WOLF_MARK)}`;
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 28,
				backgroundColor: "#0a0f1c",
				backgroundImage:
					"radial-gradient(60% 50% at 50% 0%, rgba(0,172,237,0.18), transparent 70%)",
				color: "#f1f5f9",
				fontFamily: "sans-serif",
			}}
		>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={mark} width={150} height={150} alt="" />
			<div
				style={{
					fontSize: 30,
					letterSpacing: 8,
					textTransform: "uppercase",
					color: "#00aced",
					fontWeight: 700,
				}}
			>
				MrDemonWolf presents
			</div>
			<div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>
				The Wolf Pack Wolfathon
			</div>
			<div style={{ fontSize: 32, color: "#94a3b8" }}>
				Live Wolfathon timer, rewards &amp; giveaways
			</div>
		</div>,
		{ ...size },
	);
}
