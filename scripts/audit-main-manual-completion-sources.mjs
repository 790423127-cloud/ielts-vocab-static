#!/usr/bin/env node

/**
 * Read-only audit for main-lexicon entries that are still in the required
 * completion lane and have no standalone G-reading headword. It reports
 * whether local historical profiles can be reviewed instead of regenerated.
 * This script never writes data and never calls an external API.
 */
import fs from "node:fs";
import path from "node:path";
import {
  isUsableAiProfile,
  normalizeProfileKey,
  readProfileCache
} from "../app/lib/ai/deepseek-word-profile.server.mjs";
import { isReadingGStandaloneStudyEntry } from "../app/lib/reading-g-vocab/ai-completion.mjs";
import {
  isAiProfileCompatibleWithDeclaredPos,
  normalizePartOfSpeechTokens
} from "../app/lib/vocab/multi-pos-sense-coverage.mjs";
import { isMeaningDetailInformative } from "../app/lib/vocab/meaning-display.mjs";
import { isLikelyWrongAiWord } from "../app/lib/vocab/page-word-helpers.mjs";
import { isBrushableWord } from "../app/lib/vocab/word-study-eligibility.mjs";
import { getWordQualityEvaluation } from "../app/lib/vocab/word-quality-status.mjs";

const root = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function comparableMeaning(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^(noun|verb|adjective|adverb|preposition|conjunction|pronoun|determiner|phrase|n|v|adj|adv|prep|conj)\.?\s*/i, "")
    .replace(/[\s,;:，；：。.!?！？、“”‘’'"()（）/\\-]+/gu, "");
}

function comparableExample(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s,;:，；：。.!?！？、“”‘’'"()（）/\\-]+/gu, "");
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

function profileCoversAllCommonMeanings(entry, profile) {
  const mainTokens = glossTokens(entry.meaning);
  if (mainTokens.length <= 1) return true;
  const primaryDetail = comparableMeaning(profile.meaningDetailZh);
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
    (mainToken.length >= 2 && primaryDetail.includes(comparableMeaning(mainToken)))
    || detailedOtherMeanings.some((meaning) => (
      meaning.hasDetail && tokensOverlap(mainToken, meaning.token)
    ))
  ));
}

function relaxedSenseAlignment(entry, profile) {
  const mainTokens = glossTokens(entry.meaning);
  const profileTokens = glossTokens(profile.meaning);
  if (!mainTokens.length || !profileTokens.length) return "";
  const mainSet = [...new Set(mainTokens)].sort().join("|");
  const profileSet = [...new Set(profileTokens)].sort().join("|");
  if (mainSet && mainSet === profileSet && profileCoversAllCommonMeanings(entry, profile)) {
    return "same-gloss-set";
  }
  if (
    profileTokens.some((token) => token === mainTokens[0] || token.includes(mainTokens[0]))
    && profileCoversAllCommonMeanings(entry, profile)
  ) {
    return "primary-common-gloss-aligned";
  }
  return "";
}

function profileSignature(profile = {}) {
  return JSON.stringify({
    word: normalizeProfileKey(profile.word),
    pos: String(profile.pos || "").trim().toLowerCase(),
    meaning: comparableMeaning(profile.meaning),
    meaningDetailZh: String(profile.meaningDetailZh || "").trim(),
    example: comparableExample(profile.example)
  });
}

function isHistoricalProfilePosCompatible(entry, profile) {
  const expected = normalizePartOfSpeechTokens(entry.primaryPos || entry.pos);
  const actual = normalizePartOfSpeechTokens(profile?.primaryPos || profile?.pos);
  if (expected.length === 1) return actual.length === 1 && actual[0] === expected[0];
  return isAiProfileCompatibleWithDeclaredPos(profile, entry.primaryPos || entry.pos);
}

const mainPayload = readJson("public/data/words.json");
const readingG = readJson("public/data/reading-g-vocab.json");
const knownHeadwords = new Set(
  mainPayload.words.map((entry) => normalizeProfileKey(entry.word)).filter(Boolean)
);
const readingGKeys = new Set(
  readingG.items
    .filter(isReadingGStandaloneStudyEntry)
    .map((entry) => normalizeProfileKey(entry.word))
    .filter(Boolean)
);
const targets = mainPayload.words.filter((entry) => {
  if (!isBrushableWord(entry)) return false;
  const evaluation = getWordQualityEvaluation(entry, {
    needsRepair: isLikelyWrongAiWord(entry),
    knownHeadwords
  });
  return evaluation.lane === "completion" && !readingGKeys.has(normalizeProfileKey(entry.word));
});

