import { expect, test } from "bun:test";

import {
	addWinner,
	applyConfig,
	applyGiveawayEvent,
	CLAIM_WINDOW_MS,
	claimPending,
	defaultGiveawayDoc,
	drawRaffle,
	expirePending,
	parseGiveawayEvent,
	qualifyingGifters,
	removeWinner,
	rerollRaffle,
	resetPool,
	resetRound,
	setShipped,
	setWinnerNote,
	startGiveaway,
} from "./giveaway";

/** A 3-entrant, open, started doc — the common fixture for the raffle/claim tests. */
function poolOf(logins: string[]) {
	let doc = startGiveaway(defaultGiveawayDoc(), 0);
	doc.config.open = true;
	for (const login of logins) {
		doc = applyGiveawayEvent(doc, { kind: "entry", login, name: login }, 0);
	}
	return doc;
}

test("gifts are ignored until the round is started", () => {
	let doc = defaultGiveawayDoc(); // startedAt null
	doc = applyGiveawayEvent(doc, { kind: "gift", login: "alice", name: "Alice", count: 9 }, 5);
	expect(doc.gifters).toHaveLength(0); // not started → ignored

	doc = startGiveaway(doc, 10);
	expect(startGiveaway(doc, 99).startedAt).toBe(10); // idempotent — start time sticks
	doc = applyGiveawayEvent(doc, { kind: "gift", login: "alice", name: "Alice", count: 9 }, 15);
	expect(doc.gifters).toHaveLength(1);
});

test("gifts accumulate and cross the threshold in order", () => {
	let doc = startGiveaway(defaultGiveawayDoc(), 0); // threshold 5, started
	// alice gifts 3 then 2 → qualifies on the second gift (t=20)
	doc = applyGiveawayEvent(doc, { kind: "gift", login: "alice", name: "Alice", count: 3 }, 10);
	doc = applyGiveawayEvent(doc, { kind: "gift", login: "alice", name: "Alice", count: 2 }, 20);
	// bob gifts 5 at once → qualifies later (t=30)
	doc = applyGiveawayEvent(doc, { kind: "gift", login: "bob", name: "Bob", count: 5 }, 30);

	const q = qualifyingGifters(doc);
	expect(q.map((g) => g.login)).toEqual(["alice", "bob"]); // alice first
	expect(doc.gifters.find((g) => g.login === "alice")!.count).toBe(5);
});

test("entries only count when open, and dedup by login", () => {
	let doc = defaultGiveawayDoc(); // open: false
	doc = applyGiveawayEvent(doc, { kind: "entry", login: "cara", name: "Cara" }, 0);
	expect(doc.entrants).toHaveLength(0); // closed → ignored

	doc.config.open = true;
	doc = applyGiveawayEvent(doc, { kind: "entry", login: "cara", name: "Cara" }, 1);
	doc = applyGiveawayEvent(doc, { kind: "entry", login: "cara", name: "Cara" }, 2); // dup
	doc = applyGiveawayEvent(doc, { kind: "entry", login: "dan", name: "Dan" }, 3);
	expect(doc.entrants.map((e) => e.login)).toEqual(["cara", "dan"]);
});

test("raffle picks from the pool, never repeats a winner, and is deterministic with injected rand", () => {
	let doc = defaultGiveawayDoc();
	doc.config.open = true;
	for (const login of ["a", "b", "c"]) {
		doc = applyGiveawayEvent(doc, { kind: "entry", login, name: login }, 0);
	}
	// rand=0 → first remaining entrant each draw
	let r = drawRaffle(doc, 100, () => 0);
	expect(r.winner!.login).toBe("a");
	r = drawRaffle(r.doc, 101, () => 0);
	expect(r.winner!.login).toBe("b"); // "a" excluded as already won
	expect(r.doc.winners.map((w) => w.login)).toEqual(["a", "b"]);
});

test("empty pool draws nothing", () => {
	const r = drawRaffle(defaultGiveawayDoc(), 0, () => 0);
	expect(r.winner).toBeNull();
	expect(r.doc.winners).toHaveLength(0);
});

