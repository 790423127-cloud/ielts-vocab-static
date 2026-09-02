/**
 * Tag 538 entries whose headword or synonym replacements (including phrases)
 * appear in Cambridge GT Part 3 articles. Does not add or remove 538 IDs.
 *
 *   node scripts/tag-ielts-538-part3-high-frequency.mjs
 *   node scripts/tag-ielts-538-part3-high-frequency.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEXICON_PATH = path.join(ROOT, "public", "data", "ielts-538-words.json");
const PART3_DIR = path.join("C:", "Users", "Administrator", "Desktop", "G类阅读5-21_Part3纯英文文章");
const apply = process.argv.includes("--apply");

const FUNCTION_WORDS = new Set([
  "a", "an", "the", "be", "to", "of", "in", "on", "at", "for", "by", "with",
  "from", "as", "is", "are", "was", "were", "it", "this", "they", "but", "and",
  "or", "not", "like", "see", "use", "way", "old", "dry", "hot", "home", "body",
  "face", "first", "copy", "fix", "begin", "boss", "number", "sea", "top", "word"
]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ");
}

function wordForms(word) {
  const w = normalizeKey(word);
  if (!w || /\s/.test(w)) return [w];
  const out = new Set([w]);
  if (w.endsWith("y") && !/[aeiou]y$/.test(w)) out.add(`${w.slice(0, -1)}ies`);
  else if (/[sxz]$|[cs]h$/.test(w)) out.add(`${w}es`);
  else out.add(`${w}s`);
  if (w.endsWith("e")) {
    out.add(`${w}d`);
    out.add(`${w.slice(0, -1)}ing`);
  } else if (/[^aeiou]y$/.test(w)) {
    out.add(`${w.slice(0, -1)}ied`);
    out.add(`${w}ing`);
  } else {
    out.add(`${w}ed`);
    out.add(`${w}ing`);
  }
  return [...out].filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phrasePattern(phrase) {
  const tokens = normalizeKey(phrase).split(" ").filter(Boolean);
  if (!tokens.length) return null;
  const body = tokens.map((token) => {
    if (token.includes("...")) return token.split("...").map(escapeRegExp).join(".{0,40}");
    return `(?:${wordForms(token).map(escapeRegExp).join("|")})`;
  }).join("\\s+");
  return new RegExp(`(?:^|[^a-z])${body}(?:[^a-z]|$)`, "i");
}

function collectTxtFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTxtFiles(full);
    if (entry.name.toLowerCase().endsWith(".txt") && entry.name !== "目录.txt") return [full];
    return [];
  });
}

function entryReplacements(entry) {
  return [...new Set([
    ...list(entry.validatedSynonyms),
    ...list(entry.recommendedSynonyms),
    ...list(entry.paraphraseExamples).map((item) => item?.replacement)
  ].map(normalizeKey).filter(Boolean))];
}

const files = collectTxtFiles(PART3_DIR);
const corpusNorm = ` ${files.map((file) => fs.readFileSync(file, "utf8")).join("\n").toLowerCase().replace(/[^a-z]+/g, " ")} `;
const occursCache = new Map();
function occurs(phrase) {
  const key = normalizeKey(phrase);
  if (occursCache.has(key)) return occursCache.get(key);
  const pattern = phrasePattern(key);
  const hit = Boolean(pattern && pattern.test(corpusNorm));
  occursCache.set(key, hit);
  return hit;
}

const raw = fs.readFileSync(LEXICON_PATH, "utf8");
const payload = JSON.parse(raw);
const identities = payload.words.map((word) => `${word.id}::${word.word}`);
const uniqueReplacements = new Set();
const usedReplacements = new Set();
const usedPhrases = new Set();

const nextWords = payload.words.map((entry) => {
  const replacements = entryReplacements(entry);
  const used = replacements.filter((item) => {
    uniqueReplacements.add(item);
    const hit = occurs(item);
    if (!hit) return false;
    if (FUNCTION_WORDS.has(item) && !/\s/.test(item)) return false;
    usedReplacements.add(item);
    if (/\s/.test(item)) usedPhrases.add(item);
    return true;
  });
  const headwordHit = occurs(entry.word);
  const highFrequency = headwordHit || used.length > 0;
  const next = { ...entry, part3HighFrequency: highFrequency };
  if (used.length) next.part3HighFrequencyReplacements = used;
  else delete next.part3HighFrequencyReplacements;
  return next;
});

const afterIdentities = nextWords.map((word) => `${word.id}::${word.word}`);
if (JSON.stringify(identities) !== JSON.stringify(afterIdentities)) {
  throw new Error("538 稳定 ID 或词头发生变化，已停止。");
}

const tagged = nextWords.filter((word) => word.part3HighFrequency).length;
const nextPayload = {
  ...payload,
  part3HighFrequency: {
    version: "ielts-538-part3-high-frequency-v1-20260824",
    sourceDirectory: "G类阅读5-21_Part3纯英文文章",
    articleCount: files.length,
    taggedWordCount: tagged,
    usedReplacementCount: usedReplacements.size,
    usedPhraseReplacementCount: usedPhrases.size,
    uniqueReplacementCount: uniqueReplacements.size,
    taggedAt: new Date().toISOString()
  },
  words: nextWords,
  count: nextWords.length
};

const report = {
  mode: apply ? "apply" : "dry-run",
  articles: files.length,
  headwords: nextWords.length,
  tagged,
  usedReplacements: usedReplacements.size,
  usedPhrases: usedPhrases.size
};

if (apply) {
  fs.writeFileSync(LEXICON_PATH, `${JSON.stringify(nextPayload, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
