import { normalizeReadingGKey } from "./normalize.mjs";
import {
  buildChineseCharacterFrequency,
  coarsePos,
  hasFamilyShape,
  isPlaceholderMeaning,
  looksDerivational,
  meaningsAreCompatible,
  regularForms
} from "./compaction.mjs";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function relationWord(value) {
  return typeof value === "string"
    ? text(value)
    : text(value?.word || value?.form || value?.value);
}

function entryMeaning(entry) {
  return text(
    entry?.primaryMeaningZh
    || entry?.meaning
    || entry?.meaningZh
    || entry?.chinese
  );
}

function cleanMeaning(value) {
  return text(value).replace(/\s+/g, " ");
}

function formTypeZh(type, headword, form) {
  const normalizedType = text(type).toLowerCase();
  const normalizedHeadword = normalizeReadingGKey(headword);
  const normalizedForm = normalizeReadingGKey(form);
  if (/plural.*third-person|third-person.*plural/.test(normalizedType)) return "复数或第三人称单数";
  if (/irregular plural/.test(normalizedType)) return "不规则复数";
  if (/plural/.test(normalizedType)) return "复数";
  if (/past tense.*past participle|past participle.*past tense/.test(normalizedType)) return "过去式或过去分词";
  if (/past tense/.test(normalizedType)) return "过去式";
  if (/past participle/.test(normalizedType)) return "过去分词";
  if (/present participle|gerund/.test(normalizedType)) return "现在分词或动名词";
  if (/third-person/.test(normalizedType)) return "第三人称单数";
  if (/comparative/.test(normalizedType)) return "比较级";
  if (/superlative/.test(normalizedType)) return "最高级";

  if (/ing$/.test(normalizedForm)) return "现在分词或动名词";
  if (/(ed|ied)$/.test(normalizedForm)) return "过去式或过去分词";
  if (/est$/.test(normalizedForm)) return "最高级";
  if (/er$/.test(normalizedForm) && normalizedForm.startsWith(normalizedHeadword.slice(0, 3))) {
    return "比较级或派生形式";
  }
  if (/(s|es|ies)$/.test(normalizedForm)) return "复数或第三人称单数";
  return "词形变化";
}

function isTruncatedFamilyStem(word, headword, knownMeanings) {
  const key = normalizeReadingGKey(word);
  const headwordKey = normalizeReadingGKey(headword);
  if (!key || knownMeanings.has(key) || key.length < 4 || !headwordKey.startsWith(key)) return false;
  const suffix = headwordKey.slice(key.length);
  return /^(e|er|or|al|ial|ic|ical|ing|ingly|ive|ion|tion|sion|ation|ment|able|ible|ous|ly)$/i.test(suffix);
}

function buildKnownMeanings(items, masterByKey) {
  const meanings = new Map();
  for (const [key, entry] of masterByKey || []) {
    const meaning = entryMeaning(entry);
    if (key && meaning && !isPlaceholderMeaning(meaning)) meanings.set(key, meaning);
  }
  for (const entry of asArray(items)) {
    if ((entry?.entryType || "word") !== "word") continue;
    const key = normalizeReadingGKey(entry.normalizedKey || entry.word);
    const meaning = entryMeaning(entry);
    if (key && meaning) meanings.set(key, meaning);
    for (const merged of asArray(entry.mergedEntries)) {
      const mergedKey = normalizeReadingGKey(merged?.key || merged?.word);
      const mergedMeaning = entryMeaning(merged);
      if (mergedKey && mergedMeaning && !isPlaceholderMeaning(mergedMeaning)) {
        meanings.set(mergedKey, mergedMeaning);
      }
    }
  }
  return meanings;
}

function buildKnownEntries(items, masterByKey) {
  const entries = new Map(masterByKey || []);
  for (const entry of asArray(items)) {
    if ((entry?.entryType || "word") !== "word") continue;
    const key = normalizeReadingGKey(entry.normalizedKey || entry.word);
    if (key) entries.set(key, entry);
    for (const merged of asArray(entry.mergedEntries)) {
      const mergedKey = normalizeReadingGKey(merged?.key || merged?.word);
      if (!mergedKey) continue;
      entries.set(mergedKey, {
        word: merged.word,
        primaryMeaningZh: entryMeaning(merged),
        pos: merged.pos
      });
    }
  }
  return entries;
}

function isTrustedMergedRelation(row) {
  return text(row?.relation) === "merged-independent-entry";
}