const profilesByWord = new Map();
for (const profile of Object.values(readProfileCache())) {
  const key = normalizeProfileKey(profile?.word);
  if (!key) continue;
  if (!profilesByWord.has(key)) profilesByWord.set(key, []);
  profilesByWord.get(key).push(profile);
}

const rows = targets.map((entry) => {
  const quality = getWordQualityEvaluation(entry, {
    needsRepair: isLikelyWrongAiWord(entry),
    knownHeadwords
  });
  const allProfiles = profilesByWord.get(normalizeProfileKey(entry.word)) || [];
  const compatibleProfiles = allProfiles.filter((profile) => (
    isUsableAiProfile(profile)
    && isHistoricalProfilePosCompatible(entry, profile)
  ));
  const compatibleDetailProfiles = allProfiles.filter((profile) => (
    isMeaningDetailInformative(profile)
    && isHistoricalProfilePosCompatible(entry, profile)
  ));
  const relaxedDetailProfiles = compatibleDetailProfiles
    .map((profile) => ({ profile, reason: relaxedSenseAlignment(entry, profile) }))
    .filter((candidate) => candidate.reason);
  const exactMeaningProfiles = compatibleProfiles.filter((profile) => (
    comparableMeaning(entry.meaning)
    && comparableMeaning(entry.meaning) === comparableMeaning(profile.meaning)
  ));
  const exactExampleProfiles = compatibleProfiles.filter((profile) => (
    comparableExample(entry.example)
    && comparableExample(entry.example) === comparableExample(profile.example)
  ));
  const strictProfiles = [...new Map(
    [...exactExampleProfiles, ...exactMeaningProfiles]
      .map((profile) => [profileSignature(profile), profile])
  ).values()];
  const strictDetailProfiles = [...new Map(
    compatibleDetailProfiles
      .filter((profile) => (
        (
          comparableMeaning(entry.meaning)
          && comparableMeaning(entry.meaning) === comparableMeaning(profile.meaning)
        )
        || (
          comparableExample(entry.example)
          && comparableExample(entry.example) === comparableExample(profile.example)
        )
      ))
      .map((profile) => [String(profile.meaningDetailZh || "").trim(), profile])
  ).values()];
  const relaxedDetails = [...new Map(
    relaxedDetailProfiles.map((candidate) => [
      String(candidate.profile.meaningDetailZh || "").trim(),
      candidate
    ])
  ).values()];
  return {
    word: entry.word,
    pos: entry.primaryPos || entry.pos || "",
    meaning: entry.meaning || "",
    example: entry.example || "",
    exampleCn: entry.exampleCn || "",
    missingContentFields: quality.missingContentFields || [],
    localProfiles: allProfiles.length,
    compatibleProfiles: compatibleProfiles.length,
    exactMeaningProfiles: exactMeaningProfiles.length,
    exactExampleProfiles: exactExampleProfiles.length,
    strictDistinctProfiles: strictProfiles.length,
    strictDetailDistinctProfiles: strictDetailProfiles.length,
    relaxedDetailDistinctProfiles: relaxedDetails.length,
    relaxedDetail: relaxedDetails.length === 1
      ? {
          reason: relaxedDetails[0].reason,
          meaning: relaxedDetails[0].profile.meaning || "",
          meaningDetailZh: relaxedDetails[0].profile.meaningDetailZh || ""
        }
      : null,
    strictProfile: strictProfiles.length === 1
      ? {
          meaning: strictProfiles[0].meaning || "",
          meaningDetailZh: strictProfiles[0].meaningDetailZh || "",
          example: strictProfiles[0].example || "",
          exampleCn: strictProfiles[0].exampleCn || ""
        }
      : null,
    historicalOptions: allProfiles.map((profile) => ({
      pos: profile.pos || "",
      meaning: profile.meaning || "",
      meaningDetailZh: profile.meaningDetailZh || "",
      definition: profile.definition || "",
      otherMeanings: Array.isArray(profile.otherMeanings) ? profile.otherMeanings : []
    }))
  };
});

