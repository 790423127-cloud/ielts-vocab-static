#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeAiPhraseItems
} from "../app/lib/vocab/admin-ai-content-profile.mjs";
import {
  normalizeCachedRecoveryEntry
} from "../app/lib/vocab/deepseek-cache-recovery.mjs";
import {
  buildLexiconTidyReview,
  buildRemovableWordKeySet,
  createEmptyLexiconTidyAudit,
  getTidyAuditKey
} from "../app/lib/vocab/lexicon-tidy-review.mjs";
import {
  getWordQualityEvaluation
} from "../app/lib/vocab/word-quality-status.mjs";
import {
  isLikelyWrongAiWord,
  normalizeWord
} from "../app/lib/vocab/page-word-helpers.mjs";
import {
  isBrushableWord,
  isInflectedReferenceWord
} from "../app/lib/vocab/word-study-eligibility.mjs";
import {
  computeIntegrityHash,
  computeLexiconHash
} from "../app/lib/vocab/lexicon-guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MASTER_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC_PATH = path.join(ROOT, "public", "data", "words.json");
const CACHE_PATH = path.join(ROOT, ".ai-cache", "deepseek-word-cache.json");
const BASIC_PATH = path.join(ROOT, "public", "data", "basic-words.json");
const TIDY_AUDIT_PATH = path.join(ROOT, "public", "data", "lexicon-tidy-audit.json");
const OVERRIDES_PATH = path.join(ROOT, "data", "manual-review", "quality-queue-zero-overrides-v1.json");
const REPORT_DIR = path.join(ROOT, "reports", "master-lexicon-quality-repair");