function isTrustedExplicitIrregular(row) {
  const type = text(row?.type).toLowerCase();
  const source = text(row?.source).toLowerCase();
  return (
    /irregular|past tense|past participle/.test(type)
    && /local-irregular|irregular/.test(source)
  );
}

const IRREGULAR_FORMS = new Map([
  ["be", new Set(["am", "is", "are", "was", "were", "been", "being"])],
  ["bad", new Set(["worse", "worst"])],
  ["bear", new Set(["bore", "borne", "born"])],
  ["begin", new Set(["began", "begun"])],
  ["break", new Set(["broke", "broken"])],
  ["breed", new Set(["bred"])],
  ["bring", new Set(["brought"])],
  ["buy", new Set(["bought"])],
  ["choose", new Set(["chose", "chosen"])],
  ["come", new Set(["came"])],
  ["do", new Set(["did", "done"])],
  ["draw", new Set(["drew", "drawn"])],
  ["drink", new Set(["drank", "drunk"])],
  ["drive", new Set(["drove", "driven"])],
  ["eat", new Set(["ate", "eaten"])],
  ["fall", new Set(["fell", "fallen"])],
  ["far", new Set(["farther", "farthest", "further", "furthest"])],
  ["feel", new Set(["felt"])],
  ["find", new Set(["found"])],
  ["fly", new Set(["flew", "flown"])],
  ["get", new Set(["got", "gotten"])],
  ["give", new Set(["gave", "given"])],
  ["go", new Set(["went", "gone"])],
  ["good", new Set(["better", "best"])],
  ["grow", new Set(["grew", "grown"])],
  ["have", new Set(["had"])],
  ["hear", new Set(["heard"])],
  ["keep", new Set(["kept"])],
  ["know", new Set(["knew", "known"])],
  ["leave", new Set(["left"])],
  ["lose", new Set(["lost"])],
  ["make", new Set(["made"])],
  ["many", new Set(["more", "most"])],
  ["meet", new Set(["met"])],
  ["mouse", new Set(["mice"])],
  ["much", new Set(["more", "most"])],
  ["pay", new Set(["paid"])],
  ["person", new Set(["people"])],
  ["read", new Set(["read"])],
  ["ride", new Set(["rode", "ridden"])],
  ["ring", new Set(["rang", "rung"])],
  ["run", new Set(["ran"])],
  ["say", new Set(["said"])],
  ["see", new Set(["saw", "seen"])],
  ["send", new Set(["sent"])],
  ["show", new Set(["shown"])],
  ["sing", new Set(["sang", "sung"])],
  ["sit", new Set(["sat"])],
  ["speak", new Set(["spoke", "spoken"])],
  ["stand", new Set(["stood"])],
  ["swim", new Set(["swam", "swum"])],
  ["take", new Set(["took", "taken"])],
  ["teach", new Set(["taught"])],
  ["think", new Set(["thought"])],
  ["tooth", new Set(["teeth"])],
  ["wear", new Set(["wore", "worn"])],
  ["well", new Set(["better", "best"])],
  ["win", new Set(["won"])],
  ["write", new Set(["wrote", "written"])]
]);

const KNOWN_FALSE_RELATION_PAIRS = new Set([
  "already::ready",
  "animal::animation",
  "break::broker",
  "care::career",
  "communication::communal",
  "communication::communism",
  "communication::communist",
  "communication::community",
  "community::communication",
  "community::communism",
  "community::communist",
  "complete::complement",
  "continually::continu",
  "currently::constant",
  "facelift::lift",
  "fee::feed",
  "fee::feeding",
  "feed::fee",
  "feed::fees",
  "find::foundation",
  "find::founder",
  "formal::former",
  "formal::formerly",
  "general::generous",
  "homemaker::make",
  "information::informal",
  "internal::international",
  "international::intern",
  "international::internal",
  "international::internally",
  "meltdown::down",
  "method::methodist",
  "opposition::oppos",
  "others::another",
  "sunny::sunni",
  "tenant::landlord",
  "organisation::organ",
  "organisation::organic",
  "organisation::organism"
]);

const TRUNCATED_FAMILY_FRAGMENTS = new Set([
  "advertis",
  "announc",
  "continu",
  "inspir",
  "oppos",
  "organiz"
]);

const PENDING_RELATION_MARKERS = ["\u603b\u8bcd\u5e93\u5f85\u8865", "\u5f85\u8865"];

