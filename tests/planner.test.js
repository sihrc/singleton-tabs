import assert from "node:assert/strict";
import test from "node:test";

import { planReconciliation } from "../src/core/planner.js";
import { emptyRuntimeState, scopeKey } from "../src/core/runtime-state.js";
import { normalizeSettings } from "../src/core/settings.js";

function rule(id, prefix, enabled = true) {
  return { id, label: id.toUpperCase(), prefix, enabled };
}

function tab(id, windowId, index, url, extra = {}) {
  return {
    id,
    windowId,
    index,
    url,
    incognito: false,
    windowType: "normal",
    pinned: false,
    groupId: -1,
    ...extra,
  };
}

function settings(rules, values = {}) {
  return normalizeSettings({ rules, ...values });
}

function applyActions(tabs, actions) {
  const removed = new Set(actions.removeTabIds);
  const byWindow = new Map();
  for (const item of tabs.filter((candidate) => !removed.has(candidate.id))) {
    if (!byWindow.has(item.windowId)) byWindow.set(item.windowId, []);
    byWindow.get(item.windowId).push({ ...item });
  }
  for (const items of byWindow.values()) items.sort((a, b) => a.index - b.index);
  for (const move of actions.moves) {
    for (const items of byWindow.values()) {
      const current = items.findIndex((candidate) => candidate.id === move.tabId);
      if (current === -1) continue;
      const [item] = items.splice(current, 1);
      items.splice(move.index, 0, item);
    }
  }
  return [...byWindow.values()].flatMap((items) =>
    items.map((item, index) => ({ ...item, index })),
  );
}

test("creates one canonical per window in window scope", () => {
  const configured = settings([rule("app", "https://app.example.com/")]);
  const result = planReconciliation({
    tabs: [
      tab(1, 10, 0, "https://app.example.com/a"),
      tab(2, 20, 0, "https://app.example.com/b"),
    ],
    settings: configured,
    runtimeState: emptyRuntimeState(),
  });
  assert.deepEqual(result.actions.removeTabIds, []);
  assert.equal(result.state.canonicalByScope[scopeKey("app", "window", 10)], 1);
  assert.equal(result.state.canonicalByScope[scopeKey("app", "window", 20)], 2);
});

test("creates one canonical across windows in profile scope", () => {
  const configured = settings([rule("app", "https://app.example.com/")], {
    singletonScope: "profile",
  });
  const result = planReconciliation({
    tabs: [
      tab(1, 10, 0, "https://app.example.com/a"),
      tab(2, 20, 0, "https://app.example.com/b"),
    ],
    settings: configured,
    runtimeState: emptyRuntimeState(),
  });
  assert.equal(result.state.canonicalByScope["app:profile"], 1);
  assert.deepEqual(result.actions.removeTabIds, [2]);
});

test("prefers an existing canonical over the triggering tab and focuses its window", () => {
  const configured = settings([rule("app", "https://app.example.com/")], {
    singletonScope: "profile",
  });
  const state = emptyRuntimeState();
  state.canonicalByScope["app:profile"] = 5;
  const result = planReconciliation({
    tabs: [
      tab(2, 10, 0, "https://app.example.com/new"),
      tab(5, 20, 4, "https://app.example.com/existing"),
    ],
    settings: configured,
    runtimeState: state,
    triggerTabId: 2,
  });
  assert.deepEqual(result.actions.focus, { tabId: 5, windowId: 20, focusWindow: true });
  assert.deepEqual(result.actions.removeTabIds, [2]);
});

test("retains an intentional duplicate and removes its exemption after it leaves the rule", () => {
  const configured = settings([rule("app", "https://app.example.com/")]);
  const state = emptyRuntimeState();
  state.canonicalByScope["app:window:10"] = 1;
  state.duplicateExemptions[2] = { ruleId: "app" };
  const kept = planReconciliation({
    tabs: [
      tab(1, 10, 0, "https://app.example.com/a"),
      tab(2, 10, 1, "https://app.example.com/b"),
    ],
    settings: configured,
    runtimeState: state,
  });
  assert.deepEqual(kept.actions.removeTabIds, []);
  assert.deepEqual(kept.state.duplicateExemptions[2], { ruleId: "app" });

  const left = planReconciliation({
    tabs: [
      tab(1, 10, 0, "https://app.example.com/a"),
      tab(2, 10, 1, "https://other.example.com/"),
    ],
    settings: configured,
    runtimeState: kept.state,
  });
  assert.equal(left.state.duplicateExemptions[2], undefined);
});

