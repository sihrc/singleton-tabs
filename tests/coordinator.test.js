import assert from "node:assert/strict";
import test from "node:test";

import { createCoordinator } from "../src/background/coordinator.js";
import { emptyRuntimeState } from "../src/core/runtime-state.js";
import { normalizeSettings } from "../src/core/settings.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function managedSettings(values = {}) {
  return normalizeSettings({
    rules: [{ id: "app", label: "App", prefix: "https://app.example.com/", enabled: true }],
    organizeTabs: false,
    ...values,
  });
}

function tab(id, index, url = `https://app.example.com/${id}`, windowId = 10) {
  return {
    id,
    index,
    windowId,
    url,
    incognito: false,
    windowType: "normal",
    pinned: false,
    groupId: -1,
  };
}

class FakeAdapter {
  constructor({ tabs = [], settings = managedSettings(), runtimeState = emptyRuntimeState() } = {}) {
    this.tabs = tabs.map(clone);
    this.settings = clone(settings);
    this.runtimeState = clone(runtimeState);
    this.log = [];
    this.nextTabId = Math.max(0, ...tabs.map((item) => item.id)) + 1;
  }

  async getSettings() {
    this.log.push("get-settings");
    return clone(this.settings);
  }

  async setSettings(value) {
    this.settings = clone(value);
    this.log.push("set-settings");
  }

  async getRuntimeState() {
    this.log.push("get-runtime");
    return clone(this.runtimeState);
  }

  async setRuntimeState(value) {
    this.runtimeState = clone(value);
    const exemptionIds = Object.keys(value.duplicateExemptions || {});
    this.log.push(`set-runtime:${exemptionIds.join(",")}`);
  }

  async queryNormalTabs() {
    this.log.push("query-tabs");
    return this.tabs.map(clone);
  }

  async getActiveTab() {
    return clone(this.tabs[0] || null);
  }

  async getTab(tabId) {
    return clone(this.tabs.find((item) => item.id === tabId) || null);
  }

  async duplicateTab(tabId) {
    this.log.push(`duplicate:${tabId}`);
    const source = this.tabs.find((item) => item.id === tabId);
    const duplicate = { ...clone(source), id: this.nextTabId, index: source.index + 1 };
    this.nextTabId += 1;
    this.tabs.push(duplicate);
    return clone(duplicate);
  }

  async activateTab(tabId) {
    this.log.push(`activate:${tabId}`);
  }

  async focusWindow(windowId) {
    this.log.push(`focus-window:${windowId}`);
  }

  async removeTabs(tabIds) {
    this.log.push(`remove:${tabIds.join(",")}`);
    const removed = new Set(tabIds);
    this.tabs = this.tabs.filter((item) => !removed.has(item.id));
  }

  async moveTab(tabId, index) {
    this.log.push(`move:${tabId}:${index}`);
  }

  async openOptionsPage() {
    this.log.push("open-options");
  }
}

test("rebuilds a stale canonical from a fresh tab snapshot", async () => {
  const runtimeState = emptyRuntimeState();
  runtimeState.canonicalByScope["app:window:10"] = 999;
  const adapter = new FakeAdapter({ tabs: [tab(1, 0)], runtimeState });
  const coordinator = createCoordinator(adapter);

  await coordinator.reconcile({ reason: "test" });

  assert.equal(adapter.runtimeState.canonicalByScope["app:window:10"], 1);
  assert.equal(adapter.runtimeState.lastAction.type, "reconcile");
});

test("a fresh coordinator instance relies on stored session state instead of globals", async () => {
  const state = emptyRuntimeState();
  state.canonicalByScope["app:window:10"] = 1;
  const adapter = new FakeAdapter({ tabs: [tab(1, 0), tab(2, 1)], runtimeState: state });

  const restartedCoordinator = createCoordinator(adapter);
  await restartedCoordinator.reconcile({ triggerTabId: 2, reason: "worker-restart" });

  assert.deepEqual(adapter.tabs.map((item) => item.id), [1]);
  assert.ok(adapter.log.includes("activate:1"));
});

