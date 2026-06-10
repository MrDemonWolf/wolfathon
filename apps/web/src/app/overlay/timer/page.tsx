"use client";

import { useQuery } from "@tanstack/react-query";

import { TimerView } from "@/components/overlay/timer-view";
import { publicTrpc } from "@/utils/trpc";

/**
 * Subathon timer OBS browser source (1920×1080, transparent). Polls the public
 * timer every 2s; the overlay itself counts down to the frame between polls.
 */
export default function TimerOverlayPage() {
  const { data } = useQuery({
    ...publicTrpc.timer.getPublic.queryOptions(),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  return (
    <div className="@container fixed inset-0 overflow-hidden bg-transparent">
      <TimerView data={data} />
    </div>
  );
}
