import { createHash } from "node:crypto";
import {
  LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES,
  CONFIRMED_PERSON_NAME_WORDS,
  PENDING_PERSON_NAME_WORDS,
  normalizeHeadword,
  lexiconVersionRank,
  findConfirmedPersonNamesInWords,
  entryIntegrityFingerprint
} from "./lexicon-guard-shared.mjs";

export {
  LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES,
  CONFIRMED_PERSON_NAME_WORDS,
  PENDING_PERSON_NAME_WORDS,
  normalizeHeadword,
  lexiconVersionRank,
  findConfirmedPersonNamesInWords,
  entryIntegrityFingerprint
};

export function isConfirmedPersonNameWord(word) {
  return CONFIRMED_PERSON_NAME_WORDS.has(normalizeHeadword(word));
}

export function hashSerialized(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function computeIntegrityHash(words = [], shouldKeep = () => true) {
  const fingerprints = [];
  words.forEach((entry, index) => {
    if (!shouldKeep(entry, index)) return;
    fingerprints.push(entryIntegrityFingerprint(entry, index));
  });
  return hashSerialized(fingerprints);
}

export function computeLexiconHash(words = []) {
  const fingerprints = words.map((entry, index) => entryIntegrityFingerprint(entry, index));
  return hashSerialized(fingerprints);
}

export function validateExportCacheWrite(incoming = {}, current = null) {
  const words = Array.isArray(incoming.words) ? incoming.words : [];
  const currentWords = Array.isArray(current?.words) ? current.words : [];
  const currentConfirmedNameEntryIds = new Set(
    currentWords
      .filter((entry) => isConfirmedPersonNameWord(entry?.word))
      .map((entry) => String(entry?.id || entry?.wordId || "").trim())
      .filter(Boolean)
  );
  const reintroducedConfirmedNames = words
    .filter((entry) => {
      if (!isConfirmedPersonNameWord(entry?.word)) return false;
      const id = String(entry?.id || entry?.wordId || "").trim();
      return !id || !currentConfirmedNameEntryIds.has(id);
    })
    .map((entry) => normalizeHeadword(entry?.word));

  if (reintroducedConfirmedNames.length) {
    return {
      ok: false,
      status: 409,
      error: "拒绝写入：待保存词库重新加入了已删除的确定人名",
      detail: `命中 ${reintroducedConfirmedNames.length} 条：${reintroducedConfirmedNames.slice(0, 12).join(", ")}${reintroducedConfirmedNames.length > 12 ? "..." : ""}`
    };
  }

  const incomingRank = lexiconVersionRank(incoming.version);
  const currentRank = lexiconVersionRank(current?.version);

  if (current && currentRank > incomingRank) {
    return {
      ok: false,
      status: 409,
      error: "拒绝写入：待保存词库版本早于当前 active cache",
      detail: `incoming=${incoming.version || "(none)"}, current=${current.version || "(none)"}`
    };
  }

  if (current?.savedAt && incoming.savedAt && !incoming.forceRefresh) {
    const incomingSavedAt = Date.parse(String(incoming.savedAt));
    const currentSavedAt = Date.parse(String(current.savedAt));
    if (
      Number.isFinite(incomingSavedAt) &&
      Number.isFinite(currentSavedAt) &&
      incomingSavedAt < currentSavedAt &&
      currentRank >= incomingRank
    ) {
      return {
        ok: false,
        status: 409,
        error: "拒绝写入：待保存词库时间戳早于当前 active cache",
        detail: `incoming=${incoming.savedAt}, current=${current.savedAt}`
      };
    }
  }

  return { ok: true };
}
