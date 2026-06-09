"use client";

import { useMutation } from "@tanstack/react-query";
import type { Data } from "@wolfathon/api/state";
import { Button } from "@wolfathon/ui/components/button";
import { AlertTriangle, CheckCircle2, ClipboardCopy, Download, FileUp, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { controlTrpc } from "@/utils/trpc";

import { EXAMPLE_JSON } from "./example";

type ValidateResult =
  | { ok: true; count: number; rewards: string[] }
  | { ok: false; errors: { index: number; message: string }[] };

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function downloadJson(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportExportPanel({
  data,
  onChanged,
}: {
  data: Data | undefined;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validate = useMutation(controlTrpc.state.validate.mutationOptions());
  const importMut = useMutation(controlTrpc.state.import.mutationOptions());
  const busy = validate.isPending || importMut.isPending;

  // Any text edit invalidates a prior validation / pending confirmation.
  function updateText(next: string) {
    setText(next);
    setResult(null);
    setConfirming(false);
  }

  /** Parse the textarea. Returns the JSON value, or sets a document-level error. */
  function parse(): { ok: true; value: unknown } | { ok: false } {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      setResult({
        ok: false,
        errors: [{ index: -1, message: `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}` }],
      });
      setConfirming(false);
      return { ok: false };
    }
  }

  function runValidate() {
    const parsed = parse();
    if (!parsed.ok) return;
    validate.mutate(parsed.value, {
      onSuccess: (res) => {
        setResult(res);
        setConfirming(false);
      },
    });
  }

  /** Step 1 of import: validate, then reveal the confirm gate if clean. */
  function requestImport() {
    const parsed = parse();
    if (!parsed.ok) return;
    validate.mutate(parsed.value, {
      onSuccess: (res) => {
        setResult(res);
        setConfirming(res.ok);
      },
    });
  }

  /** Step 2 of import: the operator confirmed — replace everything. */
  function confirmImport() {
    const parsed = parse();
    if (!parsed.ok) return;
    importMut.mutate(parsed.value, {
      onSuccess: (res) => {
        if (!res.ok) {
          setResult(res);
          setConfirming(false);
          return;
        }
        toast.success(`Imported ${res.rewards.length} goals — progress reset`);
        setConfirming(false);
        setResult(null);
        setText("");
        onChanged();
      },
    });
  }

  function exportState() {
    if (!data) return;
    downloadJson(`wolfathon-goals-${nowStamp()}.json`, JSON.stringify(data, null, 2));
  }

  async function copyCurrent() {
    if (!data) return;
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast.success("Current state copied");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    updateText(await file.text());
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-heading text-lg font-bold">Import / Export</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Paste or upload a goal list, validate it, then replace everything in one click.
      </p>

      <textarea
        value={text}
        onChange={(e) => updateText(e.target.value)}
        spellCheck={false}
        placeholder={EXAMPLE_JSON}
        className="mt-4 min-h-44 w-full resize-y rounded-lg border border-input bg-background/60 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="rounded-lg" onClick={runValidate} disabled={!text.trim() || busy}>
          <ShieldCheck className="size-4" />
          Validate
        </Button>
        <Button
          variant="secondary"
          className="rounded-lg"
          onClick={requestImport}
          disabled={!text.trim() || busy}
        >
          <FileUp className="size-4" />
          Import (replace all)
        </Button>
        <Button variant="outline" className="rounded-lg" onClick={() => fileRef.current?.click()}>
          <FileUp className="size-4" />
          Upload .json
        </Button>
        <span className="mx-1 w-px self-stretch bg-border" />
        <Button variant="outline" className="rounded-lg" onClick={exportState} disabled={!data}>
          <Download className="size-4" />
          Export
        </Button>
        <Button variant="outline" className="rounded-lg" onClick={copyCurrent} disabled={!data}>
          <ClipboardCopy className="size-4" />
          Copy current JSON
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={onFile}
        />
      </div>

      {/* Preview / errors */}
      {result?.ok && (
        <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <CheckCircle2 className="size-4" />
            {result.count} goal{result.count === 1 ? "" : "s"} parsed
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.rewards.map((reward, i) => (
              <span
                key={`${reward}-${i}`}
                className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              >
                {reward}
              </span>
            ))}
          </div>
        </div>
      )}

      {result && !result.ok && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" />
            Nothing was changed. Fix these and try again:
          </div>
          <ul className="mt-2 space-y-1 text-xs text-destructive">
            {result.errors.map((err, i) => (
              <li key={i}>
                <span className="font-medium">
                  {err.index < 0 ? "Document" : `Goal #${err.index + 1}`}:
                </span>{" "}
                {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Confirm gate */}
      {confirming && result?.ok && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
            <AlertTriangle className="size-4" />
            This wipes current goals and resets progress. Continue?
          </div>
          <div className="mt-3 flex gap-2">
            <Button className="rounded-lg" onClick={confirmImport} disabled={importMut.isPending}>
              Yes, replace all {result.count} goals
            </Button>
            <Button
              variant="ghost"
              className="rounded-lg"
              onClick={() => setConfirming(false)}
              disabled={importMut.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
