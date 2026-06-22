/**
 * StreamElements tip handling.
 *
 * A persistent Durable Object (apps/server) holds the SE realtime socket and
 * calls {@link recordTip} on each tip. The socket/transport lives there; this
 * module is pure domain logic so the tip → time + goal mapping is testable.
 *
 * A tip does two things, mirroring how subs/bits already work:
 *   - adds timer time   (config.tipMinutesPerDollar)
 *   - advances goals     (config.tipDollarsPerSub → sub-equivalents)
 */

import type { Db } from "@wolfathon/db";

import { readState, readTimer, writeState, writeTimer } from "./store";
import { applyEvent, tipSubs } from "./timer";

export type SeTip = { id: string; amount: number; who?: string };

/**
 * Normalize a StreamElements realtime tip payload (the `event` / `event:test`
 * message data) into a {@link SeTip}, or null if it isn't a usable tip.
 *
 * SE shape (realtime "event"): `{ _id, type: "tip", data: { amount, username, ... } }`.
 * We're lenient about the exact nesting — different SE event channels wrap it
 * slightly differently — and require a positive numeric amount.
 */
export function parseTip(payload: unknown): SeTip | null {
	if (!payload || typeof payload !== "object") return null;
	const p = payload as Record<string, unknown>;
	const type = (p.type ?? p.listener ?? "") as string;
	if (!String(type).toLowerCase().includes("tip")) return null;
	const d = (typeof p.data === "object" && p.data ? p.data : p) as Record<string, unknown>;
	const amount = Number(d.amount);
	if (!Number.isFinite(amount) || amount <= 0) return null;
	const rawWho = d.username ?? d.name;
	const who = typeof rawWho === "string" && rawWho.trim() ? rawWho.trim() : undefined;
	const id = String(p._id ?? d._id ?? d.tipId ?? `${who ?? "anon"}-${amount}-${d.createdAt ?? ""}`);
	return who ? { id, amount, who } : { id, amount };
}

/** Apply a tip: add timer time and advance the reward goals. */
export async function recordTip(db: Db, tip: SeTip, now: number): Promise<void> {
	const timer = await readTimer(db);
	const { state } = applyEvent(
		timer.config,
		timer.state,
		tip.who
			? { kind: "tip", amount: tip.amount, who: tip.who }
			: { kind: "tip", amount: tip.amount },
		now,
	);
	await writeTimer(db, { ...timer, state });

	const subs = tipSubs(tip.amount, timer.config);
	if (subs > 0) {
		const data = await readState(db);
		await writeState(db, { ...data, currentSubs: (data.currentSubs ?? 0) + subs });
	}
}
