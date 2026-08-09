function text(value) {
  return String(value == null ? "" : value).trim();
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
  if (!meaning) return null;
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
  const aliases = {
    n: "noun",
    v: "verb",
    adj: "adjective",
    adv: "adverb",
    prep: "preposition",
    conj: "conjunction",
    pron: "pronoun",
    det: "determiner"
  };
  return [...new Set(
    text(value)
      .toLowerCase()
      .split(/\s*(?:\/|\||,|;|、|，|；)\s*/)
      .map((token) => token.replace(/\.$/, ""))
      .map((token) => aliases[token] || token)
      .filter(Boolean)
  )];
}

function uniqueSupplementalSenses(values, primaryMeaning) {
  const seen = new Set(
    text(primaryMeaning)
      .split(/[；;，,、/]+/)
      .map(meaningKey)
      .filter(Boolean)
  );
  const result = [];

  for (const sense of values) {
    const parts = text(sense?.meaning)
      .split(/[；;，,、/]+/)
      .map(text)
      .filter(Boolean)
      .filter((part) => {
        const key = meaningKey(part);
        if (!key || seen.has(key)) return false;
        seen.add(key);
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
  const readingSenseIndex = explicitSenses.findIndex((sense) => sense.readingCommon);
  const primarySenseIndex = preferredSenseIndex >= 0
    ? preferredSenseIndex
    : readingSenseIndex >= 0
      ? readingSenseIndex
      : 0;
  const primarySense = explicitSenses[primarySenseIndex] || null;
  const fallbackMeaning = text(entry.primaryMeaningZh || entry.meaningZh || entry.meaning);
  const primaryMeaning = primarySense?.meaning || fallbackMeaning;
  const primaryPos = primarySense?.pos
    || text(entry.primaryPos || entry.pos || (entry.entryType === "phrase" ? "phrase" : ""));

  const otherExplicitSenses = explicitSenses.filter((_, index) => index !== primarySenseIndex);
  const supplementalSenses = uniqueSupplementalSenses([
    ...otherExplicitSenses,
    ...(Array.isArray(entry.otherMeanings) ? entry.otherMeanings : [])
      .map((sense) => normalizeSense(sense, "otherMeanings"))
      .filter(Boolean),
    ...(Array.isArray(entry.meaningsZh) ? entry.meaningsZh : [])
      .filter((sense) => !sense?.confidence || String(sense.confidence).toLowerCase() === "high")
      .map((sense) => normalizeSense(sense, "meaningsZh"))
      .filter(Boolean)
  ], primaryMeaning);

  const declaredPosTokens = posTokens(entry.primaryPos || entry.pos);
  const coveredPosTokens = new Set(
    [primarySense, ...supplementalSenses]
      .map((sense) => posTokens(sense?.pos))
      .filter((tokens) => tokens.length === 1)
      .flat()
  );
  const needsSenseSplit = declaredPosTokens.length > 1
    && declaredPosTokens.some((token) => !coveredPosTokens.has(token));

  return {
    word: text(entry.word),
    phonetic: text(entry.phonetic),
    pos: primaryPos,
    meaning: primaryMeaning,
    definition: primarySense?.definition || text(entry.definition),
    example: primarySense?.example || text(entry.example),
    exampleCn: primarySense?.exampleCn || text(entry.exampleCn || entry.exampleZh),
    supplementalSenses,
    needsSenseSplit,
    declaredPos: text(entry.primaryPos || entry.pos)
  };
}
