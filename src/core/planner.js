import { matchRuleForUrl } from "./matcher.js";
import { normalizeRuntimeState, scopeKey } from "./runtime-state.js";

const NO_GROUP = -1;

function tabSort(left, right) {
  return (
    left.windowId - right.windowId ||
    left.index - right.index ||
    left.id - right.id
  );
}

function eligibleTab(tab) {
  return (
    Number.isInteger(tab?.id) &&
    Number.isInteger(tab?.windowId) &&
    !tab.incognito &&
    (!tab.windowType || tab.windowType === "normal")
  );
}

function isUngrouped(tab) {
  return tab.groupId === undefined || tab.groupId === NO_GROUP;
}

function moveInSnapshot(snapshot, tabId, targetIndex) {
  const currentIndex = snapshot.findIndex((tab) => tab.id === tabId);
  if (currentIndex === -1 || currentIndex === targetIndex) {
    return false;
  }
  const [tab] = snapshot.splice(currentIndex, 1);
  snapshot.splice(targetIndex, 0, tab);
  return true;
}

function buildMoveActions(tabs, canonicalRuleOrder, settings, removedIds) {
  if (!settings.organizeTabs) {
    return [];
  }

  const moves = [];
  const windowIds = [...new Set(tabs.map((tab) => tab.windowId))].sort((a, b) => a - b);
  for (const windowId of windowIds) {
    const snapshot = tabs
      .filter((tab) => tab.windowId === windowId && !removedIds.has(tab.id))
      .sort((a, b) => a.index - b.index || a.id - b.id);
    const canonicals = snapshot
      .filter((tab) => canonicalRuleOrder.has(tab.id) && isUngrouped(tab))
      .sort((left, right) => {
        return canonicalRuleOrder.get(left.id) - canonicalRuleOrder.get(right.id) || tabSort(left, right);
      });

    const pinned = canonicals.filter((tab) => tab.pinned);
    pinned.forEach((tab, position) => {
      if (moveInSnapshot(snapshot, tab.id, position)) {
        moves.push({ tabId: tab.id, index: position });
      }
    });

    const pinnedCount = snapshot.filter((tab) => tab.pinned).length;
    const unpinned = canonicals.filter((tab) => !tab.pinned);
    unpinned.forEach((tab, offset) => {
      const index = pinnedCount + offset;
      if (moveInSnapshot(snapshot, tab.id, index)) {
        moves.push({ tabId: tab.id, index });
      }
    });
  }
  return moves;
}

export function planReconciliation({ tabs, settings, runtimeState, triggerTabId = null }) {
  const state = normalizeRuntimeState(runtimeState);
  const normalTabs = tabs.filter(eligibleTab);
  const tabsById = new Map(normalTabs.map((tab) => [tab.id, tab]));
  const entries = normalTabs.map((tab) => ({
    tab,
    match: matchRuleForUrl(tab.url, settings.rules),
  }));
  const entryById = new Map(entries.map((entry) => [entry.tab.id, entry]));

  const exemptions = {};
  for (const [tabIdText, exemption] of Object.entries(state.duplicateExemptions)) {
    const tabId = Number(tabIdText);
    const entry = entryById.get(tabId);
    if (entry?.match?.rule.id === exemption?.ruleId) {
      exemptions[tabId] = { ruleId: exemption.ruleId };
    }
  }

  const canonicals = {};
  for (const [key, tabId] of Object.entries(state.canonicalByScope)) {
    const entry = entryById.get(tabId);
    if (!entry?.match || exemptions[tabId]) {
      continue;
    }
    const expectedKey = scopeKey(
      entry.match.rule.id,
      settings.singletonScope,
      entry.tab.windowId,
    );
    if (expectedKey === key) {
      canonicals[key] = tabId;
    }
  }

  const groups = new Map();
  for (const entry of entries) {
    if (!entry.match) {
      continue;
    }
    const key = scopeKey(entry.match.rule.id, settings.singletonScope, entry.tab.windowId);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  }

  const removeTabIds = [];
  let focus = null;
  const canonicalRuleOrder = new Map();

  const orderedGroups = [...groups.entries()].sort(([, left], [, right]) => {
    return left[0].match.index - right[0].match.index || tabSort(left[0].tab, right[0].tab);
  });

  for (const [key, groupEntries] of orderedGroups) {
    groupEntries.sort((left, right) => tabSort(left.tab, right.tab));
    let canonicalEntry = groupEntries.find((entry) => canonicals[key] === entry.tab.id);
    const nonExempt = groupEntries.filter((entry) => !exemptions[entry.tab.id]);

    if (!canonicalEntry) {
      const existing = nonExempt.filter((entry) => entry.tab.id !== triggerTabId);
      canonicalEntry = existing[0] || nonExempt[0] || groupEntries[0];
      if (canonicalEntry && exemptions[canonicalEntry.tab.id]) {
        delete exemptions[canonicalEntry.tab.id];
      }
    }
    if (!canonicalEntry) {
      continue;
    }

    canonicals[key] = canonicalEntry.tab.id;
    canonicalRuleOrder.set(canonicalEntry.tab.id, canonicalEntry.match.index);

    for (const entry of groupEntries) {
      if (entry.tab.id === canonicalEntry.tab.id || exemptions[entry.tab.id]) {
        continue;
      }
      removeTabIds.push(entry.tab.id);
      if (entry.tab.id === triggerTabId) {
        focus = {
          tabId: canonicalEntry.tab.id,
          windowId: canonicalEntry.tab.windowId,
          focusWindow:
            settings.singletonScope === "profile" &&
            canonicalEntry.tab.windowId !== entry.tab.windowId,
        };
      }
    }
  }

  const activeKeys = new Set(groups.keys());
  for (const key of Object.keys(canonicals)) {
    if (!activeKeys.has(key) || !tabsById.has(canonicals[key])) {
      delete canonicals[key];
    }
  }

  const removedIds = new Set(removeTabIds);
  const moves = buildMoveActions(normalTabs, canonicalRuleOrder, settings, removedIds);

  return {
    state: {
      ...state,
      canonicalByScope: canonicals,
      duplicateExemptions: exemptions,
    },
    actions: {
      focus,
      removeTabIds,
      moves,
    },
  };
}
