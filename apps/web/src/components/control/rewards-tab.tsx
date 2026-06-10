"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { controlTrpc, queryClient } from "@/utils/trpc";

import { buildClaudePrompt } from "./claude-prompt";
import { EXAMPLE_JSON, REWARDS_SCHEMA_BULLETS } from "./example";
import { GoalEditor } from "./goal-editor";
import { type IEConfig, type IEError, ImportExportPanel } from "./import-export-panel";
import { OverlayPreview } from "./overlay-preview";
import { nowStamp } from "./util";

const label = (index: number) => (index < 0 ? "Document" : `Goal #${index + 1}`);

export function RewardsTab() {
  const rawOptions = controlTrpc.state.getRaw.queryOptions();
  const { data } = useQuery(rawOptions);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: rawOptions.queryKey });

  const validate = useMutation(controlTrpc.state.validate.mutationOptions());
  const importMut = useMutation(controlTrpc.state.import.mutationOptions());

  async function guard<T>(fn: () => Promise<T>, onErr: (errors: IEError[]) => T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      return onErr([{ label: "Error", message: e instanceof Error ? e.message : "request failed" }]);
    }
  }

  const ie: IEConfig = {
    title: "rewards",
    noteLine: "reward shows on stream; note is internal only and never displayed.",
    exampleJson: EXAMPLE_JSON,
    schemaBullets: REWARDS_SCHEMA_BULLETS,
    exportFilename: () => `wolfathon-goals-${nowStamp()}.json`,
    currentJson: () => (data ? JSON.stringify(data, null, 2) : null),
    claudePrompt: () =>
      data
        ? buildClaudePrompt({
            kind: "rewards list",
            schemaBullets: REWARDS_SCHEMA_BULLETS,
            exampleJson: EXAMPLE_JSON,
            currentJson: JSON.stringify(data, null, 2),
          })
        : null,
    confirmText: "This wipes current goals and resets progress. Continue?",
    validate: (v) =>
      guard(
        async () => {
          const r = await validate.mutateAsync(v);
          return r.ok
            ? ({ ok: true, summary: r.rewards } as const)
            : ({ ok: false, errors: r.errors.map((e) => ({ label: label(e.index), message: e.message })) } as const);
        },
        (errors) => ({ ok: false, errors }),
      ),
    doImport: (v) =>
      guard(
        async () => {
          const r = await importMut.mutateAsync(v);
          return r.ok
            ? ({ ok: true } as const)
            : ({ ok: false, errors: r.errors.map((e) => ({ label: label(e.index), message: e.message })) } as const);
        },
        (errors) => ({ ok: false, errors }),
      ),
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="flex flex-col gap-6">
        <GoalEditor data={data} onChanged={invalidate} />
        <ImportExportPanel config={ie} busy={validate.isPending || importMut.isPending} onImported={invalidate} />
      </div>
      <div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Live preview</h2>
          <a href="/overlay/rewards" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
            Open ↗
          </a>
        </div>
        <OverlayPreview data={data} />
      </div>
    </div>
  );
}