test("promotes an exempt duplicate when the canonical closes", () => {
  const configured = settings([rule("app", "https://app.example.com/")]);
  const state = emptyRuntimeState();
  state.canonicalByScope["app:window:10"] = 1;
  state.duplicateExemptions[2] = { ruleId: "app" };
  const result = planReconciliation({
    tabs: [tab(2, 10, 0, "https://app.example.com/b")],
    settings: configured,
    runtimeState: state,
  });
  assert.equal(result.state.canonicalByScope["app:window:10"], 2);
  assert.equal(result.state.duplicateExemptions[2], undefined);
});

test("reconstructs stale canonical state from the current snapshot", () => {
  const configured = settings([rule("app", "https://app.example.com/")]);
  const state = emptyRuntimeState();
  state.canonicalByScope["app:window:10"] = 999;
  const result = planReconciliation({
    tabs: [tab(4, 10, 0, "https://app.example.com/")],
    settings: configured,
    runtimeState: state,
  });
  assert.equal(result.state.canonicalByScope["app:window:10"], 4);
});

test("serial planning retains one canonical from simultaneous duplicate tabs", () => {
  const configured = settings([rule("app", "https://app.example.com/")]);
  const result = planReconciliation({
    tabs: [
      tab(1, 10, 0, "https://app.example.com/a"),
      tab(2, 10, 1, "https://app.example.com/b"),
      tab(3, 10, 2, "https://app.example.com/c"),
    ],
    settings: configured,
    runtimeState: emptyRuntimeState(),
  });
  assert.equal(result.state.canonicalByScope["app:window:10"], 1);
  assert.deepEqual(result.actions.removeTabIds, [2, 3]);
});

test("organizes pinned and unpinned canonicals, skips grouped tabs, and is idempotent", () => {
  const configured = settings([
    rule("a", "https://a.example.com/"),
    rule("b", "https://b.example.com/"),
    rule("c", "https://c.example.com/"),
    rule("d", "https://d.example.com/"),
    rule("e", "https://e.example.com/"),
  ]);
  const tabs = [
    tab(10, 1, 0, "https://ordinary.example.com/", { pinned: true }),
    tab(12, 1, 1, "https://b.example.com/", { pinned: true }),
    tab(11, 1, 2, "https://a.example.com/", { pinned: true }),
    tab(20, 1, 3, "https://ordinary.example.com/two"),
    tab(22, 1, 4, "https://d.example.com/"),
    tab(21, 1, 5, "https://c.example.com/"),
    tab(30, 1, 6, "https://e.example.com/", { groupId: 7 }),
  ];
  const first = planReconciliation({
    tabs,
    settings: configured,
    runtimeState: emptyRuntimeState(),
  });
  assert.ok(first.actions.moves.some((move) => move.tabId === 11 && move.index === 0));
  assert.ok(first.actions.moves.some((move) => move.tabId === 21 && move.index === 3));
  assert.ok(!first.actions.moves.some((move) => move.tabId === 30));

  const second = planReconciliation({
    tabs: applyActions(tabs, first.actions),
    settings: configured,
    runtimeState: first.state,
  });
  assert.deepEqual(second.actions.moves, []);
});

test("ignores incognito and non-normal windows", () => {
  const configured = settings([rule("app", "https://app.example.com/")]);
  const result = planReconciliation({
    tabs: [
      tab(1, 1, 0, "https://app.example.com/", { incognito: true }),
      tab(2, 2, 0, "https://app.example.com/", { windowType: "popup" }),
    ],
    settings: configured,
    runtimeState: emptyRuntimeState(),
  });
  assert.deepEqual(result.state.canonicalByScope, {});
});
