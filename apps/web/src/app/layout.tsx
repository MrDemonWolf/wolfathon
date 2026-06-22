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

export const metadata: Metadata = {
	title: "Wolfathon",
	description: "Subathon reward tracker by MrDemonWolf",
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
