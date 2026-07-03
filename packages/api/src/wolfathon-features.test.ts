import { expect, test } from "bun:test";

import { buildGiftAnnouncement, giveawayValue, mergeGiftBatch } from "./bot";
import { defaultGiveawayDoc, normalizeTosUrl } from "./giveaway";

test("gift batch merges a burst by login and builds one announcement line", () => {
	let batch = mergeGiftBatch(null, { login: "nate", name: "Nate" }, 10, 1000);
	// same gifter mid-train → counted once as a person, subs still sum
	batch = mergeGiftBatch(batch, { login: "NATE", name: "Nate" }, 2, 1500);
	batch = mergeGiftBatch(batch, { login: "sam", name: "Sam" }, 3, 1800);
	expect(batch.subs).toBe(15);
	expect(batch.gifters.length).toBe(2);
	expect(batch.firstAt).toBe(1000); // sticky

	// many gifters → counted
	expect(buildGiftAnnouncement(batch, 30)).toBe(
		"🎁 15 subs gifted by 2 people · +30m on the clock!",
	);
	// single gifter → named
	const solo = mergeGiftBatch(null, { login: "nate", name: "Nate" }, 1, 0);
	expect(buildGiftAnnouncement(solo, 20)).toBe("🎁 Nate gifted 1 sub · +20m on the clock!");
});

test("giveawayValue returns the TOS link or a nudge", () => {
	const doc = defaultGiveawayDoc();
	expect(giveawayValue(doc)).toContain("no rules link set");
	doc.config.tosUrl = "https://gist.github.com/x";
	expect(giveawayValue(doc)).toBe("https://gist.github.com/x");
});

test("normalizeTosUrl adds https to a bare domain and keeps an explicit scheme", () => {
	expect(normalizeTosUrl("  gist.github.com/x  ")).toBe("https://gist.github.com/x");
	expect(normalizeTosUrl("http://example.com")).toBe("http://example.com");
	expect(normalizeTosUrl("")).toBe("");
});
