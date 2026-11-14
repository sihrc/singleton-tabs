import { matchRuleForUrl } from "../core/matcher.js";
import { planReconciliation } from "../core/planner.js";
import { normalizeRuntimeState, scopeKey } from "../core/runtime-state.js";
import { normalizeSettings } from "../core/settings.js";

function nowRecord(type, details = {}) {
  return { type, ...details, at: new Date().toISOString() };
}

export function createCoordinator(adapter) {
  let queue = Promise.resolve();

  function enqueue(task) {
    const result = queue.then(task, task);
    queue = result.catch(() => undefined);
    return result;
  }

  async function recordError(operation, error) {
    const state = normalizeRuntimeState(await adapter.getRuntimeState());
    state.lastError = nowRecord("error", {
      operation,
      message: error?.message || String(error),
    });
    await adapter.setRuntimeState(state);
  }

  async function executePlan(plan, reason) {
    await adapter.setRuntimeState(plan.state);
    if (plan.actions.focus) {
      if (plan.actions.focus.focusWindow) {
        await adapter.focusWindow(plan.actions.focus.windowId);
      }
      await adapter.activateTab(plan.actions.focus.tabId);
    }
    await adapter.removeTabs(plan.actions.removeTabIds);
    for (const move of plan.actions.moves) {
      await adapter.moveTab(move.tabId, move.index);
    }

    const finalState = normalizeRuntimeState(await adapter.getRuntimeState());
    finalState.lastAction = nowRecord("reconcile", {
      reason,
      removed: plan.actions.removeTabIds.length,
      moved: plan.actions.moves.length,
    });
    finalState.lastError = null;
    await adapter.setRuntimeState(finalState);
    return plan;
  }

  async function reconcileNow({ triggerTabId = null, reason = "manual" } = {}) {
    try {
      const settings = normalizeSettings(await adapter.getSettings());
      const runtimeState = normalizeRuntimeState(await adapter.getRuntimeState());
      const tabs = await adapter.queryNormalTabs();
      const plan = planReconciliation({ tabs, settings, runtimeState, triggerTabId });
      return await executePlan(plan, reason);
    } catch (error) {
      await recordError(reason, error);
      throw error;
    }
  }

  async function duplicateNow(tabId = null) {
    try {
      const settings = normalizeSettings(await adapter.getSettings());
      const source = tabId === null ? await adapter.getActiveTab() : await adapter.getTab(tabId);
      const match = source && matchRuleForUrl(source.url, settings.rules);
      if (!source?.id || !match) {
        throw new Error("The current tab does not match an enabled singleton rule.");
      }

      const duplicate = await adapter.duplicateTab(source.id);
      const state = normalizeRuntimeState(await adapter.getRuntimeState());
      state.duplicateExemptions[duplicate.id] = { ruleId: match.rule.id };
      state.lastAction = nowRecord("duplicate", {
        tabId: duplicate.id,
        ruleId: match.rule.id,
      });
      state.lastError = null;
      await adapter.setRuntimeState(state);
      return { tabId: duplicate.id, rule: match.rule };
    } catch (error) {
      await recordError("duplicate", error);
      throw error;
    }
  }

  async function statusNow(tabId = null) {
    const settings = normalizeSettings(await adapter.getSettings());
    const state = normalizeRuntimeState(await adapter.getRuntimeState());
    const tab = tabId === null ? await adapter.getActiveTab() : await adapter.getTab(tabId);
    const match = tab && matchRuleForUrl(tab.url, settings.rules);
    if (!tab?.id || !match) {
      return { managed: false, tabId: tab?.id || null, lastError: state.lastError };
    }
    const key = scopeKey(match.rule.id, settings.singletonScope, tab.windowId);
    return {
      managed: true,
      tabId: tab.id,
      rule: match.rule,
      exempt: Boolean(state.duplicateExemptions[tab.id]),
      canonical: state.canonicalByScope[key] === tab.id,
      singletonScope: settings.singletonScope,
      organizeTabs: settings.organizeTabs,
      lastError: state.lastError,
    };
  }

  async function saveSettingsNow(rawSettings) {
    const settings = normalizeSettings(rawSettings);
    await adapter.setSettings(settings);
    try {
      await reconcileNow({ reason: "settings-change" });
      return { settings, warning: null };
    } catch (error) {
      return {
        settings,
        warning: {
          operation: "settings-reconcile",
          message: error?.message || String(error),
        },
      };
    }
  }

  return {
    enqueue,
    reconcile(options) {
      return enqueue(() => reconcileNow(options));
    },
    duplicate(tabId) {
      return enqueue(() => duplicateNow(tabId));
    },
    getStatus(tabId) {
      return enqueue(() => statusNow(tabId));
    },
    getSettings() {
      return enqueue(async () => normalizeSettings(await adapter.getSettings()));
    },
    saveSettings(settings) {
      return enqueue(() => saveSettingsNow(settings));
    },
    openOptions() {
      return enqueue(() => adapter.openOptionsPage());
    },
    async handleMessage(message) {
      switch (message?.type) {
        case "get-status":
          return this.getStatus(message.tabId ?? null);
        case "duplicate-current":
          return this.duplicate(message.tabId ?? null);
        case "reconcile":
          await this.reconcile({ reason: "popup" });
          return { ok: true };
        case "get-settings":
          return this.getSettings();
        case "save-settings":
          return this.saveSettings(message.settings);
        case "open-options":
          await this.openOptions();
          return { ok: true };
        default:
          throw new Error("Unknown Singleton Tabs message.");
      }
    },
  };
}
