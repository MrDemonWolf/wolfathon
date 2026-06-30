import { expect, test } from "bun:test";

import {
	buildAutoSpinAnnouncement,
	buildGiftAnnouncement,
	giveawayValue,
	mergeGiftBatch,
} from "./bot";
import { defaultGiveawayDoc, normalizeTosUrl } from "./giveaway";
import { clampScale } from "./theme";
import { clampSpinEvery, defaultWheelDoc, setWheelConfig, shouldAutoSpin } from "./wheel";

test("shouldAutoSpin fires once per crossed multiple, even when a gift vaults several", () => {
	// off
	expect(shouldAutoSpin(0, 0, 5)).toBe(false);
	// plain crossing 9 → 10 with N=10
	expect(shouldAutoSpin(10, 9, 10)).toBe(true);
	// no crossing 10 → 19
	expect(shouldAutoSpin(10, 10, 19)).toBe(false);
	// a +25 gift from 9 → 34 vaults 10/20/30 but still trips exactly one spin
	expect(shouldAutoSpin(10, 9, 34)).toBe(true);
	// going backwards / equal never spins
	expect(shouldAutoSpin(10, 20, 20)).toBe(false);
});

test("clampSpinEvery + setWheelConfig clamp the cadence to [0, MAX]", () => {
	expect(clampSpinEvery(-3)).toBe(0);
	expect(clampSpinEvery(7.6)).toBe(8); // rounded
	expect(clampSpinEvery(99_999)).toBe(1000);
	expect(clampSpinEvery("nope")).toBe(10); // default
	const doc = setWheelConfig(defaultWheelDoc(), { spinEvery: -1 });
	expect(doc.config.spinEvery).toBe(0);
});

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

test("auto-spin announcement names the dare when known", () => {
	expect(buildAutoSpinAnnouncement(10, "10 push-ups")).toBe(
		"🎡 10 subs — spinning the Howlwheel! Landed on: 10 push-ups",
	);
	expect(buildAutoSpinAnnouncement(20, null)).toBe("🎡 20 subs — spinning the Howlwheel!");
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

test("clampScale keeps overlay sizes in range and defaults junk to 1", () => {
	expect(clampScale(1)).toBe(1);
	expect(clampScale(0.1)).toBe(0.5);
	expect(clampScale(9)).toBe(1.6);
	expect(clampScale("x")).toBe(1);
});