test("parse extracts entries and non-anonymous gifts, ignores the rest", () => {
	expect(
		parseGiveawayEvent(
			"channel.chat.message",
			{ chatter_user_login: "Eve", chatter_user_name: "Eve", message: { text: "!enter pls" } },
			"!enter",
		),
	).toEqual({ kind: "entry", login: "eve", name: "Eve" });

	// wrong command
	expect(
		parseGiveawayEvent(
			"channel.chat.message",
			{ chatter_user_login: "eve", message: { text: "hello" } },
			"!enter",
		),
	).toBeNull();

	expect(
		parseGiveawayEvent(
			"channel.subscription.gift",
			{ user_login: "Fox", user_name: "Fox", total: 5 },
			"!enter",
		),
	).toEqual({ kind: "gift", login: "fox", name: "Fox", count: 5 });

	// anonymous gift → dropped (no identity)
	expect(
		parseGiveawayEvent("channel.subscription.gift", { is_anonymous: true, total: 10 }, "!enter"),
	).toBeNull();
});

test("parse defaults a missing/non-numeric gift total to 1", () => {
	expect(
		parseGiveawayEvent(
			"channel.subscription.gift",
			{ user_login: "Fox", user_name: "Fox" },
			"!enter",
		),
	).toEqual({ kind: "gift", login: "fox", name: "Fox", count: 1 });
	expect(
		parseGiveawayEvent("channel.subscription.gift", { user_login: "Fox", total: "abc" }, "!enter"),
	).toEqual({ kind: "gift", login: "fox", name: "fox", count: 1 });
});

test("parse drops gift/chat events with no login (the dedup-key safeguard)", () => {
	// gift with user_login missing
	expect(
		parseGiveawayEvent("channel.subscription.gift", { user_name: "Fox", total: 5 }, "!enter"),
	).toBeNull();
	// matching command but no chatter login
	expect(
		parseGiveawayEvent(
			"channel.chat.message",
			{ chatter_user_name: "Eve", message: { text: "!enter" } },
			"!enter",
		),
	).toBeNull();
});

test("applyConfig clamps, trims, and preserves prior values", () => {
	const base = defaultGiveawayDoc(); // command "!enter", threshold 5, slots 2/2, open false
	// whitespace-only command keeps the prior command
	expect(applyConfig(base, { command: "   " }).config.command).toBe("!enter");
	// over-long command truncates to MAX_COMMAND_LENGTH (32)
	expect(applyConfig(base, { command: "!".padEnd(40, "x") }).config.command).toHaveLength(32);
	// giftThreshold clamps to [1, 1000]
	expect(applyConfig(base, { giftThreshold: 5000 }).config.giftThreshold).toBe(1000);
	expect(applyConfig(base, { giftThreshold: 0 }).config.giftThreshold).toBe(1);
	// non-finite slot falls back to current; fractional rounds
	expect(applyConfig(base, { giftWinnerSlots: NaN }).config.giftWinnerSlots).toBe(2);
	expect(applyConfig(base, { giftWinnerSlots: Infinity }).config.giftWinnerSlots).toBe(2);
	expect(applyConfig(base, { raffleWinnerSlots: 3.7 }).config.raffleWinnerSlots).toBe(4);
	// open is preserved when the patch omits it
	expect(applyConfig(base, {}).config.open).toBe(false);
});

test("addWinner appends once per login and never duplicates", () => {
	const base = defaultGiveawayDoc();
	const one = addWinner(base, { login: "kit", name: "Kit", source: "gift" }, 100);
	expect(one.winners).toHaveLength(1);
	expect(one.winners[0]).toMatchObject({
		login: "kit",
		name: "Kit",
		source: "gift",
		shipped: false,
	});
	// same login again is a no-op
	const two = addWinner(one, { login: "kit", name: "Kit", source: "raffle" }, 200);
	expect(two.winners).toHaveLength(1);
});

