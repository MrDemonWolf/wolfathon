"use client";

import { useQuery } from "@tanstack/react-query";

import { OverlayView } from "@/components/overlay/overlay-view";
import { publicTrpc } from "@/utils/trpc";

/**
 * OBS browser source. Add it at 1920×1080 with a transparent background.
 *
 * v1 realtime = polling: refetch the public (note-stripped) state every 2s.
 * Reliable on Workers; a Durable Object + WebSocket can replace this later for
 * instant push (see README).
 */
export default function OverlayPage() {
  const { data } = useQuery({
    ...publicTrpc.state.getPublic.queryOptions(),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  return (
    <div className="@container fixed inset-0 overflow-hidden bg-transparent">
      <OverlayView data={data} />
    </div>
  );
}
