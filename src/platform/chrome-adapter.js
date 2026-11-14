import { DEFAULT_SETTINGS } from "../core/settings.js";
import { emptyRuntimeState } from "../core/runtime-state.js";

const SETTINGS_KEY = "settings";
const RUNTIME_KEY = "runtimeState";
const DRAG_ERROR = "Tabs cannot be edited right now";

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createChromeAdapter(
  chromeApi,
  { sleep = defaultSleep, maxMoveAttempts = 3 } = {},
) {
  return {
    async getSettings() {
      const stored = await chromeApi.storage.local.get(SETTINGS_KEY);
      return stored[SETTINGS_KEY] || DEFAULT_SETTINGS;
    },

    async setSettings(settings) {
      await chromeApi.storage.local.set({ [SETTINGS_KEY]: settings });
    },

    async getRuntimeState() {
      const stored = await chromeApi.storage.session.get(RUNTIME_KEY);
      return stored[RUNTIME_KEY] || emptyRuntimeState();
    },

    async setRuntimeState(runtimeState) {
      await chromeApi.storage.session.set({ [RUNTIME_KEY]: runtimeState });
    },

    async queryNormalTabs() {
      return chromeApi.tabs.query({ windowType: "normal" });
    },

    async getActiveTab() {
      const [tab] = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
      return tab || null;
    },

    async getTab(tabId) {
      return chromeApi.tabs.get(tabId);
    },

    async duplicateTab(tabId) {
      const duplicate = await chromeApi.tabs.duplicate(tabId);
      if (!duplicate?.id) {
        throw new Error("Chrome did not return the duplicated tab.");
      }
      return duplicate;
    },

    async activateTab(tabId) {
      await chromeApi.tabs.update(tabId, { active: true });
    },

    async focusWindow(windowId) {
      await chromeApi.windows.update(windowId, { focused: true });
    },

    async removeTabs(tabIds) {
      if (tabIds.length) {
        await chromeApi.tabs.remove(tabIds);
      }
    },

    async moveTab(tabId, index) {
      let lastError;
      for (let attempt = 1; attempt <= maxMoveAttempts; attempt += 1) {
        try {
          await chromeApi.tabs.move(tabId, { index });
          return;
        } catch (error) {
          lastError = error;
          if (!String(error?.message || error).includes(DRAG_ERROR) || attempt === maxMoveAttempts) {
            throw error;
          }
          await sleep(50 * attempt);
        }
      }
      throw lastError;
    },

    async openOptionsPage() {
      await chromeApi.runtime.openOptionsPage();
    },
  };
}