function isKnownFalseRelation(headword, relation) {
  const headwordKey = normalizeReadingGKey(headword);
  const relationKey = normalizeReadingGKey(relation);
  return (
    KNOWN_FALSE_RELATION_PAIRS.has(`${headwordKey}::${relationKey}`)
    || KNOWN_FALSE_RELATION_PAIRS.has(`${relationKey}::${headwordKey}`)
  );
}

function relationHasPendingMeaning(row) {
  const value = text(row?.meaning || row?.meaningZh || row?.note);
  return PENDING_RELATION_MARKERS.some((marker) => value.includes(marker));
}

function adverbialForms(headword) {
  const key = normalizeReadingGKey(headword);
  const forms = new Set([`${key}ly`]);
  if (key.endsWith("y")) forms.add(`${key.slice(0, -1)}ily`);
  if (key.endsWith("ic")) forms.add(`${key}ally`);
  if (key.endsWith("le")) forms.add(`${key.slice(0, -1)}y`);
  if (key.endsWith("ue")) forms.add(`${key.slice(0, -2)}uly`);
  return forms;
}

function hasCoarsePos(entry, expected) {
  const value = text(entry?.primaryPos || entry?.pos).toLowerCase();
  if (expected === "verb") return /(^|[\s/])v([\s/.]|$)|verb/.test(value);
  if (expected === "noun") return /(^|[\s/])n([\s/.]|$)|noun/.test(value);
  if (expected === "adjective") return /adj/.test(value);
  if (expected === "adverb") return /adv/.test(value);
  return false;
}

function inferGrammaticalFormType(headword, form, row, entry, target = null) {
  const headwordKey = normalizeReadingGKey(headword);
  const formKey = normalizeReadingGKey(form);
  if (!headwordKey || !formKey || headwordKey === formKey) return "";
  const explicitType = text(row?.type).toLowerCase();
  if (IRREGULAR_FORMS.get(headwordKey)?.has(formKey)) {
    return explicitType && explicitType !== "form" ? explicitType : "irregular form";
  }
  if (
    adverbialForms(headwordKey).has(formKey)
    && hasCoarsePos(entry, "adjective")
    && hasCoarsePos(target || row, "adverb")
  ) {
    return "adverb";
  }
  const checks = [
    ["plural", "noun", "noun"],
    ["third-person singular", "verb", "verb"],
    ["past tense", "verb", "verb"],
    ["past participle", "verb", "verb"],
    ["present participle", "verb", "verb"],
    ["comparative", "adjective", "adjective"],
    ["superlative", "adjective", "adjective"]
  ];
  for (const [type, ownerPos, targetPos] of checks) {
    const explicitMatch = explicitType.includes(type)
      || (type === "present participle" && explicitType.includes("gerund"));
    const posMatch = hasCoarsePos(entry, ownerPos)
      && hasCoarsePos(target || row, targetPos);
    if ((explicitMatch || posMatch) && regularForms(headwordKey, type, ownerPos).has(formKey)) {
      return type;
    }
  }
  if (
    /(plural|third-person|past tense|past participle|present participle|gerund|comparative|superlative)/.test(explicitType)
    && isRegularGrammaticalForm(headwordKey, formKey, explicitType, entry)
  ) {
    return explicitType && explicitType !== "form" ? explicitType : "form";
  }
  return "";
}

const PRESERVED_SUFFIXES = new Set([
  "al", "ally", "ful", "fully", "hood", "ish", "ism", "ist", "ity",
  "less", "ly", "ment", "ness", "ship", "ward", "wards", "wise"
]);
const DROPPED_E_SUFFIXES = new Set([
  "able", "ably", "al", "ance", "ant", "ation", "ence", "ent",
  "er", "ers", "ion", "ions", "ive", "ively", "or", "ors",
  "ous", "ously", "tion", "tions"
]);
const GENERIC_SUFFIXES = new Set([
  ...PRESERVED_SUFFIXES,
  ...DROPPED_E_SUFFIXES,
  "ability", "able", "ably", "ance", "ant", "ary", "ate", "ated", "ates", "ating",
  "ence", "ent", "en", "er", "ers", "ical", "ically", "ible", "ibly",
  "ic", "ics", "ify", "ings", "ion", "ions", "ise", "ised",
  "ises", "ising", "ivate", "ivated", "ivates", "ivating", "ive", "ively", "ivity",
  "ivities", "ize", "ized", "izes", "izing",
  "or", "ors", "ous", "ously", "tion", "tions", "y"
]);

