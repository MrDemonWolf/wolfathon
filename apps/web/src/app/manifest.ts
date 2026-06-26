import type { MetadataRoute } from "next";

/**
 * PWA manifest. The installable surface is the control panel, which now lives
 * at the root, so `start_url` opens `/` (which sits behind Cloudflare Access).
 */
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Wolfathon Control",
		short_name: "Wolfathon",
		description: "Subathon reward tracker control panel",
		start_url: "/",
		display: "standalone",
		background_color: "#091533",
		theme_color: "#091533",
		icons: [
			{
				src: "/favicon/web-app-manifest-192x192.png",
				sizes: "192x192",
				type: "image/png",
			},
			{
				src: "/favicon/web-app-manifest-512x512.png",
				sizes: "512x512",
				type: "image/png",
			},
		],
	};
}
