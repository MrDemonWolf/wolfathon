"use client";

import { Bot, DatabaseBackup, MonitorPlay, Palette, Twitch, type LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Set-once config — connect Twitch, grab overlay URLs, back up state. Reached via
 * the gear in the navbar. Laid out as a vertical settings sidebar (grouped, with
 * icons + one-line subtitles) rather than a second horizontal pill row: the header
 * already owns the top-level pills, so a distinct axis + grouping keeps the two
 * nav levels from reading as one. Sidebar stacks full-width on mobile — no
 * horizontal overflow that would scroll items off-screen.
 */
type Section = { href: Route; label: string; hint: string; icon: LucideIcon };
type Group = { title: string; items: Section[] };

const GROUPS: Group[] = [
	{
		title: "Connections",
		items: [
			{
				href: "/dashboard/settings/twitch",
				label: "Twitch",
				hint: "Link your channel",
				icon: Twitch,
			},
			{
				href: "/dashboard/settings/bot",
				label: "Bot",
				hint: "Chat commands & announces",
				icon: Bot,
			},
		],
	},
	{
		title: "Overlays",
		items: [
			{
				href: "/dashboard/settings/overlays",
				label: "Overlays",
				hint: "OBS browser-source URLs",
				icon: MonitorPlay,
			},
			{
				href: "/dashboard/settings/theme",
				label: "Customizer",
				hint: "Colors, labels & toggles",
				icon: Palette,
			},
		],
	},
	{
		title: "Data",
		items: [
			{
				href: "/dashboard/settings/backup",
				label: "Backup",
				hint: "Export & import state",
				icon: DatabaseBackup,
			},
		],
	},
];

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

			<div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-8">
				<nav
					aria-label="Settings sections"
					className="flex flex-col gap-5 md:sticky md:top-24 md:max-h-[calc(100svh-7rem)] md:self-start md:overflow-y-auto"
				>
					{GROUPS.map((group) => (
						<div key={group.title} className="flex flex-col gap-1.5">
							<span className="eyebrow px-1 text-[0.6rem]">{group.title}</span>
							<ul className="flex flex-col gap-1">
								{group.items.map((s) => {
									const active = pathname === s.href || pathname.startsWith(s.href + "/");
									const Icon = s.icon;
									return (
										<li key={s.href}>
											<Link
												href={s.href}
												aria-current={active ? "page" : undefined}
												className={`group flex items-start gap-3 rounded-[0.7rem] border-l-2 px-3 py-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
													active
														? "border-primary bg-primary/10"
														: "border-transparent hover:border-border hover:bg-white/5"
												}`}
											>
												<Icon
													className={`mt-0.5 size-4 shrink-0 transition-colors ${
														active
															? "text-primary"
															: "text-muted-foreground group-hover:text-foreground"
													}`}
													aria-hidden
												/>
												<span className="flex flex-col">
													<span
														className={`text-sm font-medium leading-tight transition-colors ${
															active
																? "text-foreground"
																: "text-muted-foreground group-hover:text-foreground"
														}`}
													>
														{s.label}
													</span>
													<span className="text-xs leading-tight text-muted-foreground">
														{s.hint}
													</span>
												</span>
											</Link>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</nav>

				<div className="min-w-0">{children}</div>
			</div>
		</div>
	);
}