test("setShipped, setWinnerNote, and removeWinner only touch the matching winner", () => {
	let doc = defaultGiveawayDoc();
	doc = addWinner(doc, { login: "a", name: "A", source: "gift" }, 1);
	doc = addWinner(doc, { login: "b", name: "B", source: "raffle" }, 2);
	const [a, b] = doc.winners;

	doc = setShipped(doc, a!.id, true);
	expect(doc.winners.find((w) => w.id === a!.id)!.shipped).toBe(true);
	expect(doc.winners.find((w) => w.id === b!.id)!.shipped).toBe(false);

	// blank note clears to undefined; real text is trimmed and stored
	doc = setWinnerNote(doc, a!.id, "   ");
	expect(doc.winners.find((w) => w.id === a!.id)!.note).toBeUndefined();
	doc = setWinnerNote(doc, a!.id, "  ship to EU  ");
	expect(doc.winners.find((w) => w.id === a!.id)!.note).toBe("ship to EU");

	doc = removeWinner(doc, a!.id);
	expect(doc.winners.map((w) => w.id)).toEqual([b!.id]);
});

test("resetRound clears gifters/entrants/winners and un-starts/closes the round", () => {
	let doc = startGiveaway(defaultGiveawayDoc(), 0);
	doc.config.open = true;
	doc = applyGiveawayEvent(doc, { kind: "gift", login: "g", name: "G", count: 9 }, 1);
	doc = applyGiveawayEvent(doc, { kind: "entry", login: "e", name: "E" }, 2);
	doc = addWinner(doc, { login: "w", name: "W", source: "gift" }, 3);

	const reset = resetRound(doc);
	expect(reset.gifters).toHaveLength(0);
	expect(reset.entrants).toHaveLength(0);
	expect(reset.winners).toHaveLength(0);
	expect(reset.pendingClaim).toBeNull(); // claim cleared too
	expect(reset.startedAt).toBeNull(); // gifts wait for the next Start
	expect(reset.config.open).toBe(false); // entries closed
	expect(reset.config.command).toBe(doc.config.command); // rest of config kept
});

test("rerollRaffle swaps a raffle winner for someone new, never re-picking them", () => {
	let doc = startGiveaway(defaultGiveawayDoc(), 0);
	doc.config.open = true;
	for (const login of ["a", "b"]) {
		doc = applyGiveawayEvent(doc, { kind: "entry", login, name: login }, 0);
	}
	const drawn = drawRaffle(doc, 100, () => 0); // picks "a"
	expect(drawn.winner!.login).toBe("a");
	const id = drawn.doc.winners[0]!.id;

	// reroll "a" → only "b" left, so it must land on "b" (never re-picks "a")
	const re = rerollRaffle(drawn.doc, id, 200, () => 0);
	expect(re.winner!.login).toBe("b");
	expect(re.doc.winners.map((w) => w.login)).toEqual(["b"]);
});

test("rerollRaffle keeps the winner when there's no one else to draw", () => {
	let doc = startGiveaway(defaultGiveawayDoc(), 0);
	doc.config.open = true;
	doc = applyGiveawayEvent(doc, { kind: "entry", login: "solo", name: "Solo" }, 0);
	const drawn = drawRaffle(doc, 100, () => 0);
	const id = drawn.doc.winners[0]!.id;

	// "solo" is the only entrant and is excluded → keep them, no-op
	const stuck = rerollRaffle(drawn.doc, id, 200, () => 0);
	expect(stuck.winner).toBeNull();
	expect(stuck.doc.winners.map((w) => w.login)).toEqual(["solo"]);
});

test("drawRaffle arms a pending claim pointing at the new winner", () => {
	const doc = poolOf(["a", "b"]);
	const { doc: next, winner } = drawRaffle(doc, 100, () => 0); // picks "a"
	expect(winner!.login).toBe("a");
	const pc = next.pendingClaim!;
	expect(pc).toMatchObject({ login: "a", name: "a", drawnAt: 100, announced: false });
	// winnerId resolves to the freshly-added winner row
	expect(pc.winnerId).toBe(next.winners.find((w) => w.login === "a")!.id);
	expect(pc.timedOut).toBeUndefined();
});

test("an empty-pool draw leaves no pending claim", () => {
	const { doc, winner } = drawRaffle(defaultGiveawayDoc(), 5, () => 0);
	expect(winner).toBeNull();
	expect(doc.pendingClaim).toBeNull();
});

