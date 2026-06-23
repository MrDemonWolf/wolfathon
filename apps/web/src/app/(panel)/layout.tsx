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
	const sha = process.env.NEXT_PUBLIC_COMMIT_SHA;

	return (
		<div className="app-bg flex min-h-svh flex-col text-foreground">
			<header className="sticky top-0 z-30 px-4 pt-3">
				<div className="glass-bar mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-2.5">
					<Link href="/" className="group flex items-center gap-2.5">
						<WolfMark className="size-8 transition-transform group-hover:scale-110" />
						<span className="font-heading text-lg font-extrabold tracking-tight">Wolfathon</span>
					</Link>
					<nav className="flex items-center gap-1 text-sm">
						<NavLink
							href="/control"
							active={pathname.startsWith("/control") && pathname !== "/control/overlays"}
						>
							Control
						</NavLink>
						<NavLink href="/control/overlays" active={pathname === "/control/overlays"}>
							Overlays
						</NavLink>
					</nav>
				</div>
			</header>

			<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

			<footer className="border-t border-[#00aced]/10 px-4 py-6">
				<div className="mx-auto flex max-w-6xl items-center justify-center gap-4 text-center text-sm text-muted-foreground">
					<p>
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
					{sha && (
						<>
							<span className="hidden text-muted-foreground/50 sm:inline">·</span>
							<a
								href={`https://github.com/MrDemonWolf/wolfathon/commit/${sha}`}
								target="_blank"
								rel="noopener noreferrer"
								title={`Deployed commit ${sha} — view on GitHub`}
								className="hidden font-mono text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline sm:inline"
							>
								{sha.slice(0, 7)}
							</a>
						</>
					)}
				</div>
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
			className={`rounded-[0.7rem] px-3 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
				active
					? "bg-primary/15 font-medium text-foreground"
					: "text-muted-foreground hover:bg-accent hover:text-foreground"
			}`}
		>
			{children}
		</Link>
	);
}
