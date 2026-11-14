import assert from "node:assert/strict";
import test from "node:test";

import { createChromeAdapter } from "../src/platform/chrome-adapter.js";

function fakeChrome(move) {
  return {
    storage: {
      local: { get: async () => ({}), set: async () => undefined },
      session: { get: async () => ({}), set: async () => undefined },
    },
    tabs: {
      query: async () => [],
      get: async () => null,
      duplicate: async () => null,
      update: async () => undefined,
      remove: async () => undefined,
      move,
    },
    windows: { update: async () => undefined },
    runtime: { openOptionsPage: async () => undefined },
  };
}

test("retries tab-drag move failures and then succeeds", async () => {
  let attempts = 0;
  const sleeps = [];
  const adapter = createChromeAdapter(
    fakeChrome(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("Tabs cannot be edited right now (user may be dragging a tab).");
    }),
    { sleep: async (delay) => sleeps.push(delay), maxMoveAttempts: 3 },
  );
  await adapter.moveTab(1, 0);
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [50, 100]);
});

test("throws after bounded tab-drag retries are exhausted", async () => {
  let attempts = 0;
  const adapter = createChromeAdapter(
    fakeChrome(async () => {
      attempts += 1;
      throw new Error("Tabs cannot be edited right now (user may be dragging a tab).");
    }),
    { sleep: async () => undefined, maxMoveAttempts: 3 },
  );
  await assert.rejects(() => adapter.moveTab(1, 0), /dragging/);
  assert.equal(attempts, 3);
});

test("does not retry unrelated adapter failures", async () => {
  let attempts = 0;
  const adapter = createChromeAdapter(fakeChrome(async () => {
    attempts += 1;
    throw new Error("No tab with id: 1");
  }));
  await assert.rejects(() => adapter.moveTab(1, 0), /No tab/);
  assert.equal(attempts, 1);
});
