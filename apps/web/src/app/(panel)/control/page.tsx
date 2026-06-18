"use client";

import { useRef, useState } from "react";

import { RewardsTab } from "@/components/control/rewards-tab";
import { TimerTab } from "@/components/control/timer-tab";
import { TwitchPanel } from "@/components/control/twitch-panel";

const TABS = [
	{ id: "rewards", label: "Rewards" },
	{ id: "timer", label: "Timer" },
	{ id: "twitch", label: "Twitch" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Operator panel. Reachable only behind Cloudflare Access (the `/api/trpc`
 * mutations it calls verify the Access JWT server-side regardless).
 */
export default function ControlPage() {
	const [tab, setTab] = useState<TabId>("rewards");
	const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

	// Roving arrow-key navigation between tabs (WAI-ARIA tabs pattern).
	function onTabKeyDown(e: React.KeyboardEvent) {
		const i = TABS.findIndex((t) => t.id === tab);
		let next: number;
		if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
		else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = TABS.length - 1;
		else return;
		e.preventDefault();
		const id = TABS[next]!.id;
		setTab(id);
		tabRefs.current[id]?.focus();
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<span className="eyebrow text-[0.7rem]">Operator</span>
				<h1 className="font-heading text-2xl font-extrabold tracking-tight">Control panel</h1>
			</div>

			<div
				role="tablist"
				aria-label="Control sections"
				onKeyDown={onTabKeyDown}
				className="segmented inline-flex w-fit gap-1 rounded-[0.95rem] p-1"
			>
				{TABS.map((t) => (
					<button
						key={t.id}
						type="button"
						role="tab"
						id={`tab-${t.id}`}
						aria-selected={tab === t.id}
						aria-controls={`panel-${t.id}`}
						tabIndex={tab === t.id ? 0 : -1}
						ref={(el) => {
							tabRefs.current[t.id] = el;
						}}
						onClick={() => setTab(t.id)}
						className={`rounded-[0.7rem] px-4 py-1.5 text-sm font-medium transition-all ${
							tab === t.id
								? "segmented-on text-primary-foreground"
								: "text-muted-foreground hover:bg-white/5 hover:text-foreground"
						}`}
					>
						{t.label}
					</button>
				))}
			</div>

			<div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
				{tab === "rewards" && <RewardsTab />}
				{tab === "timer" && <TimerTab />}
				{tab === "twitch" && (
					<div className="max-w-2xl">
						<TwitchPanel />
					</div>
				)}
			</div>
		</div>
	);
}
