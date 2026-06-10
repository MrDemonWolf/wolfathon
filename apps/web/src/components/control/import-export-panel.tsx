"use client";

import { Button } from "@wolfathon/ui/components/button";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileUp,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export type IEError = { label: string; message: string };
export type IEValidate = { ok: true; summary: string[] } | { ok: false; errors: IEError[] };
export type IEImport = { ok: true } | { ok: false; errors: IEError[] };

/** Per-kind adapter the generic panel renders. Hooks/mutations live in the parent. */
export type IEConfig = {
  /** e.g. "rewards" or "timer config" — used in copy. */
  title: string;
  noteLine?: React.ReactNode;
  exampleJson: string;
  schemaBullets: string[];
  exportFilename: () => string;
  /** Pretty JSON of the current exportable config, or null if unavailable. */
  currentJson: () => string | null;
  /** Ready-to-paste prompt for claude.ai, or null. */
  claudePrompt: () => string | null;
  confirmText: string;
  validate: (value: unknown) => Promise<IEValidate>;
  doImport: (value: unknown) => Promise<IEImport>;
};

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
  config,
  busy,
  onImported,
}: {
  config: IEConfig;
  busy: boolean;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<IEValidate | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function updateText(next: string) {
    setText(next);
    setResult(null);
    setConfirming(false);
  }

  function parse(): { ok: true; value: unknown } | { ok: false } {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      setResult({
        ok: false,
        errors: [{ label: "JSON", message: e instanceof Error ? e.message : "parse error" }],
      });
      setConfirming(false);
      return { ok: false };
    }
  }

  async function runValidate() {
    const p = parse();
    if (!p.ok) return;
    setResult(await config.validate(p.value));
    setConfirming(false);
  }

  async function requestImport() {
    const p = parse();
    if (!p.ok) return;
    const r = await config.validate(p.value);
    setResult(r);
    setConfirming(r.ok);
  }

  async function confirmImport() {
    const p = parse();
    if (!p.ok) return;
    const r = await config.doImport(p.value);
    if (!r.ok) {
      setResult(r);
      setConfirming(false);
      return;
    }
    toast.success(`Imported ${config.title}`);
    setConfirming(false);
    setResult(null);
    setText("");
    onImported();
  }

  function exportNow() {
    const json = config.currentJson();
    if (!json) return;
    downloadJson(config.exportFilename(), json);
  }

  async function copyCurrent() {
    const json = config.currentJson();
    if (!json) return;
    await navigator.clipboard.writeText(json);
    toast.success("Current config copied");
  }

  async function copyClaudePrompt() {
    const prompt = config.claudePrompt();
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    toast.success("Claude prompt copied — paste it into claude.ai");
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
        Paste or upload {config.title}, validate, then replace in one click.
      </p>

      <textarea
        value={text}
        onChange={(e) => updateText(e.target.value)}
        spellCheck={false}
        placeholder={config.exampleJson}
        className="mt-4 min-h-44 w-full resize-y rounded-lg border border-input bg-background/60 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="rounded-lg" onClick={runValidate} disabled={!text.trim() || busy}>
          <ShieldCheck className="size-4" />
          Validate
        </Button>
        <Button variant="secondary" className="rounded-lg" onClick={requestImport} disabled={!text.trim() || busy}>
          <FileUp className="size-4" />
          Import (replace)
        </Button>
        <Button variant="outline" className="rounded-lg" onClick={() => fileRef.current?.click()}>
          <FileUp className="size-4" />
          Upload .json
        </Button>
        <span className="mx-1 w-px self-stretch bg-border" />
        <Button variant="outline" className="rounded-lg" onClick={exportNow} disabled={!config.currentJson()}>
          <Download className="size-4" />
          Export
        </Button>
        <Button variant="outline" className="rounded-lg" onClick={copyCurrent} disabled={!config.currentJson()}>
          <ClipboardCopy className="size-4" />
          Copy current JSON
        </Button>
        <Button variant="outline" className="rounded-lg" onClick={copyClaudePrompt} disabled={!config.claudePrompt()}>
          <Sparkles className="size-4" />
          Copy Claude prompt
        </Button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
      </div>

      {result?.ok && (
        <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <CheckCircle2 className="size-4" />
            Looks good
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.summary.map((s, i) => (
              <span key={`${s}-${i}`} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {s}
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
                <span className="font-medium">{err.label}:</span> {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirming && result?.ok && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
            <AlertTriangle className="size-4" />
            {config.confirmText}
          </div>
          <div className="mt-3 flex gap-2">
            <Button className="rounded-lg" onClick={confirmImport} disabled={busy}>
              Yes, replace
            </Button>
            <Button variant="ghost" className="rounded-lg" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Schema reference (collapsible) */}
      <button
        type="button"
        onClick={() => setShowSchema((v) => !v)}
        className="mt-4 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {showSchema ? "Hide" : "Show"} schema &amp; example
      </button>
      {showSchema && (
        <div className="mt-2">
          {config.noteLine && <p className="text-xs text-muted-foreground">{config.noteLine}</p>}
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {config.schemaBullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-border bg-background/60 p-3 font-mono text-xs leading-relaxed">
            {config.exampleJson}
          </pre>
        </div>
      )}
    </div>
  );
}