test("serializes duplicate exemption persistence before queued update reconciliation", async () => {
  const state = emptyRuntimeState();
  state.canonicalByScope["app:window:10"] = 1;
  const adapter = new FakeAdapter({ tabs: [tab(1, 0)], runtimeState: state });
  const coordinator = createCoordinator(adapter);

  const duplicate = coordinator.duplicate(1);
  const update = coordinator.reconcile({ triggerTabId: 2, reason: "tab-url" });
  await Promise.all([duplicate, update]);

  const exemptionWrite = adapter.log.findIndex((entry) => entry === "set-runtime:2");
  const queryAfterDuplicate = adapter.log.findIndex((entry, index) => index > exemptionWrite && entry === "query-tabs");
  assert.ok(exemptionWrite >= 0);
  assert.ok(queryAfterDuplicate > exemptionWrite);
  assert.deepEqual(adapter.tabs.map((item) => item.id).sort(), [1, 2]);
  assert.deepEqual(adapter.runtimeState.duplicateExemptions[2], { ruleId: "app" });
});

test("focuses the canonical tab before closing a duplicate attempt", async () => {
  const state = emptyRuntimeState();
  state.canonicalByScope["app:window:10"] = 1;
  const adapter = new FakeAdapter({ tabs: [tab(1, 0), tab(2, 1)], runtimeState: state });
  const coordinator = createCoordinator(adapter);

  await coordinator.reconcile({ triggerTabId: 2, reason: "tab-url" });

  assert.ok(adapter.log.indexOf("activate:1") < adapter.log.indexOf("remove:2"));
  assert.deepEqual(adapter.tabs.map((item) => item.id), [1]);
});

test("profile scope focuses the canonical window before activating and closing", async () => {
  const state = emptyRuntimeState();
  state.canonicalByScope["app:profile"] = 1;
  const adapter = new FakeAdapter({
    tabs: [tab(1, 0, undefined, 20), tab(2, 0, undefined, 10)],
    runtimeState: state,
    settings: managedSettings({ singletonScope: "profile" }),
  });
  const coordinator = createCoordinator(adapter);

  await coordinator.reconcile({ triggerTabId: 2, reason: "tab-url" });

  assert.ok(adapter.log.indexOf("focus-window:20") < adapter.log.indexOf("activate:1"));
  assert.ok(adapter.log.indexOf("activate:1") < adapter.log.indexOf("remove:2"));
});

test("save-settings validates and reconciles atomically through the queue", async () => {
  const adapter = new FakeAdapter({ tabs: [tab(1, 0)] });
  const coordinator = createCoordinator(adapter);
  const saved = await coordinator.saveSettings({
    rules: [{ id: "new", label: "New", prefix: "https://new.example.com/" }],
    singletonScope: "profile",
    organizeTabs: true,
  });
  assert.equal(saved.settings.rules[0].id, "new");
  assert.equal(saved.warning, null);
  assert.ok(adapter.log.indexOf("set-settings") < adapter.log.indexOf("query-tabs"));
});

test("save-settings returns partial success when post-save reconciliation fails", async () => {
  const adapter = new FakeAdapter({ tabs: [tab(1, 0)] });
  adapter.queryNormalTabs = async () => {
    adapter.log.push("query-tabs:failed");
    throw new Error("Chrome tabs are temporarily unavailable");
  };
  const coordinator = createCoordinator(adapter);

  const result = await coordinator.saveSettings({
    rules: [{ id: "saved", label: "Saved", prefix: "https://saved.example.com/" }],
    singletonScope: "window",
    organizeTabs: true,
  });

  assert.equal(adapter.settings.rules[0].id, "saved");
  assert.equal(result.settings.rules[0].id, "saved");
  assert.deepEqual(result.warning, {
    operation: "settings-reconcile",
    message: "Chrome tabs are temporarily unavailable",
  });
  assert.equal(adapter.runtimeState.lastError.operation, "settings-change");
});
