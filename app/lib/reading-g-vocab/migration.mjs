/**
 * Progress migration:
 * - v1/v2 → v3 (legacy, once)
 * - flat v3 / legacy keys → v4 stable entry keys (once via ielts_reading_g_migration_v4)
 */
import {
  READING_G_MIGRATION_KEY,
  READING_G_MIGRATION_V4_KEY,
  READING_G_PARAPHRASE_STATUS_KEY,
  READING_G_STATUS_KEY,
  READING_G_STATUS_KEY_V1,
  READING_G_STATUS_KEY_V2,
  PROGRESS_SCHEMA_VERSION
} from "./keys.mjs";
import { normalizeReadingGKey } from "./normalize.mjs";
import {
  getEntryProgressKey,
  normalizeStatusEntry,
  serializeStatusMap
} from "./storage.mjs";

function safeGet(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function legacyStatusToEntry(entry) {
  return normalizeStatusEntry(entry);
}

/**
 * Build lookup indexes for items.
 * byNorm may map to multiple items (word + phrase same surface) → stored as array
 */
export function buildItemKeyIndex(items) {
  const byNorm = new Map();
  const byId = new Map();
  const byMerge = new Map();
  const indexNorm = (key, item) => {
    if (!key) return;
    if (!byNorm.has(key)) byNorm.set(key, []);
    if (!byNorm.get(key).includes(item)) byNorm.get(key).push(item);
  };
  for (const item of items || []) {
    const nk = item.normalizedKey || normalizeReadingGKey(item.word);
    const id = item.id;
    const mk = `${item.entryType || "word"}::${nk}`;
    indexNorm(nk, item);
    if (id) byId.set(id, item);
    byMerge.set(mk, item);
    for (const alias of Array.isArray(item.mergedAliases) ? item.mergedAliases : []) {
      const aliasKey = normalizeReadingGKey(alias?.key || alias?.word);
      const aliasId = String(alias?.id || "").trim();
      indexNorm(aliasKey, item);
      if (aliasId) byId.set(aliasId, item);
      if (aliasKey) byMerge.set(`word::${aliasKey}`, item);
    }
  }
  // convenience: single-item get for tests
  const byNormSingle = new Map();
  for (const [k, arr] of byNorm) {
    if (arr.length === 1) byNormSingle.set(k, arr[0]);
  }
  return { byNorm, byNormSingle, byId, byMerge };
}

/**
 * Legacy v1/v2 → v3 flat (unchanged behavior for first migration).
 */
export function migrateReadingGProgressV3(items) {
  if (typeof window === "undefined") {
    return { migrated: false, matched: 0, skipped: 0, alreadyDone: true };
  }

  const flag = safeGet(READING_G_MIGRATION_KEY);
  if (flag && flag.completed) {
    return { migrated: false, matched: 0, skipped: 0, alreadyDone: true, flag };
  }

  const existingV3 = safeGet(READING_G_STATUS_KEY);
  if (existingV3 && typeof existingV3 === "object" && Object.keys(existingV3).length > 0) {
    safeSet(READING_G_MIGRATION_KEY, {
      completed: true,
      at: new Date().toISOString(),
      reason: "v3_already_present",
      matched: Object.keys(existingV3).length
    });
    return {
      migrated: false,
      matched: Object.keys(existingV3).length,
      skipped: 0,
      alreadyDone: true
    };
  }

  const legacy =
    safeGet(READING_G_STATUS_KEY_V2) ||
    safeGet(READING_G_STATUS_KEY_V1) ||
    {};

  if (!legacy || typeof legacy !== "object") {
    safeSet(READING_G_STATUS_KEY, serializeStatusMap({}));
    safeSet(READING_G_MIGRATION_KEY, {
      completed: true,
      at: new Date().toISOString(),
      reason: "no_legacy",
      matched: 0
    });
    return { migrated: true, matched: 0, skipped: 0, alreadyDone: false };
  }

  const index = buildItemKeyIndex(items);
  const next = {};
  let matched = 0;
  let skipped = 0;

  for (const [rawKey, value] of Object.entries(legacy)) {
    if (rawKey === "progressSchemaVersion" || rawKey === "entries" || rawKey === "paraphrases") {
      continue;
    }
    const nk = normalizeReadingGKey(rawKey);
    let item = index.byId.get(rawKey);
    if (!item) {
      const arr = index.byNorm.get(nk) || [];
      if (arr.length === 1) item = arr[0];
      else if (arr.length > 1) {
        skipped += 1;
        continue;
      }
    }
    if (!item) {
      item =
        index.byMerge.get(`word::${nk}`) ||
        index.byMerge.get(`phrase::${nk}`) ||
        null;
    }
    if (!item) {
      skipped += 1;
      continue;
    }
    const storeKey = item.normalizedKey || nk;
    next[storeKey] = legacyStatusToEntry(value);
    matched += 1;
  }

  safeSet(READING_G_STATUS_KEY, next);
  safeSet(READING_G_MIGRATION_KEY, {
    completed: true,
    at: new Date().toISOString(),
    reason: "migrated_from_legacy",
    matched,
    skipped,
    resetSession: true,
    resetPositions: true,
    resetDaily: true
  });

  return { migrated: true, matched, skipped, alreadyDone: false };
}

/**
 * Pure function: remap flat status object → stable-key entries map.
 * Used by tests without localStorage.
 */
export function remapStatusToStableKeys(rawMap, items) {
  const index = buildItemKeyIndex(items);
  const entries = {};
  const warnings = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  let ambiguousCount = 0;

  const source =
    rawMap?.entries && typeof rawMap.entries === "object"
      ? rawMap.entries
      : rawMap && typeof rawMap === "object"
        ? rawMap
        : {};

  for (const [rawKey, value] of Object.entries(source)) {
    if (
      rawKey === "progressSchemaVersion" ||
      rawKey === "entries" ||
      rawKey === "paraphrases"
    ) {
      continue;
    }

    const entry = legacyStatusToEntry(value);
    let item = index.byId.get(rawKey);

    // entryType::normalizedKey
    if (!item && rawKey.includes("::")) {
      item = index.byMerge.get(rawKey) || null;
    }

    if (!item) {
      const nk = normalizeReadingGKey(rawKey);
      const arr = index.byNorm.get(nk) || [];
      if (arr.length === 1) {
        item = arr[0];
      } else if (arr.length > 1) {
        // ambiguous word/phrase — do not dual-copy
        ambiguousCount += 1;
        warnings.push({ key: rawKey, reason: "ambiguous_word_phrase" });
        continue;
      }
    }

    if (!item) {
      unmatchedCount += 1;
      continue;
    }

    const stable = getEntryProgressKey(item);
    if (!stable) {
      unmatchedCount += 1;
      continue;
    }
    // if already present, prefer non-unlearned fields merge
    if (entries[stable]) {
      const prev = entries[stable];
      entries[stable] = {
        meaningStatus:
          prev.meaningStatus !== "unlearned" ? prev.meaningStatus : entry.meaningStatus,
        phraseStatus:
          prev.phraseStatus !== "unlearned" ? prev.phraseStatus : entry.phraseStatus,
        paraphraseStatus:
          prev.paraphraseStatus !== "unlearned"
            ? prev.paraphraseStatus
            : entry.paraphraseStatus,
        status: prev.status || entry.status,
        favorite: prev.favorite || entry.favorite
      };
    } else {
      entries[stable] = entry;
    }
    matchedCount += 1;
  }

  return {
    entries,
    matchedCount,
    unmatchedCount,
    ambiguousCount,
    newEntryCount: Object.keys(entries).length,
    migrationWarnings: warnings
  };
}

/**
 * One-shot v4 migration to stable keys + nested payload.
 */
export function migrateReadingGProgressV4(items) {
  if (typeof window === "undefined") {
    return {
      migrated: false,
      alreadyDone: true,
      matchedCount: 0,
      unmatchedCount: 0,
      ambiguousCount: 0,
      newEntryCount: 0
    };
  }

  const flag = safeGet(READING_G_MIGRATION_V4_KEY);
  if (flag && (flag.completed === true || flag === "completed")) {
    return {
      migrated: false,
      alreadyDone: true,
      matchedCount: flag.matchedCount || 0,
      unmatchedCount: flag.unmatchedCount || 0,
      ambiguousCount: flag.ambiguousCount || 0,
      newEntryCount: flag.newEntryCount || 0,
      migrationWarnings: flag.migrationWarnings || []
    };
  }

  // ensure v3 legacy path ran first
  migrateReadingGProgressV3(items);

  const raw = safeGet(READING_G_STATUS_KEY) || {};
  // already v4 with entries?
  if (
    raw.progressSchemaVersion >= 4 &&
    raw.entries &&
    typeof raw.entries === "object" &&
    Object.keys(raw.entries).length > 0
  ) {
    const result = {
      completed: true,
      at: new Date().toISOString(),
      reason: "already_v4",
      matchedCount: Object.keys(raw.entries).length,
      unmatchedCount: 0,
      ambiguousCount: 0,
      newEntryCount: Object.keys(raw.entries).length
    };
    safeSet(READING_G_MIGRATION_V4_KEY, result);
    // also write string form expected by some checks
    try {
      window.localStorage.setItem(READING_G_MIGRATION_V4_KEY, JSON.stringify(result));
    } catch {
      /* ignore */
    }
    return { migrated: false, alreadyDone: true, ...result };
  }

  const remapped = remapStatusToStableKeys(raw, items);
  const paraFromNested = raw.paraphrases || safeGet(READING_G_PARAPHRASE_STATUS_KEY) || {};

  // normalize paraphrase map to paraphraseStatus
  const paraphrases = {};
  for (const [gid, v] of Object.entries(paraFromNested || {})) {
    if (!gid) continue;
    if (typeof v === "string") {
      paraphrases[gid] = { paraphraseStatus: v };
    } else if (v && typeof v === "object") {
      paraphrases[gid] = {
        paraphraseStatus:
          v.paraphraseStatus ||
          (v.mastered === true ? "familiar" : v.mastered === false ? "unfamiliar" : "unlearned"),
        mastered: v.mastered,
        at: v.at
      };
    }
  }

  const payload = serializeStatusMap(remapped.entries, paraphrases);
  safeSet(READING_G_STATUS_KEY, payload);
  safeSet(READING_G_PARAPHRASE_STATUS_KEY, paraphrases);

  const result = {
    completed: true,
    at: new Date().toISOString(),
    reason: "migrated_to_v4_stable_keys",
    progressSchemaVersion: PROGRESS_SCHEMA_VERSION,
    matchedCount: remapped.matchedCount,
    unmatchedCount: remapped.unmatchedCount,
    ambiguousCount: remapped.ambiguousCount,
    newEntryCount: remapped.newEntryCount,
    migrationWarnings: remapped.migrationWarnings
  };
  safeSet(READING_G_MIGRATION_V4_KEY, result);

  return {
    migrated: true,
    alreadyDone: false,
    ...result
  };
}

/** Convenience: run v3 then v4 */
export function migrateReadingGProgress(items) {
  const v3 = migrateReadingGProgressV3(items);
  const v4 = migrateReadingGProgressV4(items);
  return {
    v3,
    v4,
    matched: v4.matchedCount ?? v3.matched ?? 0,
    skipped: v4.unmatchedCount ?? v3.skipped ?? 0,
    migrated: Boolean(v3.migrated || v4.migrated),
    ambiguousCount: v4.ambiguousCount || 0
  };
}
