import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SETTINGS,
  MAX_PREFIX_LENGTH,
  MAX_RULES,
  SettingsValidationError,
  normalizePrefix,
  normalizeSettings,
} from "../src/core/settings.js";

function prefixWithNormalizedLength(targetLength) {
  const base = "https://example.com/";
  const remaining = targetLength - base.length;
  const unicodeCharacters = Math.floor(remaining / 6);
  const asciiCharacters = remaining - unicodeCharacters * 6;
  const raw = `${base}${"é".repeat(unicodeCharacters)}${"a".repeat(asciiCharacters)}`;
  assert.equal(new URL(raw).href.length, targetLength);
  return raw;
}

test("normalizes settings while preserving rule order and identifiers", () => {
  const settings = normalizeSettings({
    rules: [
      { id: "first", label: " Work ", prefix: "HTTPS://Example.COM:443/app", enabled: true },
      { id: "second", label: "Mail", prefix: "https://mail.example.com", enabled: false },
    ],
    singletonScope: "profile",
    organizeTabs: false,
  });

  assert.deepEqual(settings, {
    schemaVersion: 1,
    rules: [
      { id: "first", label: "Work", prefix: "https://example.com/app", enabled: true },
      { id: "second", label: "Mail", prefix: "https://mail.example.com/", enabled: false },
    ],
    singletonScope: "profile",
    organizeTabs: false,
  });
});

test("supplies safe defaults", () => {
  assert.deepEqual(normalizeSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(DEFAULT_SETTINGS.rules, [
    {
      id: "default-gmail",
      label: "Gmail",
      prefix: "https://mail.google.com/",
      enabled: true,
    },
    {
      id: "default-google-calendar",
      label: "Google Calendar",
      prefix: "https://calendar.google.com/",
      enabled: true,
    },
  ]);
});

for (const [name, prefix, expected] of [
  ["relative URL", "/app", "absolute"],
  ["unsupported scheme", "file:///tmp/app", "HTTP"],
  [
    "credentials",
    ["https://", "user:", "placeholder", "@example.com/"].join(""),
    "credentials",
  ],
  ["fragment", "https://example.com/app#view", "fragment"],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => normalizePrefix(prefix), (error) => {
      assert.ok(error instanceof SettingsValidationError);
      assert.match(error.message, new RegExp(expected, "i"));
      return true;
    });
  });
}

test("rejects duplicate normalized prefixes", () => {
  assert.throws(
    () =>
      normalizeSettings({
        rules: [
          { id: "a", prefix: "https://example.com", label: "A" },
          { id: "b", prefix: "https://EXAMPLE.com:443/", label: "B" },
        ],
      }),
    /unique/i,
  );
});

test("accepts a normalized prefix exactly at the 2,048 character boundary", () => {
  const prefix = `${"https://example.com/"}${"a".repeat(MAX_PREFIX_LENGTH - "https://example.com/".length)}`;
  assert.equal(prefix.length, MAX_PREFIX_LENGTH);
  assert.equal(normalizePrefix(prefix).length, MAX_PREFIX_LENGTH);
});

test("rejects a normalized prefix of 2,049 characters even when raw input is shorter", () => {
  const raw = prefixWithNormalizedLength(MAX_PREFIX_LENGTH + 1);
  assert.ok(raw.length < MAX_PREFIX_LENGTH);
  assert.throws(() => normalizePrefix(raw), /Normalized prefix must be 2048/i);
});

test("accounts for Unicode percent-encoding expansion in the normalized limit", () => {
  const accepted = prefixWithNormalizedLength(MAX_PREFIX_LENGTH);
  const rejected = `${accepted}é`;
  assert.ok(accepted.length < MAX_PREFIX_LENGTH);
  assert.equal(normalizePrefix(accepted).length, MAX_PREFIX_LENGTH);
  assert.throws(() => normalizePrefix(rejected), /Normalized prefix must be 2048/i);
});

for (const [name, prefix] of [
  ["hostname wildcard", "https://*.example.com/"],
  ["path wildcard", "https://example.com/app/*"],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => normalizePrefix(prefix), /wildcards/i);
  });
}

test("enforces the rule limit", () => {
  const rules = Array.from({ length: MAX_RULES + 1 }, (_, index) => ({
    id: `rule-${index}`,
    prefix: `https://example.com/${index}`,
    label: `Rule ${index}`,
  }));
  assert.throws(() => normalizeSettings({ rules }), /at most 100/i);
});
