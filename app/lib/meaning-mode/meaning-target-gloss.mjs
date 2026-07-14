// meaning-target-gloss.mjs — Browser-compatible authoritative gloss data for Meaning Mode.
// Provides hydrated quizMeaningZh and meaningDetailedZh from the authoritative words.json.
// Never falls back to the truncated meaningZh in meaning-6000.json.

import { TARGET_GLOSS_INDEX } from "./meaning-target-gloss-index.generated.mjs";

const _glossById = new Map();
let _glossInitialized = false;

function _ensureGlossIndex() {
  if (_glossInitialized) return;
  for (const entry of TARGET_GLOSS_INDEX) {
    _glossById.set(entry.wordId, entry);
  }
  _glossInitialized = true;
}

/**
 * Get the authoritative quizMeaningZh for a target word entry.
 * Uses the full words.json gloss data, never the truncated meaning-6000.json meaningZh.
 */
function splitAtomicGloss(value) {
  return String(value || "")
    .trim()
    .split(/[;；、，,\/]/g)
    .map(part => part.trim())
    .filter(Boolean);
}

function compactQuizLabel(value) {
  let text = String(value || "").trim();
  text = text
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/（.*$/g, "")
    .replace(/\.{2,}|…/g, "")
    .trim();
  if (/或(?!者)/.test(text)) text = text.split(/或(?!者)/)[0].trim();
  text = text
    .replace(/人员群体$/g, "人员")
    .replace(/工作制$/g, "工作")
    .trim();
  return text;
}

function getSingleQuizSense(gloss, wordEntry) {
  const source = wordEntry?.quizMeaningZh
    || gloss?.quizMeaningZh || gloss?.meaningOriginal
    || wordEntry?.quizSenses?.[0]?.quizMeaningZh
    || wordEntry?.meaningZh || "";
  const compactSource = compactQuizLabel(source);
  const parts = splitAtomicGloss(compactSource);
  return compactQuizLabel(parts[0] || compactSource || String(source || "").trim());
}

export function getTargetQuizMeaning(wordEntry) {
  _ensureGlossIndex();
  const gloss = _glossById.get(wordEntry.wordId);
  return getSingleQuizSense(gloss, wordEntry);
}

/**
 * Get the authoritative meaningDetailedZh for a target word entry.
 */
export function getTargetMeaningDetailed(wordEntry) {
  _ensureGlossIndex();
  const gloss = _glossById.get(wordEntry.wordId);
  if (wordEntry?.meaningDetailedZh) return wordEntry.meaningDetailedZh;
  if (gloss && gloss.meaningDetailedZh) return gloss.meaningDetailedZh;
  // Fallback: quizSenses on the entry itself
  if (wordEntry.quizSenses && wordEntry.quizSenses.length > 0) {
    return wordEntry.quizSenses[0].meaningDetailedZh
      || wordEntry.quizSenses[0].quizMeaningZh
      || wordEntry.meaningZh || "";
  }
  return wordEntry.meaningDetailedZh || wordEntry.meaningZh || "";
}

/**
 * Get the full gloss entry for a wordId.
 */
export function getTargetGlossEntry(wordId) {
  _ensureGlossIndex();
  return _glossById.get(wordId) || null;
}

/**
 * Check if all 6000 words have gloss data.
 */
export function getGlossIndexStats() {
  _ensureGlossIndex();
  let total = TARGET_GLOSS_INDEX.length;
  let withQuizMeaning = 0;
  let withDetailed = 0;
  for (const e of TARGET_GLOSS_INDEX) {
    if (e.quizMeaningZh) withQuizMeaning++;
    if (e.meaningDetailedZh) withDetailed++;
  }
  return { total, withQuizMeaning, withDetailed, missingQuizMeaning: total - withQuizMeaning, missingDetailed: total - withDetailed };
}

export { _glossById };

