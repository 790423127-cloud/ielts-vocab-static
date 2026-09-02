import { normalizeHeadword } from "../vocab/lexicon-guard-shared.mjs";

const KNOWN_TRUNCATED_HEADWORDS = new Map([
  ["rais", "raise"],
  ["explosife", "explosive"]
]);

function detectCanonicalFromMeaning(meaning = "") {
  const match = String(meaning).match(/（原形\s+([a-z][a-z-]*)\s*）/i);
  return match ? normalizeHeadword(match[1]) : "";
}

function exampleUsesWholeWord(entry, canonical) {
  const haystack = [
    entry.example,
    entry.definition,
    ...(entry.collocations || []).map((item) => item.phrase),
    ...(entry.phraseCollocations || []).map((item) => item.phrase)
  ].join(" ");
  const escaped = canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

function exampleUsesExactTruncatedSpelling(entry) {
  const word = String(entry.word || "");
  const example = String(entry.example || "");
  if (!word || !example) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Sentence examples commonly capitalize a headword at the start. Matching
  // case-sensitively allowed damaged rows such as "rais" / "Rais your hand"
  // to bypass the truncation audit even though the canonical "raise" exists.
  return new RegExp(`\\b${escaped}\\b`, "i").test(example);
}

function formsReferenceCanonical(entry, canonical) {
  const forms = Array.isArray(entry.forms) ? entry.forms : [];
  return forms.some((form) => normalizeHeadword(form.word) === canonical);
}

function isDeclaredLexicalRelative(entry, canonical) {
  const family = Array.isArray(entry.wordFamily) ? entry.wordFamily : [];
  if (family.some((item) => normalizeHeadword(item?.word || item) === canonical)) return true;

  const forms = Array.isArray(entry.forms) ? entry.forms : [];
  return forms.some((form) => {
    if (normalizeHeadword(form?.word || form) !== canonical) return false;
    const relation = String(form?.relation || "").trim().toLowerCase();
    const type = String(form?.type || "").trim().toLowerCase();
    return relation === "related-to" || /^(?:noun|verb|adjective|adverb)$/.test(type);
  });
}

function isDeclaredInflectionOfHeadword(entry, canonical) {
  const forms = Array.isArray(entry.forms) ? entry.forms : [];
  return forms.some((form) => {
    if (normalizeHeadword(form.word) !== canonical) return false;
    const type = String(form.type || "").trim().toLowerCase();
    return /plural|past tense|past participle|present participle|gerund|third[- ]person/.test(type);
  });
}

function formsImplyTruncatedCanonical(entry, headword, canonical) {
  const forms = Array.isArray(entry.forms) ? entry.forms : [];
  return forms.some((form) => {
    const formWord = normalizeHeadword(form.word);
    if (!formWord || !formWord.startsWith(headword)) return false;
    return (
      formWord === canonical ||
      (canonical.startsWith(headword) && formWord.startsWith(canonical))
    );
  });
}

function collocationsConsistentlyUseHeadword(entry, headword) {
  const phrases = [
    ...(entry.collocations || []),
    ...(entry.phraseCollocations || [])
  ]
    .map((item) => String(item.phrase || "").trim())
    .filter(Boolean);

  if (!phrases.length) return false;
  const escaped = headword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headwordPattern = new RegExp(`\\b${escaped}\\b`, "i");

  return phrases.every((phrase) => headwordPattern.test(phrase));
}

function isCorruptedTemplateEntry(entry = {}) {
  return Boolean(entry.importedFromBasicTemplateAt);
}

function isLikelyTruncatedCanonical(headword, canonical) {
  if (!headword || !canonical || headword === canonical) return false;
  if (!canonical.startsWith(headword)) return false;
  const suffix = canonical.slice(headword.length);
  if (!suffix || suffix.length > 3) return false;
  return /^[a-z]+$/.test(suffix);
}

function isPluralizationFalsePositive(headword, canonical, entry) {
  const suffix = canonical.slice(headword.length);
  if (suffix !== "s" && suffix !== "es") return false;

  const explicitlyLinkedPlural = (Array.isArray(entry.forms) ? entry.forms : []).some((form) => (
    normalizeHeadword(form?.word || form) === canonical
    && /plural|merged-form/i.test(String(form?.type || form?.relation || ""))
  ));
  if (explicitlyLinkedPlural) return true;

  if (
    isCorruptedTemplateEntry(entry) &&
    (formsReferenceCanonical(entry, canonical) ||
      formsImplyTruncatedCanonical(entry, headword, canonical)) &&
    exampleUsesExactTruncatedSpelling(entry) &&
    collocationsConsistentlyUseHeadword(entry, headword)
  ) {
    return false;
  }

  const example = String(entry.example || "");
  const escaped = headword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(little|young|old|the|a|an|every|each|one|two|three|\\d+)\\s+${escaped}\\b`, "i").test(example);
}

function exampleImprovesWhenReplaced(entry, headword, canonical) {
  const example = String(entry.example || "");
  const replaced = example.replace(new RegExp(`\\b${headword}\\b`, "gi"), canonical);
  if (replaced === example) return false;

  if (/\b(will|would|can|could|should|must|need to|have to)\s+\w+(ed|ing)\b/i.test(replaced)) {
    return false;
  }
  if (/\bto\s+\w+(ed|ing)\b/i.test(replaced) && /\bto\s+\w+\b/i.test(example)) {
    return false;
  }
  if (
    /\b(I|you|we|they|he|she|it)\s+\w+ing\b/i.test(replaced) &&
    !/\b(am|are|is|was|were|be|been|being)\s+\w+ing\b/i.test(replaced)
  ) {
    return false;
  }

  return true;
}

function hasTruncationCorruption(entry, headword, canonical) {
  if (isPluralizationFalsePositive(headword, canonical, entry)) return false;
  // A linked derivative such as approximate -> approximately is a valid word
  // family relation. It is not evidence that the headword was truncated.
  if (isDeclaredLexicalRelative(entry, canonical)) return false;
  // A longer form explicitly labelled as an inflection is evidence that the
  // shorter value is the correct lemma (activate -> activated), not a damaged
  // headword. Treating it as truncation produced a large false-positive queue.
  if (isDeclaredInflectionOfHeadword(entry, canonical)) return false;

  return (
    isLikelyTruncatedCanonical(headword, canonical) &&
    (formsReferenceCanonical(entry, canonical) ||
      formsImplyTruncatedCanonical(entry, headword, canonical)) &&
    exampleUsesExactTruncatedSpelling(entry) &&
    !exampleUsesWholeWord(entry, canonical) &&
    collocationsConsistentlyUseHeadword(entry, headword) &&
    exampleImprovesWhenReplaced(entry, headword, canonical)
  );
}

export function detectTruncatedHeadword(entry = {}, headwordIndex = new Map(), entryByHeadword = new Map()) {
  const headword = normalizeHeadword(entry.word || entry.answer || "");
  const answer = normalizeHeadword(entry.answer || entry.word || "");
  if (!headword || answer !== headword) return null;

  const fromMeaning = detectCanonicalFromMeaning(entry.meaning);
  if (fromMeaning && entryByHeadword.has(fromMeaning) && fromMeaning !== headword) {
    return { canonical: fromMeaning, reason: "meaning-marker" };
  }

  const candidates = headwordIndex.get(headword) || [];
  for (const canonical of candidates) {
    const exampleHasCanonical = exampleUsesWholeWord(entry, canonical);
    const exampleHasHeadword = exampleUsesWholeWord(entry, headword);
    if (exampleHasCanonical && !exampleHasHeadword) {
      return { canonical, reason: "example-mismatch" };
    }

    if (!isCorruptedTemplateEntry(entry)) continue;
    if (!hasTruncationCorruption(entry, headword, canonical)) continue;

    return { canonical, reason: "corrupted-template" };
  }

  const knownCanonical = KNOWN_TRUNCATED_HEADWORDS.get(headword);
  if (knownCanonical && entryByHeadword.has(knownCanonical)) {
    return { canonical: knownCanonical, reason: "known-truncated-import" };
  }

  return null;
}

export function buildTruncationPrefixIndex(headwords = []) {
  const index = new Map();
  for (const headword of headwords) {
    for (let size = 2; size < headword.length; size += 1) {
      const prefix = headword.slice(0, size);
      if (headword.length - prefix.length > 3) continue;
      const bucket = index.get(prefix) || [];
      bucket.push(headword);
      index.set(prefix, bucket);
    }
  }
  return index;
}

export function isTruncatedHeadwordEntry(entry = {}, headwordIndex = null, entryByHeadword = null) {
  if (!headwordIndex || !entryByHeadword) {
    return Boolean(detectTruncatedHeadword(entry, new Map(), new Map()));
  }
  return Boolean(detectTruncatedHeadword(entry, headwordIndex, entryByHeadword));
}

export function findTruncatedHeadwordEntries(entries = []) {
  const entryByHeadword = new Map();
  for (const entry of entries) {
    const headword = normalizeHeadword(entry.word);
    if (headword && !entryByHeadword.has(headword)) {
      entryByHeadword.set(headword, entry);
    }
  }

  const headwords = [...entryByHeadword.keys()];
  const prefixIndex = buildTruncationPrefixIndex(headwords);
  const truncated = [];

  for (const entry of entries) {
    const hit = detectTruncatedHeadword(entry, prefixIndex, entryByHeadword);
    if (!hit || !entryByHeadword.has(hit.canonical)) continue;
    truncated.push({
      entry,
      word: entry.word,
      canonical: hit.canonical,
      reason: hit.reason
    });
  }

  return truncated;
}
