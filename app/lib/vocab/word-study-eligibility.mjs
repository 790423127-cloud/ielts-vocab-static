export function normalizeEligibilityWordKey(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

const GRAMMATICAL_REFERENCE_RE = /(?:plural|past tense|past participle|present participle|comparative|superlative|third-person|inflected form)/i;
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
    GRAMMATICAL_REFERENCE_RE.test(String(word.relationType || ""))
  );
}

export function canGenerateFormsFromHeadword(word) {
  if (!word || isInflectedReferenceWord(word)) return false;
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
  return Boolean(word) && !isInflectedReferenceWord(word);
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
