const duplicateButton = document.querySelector("#duplicate");
const reconcileButton = document.querySelector("#reconcile");
const optionsButton = document.querySelector("#options");
const ruleName = document.querySelector("#rule-name");
const ruleDetail = document.querySelector("#rule-detail");
const tabBadge = document.querySelector("#tab-badge");
const statusLine = document.querySelector("#status");

let activeTabId = null;

function setStatus(message, kind = "") {
  statusLine.textContent = message;
  statusLine.dataset.kind = kind;
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Singleton Tabs did not respond.");
  }
  return response.result;
}

async function loadStatus() {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  activeTabId = activeTab?.id ?? null;
  const result = await send({ type: "get-status", tabId: activeTabId });
  if (!result.managed) {
    ruleName.textContent = "Not a singleton";
    ruleDetail.textContent = "This tab does not match an enabled rule.";
    duplicateButton.disabled = true;
    tabBadge.hidden = true;
  } else {
    ruleName.textContent = result.rule.label;
    ruleDetail.textContent = result.rule.prefix;
    duplicateButton.disabled = false;
    tabBadge.hidden = false;
    tabBadge.textContent = result.exempt
      ? "Intentional duplicate"
      : result.canonical
        ? "Canonical tab"
        : "Managed tab";
  }
  if (result.lastError) {
    setStatus(`${result.lastError.operation}: ${result.lastError.message}`, "error");
  }
}

duplicateButton.addEventListener("click", async () => {
  duplicateButton.disabled = true;
  setStatus("Duplicating…");
  try {
    await send({ type: "duplicate-current", tabId: activeTabId });
    setStatus("Intentional duplicate created.", "success");
    window.close();
  } catch (error) {
    duplicateButton.disabled = false;
    setStatus(error.message, "error");
  }
});

reconcileButton.addEventListener("click", async () => {
  reconcileButton.disabled = true;
  setStatus("Reconciling…");
  try {
    await send({ type: "reconcile" });
    setStatus("Tabs reconciled.", "success");
    await loadStatus();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    reconcileButton.disabled = false;
  }
});

optionsButton.addEventListener("click", async () => {
  try {
    await send({ type: "open-options" });
    window.close();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

loadStatus().catch((error) => {
  ruleName.textContent = "Unavailable";
  ruleDetail.textContent = "Could not inspect the current tab.";
  duplicateButton.disabled = true;
  setStatus(error.message, "error");
});