const FAMILY_RELATION_ALIASES = new Map([
  ["同词族 / 派生词", "related-to"],
  ["同词族/派生词", "related-to"],
  ["同词族 / 词汇化派生词", "related-to"],
  ["同词族/词汇化派生词", "related-to"],
  ["lexicalised/derived relation", "related-to"],
  ["lexicalized/derived relation", "related-to"]
]);
const USER_STATE_FIELDS = [
  "status",
  "favorite",
  "lastReviewedAt",
  "reviewCount",
  "correctCount",
  "wrongCount",
  "mastery",
  "learningProgress"
];
const CACHE_ENRICHMENT_BLOCKLIST = new Set(["nearly", "leed", "lable", "ation"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function stableId(word) {
  return String(word?.wordId || word?.id || "").trim();
}

function syncLegacyMeaningZh(word = {}) {
  if (!Object.prototype.hasOwnProperty.call(word, "meaningZh")) return word;
  const meaning = String(word?.meaning || "").trim();
  return word.meaningZh === meaning ? word : { ...word, meaningZh: meaning };
}

function timestampForPath(value) {
  return String(value || new Date().toISOString()).replace(/[:.]/g, "-");
}

function isReferenceEntry(word = {}) {
  return word?.studyMode === "reference" || /(?:参考|专名|来源待核|专业参考|拼写变体)/.test(String(word?.category || ""));
}

function isFunctionWord(word = {}) {
  return /\b(?:article|auxiliary|conjunction|determiner|interjection|modal|preposition|pronoun)\b/i.test(String(word?.pos || ""));
}

function legacyEnrichmentTarget(word = {}) {
  if (isReferenceEntry(word)) return { applicable: false, common: 0, phrase: 0 };
  if (isFunctionWord(word)) return { applicable: true, common: 0, phrase: 2 };
  if (word?.difficulty === "低频认识即可") return { applicable: true, common: 1, phrase: 0 };
  if (word?.difficulty === "高级加分") return { applicable: true, common: 2, phrase: 1 };
  return { applicable: true, common: 2, phrase: 2 };
}

function translatedPhraseItems(value, max = 20) {
  return normalizeAiPhraseItems(value, { max, requireChinese: true });
}

function mergePhraseItems(existing, cached, max = 4) {
  const output = [];
  const seen = new Set();
  for (const item of [...translatedPhraseItems(existing), ...translatedPhraseItems(cached)]) {
    const key = normalizeWord(item.phrase);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= max) break;
  }
  return output;
}

function shouldUseCacheEnrichment(word) {
  const target = legacyEnrichmentTarget(word);
  if (!target.applicable) return false;
  const common = translatedPhraseItems(word?.collocations).length;
  const phrase = translatedPhraseItems(word?.phraseCollocations).length;
  return common < target.common || phrase < target.phrase;
}

function normalizeFamilyRelations(word) {
  if (!Array.isArray(word?.wordFamily)) return { word, changes: 0 };
  let changes = 0;
  let removedSelfRelations = 0;
  const ownerKey = normalizeWord(word?.word);
  const wordFamily = word.wordFamily.flatMap((item) => {
    if (normalizeWord(typeof item === "string" ? item : item?.word) === ownerKey) {
      removedSelfRelations += 1;
      return [];
    }
    if (!item || typeof item !== "object") return item;
    const raw = String(item.relation || "").trim();
    const canonical = FAMILY_RELATION_ALIASES.get(raw);
    if (!canonical) return [item];
    changes += 1;
    return [{
      ...item,
      relation: canonical,
      relationOriginal: item.relationOriginal || raw
    }];
  });
  return changes || removedSelfRelations
    ? { word: { ...word, wordFamily }, changes, removedSelfRelations }
    : { word, changes: 0, removedSelfRelations: 0 };
}

function applyOverride(word, override) {
  const set = override?.set && typeof override.set === "object" ? override.set : {};
  const protectedState = Object.fromEntries(USER_STATE_FIELDS.map((field) => [field, word?.[field]]));
  const next = { ...word, ...set };
  for (const [field, value] of Object.entries(protectedState)) {
    if (value === undefined) delete next[field];
    else next[field] = value;
  }
  return next;
}

function buildQualityCounts(words, tidyAudit, basicWords) {
  const brushable = words.filter((word) => isBrushableWord(word) && !isInflectedReferenceWord(word));
  const knownHeadwords = new Set(words.map((word) => normalizeWord(word?.word)).filter(Boolean));
  const counts = {
    repair: 0,
    classification: 0,
    enrichment: 0,
    familyReview: 0,
    familyPromotion: 0,
    tidy: 0
  };
  const samples = {
    repair: [],
    classification: [],
    enrichment: [],
    familyReview: [],
    familyPromotion: [],
    tidy: []
  };

  for (const word of brushable) {
    const quality = getWordQualityEvaluation(word, {
      needsRepair: isLikelyWrongAiWord(word),
      knownHeadwords
    });
    if (quality.lane === "repair") {
      counts.repair += 1;
      samples.repair.push(word.word);
    }
    if (quality.lane === "classification") {
      counts.classification += 1;
      samples.classification.push(word.word);
    }
    if (quality.needsOptionalEnrichment) {
      counts.enrichment += 1;
      samples.enrichment.push(word.word);
    }
    if (quality.needsFamilyReview) {
      counts.familyReview += 1;
      samples.familyReview.push(word.word);
    }
    if (quality.hasFamilyPromotionCandidate) {
      counts.familyPromotion += 1;
      samples.familyPromotion.push(word.word);
    }
  }

  const removableKeys = buildRemovableWordKeySet(basicWords, words);
  const tidyReview = buildLexiconTidyReview(words, {
    audit: tidyAudit,
    removableKeys
  });
  counts.tidy = tidyReview.counts.review;
  samples.tidy = [...tidyReview.candidateByIndex.values()].map((entry) => entry.word);
  return { counts, samples };
}

function assertStableData(beforeWords, afterWords) {
  if (beforeWords.length !== afterWords.length) throw new Error("Repair changed the physical word count");
  const beforeIds = beforeWords.map(stableId);
  const afterIds = afterWords.map(stableId);
  if (beforeIds.some((id) => !id) || JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
    throw new Error("Repair changed or removed stable IDs");
  }
  const beforeHeadwords = beforeWords.map((word) => String(word?.word || ""));
  const afterHeadwords = afterWords.map((word) => String(word?.word || ""));
  if (JSON.stringify(beforeHeadwords) !== JSON.stringify(afterHeadwords)) {
    throw new Error("Repair changed stable headwords");
  }
  for (let index = 0; index < beforeWords.length; index += 1) {
    for (const field of USER_STATE_FIELDS) {
      if (JSON.stringify(beforeWords[index]?.[field]) !== JSON.stringify(afterWords[index]?.[field])) {
        throw new Error(`Repair changed protected user state ${field} for ${beforeWords[index]?.word}`);
      }
    }
  }
}

function buildPlan(generatedAt) {
  if (sha256File(MASTER_PATH) !== sha256File(PUBLIC_PATH)) {
    throw new Error("Two formal words.json files differ; stopped before writing");
  }
  const payload = readJson(PUBLIC_PATH);
  const words = Array.isArray(payload?.words) ? payload.words : [];
  const cache = readJson(CACHE_PATH);
  const basicWords = readJson(BASIC_PATH);
  const overridesPayload = readJson(OVERRIDES_PATH);
  const overrides = Array.isArray(overridesPayload?.entries) ? overridesPayload.entries : [];
  if (!words.length || words.length !== Number(payload?.count)) throw new Error("Formal lexicon count metadata is invalid");

  const beforeAudit = buildQualityCounts(words, createEmptyLexiconTidyAudit(), basicWords);
  const beforeCounts = beforeAudit.counts;
  const cacheByWord = new Map(
    Object.entries(cache).map(([cacheKey, entry]) => [
      normalizeWord(entry?.word || cacheKey),
      normalizeCachedRecoveryEntry(entry, cacheKey)
    ])
  );
  const overrideById = new Map(overrides.map((entry) => [String(entry?.id || ""), entry]));
  if (overrideById.size !== overrides.length) throw new Error("Manual override IDs are missing or duplicated");

  const changes = {
    classificationFilled: 0,
    cacheEnrichedWords: 0,
    cacheCollocationsAdded: 0,
    manualOverridesApplied: 0,
    familyRelationsCanonicalized: 0,
    familySelfRelationsRemoved: 0,
    tidyKeepsRecorded: 0
  };
  const changedIds = new Set();

  const nextWords = words.map((sourceWord) => {
    let word = sourceWord;
    const cacheEntry = cacheByWord.get(normalizeWord(sourceWord?.word));
    if (
      (!Array.isArray(word?.topics) || !word.topics.length) &&
      Array.isArray(cacheEntry?.topics) &&
      cacheEntry.topics.length
    ) {
      word = { ...word, topics: cacheEntry.topics };
      changes.classificationFilled += 1;
      changedIds.add(stableId(sourceWord));
    }

    if (
      cacheEntry &&
      !CACHE_ENRICHMENT_BLOCKLIST.has(normalizeWord(word?.word)) &&
      shouldUseCacheEnrichment(word)
    ) {
      const collocations = mergePhraseItems(word?.collocations, cacheEntry.collocations);
      const phraseCollocations = mergePhraseItems(word?.phraseCollocations, cacheEntry.phraseCollocations);
      const beforeTotal = translatedPhraseItems(word?.collocations).length + translatedPhraseItems(word?.phraseCollocations).length;
      const afterTotal = collocations.length + phraseCollocations.length;
      if (
        JSON.stringify(collocations) !== JSON.stringify(word?.collocations || []) ||
        JSON.stringify(phraseCollocations) !== JSON.stringify(word?.phraseCollocations || [])
      ) {
        word = { ...word, collocations, phraseCollocations };
        changes.cacheEnrichedWords += 1;
        changes.cacheCollocationsAdded += Math.max(0, afterTotal - beforeTotal);
        changedIds.add(stableId(sourceWord));
      }
    }

    const override = overrideById.get(stableId(sourceWord));
    if (override) {
      if (String(override.word || "") !== String(sourceWord.word || "")) {
        throw new Error(`Manual override headword mismatch for ${stableId(sourceWord)}`);
      }
      word = applyOverride(word, override);
      changes.manualOverridesApplied += 1;
      changedIds.add(stableId(sourceWord));
      overrideById.delete(stableId(sourceWord));
    }

    const normalizedFamily = normalizeFamilyRelations(word);
    if (normalizedFamily.changes) {
      word = normalizedFamily.word;
      changes.familyRelationsCanonicalized += normalizedFamily.changes;
      changedIds.add(stableId(sourceWord));
    }
    if (normalizedFamily.removedSelfRelations) {
      word = normalizedFamily.word;
      changes.familySelfRelationsRemoved += normalizedFamily.removedSelfRelations;
      changedIds.add(stableId(sourceWord));
    }
    const legacyMeaningSyncedWord = syncLegacyMeaningZh(word);
    if (legacyMeaningSyncedWord !== word) {
      changedIds.add(stableId(sourceWord));
    }
    return legacyMeaningSyncedWord;
  });
  if (overrideById.size) throw new Error(`Manual override targets not found: ${[...overrideById.keys()].join(", ")}`);
  assertStableData(words, nextWords);

  const removableKeys = buildRemovableWordKeySet(basicWords, nextWords);
  const unreviewedTidy = buildLexiconTidyReview(nextWords, {
    audit: createEmptyLexiconTidyAudit(),
    removableKeys
  });
  const issueCandidates = [...unreviewedTidy.candidateByIndex.values()].filter((entry) => entry.hasDataIssue);
  if (issueCandidates.length) {
    throw new Error(`Unresolved tidy data issues remain: ${issueCandidates.map((entry) => entry.word).join(", ")}`);
  }
  const tidyRecords = {};
  for (const candidate of unreviewedTidy.candidateByIndex.values()) {
    const word = nextWords[candidate.index];
    tidyRecords[getTidyAuditKey(word, candidate.index)] = {
      sourceLexicon: "main",
      wordId: stableId(word),
      word: word.word,
      decision: "keep",
      reasonCodes: candidate.reasonCodes,
      reviewBasis: "valid-complete-headword-retained-in-main-lexicon",
      reviewedAt: Date.parse(generatedAt)
    };
  }
  changes.tidyKeepsRecorded = Object.keys(tidyRecords).length;
  const tidyAudit = {
    version: 1,
    generatedAt,
    updatedAt: Date.parse(generatedAt),
    sourceLexiconCount: nextWords.length,
    records: tidyRecords
  };

  const afterAudit = buildQualityCounts(nextWords, tidyAudit, basicWords);
  const afterCounts = afterAudit.counts;
  const unresolved = Object.entries(afterCounts).filter(([, count]) => count !== 0);
  if (unresolved.length) {
    throw new Error(
      `Quality queues are not zero: ${unresolved.map(([key, count]) =>
        `${key}=${count} (${afterAudit.samples[key].slice(0, 20).join(", ")})`
      ).join("; ")}`
    );
  }

  const nextPayload = {
    ...payload,
    version: `v-quality-queues-zero-${nextWords.length}-20260730`,
    savedAt: generatedAt,
    count: nextWords.length,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords),
    qualityReview: {
      version: "quality-queues-zero-v1",
      reviewedAt: generatedAt,
      offlineCacheOnly: true,
      paidAiCalls: 0,
      counts: afterCounts
    },
    words: nextWords
  };
  const wordsContent = `${JSON.stringify(nextPayload, null, 2)}\n`;
  const tidyContent = `${JSON.stringify(tidyAudit, null, 2)}\n`;

  return {
    wordsContent,
    tidyContent,
    report: {
      generatedAt,
      sourceLexiconVersion: payload.version,
      physicalWords: words.length,
      stableIdsChanged: 0,
      stableHeadwordsChanged: 0,
      userStateChanges: 0,
      paidAiCalls: 0,
      estimatedCost: 0,
      beforeCounts,
      afterCounts,
      changes,
      changedWords: changedIds.size
    }
  };
}