function isRegularGrammaticalForm(headword, form, type, entry) {
  const headwordKey = normalizeReadingGKey(headword);
  const formKey = normalizeReadingGKey(form);
  if (!headwordKey || !formKey) return false;
  if (IRREGULAR_FORMS.get(headwordKey)?.has(formKey)) return true;
  const normalizedType = text(type).toLowerCase();
  const pos = coarsePos(entry);
  if (/comparative|superlative/.test(normalizedType)) {
    return (
      regularForms(headwordKey, normalizedType, "adjective").has(formKey)
      || (
        headwordKey.endsWith("e")
        && formKey === `${headwordKey}${normalizedType.includes("superlative") ? "st" : "r"}`
      )
    );
  }
  if (/plural|third-person|past tense|past participle|present participle|gerund/.test(normalizedType)) {
    return regularForms(headwordKey, normalizedType, "").has(formKey);
  }
  if (["", "form", "corpus-observed-form", "adverbial form"].includes(normalizedType)) {
    return (
      regularForms(headwordKey, normalizedType, "noun").has(formKey)
      || regularForms(headwordKey, normalizedType, "verb").has(formKey)
      || (pos === "adjective" && regularForms(headwordKey, normalizedType, pos).has(formKey))
    );
  }
  return regularForms(headwordKey, normalizedType, pos || "").has(formKey);
}

function isSuffixDerivation(base, derived) {
  if (!base || !derived || base === derived || derived.length <= base.length) return false;
  if (derived.startsWith(base)) {
    const suffix = derived.slice(base.length);
    if (GENERIC_SUFFIXES.has(suffix)) {
      // e-final words normally drop the e before agent endings: drive -> driver.
      // Keeping it would incorrectly accept care -> career.
      if (base.endsWith("e") && /^(er|ers|or|ors)$/.test(suffix)) return false;
      return true;
    }
  }
  if (base.endsWith("e")) {
    const stem = base.slice(0, -1);
    if (derived.startsWith(stem) && DROPPED_E_SUFFIXES.has(derived.slice(stem.length))) return true;
  }
  if (base.endsWith("y")) {
    const stem = `${base.slice(0, -1)}i`;
    if (derived.startsWith(stem) && GENERIC_SUFFIXES.has(derived.slice(stem.length))) return true;
  }
  const last = base.at(-1);
  if (last && derived.startsWith(`${base}${last}`)) {
    const suffix = derived.slice(base.length + 1);
    if (GENERIC_SUFFIXES.has(suffix)) return true;
  }
  return false;
}

function isDirectDerivation(left, right) {
  const leftKey = normalizeReadingGKey(left);
  const rightKey = normalizeReadingGKey(right);
  return isSuffixDerivation(leftKey, rightKey) || isSuffixDerivation(rightKey, leftKey);
}

function isSafeFamilyRelation(headword, row, entry, target, characterFrequency) {
  const wordKey = normalizeReadingGKey(row.word);
  const headwordKey = normalizeReadingGKey(headword);
  return (
    isDirectDerivation(headwordKey, wordKey)
    || (
      meaningsAreCompatible(entry, target, characterFrequency)
      && hasFamilyShape(headwordKey, wordKey)
    )
  );
}

function normalizeRelationRow(raw) {
  const word = relationWord(raw);
  return raw && typeof raw === "object" ? { ...raw, word } : { word };
}

/**
 * Remove relation rows created by spelling-prefix guesses (care/career, fee/feed,
 * etc.) and move safe derivations out of the grammatical-form column.
 */
