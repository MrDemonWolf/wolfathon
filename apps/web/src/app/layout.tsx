import type { Metadata } from "next";
import { Inter, Montserrat, Poppins, Roboto } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

// Montserrat → headings, Roboto → body (MrDemonWolf brand). Poppins + Inter are
// selectable overlay fonts (see the theme font picker).
const montserrat = Montserrat({
	variable: "--font-montserrat",
	subsets: ["latin"],
	display: "swap",
});

const roboto = Roboto({
	variable: "--font-roboto",
	subsets: ["latin"],
	weight: ["400", "500", "700", "900"],
	display: "swap",
});

const poppins = Poppins({
	variable: "--font-poppins",
	subsets: ["latin"],
	weight: ["500", "600", "800"],
	display: "swap",
});

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	display: "swap",
});

const TITLE = "The Wolf Pack Subathon — MrDemonWolf";
const DESCRIPTION =
	"Join the Wolf Pack. Subathon timer, rewards, and giveaways for MrDemonWolf's stream.";

export const metadata: Metadata = {
	// Absolute base so the auto-detected opengraph-image resolves for crawlers.
	metadataBase: new URL("https://wolfathon.mrdemonwolf.workers.dev"),
	title: TITLE,
	description: DESCRIPTION,
	icons: {
		icon: [
			{ url: "/favicon/favicon.svg", type: "image/svg+xml" },
			{ url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
		],
		apple: "/favicon/apple-touch-icon.png",
	},
	openGraph: {
		type: "website",
		siteName: "Wolfathon",
		title: TITLE,
		description: DESCRIPTION,
	},
	twitter: {
		card: "summary_large_image",
		title: TITLE,
		description: DESCRIPTION,
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			{/*
        The root layout adds no chrome — `/overlay` needs a bare, transparent
        page for OBS. Panel routes add their own header/background.
      */}
			<body
				className={`${montserrat.variable} ${roboto.variable} ${poppins.variable} ${inter.variable} antialiased`}
			>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
