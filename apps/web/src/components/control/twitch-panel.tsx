"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { env } from "@wolfathon/env/web";
import { Button } from "@wolfathon/ui/components/button";
import { Input } from "@wolfathon/ui/components/input";
import { CheckCircle2, ExternalLink, Plug, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

const SCOPES = "channel:read:subscriptions, bits:read, channel:read:redemptions";

type Device = { userCode: string; verificationUri: string; interval: number };

export function TwitchPanel() {
  const statusOptions = controlTrpc.twitch.getStatus.queryOptions();
  const { data: status } = useQuery(statusOptions);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: statusOptions.queryKey });

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [device, setDevice] = useState<Device | null>(null);

  const setCreds = useMutation(controlTrpc.twitch.setCredentials.mutationOptions({ onSuccess: invalidate }));
  const startAuth = useMutation(controlTrpc.twitch.startDeviceAuth.mutationOptions());
  const poll = useMutation(controlTrpc.twitch.pollDeviceAuth.mutationOptions());
  const disconnect = useMutation(controlTrpc.twitch.disconnect.mutationOptions({ onSuccess: invalidate }));

  // Auto-poll while waiting for the broadcaster to authorize.
  useEffect(() => {
    if (!device) return;
    const ms = Math.max(3, device.interval) * 1000;
    const t = setInterval(async () => {
      const res = await poll.mutateAsync().catch(() => null);
      if (res?.status === "ok") {
        setDevice(null);
        invalidate();
        toast.success(`Connected as ${res.login} — ${res.subscriptionCount} subscriptions`);
        if (res.errors.length) toast.error(`Some subscriptions failed: ${res.errors[0]}`);
      }
    }, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);

  const callback = `${env.NEXT_PUBLIC_SERVER_URL}/twitch/eventsub`;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-heading text-lg font-bold">Twitch</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Auto-add time from subs, gifts, bits, and channel points via EventSub.
      </p>

      {status?.connected ? (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-primary" />
            <div>
              <div className="font-medium">Connected as {status.broadcasterLogin}</div>
              <div className="text-xs text-muted-foreground">
                {status.subscriptionCount} EventSub subscriptions active
              </div>
            </div>
          </div>
          <Button variant="destructive" className="rounded-lg" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
            <Unplug className="size-4" />
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {/* 1. credentials */}
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              1. Twitch app credentials
              {status?.hasCredentials && <span className="ml-2 text-primary">saved ✓</span>}
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input className="h-10 flex-1 rounded-lg" placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
              <Input className="h-10 flex-1 rounded-lg" type="password" placeholder="Client Secret" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
              <Button
                className="h-10 rounded-lg px-4"
                onClick={() => setCreds.mutate({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })}
                disabled={!clientId.trim() || !clientSecret.trim() || setCreds.isPending}
              >
                Save
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Create an app at dev.twitch.tv → set the OAuth redirect to anything (Device Flow
              ignores it). Scopes requested: {SCOPES}.
            </p>
          </div>

          {/* 2. connect */}
          <div>
            <div className="text-xs font-medium text-muted-foreground">2. Authorize</div>
            {device ? (
              <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="text-sm">
                  Go to{" "}
                  <a className="font-medium text-primary underline" href={device.verificationUri} target="_blank" rel="noreferrer">
                    {device.verificationUri}
                  </a>{" "}
                  and enter this code:
                </div>
                <div className="mt-2 font-heading text-3xl font-extrabold tracking-[0.3em] text-primary">
                  {device.userCode}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Waiting for authorization…</div>
              </div>
            ) : (
              <Button
                className="mt-2 h-10 rounded-lg px-4"
                disabled={!status?.hasCredentials || startAuth.isPending}
                onClick={() =>
                  startAuth.mutate(undefined, {
                    onSuccess: (d) => setDevice({ userCode: d.userCode, verificationUri: d.verificationUri, interval: d.interval }),
                  })
                }
              >
                <Plug className="size-4" />
                Connect Twitch
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ExternalLink className="size-3.5" />
          EventSub callback:
          <code className="truncate font-mono">{callback}</code>
        </div>
      </div>
    </div>
  );
}
