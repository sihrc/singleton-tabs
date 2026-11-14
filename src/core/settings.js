export const SETTINGS_SCHEMA_VERSION = 1;
export const MAX_RULES = 100;
export const MAX_LABEL_LENGTH = 80;
export const MAX_PREFIX_LENGTH = 2048;

export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  rules: Object.freeze([
    Object.freeze({
      id: "default-gmail",
      label: "Gmail",
      prefix: "https://mail.google.com/",
      enabled: true,
    }),
    Object.freeze({
      id: "default-google-calendar",
      label: "Google Calendar",
      prefix: "https://calendar.google.com/",
      enabled: true,
    }),
  ]),
  singletonScope: "window",
  organizeTabs: true,
});

export class SettingsValidationError extends Error {
  constructor(message, { field = "settings", ruleIndex = null } = {}) {
    super(message);
    this.name = "SettingsValidationError";
    this.field = field;
    this.ruleIndex = ruleIndex;
  }
}

function makeRuleId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizePrefix(value, ruleIndex = null) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    throw new SettingsValidationError("Enter an absolute HTTP(S) URL prefix.", {
      field: "prefix",
      ruleIndex,
    });
  }
  if (raw.length > MAX_PREFIX_LENGTH) {
    throw new SettingsValidationError(`Prefix must be ${MAX_PREFIX_LENGTH} characters or fewer.`, {
      field: "prefix",
      ruleIndex,
    });
  }
  if (raw.includes("*")) {
    throw new SettingsValidationError("Prefixes cannot contain wildcards (*).", {
      field: "prefix",
      ruleIndex,
    });
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SettingsValidationError("Prefix must be an absolute URL.", {
      field: "prefix",
      ruleIndex,
    });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SettingsValidationError("Only HTTP and HTTPS prefixes are supported.", {
      field: "prefix",
      ruleIndex,
    });
  }
  if (url.username || url.password) {
    throw new SettingsValidationError("Prefixes cannot contain credentials.", {
      field: "prefix",
      ruleIndex,
    });
  }
  if (url.hash) {
    throw new SettingsValidationError("Prefixes cannot contain a fragment (#…).", {
      field: "prefix",
      ruleIndex,
    });
  }
  if (url.href.length > MAX_PREFIX_LENGTH) {
    throw new SettingsValidationError(
      `Normalized prefix must be ${MAX_PREFIX_LENGTH} characters or fewer.`,
      {
        field: "prefix",
        ruleIndex,
      },
    );
  }
  return url.href;
}

function normalizeRule(rawRule, index) {
  const prefix = normalizePrefix(rawRule?.prefix, index);
  const rawLabel = typeof rawRule?.label === "string" ? rawRule.label.trim() : "";
  const label = rawLabel || new URL(prefix).hostname;
  if (label.length > MAX_LABEL_LENGTH) {
    throw new SettingsValidationError(`Label must be ${MAX_LABEL_LENGTH} characters or fewer.`, {
      field: "label",
      ruleIndex: index,
    });
  }

  return {
    id: typeof rawRule?.id === "string" && rawRule.id.trim() ? rawRule.id.trim() : makeRuleId(),
    label,
    prefix,
    enabled: rawRule?.enabled !== false,
  };
}

export function normalizeSettings(raw = DEFAULT_SETTINGS) {
  const value = raw && typeof raw === "object" ? raw : {};
  const rawRules = Array.isArray(value.rules) ? value.rules : [];
  if (rawRules.length > MAX_RULES) {
    throw new SettingsValidationError(`You can configure at most ${MAX_RULES} rules.`, {
      field: "rules",
    });
  }

  const rules = rawRules.map(normalizeRule);
  const seenPrefixes = new Set();
  const seenIds = new Set();
  rules.forEach((rule, index) => {
    if (seenPrefixes.has(rule.prefix)) {
      throw new SettingsValidationError("Each normalized prefix must be unique.", {
        field: "prefix",
        ruleIndex: index,
      });
    }
    if (seenIds.has(rule.id)) {
      throw new SettingsValidationError("Each rule identifier must be unique.", {
        field: "id",
        ruleIndex: index,
      });
    }
    seenPrefixes.add(rule.prefix);
    seenIds.add(rule.id);
  });

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    rules,
    singletonScope: value.singletonScope === "profile" ? "profile" : "window",
    organizeTabs: value.organizeTabs !== false,
  };
}

export function settingsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
