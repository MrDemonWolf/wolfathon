"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { WolfMark } from "@/components/wolf-mark";

/**
 * Chrome for the operator-facing routes (landing + control). The `/overlay`
 * route lives outside this group and stays bare/transparent for OBS.
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();

	return (
		<div className="app-bg flex min-h-svh flex-col text-foreground">
			<header className="sticky top-0 z-30 px-4 pt-3">
				<div className="glass-bar mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-2.5">
					<Link href="/" className="group flex items-center gap-2.5">
						<WolfMark className="size-8 transition-transform group-hover:scale-110" />
						<span className="font-heading text-lg font-extrabold tracking-tight">Wolfathon</span>
					</Link>
					<nav className="flex items-center gap-1 text-sm">
						<NavLink href="/control" active={pathname === "/control"}>
							Control
						</NavLink>
						<a
							href="/overlay"
							target="_blank"
							rel="noreferrer"
							className="rounded-[0.7rem] px-3 py-1.5 text-muted-foreground transition-colors hover:bg-[#13244d]/60 hover:text-foreground"
						>
							Overlays ↗
						</a>
					</nav>
				</div>
			</header>

			<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

			<footer className="border-t border-[#00aced]/10 px-4 py-6">
				<p className="mx-auto max-w-6xl text-center text-sm text-muted-foreground">
					© {new Date().getFullYear()} Wolfathon by{" "}
					<a
						href="https://mrdemonwolf.com"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground transition-colors hover:text-primary"
					>
						MrDemonWolf, Inc.
					</a>
				</p>
			</footer>
		</div>
	);
}

function NavLink({
	href,
	active,
	children,
}: {
	href: React.ComponentProps<typeof Link>["href"];
	active: boolean;
	children: React.ReactNode;
}) {
	return (
		<Link
			href={href}
			aria-current={active ? "page" : undefined}
			className={`rounded-[0.7rem] px-3 py-1.5 transition-colors ${
				active
					? "bg-[#00aced]/15 font-medium text-foreground shadow-[inset_0_1px_0_var(--glass-edge)]"
					: "text-muted-foreground hover:bg-[#13244d]/60 hover:text-foreground"
			}`}
		>
			{children}
		</Link>
	);
}
