#!/usr/bin/env node

/**
 * Reuse local teaching profiles for the master lexicon. Exact-context AI
 * cache records are preferred; a G-reading entry may be used only when its
 * headword and example or primary gloss match, and the conservative merge
 * actually removes the master entry from the completion lane.
 * The script never calls an external API.
 *
 * Usage:
 *   node scripts/reuse-exact-context-main-cache.mjs --dry-run
 *   node scripts/reuse-exact-context-main-cache.mjs --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildProfileCacheKey,
  isUsableAiProfile,
  normalizeProfileKey,
  readProfileCache
} from "../app/lib/ai/deepseek-word-profile.server.mjs";
import { shouldReuseAiProfileCache } from "../app/lib/ai/ai-profile-cache-contract.mjs";
import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import {
  isReadingGStandaloneStudyEntry
} from "../app/lib/reading-g-vocab/ai-completion.mjs";
import { isReadingGContentIncomplete } from "../app/lib/reading-g-vocab/content-completeness.mjs";
import { mergeAiProfileIntoMainEntry } from "../app/lib/reading-words/main-lexicon-sync.mjs";
import {
  applyMeaningCoverageReview,
  isMeaningCoverageProfileUsable,
  needsMeaningCoverageReview
} from "../app/lib/vocab/meaning-coverage-audit.mjs";
import { isMeaningDetailInformative } from "../app/lib/vocab/meaning-display.mjs";
import {
  isAiProfileCompatibleWithDeclaredPos,
  normalizePartOfSpeechTokens
} from "../app/lib/vocab/multi-pos-sense-coverage.mjs";
import { mergeAiWriteWithExisting } from "../app/lib/vocab/ai-write-merge.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";
import { isLikelyWrongAiWord } from "../app/lib/vocab/page-word-helpers.mjs";
import { isBrushableWord } from "../app/lib/vocab/word-study-eligibility.mjs";
import { getWordQualityEvaluation } from "../app/lib/vocab/word-quality-status.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";

const root = process.cwd();
const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !apply;
const now = new Date().toISOString();
const publicPath = path.join(root, "public", "data", "words.json");
const staticPath = path.join(root, ".static-export-cache", "words.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const readingGPath = path.join(root, "public", "data", "reading-g-vocab.json");

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function stableIdentity(entry = {}) {
  return {
    id: String(entry.id || ""),
    wordId: String(entry.wordId || ""),
    word: String(entry.word || "")
  };
}

function sameIdentity(before, after) {
  const left = stableIdentity(before);
  const right = stableIdentity(after);
  return left.id === right.id && left.wordId === right.wordId && left.word === right.word;
}

function restoreProtectedFields(next, previous) {
  const restored = { ...next };
  for (const field of ["id", "wordId", "word", ...USER_STATE_FIELDS]) {
    if (Object.prototype.hasOwnProperty.call(previous, field)) restored[field] = previous[field];
    else delete restored[field];
  }
  return restored;
}

function evaluationFor(word, knownHeadwords) {
  return getWordQualityEvaluation(word, {
    needsRepair: isLikelyWrongAiWord(word),
    knownHeadwords
  });
}

function canReuse(entry, profile) {
  return Boolean(
    String(entry?.example || "").trim()
    && profile
    && normalizeProfileKey(profile.word) === normalizeProfileKey(entry.word)
    && shouldReuseAiProfileCache(profile, {
      usable: isUsableAiProfile(profile)
        && isAiProfileCompatibleWithDeclaredPos(profile, entry.primaryPos || entry.pos)
    })
  );
}

function comparableText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s,;.!?，；。！？、“”'"()（）]+/gu, "");
}

function isHistoricalProfilePosCompatible(entry, profile) {
  const expected = normalizePartOfSpeechTokens(entry.primaryPos || entry.pos);
  const actual = normalizePartOfSpeechTokens(profile?.primaryPos || profile?.pos);
  if (expected.length === 1) return actual.length === 1 && actual[0] === expected[0];
  return isAiProfileCompatibleWithDeclaredPos(profile, entry.primaryPos || entry.pos);
}

function selectExactHistoricalMeaningDetail(entry, profiles) {
  const compatible = (Array.isArray(profiles) ? profiles : []).filter((profile) => (
    normalizeProfileKey(profile?.word) === normalizeProfileKey(entry.word)
    && isMeaningDetailInformative(profile)
    && isHistoricalProfilePosCompatible(entry, profile)
    && (
      (
        comparableText(entry.meaning)
        && comparableText(entry.meaning) === comparableText(profile.meaning)
      )
      || (
        comparableText(entry.example)
        && comparableText(entry.example) === comparableText(profile.example)
      )
    )
  ));
  const byDetail = new Map();
  for (const profile of compatible) {
    const detail = String(profile.meaningDetailZh || "").normalize("NFC").trim();
    if (detail) byDetail.set(detail, profile);
  }
  return byDetail.size === 1 ? [...byDetail.values()][0] : null;
}

function glossTokens(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/^(noun|verb|adjective|adverb|preposition|conjunction|pronoun|determiner|phrase|n|v|adj|adv|prep|conj)\.?\s*/i, "")
    .split(/[;,，；、/]+/u)
    .map((token) => token
      .replace(/[（(][^）)]*[）)]/gu, "")
      .replace(/[\s:：。.!?！？、“”‘’'"()（）\\-]+/gu, "")
      .trim())
    .filter(Boolean);
}

