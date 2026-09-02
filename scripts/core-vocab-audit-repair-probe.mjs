#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONFIRMED_PERSON_NAME_WORDS,
  normalizeHeadword
} from "../app/lib/vocab/lexicon-guard-shared.mjs";
import { VALID_DIFFICULTIES, runQualityGate } from "./core-vocab-quality-audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORDS_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC_WORDS_PATH = path.join(ROOT, "public", "data", "words.json");
const OUT_DIR = path.join(ROOT, "reports");
const OUT_PATH = path.join(OUT_DIR, "core-vocab-audit-repair-probe.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isPhraseEntry(entry) {
  const word = normalizeHeadword(entry?.word);
  const isReviewedCompoundHeadword = entry?.entryType === "headword" && entry?.lexicalizedCompound === true;
  return Boolean(
    entry?.isPhrase ||
    entry?.entryType === "phrase" ||
    entry?.pos === "phrase" ||
    (word.includes(" ") && !isReviewedCompoundHeadword)
  );
}

function entrySummary(entry) {
  return {
    id: String(entry?.id || entry?.wordId || ""),
    word: String(entry?.word || ""),
    difficulty: String(entry?.difficulty || ""),
    entryType: String(entry?.entryType || ""),
    pos: String(entry?.pos || ""),
    isPhrase: entry?.isPhrase === true,
    lexicalizedCompound: entry?.lexicalizedCompound === true,
    category: String(entry?.category || ""),
    source: String(entry?.source || ""),
    meaning: String(entry?.meaning || ""),
    definition: String(entry?.definition || "")
  };
}

const cachePayload = readJson(WORDS_PATH);
const publicPayload = readJson(PUBLIC_WORDS_PATH);
const words = Array.isArray(cachePayload) ? cachePayload : cachePayload.words || [];
const publicWords = Array.isArray(publicPayload) ? publicPayload : publicPayload.words || [];

const invalidDifficulty = words.filter((entry) => !VALID_DIFFICULTIES.has(entry?.difficulty));
const difficultyCounts = new Map();
for (const entry of invalidDifficulty) {
  const key = String(entry?.difficulty ?? "");
  difficultyCounts.set(key, (difficultyCounts.get(key) || 0) + 1);
}

const phraseEntries = words.filter(isPhraseEntry);
const confirmedPersonNames = words.filter((entry) => CONFIRMED_PERSON_NAME_WORDS.has(normalizeHeadword(entry?.word)));
const requiredFieldMissing = words.filter((entry) =>
  !normalizeHeadword(entry?.word) || !String(entry?.meaning || "").trim() || !String(entry?.example || "").trim()
);

const cacheIds = new Set(words.map((entry) => String(entry?.id || entry?.wordId || "")).filter(Boolean));
const publicIds = new Set(publicWords.map((entry) => String(entry?.id || entry?.wordId || "")).filter(Boolean));
const onlyInCache = words.filter((entry) => !publicIds.has(String(entry?.id || entry?.wordId || ""))).map(entrySummary);
const onlyInPublic = publicWords.filter((entry) => !cacheIds.has(String(entry?.id || entry?.wordId || ""))).map(entrySummary);

const report = {
  generatedAt: new Date().toISOString(),
  gate: runQualityGate(cachePayload),
  counts: {
    total: words.length,
    publicTotal: publicWords.length,
    invalidDifficulty: invalidDifficulty.length,
    phraseEntries: phraseEntries.length,
    confirmedPersonNames: confirmedPersonNames.length,
    requiredFieldMissing: requiredFieldMissing.length,
    onlyInCache: onlyInCache.length,
    onlyInPublic: onlyInPublic.length
  },
  invalidDifficultyValues: [...difficultyCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
  invalidDifficultyEntries: invalidDifficulty.map(entrySummary),
  phraseEntries: phraseEntries.map(entrySummary),
  confirmedPersonNames: confirmedPersonNames.map(entrySummary),
  requiredFieldMissing: requiredFieldMissing.map(entrySummary),
  onlyInCache,
  onlyInPublic
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  gate: report.gate,
  counts: report.counts,
  invalidDifficultyValues: report.invalidDifficultyValues,
  phraseEntries: report.phraseEntries,
  confirmedPersonNames: report.confirmedPersonNames,
  requiredFieldMissing: report.requiredFieldMissing,
  onlyInCacheCount: report.onlyInCache.length,
  onlyInPublicCount: report.onlyInPublic.length
}, null, 2));
