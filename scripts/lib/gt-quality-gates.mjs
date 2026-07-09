import { normalizeHeadword, entryIntegrityFingerprint } from "../../app/lib/vocab/lexicon-guard-shared.mjs";
import { isCorruptedExampleSkeleton } from "../../app/lib/vocab/example-skeleton-tails.mjs";
import { VALID_DIFFICULTIES } from "../core-vocab-quality-audit.mjs";
import { isInvalidIpa } from "./gt-ipa-validate.mjs";
import { isPollutedMeaning, PLACEHOLDER_MEANING, BATCH_MEANING } from "./gt-meaning-zh.mjs";
import { FORCE_REPLACE } from "./gt-new-words-pool.mjs";

export const BANNED_EXAMPLE = /^Understanding .+ helps|^This word is useful|^In daily notices|^It is important to know/i;
export const BANNED_PARAPHRASE = /\[\s*\d+\s*\]|service notice \d+|official update \d+|training cue \d+|source wording \d+|wording set \d+|notice \d+|update \d+|第\s*\d+\s*条|alternate phrasing \d+/i;
const DAILY_COMM = /^与日常交流相关的词\s*[：:]/i;

export const PARAPHRASE_RELATION_TYPES = new Set([
  "direct-paraphrase", "near-paraphrase", "contextual-paraphrase",
  "word-family-change", "part-of-speech-change", "formal-informal-shift",
  "negative-or-opposite-cue", "number-date-location-change", "logical-relationship"
]);

const PARAPHRASE_BANDS = new Set(["4-5", "5-6", "6-7"]);
const PARAPHRASE_SKILLS = new Set(["listening", "reading"]);
const REQUIRED_PARAPHRASE_FIELDS = [
  "id", "questionExpression", "sourceExpression", "relationType", "meaningZh",
  "questionSentence", "sourceSentence", "audioText", "notesZh", "sourceType"
];

export function normMeaningKey(m) {
  return String(m || "").trim().toLowerCase().replace(/\s+/g, "");
}

