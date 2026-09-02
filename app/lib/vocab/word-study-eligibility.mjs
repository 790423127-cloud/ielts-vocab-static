export function normalizeEligibilityWordKey(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

const REFERENCE_RELATION_RE = /(?:plural|past tense|past participle|present participle|comparative|superlative|third-person|inflected form|spelling repair|headword repair|import typo|malformed import)/i;
const EXPLICIT_PLURAL_MARKER_RE = /(?:plural of|noun\s*\(?plural\)?|名词复数|的复数形式|复数形式)/i;

// These are independent lexical items or conventionally lexicalised plural
// nouns. Their spelling alone must never turn them into hidden references.
export const LEXICALIZED_PLURAL_HEADWORDS = new Set([
  "acoustics",
  "aerodynamics",
  "aeronautics",
  "aerobics",
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
  "species",
  "aids",
  "odds",
  "lyrics",
  "jeans",
  "goggles",
  "sunglasses",
  "trousers",
  "scissors",
  "shorts",
  "arms",
  "analytics",
  "athletics",
  "basics",
  "belongings",
  "binoculars",
  "blinds",
  "commons",
  "contents",
  "corps",
  "cosmetics",
  "crossroads",
  "demographics",
  "dynamics",
  "economics",
  "electronics",
  "ethics",
  "genetics",
  "glasses",
  "graphics",
  "headquarters",
  "linguistics",
  "logistics",
  "mains",
  "mechanics",
  "minutes",
  "olympics",
  "pants",
  "particulars",
  "payables",
  "peoples",
  "phonetics",
  "privates",
  "proceedings",
  "proceeds",
  "quarters",
  "recyclables",
  "regards",
  "remains",
  "robotics",
  "statistics",
  "surroundings",
  "telecommunications",
  "thanks",
  "valuables",
  "visuals",
  "woods",
  "works"
]);

export function hasBaseWordRelation(word) {
  return Boolean(
    normalizeEligibilityWordKey(word?.baseWord) ||
    String(word?.baseWordId || "").trim() ||
    normalizeEligibilityWordKey(word?.redirectToWord)
  );
}

export function isLexicalizedPlural(word) {
  if (!word) return false;
  if (word.lexicalizedPlural === true || word.inflectionClass === "lexicalized-plural") return true;
  return LEXICALIZED_PLURAL_HEADWORDS.has(normalizeEligibilityWordKey(word.word));
}

export function isInflectedReferenceWord(word) {
  if (!word) return false;
  if (word.entryType === "inflected-form" && word.studyMode === "reference") return true;

  return (
    word.studyMode === "reference" &&
    hasBaseWordRelation(word) &&
    REFERENCE_RELATION_RE.test(String(word.relationType || ""))
  );
}

export function isReferenceWord(word) {
  if (!word || word.studyMode !== "reference") return false;
  return Boolean(
    hasBaseWordRelation(word)
    || word.entryType === "word-reference"
    || word.entryType === "inflected-form"
  );
}

export function canGenerateFormsFromHeadword(word) {
  if (!word || isReferenceWord(word)) return false;
  if (word.studyMode === "reference" || hasBaseWordRelation(word)) return false;
  if (isLexicalizedPlural(word)) return false;

  const grammaticalText = [
    word.pos,
    word.meaning,
    word.definition,
    word.meaningZh,
    word.meaningDetailZh,
    word.meaningDetailedZh
  ].filter(Boolean).join(" | ");

  return !EXPLICIT_PLURAL_MARKER_RE.test(grammaticalText);
}

export function isBrushableWord(word) {
  return Boolean(word) && !isReferenceWord(word);
}

export function buildEligibilityWordMap(words = []) {
  const map = new Map();
  for (const word of Array.isArray(words) ? words : []) {
    const key = normalizeEligibilityWordKey(word?.word);
    if (key && !map.has(key)) map.set(key, word);
  }
  for (const word of Array.isArray(words) ? words : []) {
    for (const alias of Array.isArray(word?.legacyHeadwords) ? word.legacyHeadwords : []) {
      const key = normalizeEligibilityWordKey(alias);
      if (key && !map.has(key)) map.set(key, word);
    }
  }
  return map;
}

const ELIGIBILITY_ID_MAP_CACHE = new WeakMap();

function getEligibilityIdMap(wordMap) {
  if (!(wordMap instanceof Map)) return new Map();
  const cached = ELIGIBILITY_ID_MAP_CACHE.get(wordMap);
  if (cached) return cached;

  const idMap = new Map();
  for (const candidate of wordMap.values()) {
    const id = String(candidate?.id || candidate?.wordId || "").trim();
    if (id && !idMap.has(id)) idMap.set(id, candidate);
  }
  ELIGIBILITY_ID_MAP_CACHE.set(wordMap, idMap);
  return idMap;
}

export function resolveBrushableWord(word, wordMap) {
  if (!word) return null;
  if (isBrushableWord(word)) return word;

  const map = wordMap instanceof Map ? wordMap : new Map();
  const redirectKey = normalizeEligibilityWordKey(word.redirectToWord || word.baseWord);
  const target = (redirectKey ? map.get(redirectKey) : null) ||
    getEligibilityIdMap(map).get(String(word.baseWordId || "").trim());
  return isBrushableWord(target) ? target : null;
}

export function resolveBrushableWordIndex(words, index, wordMap = null) {
  const list = Array.isArray(words) ? words : [];
  const current = list[index];
  if (!current) return -1;
  if (isBrushableWord(current)) return index;

  const map = wordMap || buildEligibilityWordMap(list);
  const target = resolveBrushableWord(current, map);
  if (!target) return -1;
  return list.indexOf(target);
}

export function resolveWordSearchTarget(words, query) {
  const list = Array.isArray(words) ? words : [];
  const key = normalizeEligibilityWordKey(query);
  if (!key) return null;

  const wordMap = buildEligibilityWordMap(list);
  const source = wordMap.get(key);
  if (!source) return null;

  const target = resolveBrushableWord(source, wordMap);
  if (!target) return null;

  return {
    source,
    target,
    index: list.indexOf(target),
    redirected: source !== target,
    relationType: source.relationType || "inflected form"
  };
}

function searchValues(word) {
  const formWords = Array.isArray(word?.forms)
    ? word.forms.map((form) => typeof form === "string" ? form : form?.word || form?.form || "")
    : [];
  const synonymWords = [
    ...(Array.isArray(word?.synonyms) ? word.synonyms : []),
    ...(Array.isArray(word?.validatedSynonyms) ? word.validatedSynonyms : []),
    ...(Array.isArray(word?.recommendedSynonyms) ? word.recommendedSynonyms : [])
  ];

  return [
    ["单词", word?.word],
    ...formWords.map((value) => ["词形", value]),
    ...(Array.isArray(word?.legacyHeadwords) ? word.legacyHeadwords : []).map((value) => ["历史词形", value]),
    ...synonymWords.map((value) => ["同义词", value]),
    ["释义", word?.meaning],
    ["释义", word?.meaningDetailZh || word?.meaningDetailedZh],
    ["英文释义", word?.definition]
  ];
}

function searchValueRank(value, query, fieldIndex) {
  const key = normalizeEligibilityWordKey(value);
  if (!key) return null;
  const fieldPenalty = fieldIndex * 10;
  if (key === query) return fieldPenalty;
  if (key.startsWith(query)) return 100 + fieldPenalty;
  if (key.includes(query)) return 200 + fieldPenalty;
  return null;
}

/**
 * Finds every matching card in the complete master lexicon. Results are
 * deduplicated by their brushable destination, so a stored inflected form
 * never creates a second study card for the same word.
 */
export function findWordSearchMatches(words, query) {
  const list = Array.isArray(words) ? words : [];
  const key = normalizeEligibilityWordKey(query);
  if (!key) return [];

  // An exact headword, stored form, or legacy alias is an unambiguous lookup.
  // Do not dilute it with cards that merely mention the same text in a
  // definition or synonym list.
  const exact = resolveWordSearchTarget(list, key);
  if (exact) {
    return [{
      ...exact,
      matchField: exact.source === exact.target ? "单词" : "词形",
      matchText: exact.source.word,
      rank: 0
    }];
  }

  const wordMap = buildEligibilityWordMap(list);
  const indexByWord = new Map(list.map((word, index) => [word, index]));
  const resultsByTarget = new Map();

  for (const source of list) {
    const target = resolveBrushableWord(source, wordMap);
    if (!target) continue;
    const index = indexByWord.get(target);
    if (!Number.isInteger(index)) continue;

    for (const [field, value] of searchValues(source)) {
      const fieldIndex = field === "单词" ? 0
        : field === "词形" || field === "历史词形" ? 1
          : field === "同义词" ? 2
            : field === "释义" ? 3 : 4;
      const rank = searchValueRank(value, key, fieldIndex);
      if (rank === null) continue;

      const previous = resultsByTarget.get(index);
      if (!previous || rank < previous.rank) {
        resultsByTarget.set(index, {
          source,
          target,
          index,
          redirected: source !== target,
          relationType: source.relationType || "inflected form",
          matchField: field,
          matchText: String(value || "").trim(),
          rank
        });
      }
    }
  }

  return [...resultsByTarget.values()].sort((left, right) =>
    left.rank - right.rank || String(left.target.word || "").localeCompare(String(right.target.word || ""))
  );
}
