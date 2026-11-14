# Singleton Tabs

Singleton Tabs is a local Manifest V3 Chrome extension that reuses one canonical
tab for each configured HTTP(S) URL prefix. It supports one canonical per browser
window or one across all normal windows, optional tab-strip organization, and an
explicit **Duplicate this tab** escape hatch when a second instance is useful.

The extension has no build step, runtime dependencies, content scripts, remote
code, telemetry, or network service. Fresh installs include enabled rules for
Gmail and Google Calendar; both can be edited, disabled, reordered, or removed.

## Install the unpacked extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository directory—the directory containing `manifest.json`.
5. Pin **Singleton Tabs** from Chrome's extensions menu if you want the duplicate
   action one click away.

After pulling or editing the source, use **Reload** on `chrome://extensions`.
Open the service-worker link on that page to inspect console warnings or terminate
the worker for restart testing.

## Permission warning and privacy

Chrome warns that the extension can read browsing history because the `tabs`
permission exposes tab URLs. URL visibility is required to compare arbitrary
user-configured prefixes. Singleton Tabs requests only `tabs` and `storage`:

- It does not read or modify page content.
- It has no host permissions or content scripts.
- It does not transmit data, make network requests, or include telemetry.
- It stores configured rules in `chrome.storage.local`.
- It stores only tab IDs, temporary exemptions, and the latest bounded status in
  `chrome.storage.session`.
- It does not store a tab inventory, titles, page content, or browsing history.
- Chrome does not allow it in incognito mode.

Configured prefixes stay in the current Chrome profile and do not sync to other
devices.

## Configure singleton rules

Open the extension popup and select **Manage rules**, or use **Details → Extension
options** on `chrome://extensions`.

Each rule has:

- A human-readable label.
- A literal absolute `http://` or `https://` prefix.
- An enabled switch.
- A position in rule order.

Fresh installs start with these editable rules:

- Gmail: `https://mail.google.com/`
- Google Calendar: `https://calendar.google.com/`

Prefixes cannot contain credentials, fragments (`#…`), or wildcards. If multiple
enabled prefixes match one URL, the longest prefix wins. Rule order breaks an
equal-length tie and also controls tab-strip sorting. Changes are saved and
reconciled immediately. If Chrome rejects the post-save reconciliation, the
options page reports that the settings were saved with a warning and directs you
to **Reconcile now** in the popup; the saved rules are not rolled back.

The options page also provides:

- **One per browser window** (default): each normal window gets its own canonical
  tab for a rule. This avoids cross-window focus jumps.
- **One across all browser windows**: one canonical is shared across normal
  windows. A duplicate attempt focuses the window containing that canonical.
- **Organize canonical tabs first**: places canonical tabs at the start of their
  legal pinned or unpinned partition, ordered by rule order.

## Reuse and observer semantics

The extension observes a tab's URL change. If an enabled rule already has a
canonical tab in scope, it focuses that canonical and closes the attempting tab.
Because this is an observer—not a request blocker—the attempted destination may
briefly begin loading before the tab closes.

This behavior applies to links, modified-click new tabs, pasted URLs, redirects,
and address-bar navigation. If you navigate an existing unrelated tab to a URL
that duplicates a canonical, that existing tab is also closed. Chrome's normal
**Reopen closed tab** command (`Ctrl+Shift+T` / `Cmd+Shift+T`) remains available.

When no canonical exists, the first matching tab becomes canonical. If stored
state is stale after a tab closes or Chrome replaces a tab, the extension rebuilds
it from the current tab strip.

## Create an intentional duplicate

Open the popup while viewing a tab that matches an enabled rule and select
**Duplicate this tab**. The new tab receives a temporary session exemption before
its queued URL event is processed, so it remains open and is excluded from
automatic organization.

The exemption lasts while that tab remains under the same rule. Navigating it away
removes the exemption. If the canonical closes, one exempt duplicate is promoted
to canonical. You can duplicate an already exempt tab again.

Service-worker suspension preserves exemptions through session storage. A full
Chrome restart clears session exemptions and reconstructs strict singleton state;
extra matching tabs may then be closed during startup reconciliation.

## Pinned and grouped tabs

- Pinned state is never changed. Canonical pinned tabs are sorted within the
  pinned partition.
- Canonical unpinned tabs are sorted immediately after all pinned tabs.
- Tabs inside a Chrome tab group still receive singleton enforcement, but the
  extension does not move them. This preserves group membership and may prevent a
  grouped singleton from appearing first.
- Intentional duplicates are never moved by organization.
- Non-singleton tabs keep their relative order.

If Chrome reports that a tab is currently being dragged, Singleton Tabs retries a
move three times with bounded delay, then records a nonfatal error in the popup.

## Popup status and recovery

The popup identifies whether the current tab is canonical, an intentional
duplicate, or unmanaged. It also offers:

- **Reconcile now** to rebuild canonical state and organization from current tabs.
- **Manage rules** to open the options page.
- The latest session error, if a Chrome API operation failed.

If behavior looks stale:

1. Select **Reconcile now**.
2. Confirm the rule is enabled and the normalized prefix is correct.
3. Check whether the tab is grouped or the rule scope is per-window.
4. Reload the extension on `chrome://extensions`.
5. Inspect the service-worker console for a Chrome API error.

## Validate changes

Requirements: Node.js 20 or newer. No package installation is needed.

```sh
npm test
npm run check
```

`npm test` exercises settings, matching, canonical recovery, both scope modes,
intentional exemptions and promotion, simultaneous duplicate planning, ordering,
idempotence, queue serialization, and adapter retry failures. `npm run check`
validates JavaScript syntax, manifest permissions and file references, CSP-safe
scripts, and the absence of network/remote-code surfaces.

## Browser validation

The extension passes the browser acceptance matrix in an unpacked Chrome profile
on Windows. Chrome reports the expected **Read your browsing history**
permission message, keeps incognito access disabled, and reports no manifest,
runtime, install, or service-worker errors.

The validated behaviors are:

1. Normal links, modified-click new tabs, pasted URLs, typed address-bar URLs,
   existing-tab navigation, and redirects all reuse the canonical tab.
2. **Duplicate this tab** retains exactly one requested exception.
3. Per-window and profile-wide scopes work across two normal windows, including
   focusing the canonical window in profile scope.
4. Organization can be disabled and re-enabled, follows rule reordering, preserves
   pinning, and leaves grouped tabs in their group.
5. Service-worker termination preserves session exemptions and wakes cleanly on
   the next tab event.
6. A full Chrome restart preserves local settings, clears session exemptions,
   rebuilds canonical state, removes extra matching tabs, and reapplies rule order.
7. The options form and popup actions work from the keyboard.

Repeat this matrix after changing browser-facing behavior or raising the supported
Chrome version. The static `npm run check` gate continues to verify that the package
contains no host permissions, content scripts, network calls, or remote code.

## Disable, uninstall, or roll back

Disable individual rules to stop enforcement selectively. Turn off organization
to keep matching without tab movement. Disable the extension for an immediate
whole-product rollback, or remove it from `chrome://extensions` to delete its
saved extension data. Singleton Tabs never changes website data, so no site-side
recovery is required.

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for component boundaries, state,
event flow, and privacy constraints.
