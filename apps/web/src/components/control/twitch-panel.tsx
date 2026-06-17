"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { env } from "@wolfathon/env/web";
import { Button } from "@wolfathon/ui/components/button";
import { AlertTriangle, CheckCircle2, ExternalLink, Plug, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

const SCOPES = "channel:read:subscriptions, bits:read, channel:read:redemptions";

export function TwitchPanel() {
  const statusOptions = controlTrpc.twitch.getStatus.queryOptions();
  const { data: status } = useQuery(statusOptions);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: statusOptions.queryKey });

  const startAuth = useMutation(controlTrpc.twitch.startAuth.mutationOptions());
  const disconnect = useMutation(controlTrpc.twitch.disconnect.mutationOptions({ onSuccess: invalidate }));

  // Same-origin OAuth redirect URL the user registers in the Twitch app.
  const [redirectUrl, setRedirectUrl] = useState("");
  useEffect(() => setRedirectUrl(`${window.location.origin}/api/twitch/callback`), []);

  // Surface the result of the redirect round-trip (set by /api/twitch/callback).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("twitch");
    if (!result) return;
    if (result === "connected") toast.success("Twitch connected");
    else if (result === "partial")
      toast.error("Connected, but some EventSub subscriptions failed — try reconnecting");
    else if (result === "no_subs") toast.error("Connected, but no EventSub subscriptions were created");
    else if (result === "state_error") toast.error("Authorization expired — try Connect again");
    else toast.error("Twitch authorization failed");
    invalidate();
    // Strip the query param so a refresh doesn't re-toast.
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          {/* 1. credentials (from env) */}
          <div>
            <div className="text-xs font-medium text-muted-foreground">1. Twitch app credentials</div>
            {status?.hasCredentials ? (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <CheckCircle2 className="size-4 text-primary" />
                Loaded from environment
              </div>
            ) : (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 text-destructive" />
                <span>
                  Set <code className="font-mono">TWITCH_CLIENT_ID</code> and{" "}
                  <code className="font-mono">TWITCH_CLIENT_SECRET</code> in the environment, then redeploy.
                </span>
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Create an app at dev.twitch.tv. Set its OAuth Redirect URL to{" "}
              <code className="font-mono">{redirectUrl}</code>. Scopes requested: {SCOPES}.
            </p>
          </div>

          {/* 2. connect */}
          <div>
            <div className="text-xs font-medium text-muted-foreground">2. Authorize</div>
            <Button
              className="mt-2 h-10 rounded-lg px-4"
              disabled={!status?.hasCredentials || startAuth.isPending}
              onClick={() =>
                startAuth.mutate(undefined, {
                  onSuccess: (d) => {
                    window.location.href = d.url;
                  },
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              <Plug className="size-4" />
              Connect Twitch
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">
              Sends you to Twitch to approve, then back here.
            </p>
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
