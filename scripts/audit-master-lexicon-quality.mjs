#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { buildQualityLaneSummary } from "../app/lib/vocab/admin-ai-batch-plan.mjs";
import { findTruncatedHeadwordEntries } from "../app/lib/spelling/truncated-headword.mjs";
import {
  getLikelyWrongAiWordReasons,
  hasHeadwordRepair,
  repairHeadwordLocally
} from "../app/lib/vocab/page-word-helpers.mjs";
import { isBrushableWord } from "../app/lib/vocab/word-study-eligibility.mjs";
import { getWordFamilyStatus, getWordQualityStatus } from "../app/lib/vocab/word-quality-status.mjs";

const root = process.cwd();
const lexiconPath = path.join(root, "public", "data", "words.json");

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function inspect(words) {
  const active = words.filter((entry) => entry?.word && isBrushableWord(entry));
  const missingFields = new Map();
  const invalidFields = new Map();
  const missingPos = new Map();
  const wrongReasons = new Map();
  const invalidOtherMeanings = [];
  const multiPosIncomplete = [];
  const localHeadwordRepairs = [];
  const familyReview = [];
  const duplicateGroups = [];
  const byKey = new Map();

  for (const entry of words) {
    const key = normalize(entry?.word);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(entry);
  }

  for (const [key, entries] of byKey) {
    if (entries.length > 1) {
      duplicateGroups.push({
        key,
        count: entries.length,
        entries: entries.map((entry) => ({ id: entry.id, wordId: entry.wordId, word: entry.word, studyMode: entry.studyMode }))
      });
    }
  }

  for (const entry of active) {
    const quality = getWordQualityStatus(entry);
    for (const field of quality.missingContentFields) increment(missingFields, field);
    for (const field of quality.invalidContentFields) increment(invalidFields, field);
    for (const pos of quality.multiPosCoverage?.missingPosTokens || []) increment(missingPos, pos);
    const reasons = getLikelyWrongAiWordReasons(entry);
    for (const reason of reasons) increment(wrongReasons, reason);
    if (quality.invalidOtherMeaningIndexes.length) {
      invalidOtherMeanings.push({
        word: entry.word,
        id: entry.id,
        indexes: quality.invalidOtherMeaningIndexes
      });
    }
    if (quality.multiPosCoverage?.isMultiPos && !quality.multiPosCoverage.complete) {
      multiPosIncomplete.push({
        word: entry.word,
        id: entry.id,
        pos: entry.pos,
        primaryPos: entry.primaryPos,
        missing: quality.multiPosCoverage.missingPosTokens,
        primaryResolved: quality.multiPosCoverage.primaryResolved
      });
    }
    if (hasHeadwordRepair(entry.word)) {
      localHeadwordRepairs.push({ word: entry.word, repaired: repairHeadwordLocally(entry.word), id: entry.id });
    }
    const family = getWordFamilyStatus(entry, { knownHeadwords: new Set(byKey.keys()) });
    if (family.needsFamilyReview) {
      familyReview.push({ word: entry.word, id: entry.id, items: family.familyReviewItems });
    }
  }

  const truncated = findTruncatedHeadwordEntries(active).map((item) => ({
    word: item.word,
    canonical: item.canonical,
    reason: item.reason,
    id: item.entry?.id
  }));

  return {
    totals: {
      stored: words.length,
      active: active.length,
      references: words.length - active.length,
      duplicateGroups: duplicateGroups.length,
      duplicateRows: duplicateGroups.reduce((sum, item) => sum + item.count - 1, 0),
      localHeadwordRepairs: localHeadwordRepairs.length,
      truncatedHeadwords: truncated.length,
      invalidOtherMeanings: invalidOtherMeanings.length,
      multiPosIncomplete: multiPosIncomplete.length,
      familyReview: familyReview.length
    },
    qualityLanes: buildQualityLaneSummary(words),
    missingFields: sortedCounts(missingFields),
    invalidFields: sortedCounts(invalidFields),
    missingPos: sortedCounts(missingPos),
    wrongReasons: sortedCounts(wrongReasons),
    duplicateGroups,
    localHeadwordRepairs,
    truncated,
    invalidOtherMeanings,
    multiPosIncomplete,
    familyReview
  };
}

const payload = JSON.parse(fs.readFileSync(lexiconPath, "utf8"));
if (!Array.isArray(payload.words)) throw new Error("Master lexicon does not contain a words array.");
const report = inspect(payload.words);

if (process.argv.includes("--full")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(JSON.stringify({
    totals: report.totals,
    qualityLanes: report.qualityLanes,
    missingFields: report.missingFields,
    invalidFields: report.invalidFields,
    missingPos: report.missingPos,
    wrongReasons: report.wrongReasons,
    duplicateGroups: report.duplicateGroups,
    localHeadwordRepairs: report.localHeadwordRepairs,
    truncated: report.truncated,
    familyReview: report.familyReview,
    invalidOtherMeaningsPreview: report.invalidOtherMeanings.slice(0, 40),
    multiPosIncompletePreview: report.multiPosIncomplete.slice(0, 80)
  }, null, 2));
}
