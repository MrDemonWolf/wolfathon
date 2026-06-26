"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Each control section is its own route; this bar navigates between them. */
const SECTIONS = [
	{ href: "/control", label: "Rewards" },
	{ href: "/control/timer", label: "Timer" },
	{ href: "/control/giveaways", label: "Giveaways" },
	{ href: "/control/twitch", label: "Twitch" },
	{ href: "/control/overlays", label: "Overlays" },
] as const;

export default function ControlLayout({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<span className="eyebrow text-[0.7rem]">Operator</span>
				<h1 className="font-heading text-2xl font-extrabold tracking-tight">Control panel</h1>
			</div>

			<nav
				aria-label="Control sections"
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
