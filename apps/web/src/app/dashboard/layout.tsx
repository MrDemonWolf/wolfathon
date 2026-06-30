"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SiteFooter } from "@/components/site-footer";
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
	{ href: "/dashboard/wheel", label: "Wheel" },
] as const;

export default function PanelLayout({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();

	const active = SECTIONS.find((s) =>
		s.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(s.href),
	);
	const onSettings = pathname.startsWith("/dashboard/settings");

	return (
		<div className="app-bg flex min-h-svh flex-col text-foreground">
			{/* Skip past the repeated nav for keyboard/screen-reader users (WCAG 2.4.1). */}
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
			>
				Skip to content
			</a>
			{/* Full-bleed sticky bar: the glass background spans the viewport, the
			    logo + nav stay aligned to the same max-w-6xl column as the content. */}
			<header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-xl">
				<div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5">
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

			<main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none">
				{/* Per-section h1 for screen-reader orientation. Settings provides its own
				    visible h1, so defer to it there; otherwise each panel's heading is an h2. */}
				<h1 className="sr-only">
					{onSettings ? "Wolfathon settings" : `Wolfathon — ${active?.label ?? "control panel"}`}
				</h1>
				{children}
			</main>

			<SiteFooter />
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
					? "bg-primary/20 font-semibold text-primary"
					: "text-muted-foreground hover:bg-accent hover:text-foreground"
			}`}
		>
			{children}
		</Link>
	);
}
