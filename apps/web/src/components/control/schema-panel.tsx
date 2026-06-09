"use client";

import { Button } from "@wolfathon/ui/components/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { EXAMPLE_JSON } from "./example";

/**
 * Documents the import format so an AI assistant (or you) can produce
 * import-ready JSON in one shot.
 */
export function SchemaPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold">Import schema</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="text-foreground">reward</span> shows on stream;{" "}
            <span className="text-foreground">note</span> is internal only and never displayed.
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0 rounded-lg"
          onClick={async () => {
            await navigator.clipboard.writeText(EXAMPLE_JSON);
            toast.success("Schema copied");
          }}
        >
          <Copy className="size-4" />
          Copy schema
        </Button>
      </div>

      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          Top-level <code className="text-foreground">goals</code> is a non-empty array (max 50).
        </li>
        <li>
          Each goal needs a non-empty <code className="text-foreground">reward</code> string (max 80
          chars).
        </li>
        <li>
          <code className="text-foreground">note</code> is optional; unknown keys and any{" "}
          <code className="text-foreground">id</code> are ignored.
        </li>
        <li>On import every goal resets to locked and progress returns to the first goal.</li>
      </ul>

      <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-border bg-background/60 p-3 font-mono text-xs leading-relaxed">
        {EXAMPLE_JSON}
      </pre>
    </div>
  );
}
