export const AI_CONTENT_PROFILE_VERSION = "main-meaning-detailed-senses-v3";
export const AI_COLLOCATION_LIMIT = 4;

export const AI_COLLOCATION_TRANSPORT_FIELDS = Object.freeze({
  common: "aiCollocationsV2",
  phrase: "aiPhraseCollocationsV2"
});

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

const INVALID_COLLOCATION_KEYS = new Set([
  "huh",
  "oh",
  "wow",
  "yeah",
  "yep",
  "nope",
  "ok",
  "okay",
  "um",
  "uh",
  "hmm",
  "ah",
  "hey",
  "n a",
  "na",
  "none",
  "null",
  "unknown",
  "not available",
  "to be completed",
  "waiting ai"
]);

function text(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function key(value) {
  return text(value).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
}

function collocationKey(value) {
  return key(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function englishWords(value) {
  return text(value).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [];
}

function isSingleEnglishHeadword(value) {
  return /^[A-Za-z][A-Za-z'-]*$/.test(text(value));
}

export function isReliableAiCollocation(value) {
  const phrase = text(typeof value === "string" ? value : value?.phrase || value?.text || value?.collocation);
  const phraseKey = collocationKey(phrase);
  const words = englishWords(phrase);

  if (!phrase || !phraseKey || words.length < 2 || words.length > 10) return false;
  if (/[?？]/.test(phrase)) return false;
  if (INVALID_COLLOCATION_KEYS.has(phraseKey)) return false;
  if (/^(?:等待\s*ai|待补|待完善|暂无|未知|无意义)/i.test(phrase)) return false;
  if (/^(?:huh|oh|wow|yeah|yep|nope|ok|okay|um|uh|hmm|ah|hey)\b/i.test(phrase) && words.length <= 3) return false;
  if (!/[A-Za-z]/.test(phrase) || /^[\W_]+$/u.test(phrase)) return false;

  return true;
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

export function normalizeAiPhraseItems(value, { max = AI_COLLOCATION_LIMIT, requireChinese = false } = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const phrase = text(typeof item === "string" ? item : item?.phrase || item?.text || item?.collocation);
    const chinese = text(typeof item === "string" ? "" : item?.chinese || item?.meaning || item?.translation);
    const phraseKey = collocationKey(phrase);
    if (!isReliableAiCollocation({ phrase }) || !phraseKey || seen.has(phraseKey)) continue;
    if (requireChinese && !chinese) continue;
    seen.add(phraseKey);
    result.push({ phrase, chinese });
    if (result.length >= max) break;
  }
  return result;
}

function samePhraseItems(left, right) {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  return left.every((item, index) => (
    text(item?.phrase || item) === right[index].phrase &&
    text(typeof item === "string" ? "" : item?.chinese || item?.meaning || item?.translation) === right[index].chinese
  ));
}

export function sanitizeAiWordCollocations(word = {}) {
  if (!word || typeof word !== "object") return word;
  const commonSource = word[AI_COLLOCATION_TRANSPORT_FIELDS.common] || word.collocations;
  const phraseSource = word[AI_COLLOCATION_TRANSPORT_FIELDS.phrase] || word.phraseCollocations;
  const collocations = normalizeAiPhraseItems(commonSource);
  const phraseCollocations = normalizeAiPhraseItems(phraseSource);
  const hasTransport = Object.prototype.hasOwnProperty.call(word, AI_COLLOCATION_TRANSPORT_FIELDS.common) ||
    Object.prototype.hasOwnProperty.call(word, AI_COLLOCATION_TRANSPORT_FIELDS.phrase);

  if (!hasTransport && samePhraseItems(word.collocations, collocations) && samePhraseItems(word.phraseCollocations, phraseCollocations)) {
    return word;
  }

  const next = { ...word, collocations, phraseCollocations };
  delete next[AI_COLLOCATION_TRANSPORT_FIELDS.common];
  delete next[AI_COLLOCATION_TRANSPORT_FIELDS.phrase];
  return next;
}

export function withAiClientCollocationPayload(entry = {}) {
  return {
    ...entry,
    [AI_COLLOCATION_TRANSPORT_FIELDS.common]: normalizeAiPhraseItems(entry.collocations),
    [AI_COLLOCATION_TRANSPORT_FIELDS.phrase]: normalizeAiPhraseItems(entry.phraseCollocations)
  };
}

export function normalizeOtherMeanings(value, mainMeaning = "") {
  const normalizedMainMeaning = text(mainMeaning);
  const mainMeaningKey = key(normalizedMainMeaning);
  const mainParts = new Set(
    normalizedMainMeaning
      .split(/[；;，,、/]+/)
      .map((item) => key(item))
      .filter(Boolean)
  );
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  for (const item of raw) {
    const meaning = text(typeof item === "string" ? item : item?.meaningZh || item?.meaning_zh || item?.meaning || item?.chinese);
    const meaningKey = key(meaning);
    if (!meaningKey || meaningKey === mainMeaningKey || mainParts.has(meaningKey) || seen.has(meaningKey)) continue;
    seen.add(meaningKey);
    result.push({
      pos: text(typeof item === "string" ? "" : item?.pos || item?.partOfSpeech || item?.part_of_speech),
      meaningZh: meaning,
      definitionEn: text(typeof item === "string" ? "" : item?.definitionEn || item?.definition_en || item?.definition || item?.english_definition),
      example: text(typeof item === "string" ? "" : item?.example || item?.ielts_example),
      exampleCn: text(typeof item === "string" ? "" : item?.exampleCn || item?.example_chinese || item?.translation)
    });
    if (result.length >= 5) break;
  }
  return result;
}

export function isDetailedOtherMeaning(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    text(value.meaningZh) &&
    text(value.definitionEn) &&
    text(value.example) &&
    text(value.exampleCn)
  );
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
    synonyms: normalizeAiStringArray(entry.synonyms, { max: 4 })
      .filter((item) => key(item) !== key(word)),
    collocations: normalizeAiPhraseItems(entry.common_collocations || entry.collocations || entry.commonCollocations, {
      max: AI_COLLOCATION_LIMIT,
      requireChinese: true
    }),
    phraseCollocations: normalizeAiPhraseItems(entry.phrase_collocations || entry.phraseCollocations || entry.prepositional_phrases, {
      max: AI_COLLOCATION_LIMIT,
      requireChinese: true
    }),
    ieltsUse: normalizeAiStringArray(entry.ielts_use || entry.ieltsUse, { max: 3 }),
    topics: normalizeAiStringArray(entry.topics || entry.topic, { max: 3 }),
    difficulty: text(entry.difficulty || "中级核心"),
    category: text(entry.category ? `IELTS G类 · ${entry.category}` : "IELTS G类"),
    aiGenerated: true,
    aiContentProfile: AI_CONTENT_PROFILE_VERSION,
    generatedAt: new Date().toISOString()
  };
}

function hasReliableCollocations(value) {
  return normalizeAiPhraseItems(value).length > 0;
}

function hasFourTranslatedCollocations(value) {
  return normalizeAiPhraseItems(value, {
    max: AI_COLLOCATION_LIMIT,
    requireChinese: true
  }).length === AI_COLLOCATION_LIMIT;
}

export function isAiCoreContentComplete(word) {
  return Boolean(
    word?.word &&
    word?.pos &&
    word?.meaning &&
    word?.meaningDetailZh &&
    word?.definition &&
    Array.isArray(word?.otherMeanings) &&
    word.otherMeanings.every(isDetailedOtherMeaning) &&
    word?.example &&
    word?.exampleCn &&
    Array.isArray(word?.forms) &&
    Array.isArray(word?.wordFamily) &&
    hasReliableCollocations(word?.collocations) &&
    hasReliableCollocations(word?.phraseCollocations)
  );
}

export function isAiContentProfileComplete(word) {
  return Boolean(
    isAiCoreContentComplete(word) &&
    hasFourTranslatedCollocations(word?.collocations) &&
    hasFourTranslatedCollocations(word?.phraseCollocations) &&
    Array.isArray(word?.ieltsUse) && word.ieltsUse.length &&
    Array.isArray(word?.topics) && word.topics.length &&
    word?.difficulty &&
    word?.aiContentProfile === AI_CONTENT_PROFILE_VERSION
  );
}

export function isAiContentProfileMissing(word) {
  return !isAiCoreContentComplete(word);
}
