# Architecture

Singleton Tabs is a dependency-free Manifest V3 Chrome extension. Its service
worker observes tab and storage events, computes a deterministic reconciliation
plan, and applies the smallest required set of focus, close, and move operations.
Website content never runs extension code.

## Components

- `src/core/` contains pure settings, matching, state-normalization, and planning
  modules. These modules do not call Chrome APIs and carry most behavior tests.
- `src/background/` serializes Chrome events through one coordinator. It rebuilds
  canonical state from current tabs whenever state may be stale.
- `src/platform/chrome-adapter.js` is the only module that directly performs tab,
  window, storage, and extension-page operations.
- `src/options/` manages ordered URL-prefix rules, singleton scope, and tab
  organization settings.
- `src/popup/` reports the current tab's status and exposes intentional duplication,
  reconciliation, and rule-management actions.

## State and storage

User configuration is stored in `chrome.storage.local` under one versioned
settings object. The default rules target Gmail and Google Calendar and can be
changed or removed like any other rule.

Canonical tab IDs, temporary duplicate exemptions, and the latest bounded status
are stored in `chrome.storage.session`. They survive service-worker suspension but
not a full browser restart. After restart, the extension reconstructs canonical
state from the current tab strip.

## Event flow

1. A tab, startup, install, or settings event requests reconciliation.
2. The coordinator serializes the request behind any in-progress operation.
3. The adapter reads current normal-window tabs and stored state.
4. The pure planner chooses canonicals, duplicate removals, focus behavior, and
   legal tab moves.
5. The coordinator persists state before applying browser mutations, then records
   a bounded outcome after the operations complete.

Popup-triggered duplication is serialized through the same queue. The coordinator
duplicates the current tab and records its rule-scoped exemption before a queued
URL event can treat it as accidental.

## Matching and scope

Rules are literal normalized HTTP(S) prefixes. The longest enabled matching prefix
wins; rule order breaks an equal-length tie. A canonical is tracked either per
normal browser window or across all normal windows, depending on configuration.

## Organization invariants

- Pinned state never changes.
- Pinned and unpinned tabs are sorted only inside their legal Chrome partitions.
- Grouped tabs are enforced as singletons but are not moved out of their group.
- Intentional duplicates are not moved.
- Non-singleton tabs keep their relative order.
- Reconciliation is idempotent once the tab strip matches the plan.

## Security and privacy boundaries

The extension requests only `tabs` and `storage`. It has no host permissions,
content scripts, remote code, network calls, telemetry, or externally hosted
service. Configured prefixes stay in the active Chrome profile. URL access is used
only to match open tabs against local rules.