function tokensOverlap(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  return Math.min(left.length, right.length) >= 2 && (left.includes(right) || right.includes(left));
}

function commonMeaningAlignedHistoricalDetail(entry, profile) {
  const mainTokens = glossTokens(entry.meaning);
  const profileTokens = glossTokens(profile.meaning);
  if (!mainTokens.length || !profileTokens.length) return false;
  const firstMainGloss = mainTokens[0];
  if (profileTokens.some((token) => token === firstMainGloss || token.includes(firstMainGloss))) return true;
  return [...new Set(mainTokens)].sort().join("|") === [...new Set(profileTokens)].sort().join("|");
}

function detailedHistoricalOtherMeanings(profile) {
  return (Array.isArray(profile?.otherMeanings) ? profile.otherMeanings : []).filter((meaning) => (
    meaning
    && typeof meaning === "object"
    && glossTokens(meaning.meaningZh || meaning.meaning).length > 0
    && Boolean(String(
      meaning.definitionZh
      || meaning.definitionEn
      || meaning.definition
      || meaning.exampleCn
      || ""
    ).trim())
  ));
}

function alignedDetailedHistoricalOtherMeanings(entry, profile) {
  const secondaryMeanings = glossTokens(entry.meaning).slice(1);
  if (!secondaryMeanings.length) return [];
  return detailedHistoricalOtherMeanings(profile).filter((meaning) => {
    const token = glossTokens(meaning.meaningZh || meaning.meaning)[0] || "";
    return secondaryMeanings.some((secondary) => tokensOverlap(secondary, token));
  });
}

function hasSuspiciousUntranslatedEnglish(value) {
  const allowed = new Set([
    "android", "app", "covid", "css", "dna", "email", "gps", "html",
    "internet", "iphone", "online", "pdf", "rna", "sql", "usb", "website", "wifi"
  ]);
  const matches = String(value || "").match(/\b[a-z]{3,}\b/g) || [];
  return matches.some((word) => !allowed.has(word.toLowerCase()));
}

function historicalProfileCoversAllCommonMeanings(entry, profile) {
  const mainTokens = glossTokens(entry.meaning);
  if (mainTokens.length <= 1) return true;
  const primaryDetail = comparableText(profile.meaningDetailZh);
  const detailedOtherMeanings = (Array.isArray(profile.otherMeanings) ? profile.otherMeanings : [])
    .filter((meaning) => meaning && typeof meaning === "object")
    .map((meaning) => ({
      token: glossTokens(meaning.meaningZh || meaning.meaning)[0] || "",
      hasDetail: Boolean(String(
        meaning.definitionZh
        || meaning.definitionEn
        || meaning.definition
        || meaning.exampleCn
        || ""
      ).trim())
    }));
  return mainTokens.slice(1).every((mainToken) => (
    (mainToken.length >= 2 && primaryDetail.includes(mainToken))
    || detailedOtherMeanings.some((meaning) => (
      meaning.hasDetail && tokensOverlap(mainToken, meaning.token)
    ))
  ));
}

function selectCommonMeaningHistoricalDetail(entry, profiles) {
  const byDetail = new Map();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (
      normalizeProfileKey(profile?.word) !== normalizeProfileKey(entry.word)
      || !isMeaningDetailInformative(profile)
      || hasSuspiciousUntranslatedEnglish(profile.meaningDetailZh)
      || !isHistoricalProfilePosCompatible(entry, profile)
      || !commonMeaningAlignedHistoricalDetail(entry, profile)
      || !historicalProfileCoversAllCommonMeanings(entry, profile)
    ) {
      continue;
    }
    const detail = String(profile.meaningDetailZh || "").normalize("NFC").trim();
    if (detail) byDetail.set(detail, profile);
  }
  return byDetail.size === 1 ? [...byDetail.values()][0] : null;
}

