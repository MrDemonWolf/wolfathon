"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { WolfMark } from "@/components/wolf-mark";

/**
 * Chrome for the operator panel. The live sections (rewards / timer / giveaways)
 * live under /dashboard and switch via the navbar tabs below; set-once config
 * (Twitch, overlay URLs, backup) sits behind the Settings gear at
 * /dashboard/settings. `/` is a public landing page and `/overlay` lives outside
 * this group, staying bare/transparent for OBS. Cloudflare Access gates
 * /dashboard + /api/trpc.
 */
const SECTIONS = [
	{ href: "/dashboard", label: "Rewards" },
	{ href: "/dashboard/timer", label: "Timer" },
	{ href: "/dashboard/giveaways", label: "Giveaways" },
] as const;

export default function PanelLayout({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	const sha = process.env.NEXT_PUBLIC_COMMIT_SHA;

	return (
		<div className="app-bg flex min-h-svh flex-col text-foreground">
			<header className="sticky top-0 z-30 px-4 pt-4 pb-1">
				<div className="glass-bar mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl px-5 py-3.5">
					<Link href="/dashboard" className="group flex items-center gap-2.5">
						<WolfMark className="size-8 transition-transform group-hover:scale-110" />
						<span className="font-heading text-lg font-extrabold tracking-tight">Wolfathon</span>
					</Link>
					<nav aria-label="Control sections" className="flex items-center gap-1 text-sm">
						{SECTIONS.map((s) => {
							const active =
								s.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(s.href);
							return (
								<NavLink key={s.href} href={s.href} active={active}>
									{s.label}
								</NavLink>
							);
						})}
						<span aria-hidden className="mx-1 h-5 w-px bg-border" />
						<NavLink href="/dashboard/settings" active={pathname.startsWith("/dashboard/settings")}>
							<Settings className="size-3.5" />
							Settings
						</NavLink>
					</nav>
				</div>
			</header>

			<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
				<h1 className="sr-only">Wolfathon control panel</h1>
				{children}
			</main>

			<footer className="border-t border-primary/10 px-4 py-6">
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
			className={`inline-flex items-center gap-1.5 rounded-[0.7rem] px-3 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
				active
					? "bg-primary/15 font-medium text-foreground"
					: "text-muted-foreground hover:bg-accent hover:text-foreground"
			}`}
		>
			{children}
		</Link>
	);
}