function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.quality-repair-tmp`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

const apply = process.argv.includes("--apply");
const generatedAtArgIndex = process.argv.indexOf("--generated-at");
const generatedAt = generatedAtArgIndex >= 0
  ? String(process.argv[generatedAtArgIndex + 1] || "").trim()
  : new Date().toISOString();
if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("Invalid --generated-at value");

const plan = buildPlan(generatedAt);
fs.mkdirSync(REPORT_DIR, { recursive: true });
const reportPath = path.join(REPORT_DIR, apply ? "apply.json" : "dry-run.json");

if (apply) {
  const backupDir = path.join(ROOT, "backups", `master-lexicon-quality-repair-${timestampForPath(generatedAt)}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(MASTER_PATH, path.join(backupDir, "words.cache.before.json"));
  fs.copyFileSync(PUBLIC_PATH, path.join(backupDir, "words.public.before.json"));
  fs.copyFileSync(CACHE_PATH, path.join(backupDir, "deepseek-word-cache.before.json"));
  if (fs.existsSync(TIDY_AUDIT_PATH)) {
    fs.copyFileSync(TIDY_AUDIT_PATH, path.join(backupDir, "lexicon-tidy-audit.before.json"));
  }

  atomicWrite(MASTER_PATH, plan.wordsContent);
  atomicWrite(PUBLIC_PATH, plan.wordsContent);
  atomicWrite(TIDY_AUDIT_PATH, plan.tidyContent);
  if (sha256File(MASTER_PATH) !== sha256File(PUBLIC_PATH)) {
    throw new Error("Formal lexicon copies differ after write");
  }
  plan.report.backupDir = path.relative(ROOT, backupDir).replace(/\\/g, "/");
  plan.report.outputSha256 = sha256File(PUBLIC_PATH);
}

plan.report.mode = apply ? "apply" : "dry-run";
fs.writeFileSync(reportPath, `${JSON.stringify(plan.report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(plan.report, null, 2));
