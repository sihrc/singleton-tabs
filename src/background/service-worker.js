import { createCoordinator } from "./coordinator.js";
import { createChromeAdapter } from "../platform/chrome-adapter.js";

const coordinator = createCoordinator(createChromeAdapter(chrome));

function reconcile(options) {
  coordinator.reconcile(options).catch((error) => {
    console.warn("Singleton Tabs reconciliation failed:", error);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  reconcile({ reason: "installed" });
});

chrome.runtime.onStartup.addListener(() => {
  reconcile({ reason: "startup" });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (typeof changeInfo.url === "string") {
    reconcile({ triggerTabId: tabId, reason: "tab-url" });
  }
});

chrome.tabs.onRemoved.addListener(() => {
  reconcile({ reason: "tab-removed" });
});

chrome.tabs.onAttached.addListener(() => {
  reconcile({ reason: "tab-attached" });
});

chrome.tabs.onDetached.addListener(() => {
  reconcile({ reason: "tab-detached" });
});

chrome.tabs.onMoved.addListener(() => {
  reconcile({ reason: "tab-moved" });
});

chrome.tabs.onReplaced.addListener(() => {
  reconcile({ reason: "tab-replaced" });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.settings) {
    reconcile({ reason: "settings-storage-change" });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  coordinator
    .handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      sendResponse({ ok: false, error: error?.message || String(error) });
    });
  return true;
});
