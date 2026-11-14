import { MAX_RULES, normalizeSettings } from "../core/settings.js";
import { describeSaveResult } from "./save-result.js";

const scopeSelect = document.querySelector("#scope");
const organizeCheckbox = document.querySelector("#organize");
const addForm = document.querySelector("#add-rule");
const newLabel = document.querySelector("#new-label");
const newPrefix = document.querySelector("#new-prefix");
const rulesContainer = document.querySelector("#rules");
const emptyState = document.querySelector("#empty-state");
const count = document.querySelector("#rule-count");
const statusLine = document.querySelector("#status");

let settings = null;
let saveVersion = 0;

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

function ruleButton(label, action, title = label) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  return button;
}

function render() {
  scopeSelect.value = settings.singletonScope;
  organizeCheckbox.checked = settings.organizeTabs;
  rulesContainer.replaceChildren();
  count.textContent = `${settings.rules.length} / ${MAX_RULES}`;
  emptyState.hidden = settings.rules.length !== 0;

  settings.rules.forEach((rule, index) => {
    const row = document.createElement("article");
    row.className = "rule card";
    row.dataset.ruleId = rule.id;

    const order = document.createElement("span");
    order.className = "rule-index";
    order.textContent = String(index + 1);

    const labelWrap = document.createElement("label");
    labelWrap.textContent = "Label";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.maxLength = 80;
    labelInput.value = rule.label;
    labelInput.dataset.field = "label";
    labelWrap.append(labelInput);

    const prefixWrap = document.createElement("label");
    prefixWrap.textContent = "URL prefix";
    const prefixInput = document.createElement("input");
    prefixInput.type = "url";
    prefixInput.maxLength = 2048;
    prefixInput.value = rule.prefix;
    prefixInput.dataset.field = "prefix";
    prefixWrap.append(prefixInput);

    const controls = document.createElement("div");
    controls.className = "rule-actions";
    const enabledLabel = document.createElement("label");
    enabledLabel.className = "enabled-toggle";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = rule.enabled;
    enabled.dataset.field = "enabled";
    enabledLabel.append(enabled, document.createTextNode("Enabled"));
    controls.append(
      enabledLabel,
      ruleButton("↑", "up", `Move ${rule.label} up`),
      ruleButton("↓", "down", `Move ${rule.label} down`),
      ruleButton("Remove", "remove", `Remove ${rule.label}`),
    );
    controls.lastElementChild.classList.add("danger");
    controls.children[1].disabled = index === 0;
    controls.children[2].disabled = index === settings.rules.length - 1;

    row.append(order, labelWrap, prefixWrap, controls);
    rulesContainer.append(row);
  });
}

async function persist(nextSettings, successMessage = "Settings saved.") {
  const version = ++saveVersion;
  try {
    const normalized = normalizeSettings(nextSettings);
    settings = normalized;
    render();
    setStatus("Saving…");
    const result = await send({ type: "save-settings", settings: normalized });
    if (version === saveVersion) {
      settings = result.settings;
      render();
      const status = describeSaveResult(result, successMessage);
      setStatus(status.message, status.kind);
    }
    return true;
  } catch (error) {
    if (version === saveVersion) {
      setStatus(error.message, "error");
    }
    return false;
  }
}

scopeSelect.addEventListener("change", () => {
  persist({ ...settings, singletonScope: scopeSelect.value }, "Scope updated.");
});

organizeCheckbox.addEventListener("change", () => {
  persist({ ...settings, organizeTabs: organizeCheckbox.checked }, "Organization updated.");
});

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = globalThis.crypto.randomUUID();
  const added = await persist(
    {
      ...settings,
      rules: [
        ...settings.rules,
        { id, label: newLabel.value, prefix: newPrefix.value, enabled: true },
      ],
    },
    "Rule added.",
  );
  if (added) {
    addForm.reset();
    newLabel.focus();
  }
});

rulesContainer.addEventListener("change", (event) => {
  const field = event.target.dataset.field;
  const row = event.target.closest("[data-rule-id]");
  if (!field || !row) {
    return;
  }
  const rules = settings.rules.map((rule) => {
    if (rule.id !== row.dataset.ruleId) {
      return rule;
    }
    return {
      ...rule,
      [field]: field === "enabled" ? event.target.checked : event.target.value,
    };
  });
  persist({ ...settings, rules }, "Rule updated.");
});

rulesContainer.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  const row = button?.closest("[data-rule-id]");
  if (!button || !row) {
    return;
  }
  const index = settings.rules.findIndex((rule) => rule.id === row.dataset.ruleId);
  const rules = [...settings.rules];
  if (button.dataset.action === "remove") {
    rules.splice(index, 1);
  } else {
    const target = button.dataset.action === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= rules.length) {
      return;
    }
    [rules[index], rules[target]] = [rules[target], rules[index]];
  }
  persist({ ...settings, rules }, button.dataset.action === "remove" ? "Rule removed." : "Rule reordered.");
});

send({ type: "get-settings" })
  .then((loaded) => {
    settings = normalizeSettings(loaded);
    render();
  })
  .catch((error) => setStatus(error.message, "error"));
