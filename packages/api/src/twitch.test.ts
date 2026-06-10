import { expect, test } from "bun:test";

import { parseEvent } from "./twitch";

test("a gifted recipient's subscribe is ignored (counted via the gift event)", () => {
  expect(parseEvent("channel.subscribe", { is_gift: true, tier: "1000" })).toBeNull();
});

test("a new sub maps the tier", () => {
  expect(parseEvent("channel.subscribe", { is_gift: false, tier: "3000" })).toEqual({
    kind: "sub",
    tier: "t3",
  });
});

test("a gift counts the total", () => {
  expect(parseEvent("channel.subscription.gift", { tier: "1000", total: 5 })).toEqual({
    kind: "gift",
    tier: "t1",
    count: 5,
  });
});

test("a cheer carries the bit count", () => {
  expect(parseEvent("channel.cheer", { bits: 300 })).toEqual({ kind: "bits", bits: 300 });
});

test("unknown events are ignored", () => {
  expect(parseEvent("channel.follow", {})).toBeNull();
});