test("rerollRaffle re-arms the pending claim for the new winner", () => {
	const doc = poolOf(["a", "b"]);
	const drawn = drawRaffle(doc, 100, () => 0); // "a"
	const id = drawn.doc.winners[0]!.id;
	const re = rerollRaffle(drawn.doc, id, 200, () => 0); // → "b"
	expect(re.winner!.login).toBe("b");
	expect(re.doc.pendingClaim).toMatchObject({ login: "b", drawnAt: 200, announced: false });
	expect(re.doc.pendingClaim!.winnerId).toBe(re.doc.winners.find((w) => w.login === "b")!.id);
});

test("claimPending marks claimed for the matching login within the window", () => {
	const drawn = drawRaffle(poolOf(["a", "b"]), 100, () => 0); // pending "a"
	// wrong login → no claim, doc untouched
	const wrong = claimPending(drawn.doc, "b", 100 + 1000);
	expect(wrong.claimed).toBe(false);
	expect(wrong.doc.pendingClaim).not.toBeNull();
	// right login, in-window (login is lowercased) → claimed, pending cleared
	const ok = claimPending(drawn.doc, "A", 100 + CLAIM_WINDOW_MS);
	expect(ok.claimed).toBe(true);
	expect(ok.doc.pendingClaim).toBeNull();
});

test("claimPending rejects a claim after the window lapses", () => {
	const drawn = drawRaffle(poolOf(["a", "b"]), 100, () => 0);
	const late = claimPending(drawn.doc, "a", 100 + CLAIM_WINDOW_MS + 1);
	expect(late.claimed).toBe(false);
	expect(late.doc.pendingClaim).not.toBeNull(); // still pending → operator can redraw
});

test("claimPending is a no-op when nothing is pending", () => {
	const { claimed, doc } = claimPending(defaultGiveawayDoc(), "a", 0);
	expect(claimed).toBe(false);
	expect(doc.pendingClaim).toBeNull();
});

test("expirePending flips only once the window has lapsed", () => {
	const drawn = drawRaffle(poolOf(["a", "b"]), 100, () => 0);
	expect(expirePending(drawn.doc, 100 + CLAIM_WINDOW_MS)).toBe(false); // exactly at edge
	expect(expirePending(drawn.doc, 100 + CLAIM_WINDOW_MS + 1)).toBe(true);
	expect(expirePending(defaultGiveawayDoc(), 1e9)).toBe(false); // nothing pending
});

test("removeWinner clears a pending claim that gated the removed winner", () => {
	const drawn = drawRaffle(poolOf(["a", "b"]), 100, () => 0); // pending "a"
	const id = drawn.doc.pendingClaim!.winnerId;
	const gone = removeWinner(drawn.doc, id);
	expect(gone.winners.some((w) => w.id === id)).toBe(false);
	expect(gone.pendingClaim).toBeNull(); // no dangling claim
});

test("removeWinner keeps a pending claim that gated a different winner", () => {
	let doc = poolOf(["a", "b", "c"]);
	doc = addWinner(doc, { login: "z", name: "Z", source: "gift" }, 1);
	const giftId = doc.winners.find((w) => w.login === "z")!.id;
	const drawn = drawRaffle(doc, 100, () => 0); // pending raffle "a"
	const gone = removeWinner(drawn.doc, giftId); // remove the unrelated gift winner
	expect(gone.pendingClaim).not.toBeNull();
	expect(gone.pendingClaim!.login).toBe("a");
});

test("resetPool empties entrants + pending claim but keeps the round + winners", () => {
	let doc = poolOf(["a", "b"]);
	doc = addWinner(doc, { login: "z", name: "Z", source: "gift" }, 1);
	const drawn = drawRaffle(doc, 100, () => 0); // pending "a", raffle + gift winners present

	const cleared = resetPool(drawn.doc);
	expect(cleared.entrants).toHaveLength(0);
	expect(cleared.pendingClaim).toBeNull();
	expect(cleared.startedAt).toBe(0); // round still started
	expect(cleared.config.open).toBe(true); // entries stay open for a fresh wave
	expect(cleared.winners.map((w) => w.login).sort()).toEqual(["a", "z"]); // winners kept
});
