"use client";

import {
	AlertDialog,
	AlertDialogClose,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@wolfathon/ui/components/alert-dialog";
import { Button } from "@wolfathon/ui/components/button";
import { Loader2, Unplug } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Shared connection UI for the OAuth-redirect panels (Twitch + bot). Each panel
 * keeps its own status body — the copy and states genuinely differ — but the
 * bordered card, the "Checking connection…" placeholder, the Disconnect confirm,
 * and the redirect-result handling are identical, so they live here.
 */

/** Accent of the connection card: connected-ok, needs-attention, or idle. */
export type ConnectionAccent = "ok" | "warn" | "idle";

const ACCENT_CLASS: Record<ConnectionAccent, string> = {
	ok: "border-primary/30 bg-primary/[0.06]",
	warn: "border-amber-400/30 bg-amber-400/[0.06]",
	idle: "border-border bg-background/40",
};

/**
 * The bordered status card every connection panel opens with. `children` is the
 * status body (icon + text), `action` the button cluster on the right. Renders in
 * every state so reconnecting never swaps out the whole panel.
 */
export function ConnectionCard({
	accent,
	action,
	children,
}: {
	accent: ConnectionAccent;
	action: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div
			className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${ACCENT_CLASS[accent]}`}
		>
			<div role="status" aria-live="polite" className="flex min-w-0 items-center gap-2">
				{children}
			</div>
			{action}
		</div>
	);
}

/** The "still loading the connection status" placeholder body. */
export function CheckingConnection() {
	return (
		<>
			<Loader2
				className="size-5 shrink-0 animate-spin text-muted-foreground"
				aria-label="Checking connection"
			/>
			<div className="text-sm text-muted-foreground">Checking connection…</div>
		</>
	);
}

/**
 * Destructive "Disconnect" button that confirms first (Base UI AlertDialog).
 * Shared by both panels — only the copy differs. `triggerVariant` lets the
 * degraded/reconnect states demote it to `ghost` so Reconnect can lead.
 */
export function DisconnectDialog({
	title,
	description,
	onConfirm,
	pending,
	triggerVariant = "destructive",
	pendingLabel,
}: {
	title: string;
	description: string;
	onConfirm: () => void;
	pending: boolean;
	triggerVariant?: "destructive" | "ghost";
	/** Shown on the trigger while the disconnect mutation is in flight. */
	pendingLabel?: string;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger
				render={
					<Button variant={triggerVariant} disabled={pending}>
						{pending ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
						{pending && pendingLabel ? pendingLabel : "Disconnect"}
					</Button>
				}
			/>
			<AlertDialogContent>
				<AlertDialogTitle>{title}</AlertDialogTitle>
				<AlertDialogDescription>{description}</AlertDialogDescription>
				<AlertDialogFooter>
					<AlertDialogClose
						render={
							<Button variant="outline" className="rounded-lg">
								Cancel
							</Button>
						}
					/>
					<AlertDialogClose
						onClick={onConfirm}
						render={
							<Button variant="destructive" className="rounded-lg">
								Disconnect
							</Button>
						}
					/>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/**
 * Handle the `?<param>=<result>` an OAuth redirect leaves in the URL: toast the
 * outcome, refresh the panel, and strip the query so a refresh doesn't re-toast.
 * `result === "connected"` toasts success; every other result is an error, using
 * `errors[result]` or `fallbackError`. Runs once on mount.
 */
export function useOAuthCallback(opts: {
	param: string;
	success: string;
	errors: Record<string, string>;
	fallbackError: string;
	onResult: () => void;
}) {
	const { param, success, errors, fallbackError, onResult } = opts;
	useEffect(() => {
		const result = new URLSearchParams(window.location.search).get(param);
		if (!result) return;
		if (result === "connected") toast.success(success);
		else toast.error(errors[result] ?? fallbackError);
		onResult();
		window.history.replaceState(null, "", window.location.pathname);
		// Mount-only: reads the one-shot redirect param the OAuth callback left in
		// the URL. Deps intentionally empty — matches the panels' prior effect.
	}, []);
}
