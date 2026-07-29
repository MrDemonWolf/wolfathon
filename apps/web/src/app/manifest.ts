import type { MetadataRoute } from "next";

/**
 * PWA manifest. The installable surface is the operator panel at `/dashboard`
 * (behind Cloudflare Access) — NOT `/`, which is the public landing page. An
 * installed app opening marketing instead of the panel is the whole point of
 * pinning `start_url` here.
 */
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Wolfathon Control",
		short_name: "Wolfathon",
		description: "Wolfathon reward tracker control panel",
		start_url: "/dashboard",
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
