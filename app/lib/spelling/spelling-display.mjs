import {
  friendlyPosLabel,
  getSpellingMeaning,
  getSpellingPhonetic
} from "./normalize-spelling-entry.mjs";

export function getSpellingTypeLabel(current) {
  if (!current) return "单词";
  if (current.entryType === "phrase") return "短语";
  return friendlyPosLabel("word", current.pos || current.sourceWord?.pos || "");
}

export function isPhoneticPendingReview(entry) {
  const status = String(entry?.phoneticStatus || "").trim().toLowerCase();
  if (status === "deepseek_verified" || status === "dictionary_verified" || status === "verified_cmudict_us") {
    return false;
  }
  return status.startsWith("pending_review")
    || status.includes("unverified")
    || entry?.pronunciationVerified === false;
}

export function getSpellingPromptView(current) {
  if (!current) {
    return {
      typeLabel: "单词",
      meaning: "",
      phonetic: "",
      phoneticPendingReview: false,
      charCount: 0,
      example: "",
      exampleCn: "",
      examplePendingReview: false
    };
  }

  const expectedAnswer = String(current.expectedAnswer || current.displayText || "").trim();
  const meaningCandidates = [
    current.meaning,
    getSpellingMeaning(current.sourceWord),
    current.sourceWord?.definition
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const meaning = meaningCandidates.find((value) => (
    value.toLowerCase() !== expectedAnswer.toLowerCase()
  )) || "";
  const phoneticPendingReview = isPhoneticPendingReview(current.sourceWord);
  const examplePendingReview = current.sourceWord?.exampleStatus === "needs_editorial_example";
  const phonetic = getSpellingPhonetic(current) || getSpellingPhonetic(current.sourceWord);

  return {
    typeLabel: getSpellingTypeLabel(current),
    meaning: meaning || "释义暂缺",
    phonetic: phoneticPendingReview ? "" : phonetic,
    phoneticMissing: phoneticPendingReview || !phonetic,
    phoneticPendingReview,
    charCount: expectedAnswer.length,
    example: examplePendingReview ? "" : String(current.example || current.sourceWord?.example || "").trim(),
    exampleCn: examplePendingReview ? "" : String(current.exampleCn || current.sourceWord?.exampleCn || "").trim(),
    examplePendingReview
  };
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildUnderscoreMask(matchedText) {
  return "_".repeat(Math.max(String(matchedText || "").length, 1));
}

function buildInflectionMaskVariants(word = "") {
  const lower = String(word || "").trim().toLowerCase();
  if (!lower || /\s/.test(lower) || !/^[a-z][a-z'-]*$/i.test(lower)) return [];

  const variants = [];
  const add = (value) => {
    const next = String(value || "").trim();
    if (!next || next.toLowerCase() === lower) return;
    variants.push(next);
  };

  if (/(s|x|z|ch|sh)$/i.test(lower)) add(`${lower}es`);
  else if (/[^aeiou]y$/i.test(lower)) add(`${lower.slice(0, -1)}ies`);
  else if (/(f)$/i.test(lower)) add(`${lower.slice(0, -1)}ves`);
  else if (/(fe)$/i.test(lower)) add(`${lower.slice(0, -2)}ves`);
  else add(`${lower}s`);

  if (lower.endsWith("e")) {
    add(`${lower}d`);
    add(`${lower.slice(0, -1)}ing`);
  } else if (/[^aeiou]y$/i.test(lower)) {
    add(`${lower.slice(0, -1)}ied`);
    add(`${lower}ing`);
  } else {
    add(`${lower}ed`);
    add(`${lower}ing`);
    if (/[^aeiou][aeiou][bdfglmnprt]$/i.test(lower)) {
      add(`${lower}${lower.slice(-1)}ed`);
      add(`${lower}${lower.slice(-1)}ing`);
    }
  }

  return variants;
}

function collectMaskCandidates(options = {}) {
  const targetWord = String(options.targetWord || "").trim();
  if (!targetWord) return [];

  const seen = new Set();
  const candidates = [];

  const addCandidate = (value) => {
    const word = String(value || "").trim();
    if (!word) return;
    const key = word.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(word);
  };

  addCandidate(targetWord);

  const lemma = String(options.lemma || "").trim();
  if (lemma) addCandidate(lemma);

  if (Array.isArray(options.variants)) {
    for (const variant of options.variants) {
      addCandidate(variant);
    }
  }

  if (Array.isArray(options.formWords)) {
    for (const formWord of options.formWords) {
      addCandidate(formWord);
    }
  }

  for (const variant of buildInflectionMaskVariants(targetWord)) {
    addCandidate(variant);
  }

  return candidates.sort((a, b) => b.length - a.length);
}

function exampleStillExposesTarget(example = "", options = {}) {
  const text = String(example || "").trim();
  if (!text) return false;

  const candidates = collectMaskCandidates(options);
  if (!candidates.length) return false;

  const alternation = candidates.map(escapeRegExp).join("|");
  if (alternation && new RegExp(`\\b(${alternation})\\b`, "i").test(text)) {
    return true;
  }

  const target = String(options.targetWord || "").trim().toLowerCase();
  if (target.length < 4 || /\s/.test(target)) return false;

  const tokens = text.match(/\b[a-z][a-z'-]*\b/gi) || [];
  return tokens.some((token) => {
    const normalized = String(token || "").toLowerCase();
    return normalized !== target
      && normalized.length > target.length
      && normalized.includes(target);
  });
}

export function maskTargetWordInExample(example = "", options = {}) {
  const text = String(example || "").trim();
  if (!text) return "";

  const targetWord = String(options.targetWord || "").trim();
  if (!targetWord) return text;

  const candidates = collectMaskCandidates(options);

  if (/\s/.test(targetWord)) {
    const pattern = new RegExp(escapeRegExp(targetWord).replace(/\s+/g, "\\s+"), "i");
    if (!pattern.test(text)) return text;
    pattern.lastIndex = 0;
    return text.replace(pattern, (match) => buildUnderscoreMask(match));
  }

  const alternation = candidates.map(escapeRegExp).join("|");
  if (!alternation) return text;

  const pattern = new RegExp(`\\b(${alternation})\\b`, "gi");
  if (!pattern.test(text)) return text;
  pattern.lastIndex = 0;
  return text.replace(pattern, (match) => buildUnderscoreMask(match));
}

export function formatExampleForPrompt(example = "", options = {}) {
  const text = String(example || "").trim();
  if (!text) return "";

  const masked = maskTargetWordInExample(text, options);
  if (exampleStillExposesTarget(masked, options)) return "";
  return masked;
}

export function isSpellingDebugMode() {
  return typeof window !== "undefined" && window.__SPELLING_DEBUG__ === true;
}

export function buildSpellingDebugDetails(current, context = {}) {
  if (!current) return null;

  return {
    wordId: current.wordId || "",
    entryType: current.entryType || "",
    displayText: current.displayText || "",
    expectedAnswer: current.expectedAnswer || "",
    entryMode: context.entryMode || "",
    lexiconVersion: context.lexiconVersion || "",
    lexiconHash: context.lexiconHash || "",
    counts: context.counts || null,
    schedulerReason: context.schedulerReason || ""
  };
}
