"use client";

import { useQuery } from "@tanstack/react-query";

import { GoalEditor } from "@/components/control/goal-editor";
import { ImportExportPanel } from "@/components/control/import-export-panel";
import { OverlayPreview } from "@/components/control/overlay-preview";
import { SchemaPanel } from "@/components/control/schema-panel";
import { controlTrpc, queryClient } from "@/utils/trpc";

/**
 * Operator panel. Reachable only behind Cloudflare Access (the `/api/trpc`
 * mutations it calls verify the Access JWT server-side regardless).
 */
export default function ControlPage() {
  const rawOptions = controlTrpc.state.getRaw.queryOptions();
  const { data } = useQuery(rawOptions);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: rawOptions.queryKey });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="flex flex-col gap-6">
        <GoalEditor data={data} onChanged={invalidate} />
        <ImportExportPanel data={data} onChanged={invalidate} />
        <SchemaPanel />
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Live preview</h2>
          <a
            href="/overlay"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Open overlay ↗
          </a>
        </div>
        <OverlayPreview data={data} />
        <p className="text-xs text-muted-foreground">
          Exactly what viewers see — notes stripped, no numbers, future goals hidden.
        </p>
      </div>
    </div>
  );
}