export function normExampleSkeleton(ex) {
  const functionWords = new Set([
    "a", "an", "the", "and", "or", "but", "if", "unless", "because", "although", "while", "when",
    "before", "after", "until", "for", "from", "to", "of", "in", "on", "at", "by", "with", "without",
    "about", "through", "during", "as", "than", "that", "which", "who", "whose", "where", "why", "how",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
    "can", "could", "may", "might", "must", "shall", "should", "will", "would", "not", "no", "only",
    "please", "you", "your", "we", "our", "they", "their", "he", "she", "it", "i", "my"
  ]);
  const tokens = String(ex || "").toLowerCase().match(/[a-z']+|\d+/g) || [];
  return tokens
    .map((token) => (/^\d+$/.test(token) ? "#" : functionWords.has(token) ? token : "X"))
    .join(" ")
    .replace(/(?:X ){3,}/g, "X X ")
    .trim();
}

export function normParaphrasePair(e, { removeNumbering = false } = {}) {
  const clean = (value) => {
    let text = String(value || "").toLowerCase().trim();
    if (removeNumbering) text = text.replace(/\[\s*\d+\s*\]/g, "").replace(/\b\d+\b/g, "");
    return text.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  };
  return `${clean(e.questionExpression)}::${clean(e.sourceExpression)}`;
}

export function runNewWordGates(newWords) {
  const errors = [];
  const norms = new Set();
  for (const e of newWords) {
    const w = normalizeHeadword(e.word);
    if (norms.has(w)) errors.push(`duplicate new word: ${w}`);
    norms.add(w);
    if (FORCE_REPLACE.has(w)) errors.push(`banned low-value word remains: ${w}`);
    if (isPollutedMeaning(e.meaning)) errors.push(`polluted meaning: ${w}`);
    if (BANNED_EXAMPLE.test(String(e.example || ""))) errors.push(`template example: ${w}`);
    if (isCorruptedExampleSkeleton(e.example)) errors.push(`skeleton-tail example: ${w}`);
    if (e.normalizedHeadword !== w) errors.push(`invalid normalizedHeadword: ${w}`);
    if (!String(e.meaningZh || "").trim()) errors.push(`missing meaningZh: ${w}`);
    if (normMeaningKey(e.meaningZh) !== normMeaningKey(e.meaning)) errors.push(`meaningZh mismatch: ${w}`);
    for (const field of ["word", "pos", "meaning", "example", "difficulty", "category", "targetBand", "gTUseCase", "candidateSource", "sourceType", "duplicateCheckResult"]) {
      if (!String(e[field] ?? "").trim()) errors.push(`missing ${field}: ${w}`);
    }
    if (!String(e.phonetic || "").trim() && e.phoneticStatus !== "pending_review") {
      errors.push(`missing phonetic without pending_review status: ${w}`);
    }
    if (!Array.isArray(e.topics) || e.topics.length === 0) errors.push(`missing topics: ${w}`);
    if (!e.pronunciationSourceTier) errors.push(`missing pronunciationSourceTier: ${w}`);
    if (e.pronunciationVariant === "en-GB" && e.pronunciationSourceTier === "C") {
      errors.push(`CMU marked en-GB: ${w}`);
    }
    if (String(e.phonetic || "").trim() && isInvalidIpa(e.phonetic)) errors.push(`invalid IPA: ${w}`);
  }
  return { ok: errors.length === 0, errors };
}

export function runOldWordGates(oldWords) {
  const errors = [];
  let invalidDiff = 0;
  for (const e of oldWords) {
    if (!VALID_DIFFICULTIES.has(e.difficulty)) invalidDiff += 1;
    if (PLACEHOLDER_MEANING.test(String(e.meaning || ""))) errors.push(`placeholder meaning: ${e.word}`);
    if (BATCH_MEANING.test(String(e.meaning || ""))) errors.push(`batch meaning in old: ${e.word}`);
    if (isInvalidIpa(e.phonetic)) errors.push(`invalid IPA old: ${e.word}`);
    if (isCorruptedExampleSkeleton(e.example)) errors.push(`skeleton-tail example old: ${e.word}`);
  }
  if (invalidDiff > 0) errors.push(`invalid difficulty count=${invalidDiff}`);
  for (const w of ["peace", "analyse"]) {
    const e = oldWords.find((x) => x.word === w);
    if (e && isInvalidIpa(e.phonetic)) errors.push(`known IPA fail: ${w}`);
  }
  return { ok: errors.length === 0, errors, invalidDifficultyCount: invalidDiff };
}

export function runParaphraseGates(entries, sampleSize = 150) {
  const errors = [];
  if (entries.length !== 600) errors.push(`count=${entries.length}`);
  const ids = new Set();
  const pairs = new Set();
  const basePairs = new Set();
  const skeletons = new Map();
  const skillCoverage = new Set();
  const bandCoverage = new Set();
  const relationCoverage = new Set();
  for (const e of entries) {
    if (ids.has(e.id)) errors.push(`dup id: ${e.id}`);
    ids.add(e.id);
    const pk = normParaphrasePair(e);
    if (pairs.has(pk)) errors.push(`dup pair: ${e.id}`);
    pairs.add(pk);
    const basePair = normParaphrasePair(e, { removeNumbering: true });
    if (basePairs.has(basePair)) errors.push(`mechanical pair after numbering removal: ${e.id}`);
    basePairs.add(basePair);
    if (BANNED_PARAPHRASE.test(JSON.stringify(e))) {
      errors.push(`numbered template: ${e.id}`);
    }
    for (const f of REQUIRED_PARAPHRASE_FIELDS) {
      if (!String(e[f] || "").trim()) errors.push(`empty ${f}: ${e.id}`);
    }
    if (!PARAPHRASE_RELATION_TYPES.has(e.relationType)) errors.push(`invalid relationType: ${e.id}`);
    if (!PARAPHRASE_BANDS.has(e.targetBand)) errors.push(`invalid targetBand: ${e.id}`);
    if (!Array.isArray(e.skills) || e.skills.length === 0 || e.skills.some((skill) => !PARAPHRASE_SKILLS.has(skill))) {
      errors.push(`invalid skills: ${e.id}`);
    }
    if (!Array.isArray(e.domains) || e.domains.length === 0) errors.push(`empty domains: ${e.id}`);
    if (String(e.questionSentence || "").length > 220 || String(e.sourceSentence || "").length > 220) {
      errors.push(`sentence too long: ${e.id}`);
    }
    if (String(e.questionExpression || "").length > 80 || String(e.sourceExpression || "").length > 80) {
      errors.push(`expression too long: ${e.id}`);
    }
    if (!/[\u3400-\u9fff]/u.test(String(e.notesZh || ""))) errors.push(`notesZh is not Chinese: ${e.id}`);
    if (["contextual-paraphrase", "near-paraphrase", "logical-relationship"].includes(e.relationType) && !/(仅|接近|相近|同义|语境|逻辑|条件|因果|转折|限制|范围|程度|不同|差异|不完全|并非|不能|对应|侧重|不宜|不可互换|可互换)/u.test(String(e.notesZh || ""))) {
      errors.push(`missing relation limitation note: ${e.id}`);
    }
    const skeleton = normExampleSkeleton(e.questionSentence);
    skeletons.set(skeleton, (skeletons.get(skeleton) || 0) + 1);
    for (const skill of e.skills || []) skillCoverage.add(skill);
    bandCoverage.add(e.targetBand);
    relationCoverage.add(e.relationType);
  }
  for (const [skeleton, count] of skeletons) {
    if (count > 3) errors.push(`sentence skeleton used ${count} times: ${skeleton.slice(0, 60)}`);
  }
  for (const value of PARAPHRASE_SKILLS) {
    if (!skillCoverage.has(value)) errors.push(`missing skill coverage: ${value}`);
  }
  for (const value of PARAPHRASE_BANDS) {
    if (!bandCoverage.has(value)) errors.push(`missing band coverage: ${value}`);
  }
  for (const value of PARAPHRASE_RELATION_TYPES) {
    if (!relationCoverage.has(value)) errors.push(`missing relation coverage: ${value}`);
  }
  const sample = [];
  const step = Math.max(1, Math.floor(entries.length / sampleSize));
  for (let i = 0; i < entries.length && sample.length < sampleSize; i += step) {
    sample.push(entries[i]);
  }
  return { ok: errors.length === 0, errors, sampleSize: sample.length, sample };
}

export function isOldWordMeaningTarget(entry) {
  const m = String(entry?.meaning || "").trim();
  if (!m) return true;
  if (DAILY_COMM.test(m)) return true;
  if (isPollutedMeaning(m)) return true;
  return false;
}

export function runP0ContentGates({ oldWords, newWords, paraphraseEntries, phrasesHash, phrasesBaselineHash, oldBefore, oldAfter }) {
  const errors = [];
  const stats = {
    oldTemplateMeanings: 0,
    newTemplateMeanings: 0,
    newTemplateExamples: 0,
    lowValueNewWords: 0,
    paraphraseNumberedTemplates: 0,
    paraphraseMechanicalPatterns: 0,
    unauthorizedOldMeaningChanges: 0
  };

  const integrity = verifyOldIntegrity(oldBefore, oldAfter);
  if (!integrity.ok) errors.push(...integrity.errors);

  for (const e of oldWords) {
    if (isOldWordMeaningTarget(e)) {
      stats.oldTemplateMeanings += 1;
      errors.push(`old polluted meaning: ${e.word}`);
    }
  }

  const meaningKeys = new Map();
  for (const e of newWords) {
    if (FORCE_REPLACE.has(normalizeHeadword(e.word))) {
      stats.lowValueNewWords += 1;
      errors.push(`low-value new word: ${e.word}`);
    }
    if (isPollutedMeaning(e.meaning)) {
      stats.newTemplateMeanings += 1;
      errors.push(`new polluted meaning: ${e.word}`);
    }
    if (BANNED_EXAMPLE.test(String(e.example || ""))) {
      stats.newTemplateExamples += 1;
      errors.push(`new template example: ${e.word}`);
    }
    const mk = normMeaningKey(e.meaning);
    meaningKeys.set(mk, (meaningKeys.get(mk) || 0) + 1);
  }
  for (const [k, c] of meaningKeys) {
    if (c > 2 && k.length > 4) errors.push(`new meaning duplicate>${2}: ${k}`);
  }

  const exSkel = new Map();
  for (const e of newWords) {
    const sk = normExampleSkeleton(e.example);
    exSkel.set(sk, (exSkel.get(sk) || 0) + 1);
  }
  for (const [, c] of exSkel) {
    if (c > 3) stats.paraphraseMechanicalPatterns += 1;
  }
  for (const [, c] of exSkel) {
    if (c > 3) errors.push(`new example skeleton used ${c} times`);
  }

  if (paraphraseEntries.length !== 600) errors.push(`paraphrase count=${paraphraseEntries.length}`);
  const patCounts = new Map();
  for (const e of paraphraseEntries) {
    const blob = JSON.stringify(e);
    if (BANNED_PARAPHRASE.test(blob)) {
      stats.paraphraseNumberedTemplates += 1;
      errors.push(`paraphrase numbered template: ${e.id}`);
    }
    const sk = normExampleSkeleton(e.questionSentence);
    patCounts.set(sk, (patCounts.get(sk) || 0) + 1);
    if (String(e.questionSentence || "").length > 220 || String(e.sourceSentence || "").length > 220) {
      stats.paraphraseMechanicalPatterns += 1;
      errors.push(`paraphrase sentence too long: ${e.id}`);
    }
  }
  for (const [, c] of patCounts) {
    if (c > 3) stats.paraphraseMechanicalPatterns += 1;
  }
  for (const [sk, c] of patCounts) {
    if (c > 3) errors.push(`paraphrase sentence skeleton>${3}: ${sk.slice(0, 60)}`);
  }

  if (phrasesHash !== phrasesBaselineHash) errors.push("phrases hash changed");

  return { ok: errors.length === 0, errors, stats };
}

export function verifyOldIntegrity(oldBefore, oldAfter) {
  const errors = [];
  if (oldBefore.length !== oldAfter.length) errors.push("old count changed");
  for (let i = 0; i < oldBefore.length; i += 1) {
    const a = entryIntegrityFingerprint(oldBefore[i], i);
    const b = entryIntegrityFingerprint(oldAfter[i], i);
    if (a.id !== b.id) errors.push(`id changed at ${i}`);
    if (a.word !== b.word) errors.push(`word changed at ${i}: ${a.word}`);
    if (oldBefore[i].answer !== oldAfter[i].answer) errors.push(`answer changed at ${i}`);
  }
  return { ok: errors.length === 0, errors };
}
