import Link from "next/link";

import { WolfMark } from "@/components/wolf-mark";

/**
 * Chrome for the operator-facing routes (landing + control). The `/overlay`
 * route lives outside this group and stays bare/transparent for OBS.
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-svh bg-background text-foreground">
			<header className="border-b border-border bg-card/40">
				<div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
					<Link href="/" className="flex items-center gap-2">
						<WolfMark className="size-8" />
						<span className="font-heading text-lg font-bold">Wolfathon</span>
					</Link>
					<nav className="flex items-center gap-5 text-sm text-muted-foreground">
						<Link href="/control" className="transition-colors hover:text-foreground">
							Control
						</Link>
						<a
							href="/overlay"
							target="_blank"
							rel="noreferrer"
							className="transition-colors hover:text-foreground"
						>
							Overlay ↗
						</a>
					</nav>
				</div>
			</header>
			<main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
		</div>
	);
}
