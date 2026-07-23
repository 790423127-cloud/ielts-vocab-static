export const AI_CONTENT_PROFILE_VERSION = "main-meaning-four-sections-v1";

const FORM_TYPE_ALIASES = new Map([
  ["plural", "plural"],
  ["irregular plural", "irregular plural"],
  ["third person singular", "third-person singular"],
  ["third-person singular", "third-person singular"],
  ["past tense", "past tense"],
  ["past participle", "past participle"],
  ["past tense / past participle", "past tense / past participle"],
  ["past tense and past participle", "past tense / past participle"],
  ["present participle", "present participle / gerund"],
  ["present participle / gerund", "present participle / gerund"],
  ["gerund", "present participle / gerund"],
  ["comparative", "comparative"],
  ["superlative", "superlative"]
]);

const FAMILY_RELATIONS = new Set([
  "base-word",
  "noun-form",
  "verb-form",
  "adjective-form",
  "adverb-form",
  "agent-noun",
  "negative-form",
  "related-to"
]);

const FORMLESS_LEXICALIZED_HEADWORDS = new Set([
  "news",
  "means",
  "customs",
  "premises",
  "savings",
  "earnings",
  "goods",
  "clothes",
  "mathematics",
  "physics",
  "series",
  "species"
]);

function text(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function key(value) {
  return text(value).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
}

function isSingleEnglishHeadword(value) {
  return /^[A-Za-z][A-Za-z'-]*$/.test(text(value));
}

export function normalizeAiStringArray(value, { max = 6 } = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const normalized = text(item);
    const normalizedKey = key(normalized);
    if (!normalizedKey || seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    result.push(normalized);
    if (result.length >= max) break;
  }
  return result;
}

export function normalizeAiPhraseItems(value, { max = 3 } = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const phrase = text(typeof item === "string" ? item : item?.phrase || item?.text || item?.collocation);
    const chinese = text(typeof item === "string" ? "" : item?.chinese || item?.meaning || item?.translation);
    const phraseKey = key(phrase);
    if (!phraseKey || seen.has(phraseKey)) continue;
    seen.add(phraseKey);
    result.push({ phrase, chinese });
    if (result.length >= max) break;
  }
  return result;
}

export function normalizeOtherMeanings(value, mainMeaning = "") {
  const mainParts = new Set(
    text(mainMeaning)
      .split(/[；;，,、/]+/)
      .map((item) => key(item))
      .filter(Boolean)
  );
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  for (const item of raw) {
    const meaning = text(typeof item === "string" ? item : item?.meaningZh || item?.meaning || item?.chinese);
    const meaningKey = key(meaning);
    if (!meaningKey || mainParts.has(meaningKey) || seen.has(meaningKey)) continue;
    seen.add(meaningKey);
    result.push(meaning);
    if (result.length >= 5) break;
  }
  return result;
}

export function normalizeAiForms(value, headword = "") {
  if (!Array.isArray(value) || !isSingleEnglishHeadword(headword)) return [];
  const headwordKey = key(headword);
  if (FORMLESS_LEXICALIZED_HEADWORDS.has(headwordKey)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const formWord = text(item?.word || item);
    const rawType = key(item?.type || item?.relation || "");
    const type = FORM_TYPE_ALIASES.get(rawType);
    const formKey = key(formWord);
    if (!isSingleEnglishHeadword(formWord) || !type || !formKey || formKey === headwordKey) continue;
    if (type === "plural" && formKey === `${headwordKey}s` && /s$/.test(headwordKey)) continue;
    const relationKey = `${formKey}::${type}`;
    if (seen.has(relationKey)) continue;
    seen.add(relationKey);
    result.push({
      word: formWord,
      type,
      note: text(item?.note || ""),
      source: "ai-generated"
    });
    if (result.length >= 5) break;
  }
  return result;
}

export function normalizeAiWordFamily(value, headword = "") {
  if (!Array.isArray(value) || !isSingleEnglishHeadword(headword)) return [];
  const headwordKey = key(headword);
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const familyWord = text(item?.word || item);
    const familyKey = key(familyWord);
    const rawRelation = key(item?.relation || "related-to");
    const relation = FAMILY_RELATIONS.has(rawRelation) ? rawRelation : "related-to";
    if (!isSingleEnglishHeadword(familyWord) || !familyKey || familyKey === headwordKey || seen.has(familyKey)) continue;
    seen.add(familyKey);
    result.push({
      word: familyWord,
      pos: text(item?.pos || ""),
      meaning: text(item?.meaningZh || item?.meaning || item?.chinese || ""),
      relation,
      source: "ai-generated"
    });
    if (result.length >= 6) break;
  }
  return result;
}

export function normalizeAiGeneratedEntry(entry = {}, fallbackWord = "") {
  const word = text(entry.word || fallbackWord);
  const meaning = text(entry.chinese_meaning || entry.meaning);
  return {
    word,
    phonetic: text(entry.phonetic),
    pos: text(entry.part_of_speech || entry.pos),
    meaning,
    meaningDetailZh: text(entry.main_meaning_detail_zh || entry.meaningDetailZh || entry.meaning_detail_zh),
    definition: text(entry.english_definition || entry.definition),
    otherMeanings: normalizeOtherMeanings(entry.other_meanings || entry.otherMeanings, meaning),
    example: text(entry.ielts_example || entry.example),
    exampleCn: text(entry.example_chinese || entry.exampleCn),
    forms: normalizeAiForms(entry.forms, word),
    wordFamily: normalizeAiWordFamily(entry.word_family || entry.wordFamily, word),
    collocations: normalizeAiPhraseItems(entry.common_collocations || entry.collocations || entry.commonCollocations),
    phraseCollocations: normalizeAiPhraseItems(entry.phrase_collocations || entry.phraseCollocations || entry.prepositional_phrases),
    ieltsUse: normalizeAiStringArray(entry.ielts_use || entry.ieltsUse, { max: 3 }),
    topics: normalizeAiStringArray(entry.topics || entry.topic, { max: 3 }),
    difficulty: text(entry.difficulty || "中级核心"),
    category: text(entry.category ? `IELTS G类 · ${entry.category}` : "IELTS G类"),
    aiGenerated: true,
    aiContentProfile: AI_CONTENT_PROFILE_VERSION,
    generatedAt: new Date().toISOString()
  };
}

export function isAiContentProfileComplete(word) {
  return Boolean(
    word?.word &&
    word?.pos &&
    word?.meaning &&
    word?.meaningDetailZh &&
    word?.definition &&
    Array.isArray(word?.otherMeanings) &&
    word?.example &&
    word?.exampleCn &&
    Array.isArray(word?.forms) &&
    Array.isArray(word?.wordFamily) &&
    Array.isArray(word?.collocations) && word.collocations.length &&
    Array.isArray(word?.phraseCollocations) && word.phraseCollocations.length &&
    Array.isArray(word?.ieltsUse) && word.ieltsUse.length &&
    Array.isArray(word?.topics) && word.topics.length &&
    word?.difficulty &&
    word?.aiContentProfile === AI_CONTENT_PROFILE_VERSION
  );
}

export function isAiContentProfileMissing(word) {
  return !isAiContentProfileComplete(word);
}
