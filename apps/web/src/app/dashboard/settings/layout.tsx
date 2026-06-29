"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Set-once config — connect Twitch, grab overlay URLs, back up state. Reached via the gear in the navbar. */
const SECTIONS = [
	{ href: "/dashboard/settings/twitch", label: "Twitch" },
	{ href: "/dashboard/settings/overlays", label: "Overlays" },
	{ href: "/dashboard/settings/theme", label: "Theme" },
	{ href: "/dashboard/settings/backup", label: "Backup" },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<span className="eyebrow text-[0.7rem]">Operator</span>
				<h1 className="font-heading text-2xl font-extrabold tracking-tight">Settings</h1>
				<p className="text-sm text-muted-foreground">
					Connect Twitch, copy overlay URLs, and back up your data. Set these once.
				</p>
			</div>

			<nav
				aria-label="Settings sections"
				className="segmented inline-flex w-fit gap-1 rounded-[0.95rem] p-1"
			>
				{SECTIONS.map((s) => {
					const active = pathname === s.href;
					return (
						<Link
							key={s.href}
							href={s.href}
							aria-current={active ? "page" : undefined}
							className={`rounded-[0.7rem] px-4 py-1.5 text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
								active
									? "segmented-on text-primary-foreground"
									: "text-muted-foreground hover:bg-white/5 hover:text-foreground"
							}`}
						>
							{s.label}
						</Link>
					);
				})}
			</nav>

			<div>{children}</div>
		</div>
	);
}
