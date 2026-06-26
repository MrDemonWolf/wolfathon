import { expect, test } from "bun:test";

import {
	applyGiveawayEvent,
	defaultGiveawayDoc,
	drawRaffle,
	parseGiveawayEvent,
	qualifyingGifters,
} from "./giveaway";

test("gifts accumulate and cross the threshold in order", () => {
	let doc = defaultGiveawayDoc(); // threshold 5
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
