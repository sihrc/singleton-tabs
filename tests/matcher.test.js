import assert from "node:assert/strict";
import test from "node:test";

import { matchRuleForUrl } from "../src/core/matcher.js";

const rules = [
  { id: "broad", prefix: "https://example.com/", enabled: true },
  { id: "disabled", prefix: "https://example.com/app/admin", enabled: false },
  { id: "specific", prefix: "https://example.com/app", enabled: true },
];

test("selects the longest enabled matching prefix", () => {
  assert.equal(matchRuleForUrl("https://example.com/app/inbox", rules).rule.id, "specific");
});

test("uses rule order for equal-length ties", () => {
  const tied = [
    { id: "first", prefix: "https://example.com/app", enabled: true },
    { id: "second", prefix: "https://example.com/app", enabled: true },
  ];
  assert.equal(matchRuleForUrl("https://example.com/app", tied).rule.id, "first");
});

test("ignores unsupported and unmatched URLs", () => {
  assert.equal(matchRuleForUrl("chrome://extensions", rules), null);
  assert.equal(matchRuleForUrl("https://other.example.com/", rules), null);
});