export function sanitizeReadingGRelations(items, masterByKey = new Map()) {
  const wordEntries = asArray(items).filter((entry) => (entry?.entryType || "word") === "word");
  const knownEntries = buildKnownEntries(wordEntries, masterByKey);
  const characterFrequency = buildChineseCharacterFrequency(wordEntries);
  const stats = {
    wordEntries: wordEntries.length,
    formRowsBefore: 0,
    familyRowsBefore: 0,
    formRowsKept: 0,
    familyRowsKept: 0,
    formsMovedToFamily: 0,
    familyRowsMovedToForms: 0,
    unsafeFormRowsRemoved: 0,
    unsafeFamilyRowsRemoved: 0,
    fragmentFamilyRowsRemoved: 0,
    placeholderRowsRemoved: 0,
    phraseEntriesCleared: 0,
    phraseRelationRowsRemoved: 0,
    selfLinksRemoved: 0,
    crossCategoryDuplicatesRemoved: 0
  };

  const sanitizedItems = asArray(items).map((entry) => {
    const entryType = entry?.entryType || "word";
    const entryHeadword = text(entry?.word);
    if (entryType !== "word" || /\s/.test(entryHeadword)) {
      const formRows = asArray(entry?.forms);
      const familyRows = asArray(entry?.wordFamily);
      if (!formRows.length && !familyRows.length) return entry;
      stats.phraseEntriesCleared += 1;
      stats.phraseRelationRowsRemoved += formRows.length + familyRows.length;
      return { ...entry, forms: [], wordFamily: [] };
    }
    const headword = text(entry.word);
    const headwordKey = normalizeReadingGKey(headword);
    const forms = [];
    const family = [];

    for (const raw of asArray(entry.forms)) {
      stats.formRowsBefore += 1;
      const row = normalizeRelationRow(raw);
      const wordKey = normalizeReadingGKey(row.word);
      if (!wordKey || wordKey === headwordKey) {
        stats.selfLinksRemoved += 1;
        continue;
      }
      if (relationHasPendingMeaning(row)) {
        stats.placeholderRowsRemoved += 1;
        continue;
      }
      if (isKnownFalseRelation(headwordKey, wordKey)) {
        stats.unsafeFormRowsRemoved += 1;
        continue;
      }
      if (isTrustedMergedRelation(row)) {
        forms.push(row);
        stats.formRowsKept += 1;
        continue;
      }
      const target = knownEntries.get(wordKey) || {
        word: row.word,
        primaryMeaningZh: entryMeaning(row),
        pos: row.pos
      };
      const type = text(row.type).toLowerCase();
      const semantic = meaningsAreCompatible(entry, target, characterFrequency);
      const irregularCandidate = IRREGULAR_FORMS.get(headwordKey)?.has(wordKey) || false;
      const regularCandidate = isRegularGrammaticalForm(headwordKey, wordKey, type, entry);
      const regular = irregularCandidate || regularCandidate;
      const explicitIrregular = isTrustedExplicitIrregular(row);
      const differentPos = coarsePos(entry)
        && coarsePos(target)
        && coarsePos(entry) !== coarsePos(target);
      const derivational = looksDerivational(wordKey) && !regular;
      if (
        (differentPos || derivational)
        && isSafeFamilyRelation(headwordKey, row, entry, target, characterFrequency)
      ) {
        family.push({ ...row, relation: row.relation || "reclassified-safe-family" });
        stats.formsMovedToFamily += 1;
        continue;
      }
      if (!regular && !semantic && !explicitIrregular) {
        stats.unsafeFormRowsRemoved += 1;
        continue;
      }
      forms.push(row);
      stats.formRowsKept += 1;
    }

    for (const raw of asArray(entry.wordFamily)) {
      stats.familyRowsBefore += 1;
      const row = normalizeRelationRow(raw);
      const wordKey = normalizeReadingGKey(row.word);
      if (!wordKey || wordKey === headwordKey) {
        stats.selfLinksRemoved += 1;
        continue;
      }
      if (relationHasPendingMeaning(row)) {
        stats.placeholderRowsRemoved += 1;
        continue;
      }
      if (isKnownFalseRelation(headwordKey, wordKey)) {
        stats.unsafeFamilyRowsRemoved += 1;
        continue;
      }
      if (TRUNCATED_FAMILY_FRAGMENTS.has(wordKey)) {
        stats.fragmentFamilyRowsRemoved += 1;
        continue;
      }
      const target = knownEntries.get(wordKey) || {
        word: row.word,
        primaryMeaningZh: entryMeaning(row),
        pos: row.pos
      };
      const grammaticalType = inferGrammaticalFormType(headwordKey, wordKey, row, entry, target);
      if (grammaticalType) {
        forms.push({
          ...row,
          type: grammaticalType,
          relation: row.relation || "reclassified-grammatical-form"
        });
        stats.familyRowsMovedToForms += 1;
        continue;
      }
      if (isTrustedMergedRelation(row)) {
        family.push(row);
        stats.familyRowsKept += 1;
        continue;
      }
      if (!isSafeFamilyRelation(headwordKey, row, entry, target, characterFrequency)) {
        stats.unsafeFamilyRowsRemoved += 1;
        continue;
      }
      family.push(row);
      stats.familyRowsKept += 1;
    }

    const formMap = new Map(forms.map((row) => [normalizeReadingGKey(row.word), row]));
    const familyMap = new Map();
    for (const row of family) {
      const key = normalizeReadingGKey(row.word);
      if (!key || familyMap.has(key)) continue;
      if (formMap.has(key)) {
        const formRow = formMap.get(key);
        if (isTrustedMergedRelation(row) && !isTrustedMergedRelation(formRow)) {
          formMap.delete(key);
        } else {
          stats.crossCategoryDuplicatesRemoved += 1;
          continue;
        }
      }
      familyMap.set(key, row);
    }
    return { ...entry, forms: [...formMap.values()], wordFamily: [...familyMap.values()] };
  });
  return { items: sanitizedItems, stats };
}

