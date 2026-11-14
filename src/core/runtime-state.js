export const RUNTIME_SCHEMA_VERSION = 1;

export function emptyRuntimeState() {
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    canonicalByScope: {},
    duplicateExemptions: {},
    lastAction: null,
    lastError: null,
  };
}

export function normalizeRuntimeState(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    canonicalByScope:
      value.canonicalByScope && typeof value.canonicalByScope === "object"
        ? { ...value.canonicalByScope }
        : {},
    duplicateExemptions:
      value.duplicateExemptions && typeof value.duplicateExemptions === "object"
        ? { ...value.duplicateExemptions }
        : {},
    lastAction: value.lastAction && typeof value.lastAction === "object" ? { ...value.lastAction } : null,
    lastError: value.lastError && typeof value.lastError === "object" ? { ...value.lastError } : null,
  };
}

export function scopeKey(ruleId, singletonScope, windowId) {
  return singletonScope === "profile"
    ? `${ruleId}:profile`
    : `${ruleId}:window:${windowId}`;
}
