import {
  buildTruncationPrefixIndex,
  detectTruncatedHeadword
} from "./truncated-headword.mjs";

const FILLER_HEADWORDS = new Set([
  "ah",
  "aha",
  "alas",
  "aye",
  "bye",
  "eh",
  "erm",
  "gee",
  "gosh",
  "ha",
  "hello",
  "heck",
  "hmm",
  "huh",
  "mhm",
  "oh",
  "ooh",
  "whoa",
  "yeah"
]);

function normalizeHeadword(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isPureInterjectionPos(pos = "") {
  const normalized = String(pos || "").trim().toLowerCase();
  if (!normalized) return false;
  if (!/\binterjection\b/.test(normalized)) return false;

  const parts = normalized
    .split(/[/,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length === 1 && parts[0] === "interjection";
}

export function isSpellingInterjectionEntry(entry = {}) {
  const headword = normalizeHeadword(entry.word || entry.answer || entry.expectedAnswer || "");
  if (!headword) return false;

  if (FILLER_HEADWORDS.has(headword)) return true;
  return isPureInterjectionPos(entry.pos);
}

export function isSpellingBlockedEntry(entry = {}, options = {}) {
  if (isSpellingInterjectionEntry(entry)) return true;
  if (options.truncationIndex) {
    return Boolean(detectTruncatedHeadword(entry, options.truncationIndex));
  }
  return false;
}

export function buildSpellingExclusionIndex(entries = []) {
  const headwords = entries
    .map((entry) => normalizeHeadword(entry.word || entry.answer || ""))
    .filter(Boolean);
  return buildTruncationPrefixIndex([...new Set(headwords)]);
}

export function filterSpellingInterjections(entries = []) {
  const removed = [];
  const kept = [];

  for (const entry of entries) {
    if (isSpellingInterjectionEntry(entry)) {
      removed.push(entry);
    } else {
      kept.push(entry);
    }
  }

  return { kept, removed };
}

export function filterSpellingBlockedEntries(entries = []) {
  const truncationIndex = buildSpellingExclusionIndex(entries);
  const removed = [];
  const kept = [];

  for (const entry of entries) {
    if (isSpellingBlockedEntry(entry, { truncationIndex })) {
      removed.push(entry);
    } else {
      kept.push(entry);
    }
  }

  return { kept, removed };
}