export function enrichReadingGRelationMeanings(items, masterByKey = new Map()) {
  const knownMeanings = buildKnownMeanings(items, masterByKey);
  const stats = {
    wordEntries: 0,
    formRows: 0,
    familyRows: 0,
    formsReusedExisting: 0,
    formsFilledFromKnownWord: 0,
    formsFilledFromHeadword: 0,
    familiesReusedExisting: 0,
    familiesFilledFromKnownWord: 0,
    familiesFilledFromHeadword: 0,
    invalidFamilyStemsRemoved: 0,
    formsMissingMeaning: 0,
    familiesMissingMeaning: 0
  };

  const enrichedItems = asArray(items).map((entry) => {
    if ((entry?.entryType || "word") !== "word") return entry;
    stats.wordEntries += 1;
    const headword = text(entry.word);
    const headwordMeaning = entryMeaning(entry);
    const forms = asArray(entry.forms).map((raw) => {
      const row = raw && typeof raw === "object" ? { ...raw } : { word: relationWord(raw) };
      const word = relationWord(row);
      const existingMeaning = cleanMeaning(row.meaning || row.meaningZh);
      stats.formRows += 1;
      if (existingMeaning && !isPlaceholderMeaning(existingMeaning)) {
        stats.formsReusedExisting += 1;
        return { ...row, word, meaning: existingMeaning };
      }
      const knownMeaning = knownMeanings.get(normalizeReadingGKey(word));
      if (knownMeaning && !isPlaceholderMeaning(knownMeaning)) {
        stats.formsFilledFromKnownWord += 1;
        return { ...row, word, meaning: knownMeaning, meaningSource: "existing-or-master-entry" };
      }
      const typeZh = formTypeZh(row.type, headword, word);
      if (headwordMeaning) {
        stats.formsFilledFromHeadword += 1;
        return {
          ...row,
          word,
          meaning: `${headwordMeaning}（${typeZh}）`,
          meaningSource: "headword-meaning-with-form-type"
        };
      }
      stats.formsMissingMeaning += 1;
      return { ...row, word, meaning: typeZh, meaningSource: "form-type-only" };
    });

    const wordFamily = asArray(entry.wordFamily).flatMap((raw) => {
      const row = raw && typeof raw === "object" ? { ...raw } : { word: relationWord(raw) };
      const word = relationWord(row);
      const existingMeaning = cleanMeaning(row.meaning || row.meaningZh);
      if (existingMeaning && !isPlaceholderMeaning(existingMeaning)) {
        stats.familyRows += 1;
        stats.familiesReusedExisting += 1;
        return [{ ...row, word, meaning: existingMeaning }];
      }
      const knownMeaning = knownMeanings.get(normalizeReadingGKey(word));
      if (knownMeaning && !isPlaceholderMeaning(knownMeaning)) {
        stats.familyRows += 1;
        stats.familiesFilledFromKnownWord += 1;
        return [{ ...row, word, meaning: knownMeaning, meaningSource: "existing-or-master-entry" }];
      }
      if (isTruncatedFamilyStem(word, headword, knownMeanings)) {
        stats.invalidFamilyStemsRemoved += 1;
        return [];
      }
      stats.familyRows += 1;
      if (headwordMeaning) stats.familiesFilledFromHeadword += 1;
      else stats.familiesMissingMeaning += 1;
      return [{
        ...row,
        word,
        meaning: headwordMeaning
          ? `与 ${headword} 同词族：${headwordMeaning}`
          : `与 ${headword} 同词族`,
        meaningSource: "headword-family-fallback"
      }];
    });

    return { ...entry, forms, wordFamily };
  });
  return { items: enrichedItems, stats };
}
