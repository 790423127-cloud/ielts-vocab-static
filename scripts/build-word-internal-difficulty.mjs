import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORDS_FILE = path.join(ROOT, "public", "data", "words.json");
const BASIC_FILE = path.join(ROOT, "public", "data", "basic-words.json");
const MEANING_FILE = path.join(ROOT, "public", "data", "meaning-6000.json");
const IDICTATION_FILE = path.join(ROOT, "public", "data", "idictation-frequency.json");
const OUTPUT_FILE = path.join(
  ROOT,
  "app",
  "lib",
  "vocab",
  "word-internal-difficulty.generated.mjs"
);

const VERSION = "internal-relative-difficulty-v1-20260730";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function normalizeWord(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function wordLetters(word) {
  return normalizeWord(word?.word).replace(/[^a-z]/g, "");
}

function estimateSyllables(word) {
  const letters = wordLetters(word).replace(/e$/, "");
  return Math.max(1, (letters.match(/[aeiouy]+/g) || []).length);
}

function countParts(value, pattern) {
  return String(value || "").split(pattern).map((item) => item.trim()).filter(Boolean).length;
}

function countMeaningParts(word) {
  return Math.max(1, countParts(word?.meaning, /[;；,，、/]+/));
}

function countPosParts(word) {
  return Math.max(1, countParts(word?.pos, /[/,;|]+|\s+or\s+/i));
}

function sourceBreadth(word) {
  return new Set([
    ...(Array.isArray(word?.ieltsUse) ? word.ieltsUse : []),
    ...(Array.isArray(word?.topics) ? word.topics : []),
    ...(Array.isArray(word?.excelSourceSheets) ? word.excelSourceSheets : [])
  ].map((item) => String(item || "").trim()).filter(Boolean)).size;
}

function buildEvidence() {
  const meaningItems = readJson(MEANING_FILE).items || [];
  const idictation = readJson(IDICTATION_FILE);
  const basicWords = readJson(BASIC_FILE).words || [];
  const zipfByWord = new Map();
  const examFrequencyByWord = new Map();
  const basicWordsSet = new Set(basicWords.map((word) => normalizeWord(word.word)));

  for (const item of meaningItems) {
    const key = normalizeWord(item.word);
    const value = Number(item.zipfFrequency);
    if (key && Number.isFinite(value)) zipfByWord.set(key, value);
  }

  for (const source of Object.values(idictation.sources || {})) {
    for (const entry of source.entries || []) {
      const frequency = Number(entry.frequency) || 0;
      const keys = new Set([
        entry.word,
        entry.expectedAnswer,
        ...(Array.isArray(entry.acceptedAnswers) ? entry.acceptedAnswers : [])
      ].map(normalizeWord).filter(Boolean));
      for (const key of keys) {
        examFrequencyByWord.set(key, (examFrequencyByWord.get(key) || 0) + frequency);
      }
    }
  }

  return {
    basicWords,
    basicWordsSet,
    examFrequencyByWord,
    zipfByWord
  };
}

function commonnessScore(word, evidence) {
  const key = normalizeWord(word?.word);
  const zipf = evidence.zipfByWord.get(key);
  const examFrequency = evidence.examFrequencyByWord.get(key);
  const isBasic = evidence.basicWordsSet.has(key);
  let weighted = 0;
  let weight = 0;

  if (Number.isFinite(zipf)) {
    weighted += clamp((zipf - 2.5) / 3.2) * 6;
    weight += 6;
  }
  if (Number.isFinite(examFrequency)) {
    weighted += clamp(Math.log1p(examFrequency) / Math.log(301)) * 3.5;
    weight += 3.5;
  }
  if (isBasic) {
    weighted += 0.98 * 4.5;
    weight += 4.5;
  }

  const breadth = sourceBreadth(word);
  if (weight === 0) {
    // Missing frequency evidence is neutral, not automatically difficult.
    return clamp(0.43 + Math.min(0.07, breadth * 0.004));
  }

  weighted += clamp(breadth / 18) * 0.65;
  weight += 0.65;
  return clamp(weighted / weight);
}

function internalDifficultyScore(word, evidence) {
  const key = normalizeWord(word?.word);
  const letters = wordLetters(word);
  const length = letters.length;
  const syllables = estimateSyllables(word);
  const posParts = countPosParts(word);
  const meaningParts = countMeaningParts(word);
  const familySize = Array.isArray(word?.wordFamily) ? word.wordFamily.length : 0;
  const stage = Number(word?.gtPlanStage);
  let score = (1 - commonnessScore(word, evidence)) * 55;

  score += clamp((length - 4) / 10) * 13;
  score += clamp((syllables - 1) / 4) * 9;
  score += clamp((posParts - 1) / 3) * 6;
  score += clamp((meaningParts - 1) / 5) * 7;
  if (/[\s-]/.test(key)) score += 4;
  if (
    length >= 9
    && /(?:tion|sion|ity|ism|ology|ence|ance|ment|ative|isation|ization)$/i.test(letters)
  ) {
    score += 3;
  }
  if (familySize > 0) score -= 3;
  if (stage === 1) score -= 2;
  else if (stage === 2) score += 1;
  else if (stage === 4) score += 3;

  return Math.round(clamp(score, 0, 100));
}

function main() {
  const wordsPayload = readJson(WORDS_FILE);
  const words = Array.isArray(wordsPayload) ? wordsPayload : wordsPayload.words || [];
  const evidence = buildEvidence();
  const candidates = [...words, ...evidence.basicWords];
  const scoreByWord = {};

  for (const word of candidates) {
    const key = normalizeWord(word?.word);
    if (!key) continue;
    const score = internalDifficultyScore(word, evidence);
    if (!(key in scoreByWord) || score < scoreByWord[key]) {
      scoreByWord[key] = score;
    }
  }

  const output = [
    "// Generated by scripts/build-word-internal-difficulty.mjs.",
    "// This is derived learning metadata; it does not modify the formal lexicon.",
    `export const WORD_INTERNAL_DIFFICULTY_VERSION = ${JSON.stringify(VERSION)};`,
    `export const WORD_INTERNAL_DIFFICULTY_BY_WORD = Object.freeze(${JSON.stringify(scoreByWord)});`,
    ""
  ].join("\n");

  fs.writeFileSync(OUTPUT_FILE, output, "utf8");
  console.log(JSON.stringify({
    version: VERSION,
    formalWords: words.length,
    basicWords: evidence.basicWords.length,
    scoredWords: Object.keys(scoreByWord).length,
    output: path.relative(ROOT, OUTPUT_FILE)
  }, null, 2));
}

main();