function canReuseReadingGEntry(entry, readingGEntry) {
  if (!readingGEntry || isReadingGContentIncomplete(readingGEntry)) return false;
  if (normalizeProfileKey(entry.word) !== normalizeProfileKey(readingGEntry.word)) return false;
  const mainExample = comparableText(entry.example);
  const gExample = comparableText(readingGEntry.example);
  const mainMeaning = comparableText(entry.meaning);
  const gMeaning = comparableText(
    readingGEntry.meaning || readingGEntry.primaryMeaningZh || readingGEntry.meaningZh
  );
  return Boolean(
    (mainExample && mainExample === gExample)
    || (mainMeaning && mainMeaning === gMeaning)
  );
}

function mergeExactProfile(entry, profile) {
  let next = mergeAiWriteWithExisting(entry, {
    ...profile,
    word: entry.word,
    aiReplaceExisting: false,
    source: "ai-cache"
  });
  if (needsMeaningCoverageReview(next) && isMeaningCoverageProfileUsable(profile, entry.word)) {
    next = applyMeaningCoverageReview(next, profile, {
      source: "ai-cache-exact-context",
      reviewedAt: now
    });
  }
  next = restoreProtectedFields(next, entry);
  if (!sameIdentity(entry, next)) {
    throw new Error(`Stable identity changed while merging ${entry.word}`);
  }
  return next;
}

