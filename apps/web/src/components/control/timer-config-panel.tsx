"use client";

import { useMutation } from "@tanstack/react-query";
import type { TimerConfig, TimerDoc } from "@wolfathon/api/timer";
import { Button } from "@wolfathon/ui/components/button";
import { Input } from "@wolfathon/ui/components/input";
import { Plus, Save, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { controlTrpc } from "@/utils/trpc";

export function TimerConfigPanel({ doc, onChanged }: { doc: TimerDoc | undefined; onChanged: () => void }) {
  if (!doc) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Loading config…
      </div>
    );
  }
  // Remount (reseed local state) whenever the saved config changes.
  return <ConfigForm key={JSON.stringify(doc.config)} config={doc.config} onChanged={onChanged} />;
}

function ConfigForm({ config, onChanged }: { config: TimerConfig; onChanged: () => void }) {
  const [form, setForm] = useState<TimerConfig>(config);
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);
  const setConfig = useMutation(controlTrpc.timer.setConfig.mutationOptions());

  function n(v: string): number {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  function save() {
    setConfig.mutate(form, {
      onSuccess: (res) => {
        if (res.ok) {
          setErrors([]);
          toast.success("Timer config saved");
          onChanged();
        } else {
          setErrors(res.errors);
        }
      },
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">Time rules</h2>
        <Button className="rounded-lg" onClick={save} disabled={setConfig.isPending}>
          <Save className="size-4" />
          Save
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Start (min)" value={form.startMinutes} onChange={(v) => setForm({ ...form, startMinutes: n(v) })} />
        <Field label="Cap (min, 0=∞)" value={form.maxMinutes} onChange={(v) => setForm({ ...form, maxMinutes: n(v) })} />
        <Field label="Bits / 100 (min)" value={form.bitsPer100Minutes} onChange={(v) => setForm({ ...form, bitsPer100Minutes: n(v) })} />
        <Field label="Sub T1 (min)" value={form.sub.t1} onChange={(v) => setForm({ ...form, sub: { ...form.sub, t1: n(v) } })} />
        <Field label="Sub T2 (min)" value={form.sub.t2} onChange={(v) => setForm({ ...form, sub: { ...form.sub, t2: n(v) } })} />
        <Field label="Sub T3 (min)" value={form.sub.t3} onChange={(v) => setForm({ ...form, sub: { ...form.sub, t3: n(v) } })} />
        <Field label="Prime (min)" value={form.sub.prime} onChange={(v) => setForm({ ...form, sub: { ...form.sub, prime: n(v) } })} />
        <Field label="Gift sub (min)" value={form.giftSubMinutes} onChange={(v) => setForm({ ...form, giftSubMinutes: n(v) })} />
      </div>

      {/* channel point rules */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Channel-point rewards</div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={() => setForm({ ...form, channelPoints: [...form.channelPoints, { rewardTitle: "", minutes: 5 }] })}
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {form.channelPoints.map((rule, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="h-9 flex-1 rounded-lg"
                placeholder="Reward title (exact)"
                value={rule.rewardTitle}
                onChange={(e) => {
                  const cp = [...form.channelPoints];
                  cp[i] = { ...cp[i]!, rewardTitle: e.target.value };
                  setForm({ ...form, channelPoints: cp });
                }}
              />
              <Input
                className="h-9 w-24 rounded-lg"
                type="number"
                value={String(rule.minutes)}
                onChange={(e) => {
                  const cp = [...form.channelPoints];
                  cp[i] = { ...cp[i]!, minutes: n(e.target.value) };
                  setForm({ ...form, channelPoints: cp });
                }}
              />
              <Button
                variant="destructive"
                size="icon-sm"
                className="rounded-lg"
                aria-label="Remove rule"
                onClick={() => setForm({ ...form, channelPoints: form.channelPoints.filter((_, j) => j !== i) })}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          {form.channelPoints.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No channel-point rules. Add one and match the reward title exactly (or connect Twitch
              and redeem once to capture its id).
            </p>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {errors.map((e, i) => (
            <li key={i}>
              <span className="font-medium">{e.path}:</span> {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input className="h-9 rounded-lg" type="number" value={String(value)} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
