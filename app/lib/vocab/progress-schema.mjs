export const PROGRESS_SCHEMA_VERSION = 1;
export const PROGRESS_STORAGE_NAMESPACE = "ielts-vocab";

export function progressStorageKey(area, scope = "global", name = "state") {
  const parts = [PROGRESS_STORAGE_NAMESPACE, "progress", `v${PROGRESS_SCHEMA_VERSION}`, area, scope, name]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return parts.join(":");
}

export function readJsonStorage(storageGet, key, fallback = null) {
  try {
    const raw = storageGet?.(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeJsonStorage(storageSet, key, value) {
  try {
    return Boolean(storageSet?.(key, JSON.stringify(value)));
  } catch {
    return false;
  }
}

export function readWithLegacyFallback(storageGet, primaryKey, legacyKeys = [], fallback = null) {
  const primary = readJsonStorage(storageGet, primaryKey, null);
  if (primary) return { value: primary, sourceKey: primaryKey, migrated: false };

  for (const key of legacyKeys) {
    const value = readJsonStorage(storageGet, key, null);
    if (value) return { value, sourceKey: key, migrated: key !== primaryKey };
  }

  return { value: fallback, sourceKey: "", migrated: false };
}
