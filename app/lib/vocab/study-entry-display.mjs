import {
  needsMultiPosSenseRepair,
  normalizePartOfSpeechTokens
} from "./multi-pos-sense-coverage.mjs";

const PLACEHOLDER_SENSE_PATTERN = /(?:总词库待补|待补(?:全|充)?(?:释义|资料|内容)|暂无(?:释义|例句|音标|词性)|等待(?:ai|音标)|to be completed|waiting ai|not available)/iu;

function text(value) {
  return String(value == null ? "" : value).trim();
}

function isPlaceholderSenseMeaning(value) {
  const meaning = text(value);
  return Boolean(meaning && PLACEHOLDER_SENSE_PATTERN.test(meaning));
}

function bilingualExamplePair(example, exampleCn) {
  const english = text(example);
  const chinese = text(exampleCn);
  return english && chinese ? { example: english, exampleCn: chinese } : null;
}

function meaningKey(value) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s，,。；;：:、（）()\[\]【】“”"'·/\\-]+/g, "");
}

function normalizeSense(value, source = "sense") {
  if (!value) return null;
  if (typeof value === "string") {
    const meaning = text(value);
    return meaning ? { pos: "", meaning, definition: "", example: "", exampleCn: "", source } : null;
  }
  const meaning = text(
    value.meaningZh
    || value.meaning_zh
    || value.gloss
    || value.quizMeaningZh
    || value.meaning
    || value.chinese
  );
  if (!meaning || isPlaceholderSenseMeaning(meaning)) return null;
  return {
    pos: text(value.pos || value.posFamily || value.partOfSpeech || value.part_of_speech),
    meaning,
    definition: text(value.definitionEn || value.definition_en || value.definition),
    example: text(value.example || value.exampleEn || value.ielts_example),
    exampleCn: text(value.exampleCn || value.exampleZh || value.example_chinese || value.translation),
    isPrimary: value.isPrimary === true,
    readingCommon: value.readingCommon === true,
    source
  };
}

function posTokens(value) {
  return normalizePartOfSpeechTokens(value);
}

function senseIdentityKeys(pos, meaning) {
  const positions = posTokens(pos);
  const meanings = text(meaning)
    .split(/[；;，,、/]+/)
    .map(meaningKey)
    .filter(Boolean);
  return (positions.length ? positions : [""])
    .flatMap((position) => meanings.map((meaningPart) => `${position}::${meaningPart}`));
}

function uniqueSupplementalSenses(values, primaryMeaning, primaryPos) {
  const seen = new Set(senseIdentityKeys(primaryPos, primaryMeaning));
  const primaryMeaningKeys = new Set(
    text(primaryMeaning).split(/[；;，,、/]+/).map(meaningKey).filter(Boolean)
  );
  const result = [];

  for (const sense of values) {
    const positions = posTokens(sense?.pos);
    const parts = text(sense?.meaning)
      .split(/[；;，,、/]+/)
      .map(text)
      .filter(Boolean)
      .filter((part) => {
        const normalizedMeaning = meaningKey(part);
        if (!normalizedMeaning) return false;
        if (!positions.length && primaryMeaningKeys.has(normalizedMeaning)) return false;
        if (!positions.length && [...seen].some((key) => key.endsWith(`::${normalizedMeaning}`))) return false;
        const keys = senseIdentityKeys(sense?.pos, part);
        if (keys.length && keys.every((key) => seen.has(key))) return false;
        keys.forEach((key) => seen.add(key));
        return true;
      });
    if (parts.length) result.push({ ...sense, meaning: parts.join("；") });
  }

  return result;
}

/**
 * Build one display model for every word-learning surface. It gives explicit
 * per-sense data precedence over legacy combined top-level fields, while
 * preserving those fields as the fallback for old lexicons.
 */
export function getStudyEntryDisplay(entry = {}) {
  const explicitSenses = (Array.isArray(entry.senses) ? entry.senses : [])
    .map((sense) => normalizeSense(sense, "senses"))
    .filter(Boolean);
  const preferredSenseIndex = explicitSenses.findIndex((sense) => sense.isPrimary);
  const declaredPrimaryTokens = posTokens(entry.primaryPos);
  const declaredPrimarySenseIndex = declaredPrimaryTokens.length === 1
    ? explicitSenses.findIndex((sense) => {
      const tokens = posTokens(sense.pos);
      return tokens.length === 1 && tokens[0] === declaredPrimaryTokens[0];
    })
    : -1;
  const readingSenseIndex = explicitSenses.findIndex((sense) => sense.readingCommon);
  const primarySenseIndex = preferredSenseIndex >= 0
    ? preferredSenseIndex
    : declaredPrimarySenseIndex >= 0
      ? declaredPrimarySenseIndex
    : readingSenseIndex >= 0
      ? readingSenseIndex
      : 0;
  const primarySense = explicitSenses[primarySenseIndex] || null;
  const fallbackMeaning = text(entry.primaryMeaningZh || entry.meaningZh || entry.meaning);
  const primaryMeaning = primarySense?.meaning || fallbackMeaning;
  const primaryPos = primarySense?.pos
    || text(entry.primaryPos || entry.pos || (entry.entryType === "phrase" ? "phrase" : ""));
  // A source sentence without its own translation must never borrow a different
  // top-level translation. Prefer a complete bilingual pair; otherwise hide it.
  const examplePair = bilingualExamplePair(primarySense?.example, primarySense?.exampleCn)
    || bilingualExamplePair(entry.example, entry.exampleCn || entry.exampleZh);

  const otherExplicitSenses = explicitSenses.filter((_, index) => index !== primarySenseIndex);
  const supplementalSenses = uniqueSupplementalSenses([
    ...otherExplicitSenses,
    ...(Array.isArray(entry.otherMeanings) ? entry.otherMeanings : [])
      .map((sense) => normalizeSense(sense, "otherMeanings"))
      .filter(Boolean),
    ...(Array.isArray(entry.meaningsZh) ? entry.meaningsZh : [])
      .filter((sense) => !sense?.confidence || String(sense.confidence).toLowerCase() === "high")
      .map((sense) => normalizeSense(sense, "meaningsZh"))
      .filter((sense) => Boolean(sense) && !(explicitSenses.length && posTokens(sense.pos).length > 1))
  ], primaryMeaning, primaryPos);

  const needsSenseSplit = needsMultiPosSenseRepair(entry);

  return {
    word: text(entry.word),
    phonetic: text(entry.phonetic),
    pos: primaryPos,
    meaning: primaryMeaning,
    definition: primarySense?.definition || text(entry.definition),
    example: examplePair?.example || "",
    exampleCn: examplePair?.exampleCn || "",
    supplementalSenses,
    needsSenseSplit,
    declaredPos: text(entry.primaryPos || entry.pos)
  };
}
