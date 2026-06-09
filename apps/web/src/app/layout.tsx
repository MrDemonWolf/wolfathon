import type { Metadata } from "next";
import { Montserrat, Roboto } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

// Montserrat → headings, Roboto → body (MrDemonWolf brand).
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
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
      <body className={`${montserrat.variable} ${roboto.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
