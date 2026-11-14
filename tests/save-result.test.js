import assert from "node:assert/strict";
import test from "node:test";

import { describeSaveResult } from "../src/options/save-result.js";

test("describes a fully successful settings save", () => {
  assert.deepEqual(describeSaveResult({ settings: {}, warning: null }, "Scope updated."), {
    kind: "success",
    message: "Scope updated.",
  });
});

test("describes saved settings with a reconciliation warning and recovery action", () => {
  const status = describeSaveResult({
    settings: {},
    warning: { message: "Tabs are unavailable" },
  });
  assert.equal(status.kind, "warning");
  assert.match(status.message, /^Settings saved, but tabs could not be reconciled:/);
  assert.match(status.message, /Reconcile now/);
});