function main() {
  if (apply && dryRun) throw new Error("--apply and --dry-run cannot be used together");
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) {
    throw new Error("The two authoritative master lexicon files differ; merge stopped.");
  }
  const payload = JSON.parse(publicRaw.toString("utf8"));
  if (!Array.isArray(payload.words) || payload.words.length !== Number(payload.count)) {
    throw new Error("Master lexicon words/count mismatch; merge stopped.");
  }
  const cache = readProfileCache();
  const cacheProfilesByWord = new Map();
  for (const profile of Object.values(cache)) {
    const key = normalizeProfileKey(profile?.word);
    if (!key) continue;
    if (!cacheProfilesByWord.has(key)) cacheProfilesByWord.set(key, []);
    cacheProfilesByWord.get(key).push(profile);
  }
  const readingG = JSON.parse(fs.readFileSync(readingGPath, "utf8"));
  if (!Array.isArray(readingG?.items)) {
    throw new Error("G-reading vocabulary is unavailable; merge stopped.");
  }
  const readingGByKey = new Map();
  for (const entry of readingG.items.filter(isReadingGStandaloneStudyEntry)) {
    const key = normalizeProfileKey(entry.word);
    if (!key) continue;
    const existing = readingGByKey.get(key);
    if (existing) readingGByKey.set(key, null);
    else if (!readingGByKey.has(key)) readingGByKey.set(key, entry);
  }
  const knownHeadwords = new Set(payload.words.map((entry) => normalizeProfileKey(entry.word)).filter(Boolean));
  const beforeCounts = { completion: 0, repair: 0, classification: 0, ready: 0 };
  const afterCounts = { completion: 0, repair: 0, classification: 0, ready: 0 };
  const reused = [];
  let exactCacheReused = 0;
  let readingGReused = 0;
  let historicalMeaningDetailReused = 0;
  let commonMeaningDetailReused = 0;
  const nextWords = payload.words.map((entry) => {
    if (!isBrushableWord(entry)) return entry;
    const before = evaluationFor(entry, knownHeadwords);
    beforeCounts[before.lane] += 1;
    if (before.lane !== "completion") {
      afterCounts[before.lane] += 1;
      return entry;
    }
    const profile = cache[buildProfileCacheKey(entry.word, entry.example)];
    let merged = null;
    let source = "";
    if (canReuse(entry, profile)) {
      merged = mergeExactProfile(entry, profile);
      source = "exact-context-cache";
    } else {
      const readingGEntry = readingGByKey.get(normalizeProfileKey(entry.word));
      if (canReuseReadingGEntry(entry, readingGEntry)) {
        const candidate = restoreProtectedFields(
          mergeAiProfileIntoMainEntry(entry, readingGEntry, { now }),
          entry
        );
        const candidateEvaluation = evaluationFor(candidate, knownHeadwords);
        if (candidateEvaluation.lane !== "completion" && candidateEvaluation.lane !== "repair") {
          merged = candidate;
          source = "reading-g";
        }
      }
      if (!merged && !readingGByKey.has(normalizeProfileKey(entry.word))) {
        const historicalProfile = selectExactHistoricalMeaningDetail(
          entry,
          cacheProfilesByWord.get(normalizeProfileKey(entry.word))
        );
        if (historicalProfile) {
          const candidate = restoreProtectedFields({
            ...entry,
            meaningDetailZh: String(historicalProfile.meaningDetailZh).normalize("NFC").trim(),
            meaningDetailSource: "local-history-exact-sense",
            meaningDetailReviewedAt: now,
            updatedAt: now
          }, entry);
          const candidateEvaluation = evaluationFor(candidate, knownHeadwords);
          if (candidateEvaluation.lane !== "completion" && candidateEvaluation.lane !== "repair") {
            merged = candidate;
            source = "historical-meaning-detail";
          }
        }
      }
      if (!merged && !readingGByKey.has(normalizeProfileKey(entry.word))) {
        const historicalProfile = selectCommonMeaningHistoricalDetail(
          entry,
          cacheProfilesByWord.get(normalizeProfileKey(entry.word))
        );
        if (historicalProfile) {
          const candidate = restoreProtectedFields({
            ...entry,
            meaningDetailZh: String(historicalProfile.meaningDetailZh).normalize("NFC").trim(),
            ...((!Array.isArray(entry.otherMeanings) || entry.otherMeanings.length === 0)
              && alignedDetailedHistoricalOtherMeanings(entry, historicalProfile).length
              ? {
                  otherMeanings: alignedDetailedHistoricalOtherMeanings(entry, historicalProfile),
                  otherMeaningsSource: "local-history-common-meaning"
                }
              : {}),
            meaningDetailSource: "local-history-common-meaning",
            meaningDetailReviewedAt: now,
            updatedAt: now
          }, entry);
          const candidateEvaluation = evaluationFor(candidate, knownHeadwords);
          if (candidateEvaluation.lane !== "completion" && candidateEvaluation.lane !== "repair") {
            merged = candidate;
            source = "historical-common-meaning-detail";
          }
        }
      }
    }
    if (!merged) {
      afterCounts[before.lane] += 1;
      return entry;
    }
    const after = evaluationFor(merged, knownHeadwords);
    afterCounts[after.lane] += 1;
    if (source === "exact-context-cache") exactCacheReused += 1;
    if (source === "reading-g") readingGReused += 1;
    if (source === "historical-meaning-detail") historicalMeaningDetailReused += 1;
    if (source === "historical-common-meaning-detail") commonMeaningDetailReused += 1;
    reused.push({
      id: entry.id || entry.wordId,
      word: entry.word,
      source,
      before: before.lane,
      after: after.lane
    });
    return merged;
  });
  if (nextWords.length !== payload.words.length || nextWords.some((entry, index) => !sameIdentity(payload.words[index], entry))) {
    throw new Error("Master lexicon count/order/stable identity changed; merge stopped.");
  }
  const nextPayload = {
    ...payload,
    words: nextWords,
    count: nextWords.length,
    savedAt: now,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords)
  };
  const content = `${JSON.stringify(nextPayload, null, 2)}\n`;
  const report = {
    mode: apply ? "apply" : "dry-run",
    networkCalls: 0,
    paidAiCalls: 0,
    cacheEntries: Object.keys(cache).length,
    reused: reused.length,
    exactCacheReused,
    readingGReused,
    historicalMeaningDetailReused,
    commonMeaningDetailReused,
    resolved: reused.filter((entry) => entry.after !== "completion").length,
    retainedInCompletion: reused.filter((entry) => entry.after === "completion").length,
    beforeCounts,
    afterCounts,
    stableIdsChanged: 0,
    wordPreview: reused.slice(0, 100).map((entry) => entry.word)
  };
  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const stamp = now.replace(/[:.]/g, "-");
  const backupDirectory = path.join(root, "backups", "main-local-reuse", stamp);
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backups = [
    [publicPath, path.join(backupDirectory, "words.json")],
    [staticPath, path.join(backupDirectory, "cache-words.json")],
    [baselinePath, path.join(backupDirectory, "master-lexicon-baseline.mjs")]
  ];
  for (const [source, destination] of backups) fs.copyFileSync(source, destination);
  const baselineContent = renderMasterLexiconBaseline({
    count: nextPayload.count,
    version: nextPayload.version,
    fileHash: sha256(content)
  });
  try {
    atomicWrite(publicPath, content);
    atomicWrite(staticPath, content);
    atomicWrite(baselinePath, baselineContent);
  } catch (error) {
    for (const [source, destination] of backups) fs.copyFileSync(destination, source);
    throw error;
  }
  report.backupDirectory = path.relative(root, backupDirectory).replace(/\\/g, "/");
  fs.writeFileSync(path.join(backupDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
