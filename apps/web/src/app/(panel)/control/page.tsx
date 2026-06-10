"use client";

import { useState } from "react";

import { RewardsTab } from "@/components/control/rewards-tab";
import { TimerTab } from "@/components/control/timer-tab";

const TABS = [
  { id: "rewards", label: "Rewards" },
  { id: "timer", label: "Timer" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Operator panel. Reachable only behind Cloudflare Access (the `/api/trpc`
 * mutations it calls verify the Access JWT server-side regardless).
 */
export default function ControlPage() {
  const [tab, setTab] = useState<TabId>("rewards");

  return (
    <div className="flex flex-col gap-6">
      <div className="inline-flex w-fit rounded-xl border border-border bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "rewards" ? <RewardsTab /> : <TimerTab />}
    </div>
  );
}
