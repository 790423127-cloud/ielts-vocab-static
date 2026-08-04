import { normalizeReadingGKey } from "./normalize.mjs";

export const READING_G_RETIREMENTS_SOURCE = "public/data/reading-g-retirements.json";

export function getReadingGRetirementKey(entry = {}) {
  const entryType = entry.entryType === "phrase" ? "phrase" : "word";
  const normalizedKey = normalizeReadingGKey(entry.normalizedKey || entry.word);
  return normalizedKey ? `${entryType}::${normalizedKey}` : "";
}

export function normalizeReadingGRetirements(payload = {}) {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const seen = new Set();
  return entries.flatMap((entry) => {
    const key = String(entry?.key || getReadingGRetirementKey(entry)).trim();
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{
      key,
      id: String(entry?.id || "").trim(),
      word: String(entry?.word || "").trim(),
      entryType: entry?.entryType === "phrase" ? "phrase" : "word",
      deletedAt: String(entry?.deletedAt || "").trim()
    }];
  });
}

export function applyReadingGRetirements(items = [], payload = {}) {
  const retirements = normalizeReadingGRetirements(payload);
  const retiredKeys = new Set(retirements.map((entry) => entry.key));
  const kept = [];
  const removed = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (retiredKeys.has(getReadingGRetirementKey(item))) removed.push(item);
    else kept.push(item);
  }
  return { items: kept, removed, retirements, retiredKeys };
}