const batchArgumentIndex = process.argv.indexOf("--batch");
if (batchArgumentIndex >= 0) {
  const offset = Math.max(0, Number(process.argv[batchArgumentIndex + 1]) || 0);
  const limit = Math.min(200, Math.max(1, Number(process.argv[batchArgumentIndex + 2]) || 50));
  console.log(JSON.stringify({
    networkCalls: 0,
    paidAiCalls: 0,
    total: rows.length,
    offset,
    limit,
    items: rows.slice(offset, offset + limit).map((row) => ({
      word: row.word,
      pos: row.pos,
      meaning: row.meaning,
      example: row.example,
      exampleCn: row.exampleCn,
      historicalOptions: row.historicalOptions
    }))
  }, null, 2));
  process.exit(0);
}

const count = (predicate) => rows.filter(predicate).length;
function evenlySample(list, limit) {
  if (list.length <= limit) return list;
  const sampled = [];
  for (let index = 0; index < limit; index += 1) {
    sampled.push(list[Math.floor(index * (list.length - 1) / (limit - 1))]);
  }
  return sampled;
}
const missingFieldSets = Object.fromEntries(
  [...rows.reduce((counts, row) => {
    const key = row.missingContentFields.join("+") || "none";
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map())].sort((left, right) => right[1] - left[1])
);
const summaryOnly = process.argv.includes("--summary");
const report = {
  networkCalls: 0,
  paidAiCalls: 0,
  targetWords: targets.length,
  missingFieldSets,
  withAnyHistoricalProfile: count((row) => row.localProfiles > 0),
  withCompatibleCompleteProfile: count((row) => row.compatibleProfiles > 0),
  withExactPrimaryMeaningProfile: count((row) => row.exactMeaningProfiles > 0),
  withExactExampleProfile: count((row) => row.exactExampleProfiles > 0),
  withOneStrictDistinctProfile: count((row) => row.strictDistinctProfiles === 1),
  withSeveralStrictDistinctProfiles: count((row) => row.strictDistinctProfiles > 1),
  withoutStrictHistoricalProfile: count((row) => row.strictDistinctProfiles === 0),
  withOneStrictHistoricalDetail: count((row) => row.strictDetailDistinctProfiles === 1),
  withSeveralStrictHistoricalDetails: count((row) => row.strictDetailDistinctProfiles > 1),
  withoutStrictHistoricalDetail: count((row) => row.strictDetailDistinctProfiles === 0),
  withOneRelaxedHistoricalDetail: count((row) => row.relaxedDetailDistinctProfiles === 1),
  withSeveralRelaxedHistoricalDetails: count((row) => row.relaxedDetailDistinctProfiles > 1),
  withoutRelaxedHistoricalDetail: count((row) => row.relaxedDetailDistinctProfiles === 0),
  multiFieldMissing: rows
    .filter((row) => row.missingContentFields.length > 1)
    .map((row) => ({
      word: row.word,
      pos: row.pos,
      meaning: row.meaning,
      example: row.example,
      missingContentFields: row.missingContentFields
    })),
  strictProfilePreview: summaryOnly ? [] : rows
    .filter((row) => row.strictDistinctProfiles === 1)
    .slice(0, 40)
    .map((row) => ({
      word: row.word,
      pos: row.pos,
      currentMeaning: row.meaning,
      currentExample: row.example,
      profile: row.strictProfile
    })),
  relaxedProfilePreview: summaryOnly ? [] : evenlySample(
    rows.filter((row) => row.relaxedDetailDistinctProfiles === 1),
    100
  ).map((row) => ({
      word: row.word,
      pos: row.pos,
      currentMeaning: row.meaning,
      currentExampleCn: row.exampleCn,
      profile: row.relaxedDetail
    })),
  ambiguousPreview: summaryOnly ? [] : rows.filter((row) => row.strictDistinctProfiles > 1).slice(0, 30),
  noStrictProfilePreview: summaryOnly ? [] : rows.filter((row) => row.strictDistinctProfiles === 0).slice(0, 30)
};

console.log(JSON.stringify(report, null, 2));
