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

/**
 * Persisted StreamElements state (secret — `jwt` never reaches a public response).
 * Stored in D1 like the `twitch` doc so the operator can paste/rotate the token
 * from the Access-gated control panel WITHOUT a redeploy; the listener DO reads it.
 */
export type SeDoc = {
	jwt?: string;
	channelId?: string;
	/** Last known socket auth state — written by the listener DO. */
	connected?: boolean;
	lastError?: string;
	lastTipAt?: number;
};

export function defaultSeDoc(): SeDoc {
	return {};
}

/** Masked status safe to return to the (Access-gated) control panel — no jwt. */
export type SeStatus = {
	connected: boolean;
	hasJwt: boolean;
	channelId?: string;
	lastTipAt?: number;
	lastError?: string;
};

export function toSeStatus(doc: SeDoc): SeStatus {
	return {
		connected: Boolean(doc.connected),
		hasJwt: Boolean(doc.jwt),
		channelId: doc.channelId,
		lastTipAt: doc.lastTipAt,
		lastError: doc.lastError,
	};
}

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
