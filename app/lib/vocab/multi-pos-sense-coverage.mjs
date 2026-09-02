function text(value) {
  return String(value == null ? "" : value).normalize("NFKC").trim();
}

const POS_ALIASES = new Map([
  ["n", "noun"], ["noun", "noun"],
  ["v", "verb"], ["verb", "verb"],
  ["adj", "adjective"], ["adjective", "adjective"],
  ["adv", "adverb"], ["adverb", "adverb"],
  ["prep", "preposition"], ["preposition", "preposition"],
  ["conj", "conjunction"], ["conjunction", "conjunction"],
  ["pron", "pronoun"], ["pronoun", "pronoun"],
  ["det", "determiner"], ["determiner", "determiner"],
  ["art", "article"], ["article", "article"],
  ["interj", "interjection"], ["interjection", "interjection"],
  ["exclamation", "interjection"],
  ["aux", "auxiliary"], ["auxiliary", "auxiliary"],
  ["modal", "modal"],
  ["num", "numeral"], ["numeral", "numeral"], ["number", "numeral"],
  ["prefix", "prefix"], ["suffix", "suffix"],
  ["phrase", "phrase"]
]);

const CHINESE_POS_REPLACEMENTS = Object.freeze([
  [/形容词/g, " adjective "],
  [/副词/g, " adverb "],
  [/介词/g, " preposition "],
  [/连词/g, " conjunction "],
  [/代词/g, " pronoun "],
  [/限定词/g, " determiner "],
  [/冠词/g, " article "],
  [/感叹词/g, " interjection "],
  [/助动词/g, " auxiliary "],
  [/情态动词/g, " modal "],
  [/数词/g, " numeral "],
  [/前缀/g, " prefix "],
  [/后缀/g, " suffix "],
  [/名词/g, " noun "],
  [/动词/g, " verb "],
  [/短语/g, " phrase "]
]);

const POS_TOKEN_RE = /\b(?:adjective|adverb|preposition|conjunction|pronoun|determiner|article|interjection|exclamation|auxiliary|modal|numeral|number|prefix|suffix|phrase|noun|verb|interj|prep|conj|pron|det|art|adj|adv|aux|num|n|v)\b/gi;

export function normalizePartOfSpeechTokens(value) {
  let normalized = text(value).toLowerCase();
  if (!normalized) return [];
  normalized = normalized
    .replace(/(?:noun\s+phrase\s*名词|verb\s+phrase\s*动词|adjective\s+phrase\s*形容词|adverb\s+phrase\s*副词|prepositional\s+phrase\s*介词)/g, "phrase")
    .replace(/auxiliary\s+verb/g, "auxiliary")
    .replace(/modal\s+verb/g, "modal")
    .replace(/phrasal\s+verb/g, "phrase")
    .replace(/(?:noun|verb|adjective|adverb|prepositional)\s+phrase/g, "phrase");
  for (const [pattern, replacement] of CHINESE_POS_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized
    .replace(/\bphrase\s+(?:noun|verb|adjective|adverb|preposition)\b/g, "phrase")
    .replace(/phrasal\s+verb/g, "phrase")
    .replace(/(?:noun|verb|adjective|adverb|prepositional)\s+phrase/g, "phrase");
  const matches = normalized.match(POS_TOKEN_RE) || [];
  return [...new Set(matches.map((token) => POS_ALIASES.get(token.toLowerCase())).filter(Boolean))];
}

function senseRows(entry = {}) {
  return [
    ...(Array.isArray(entry?.senses) ? entry.senses : []),
    ...(Array.isArray(entry?.otherMeanings) ? entry.otherMeanings : []),
    ...(Array.isArray(entry?.meaningsZh) ? entry.meaningsZh : [])
  ].filter((sense) => sense && typeof sense === "object");
}

function senseMeaning(sense = {}) {
  return text(
    sense.meaningZh
    || sense.meaning_zh
    || sense.quizMeaningZh
    || sense.gloss
    || sense.meaning
    || sense.chinese
  );
}

function sensePos(sense = {}) {
  return sense.pos || sense.posFamily || sense.partOfSpeech || sense.part_of_speech;
}

function explicitPrimaryPosTokens(entry = {}) {
  const primaryPos = normalizePartOfSpeechTokens(entry?.primaryPos);
  if (primaryPos.length === 1) return primaryPos;

  const explicitSenses = Array.isArray(entry?.senses)
    ? entry.senses.filter((sense) => senseMeaning(sense))
    : [];
  const primarySense = explicitSenses.find((sense) => sense?.isPrimary === true)
    || explicitSenses.find((sense) => sense?.readingCommon === true)
    || explicitSenses[0];
  const senseTokens = normalizePartOfSpeechTokens(sensePos(primarySense));
  if (senseTokens.length === 1) return senseTokens;

  const topLevelPos = normalizePartOfSpeechTokens(entry?.pos || entry?.partOfSpeech);
  return topLevelPos.length === 1 ? topLevelPos : [];
}

export function getDeclaredPartOfSpeechTokens(entry = {}) {
  return [...new Set([
    ...normalizePartOfSpeechTokens(entry?.declaredPos || entry?.declaredPartOfSpeech),
    ...normalizePartOfSpeechTokens(entry?.primaryPos),
    ...normalizePartOfSpeechTokens(entry?.pos || entry?.partOfSpeech)
  ])];
}

export function getMultiPosSenseCoverage(entry = {}) {
  const declaredPosTokens = getDeclaredPartOfSpeechTokens(entry);
  const primaryPosTokens = explicitPrimaryPosTokens(entry);
  const sensePosTokens = [...new Set(
    senseRows(entry)
      .filter((sense) => senseMeaning(sense))
      .map((sense) => normalizePartOfSpeechTokens(sensePos(sense)))
      .filter((tokens) => tokens.length === 1)
      .flat()
  )];
  const coveredPosTokens = [...new Set([...primaryPosTokens, ...sensePosTokens])];
  const missingPosTokens = declaredPosTokens.filter((token) => !coveredPosTokens.includes(token));
  const isMultiPos = declaredPosTokens.length > 1;
  const primaryResolved = !isMultiPos || (
    primaryPosTokens.length === 1 && declaredPosTokens.includes(primaryPosTokens[0])
  );

  return {
    isMultiPos,
    complete: !isMultiPos || (primaryResolved && missingPosTokens.length === 0),
    primaryResolved,
    declaredPosTokens,
    primaryPosTokens,
    sensePosTokens,
    coveredPosTokens,
    missingPosTokens
  };
}

export function needsMultiPosSenseRepair(entry = {}) {
  const coverage = getMultiPosSenseCoverage(entry);
  return coverage.isMultiPos && !coverage.complete;
}

export function isAiProfileCompatibleWithDeclaredPos(profile = {}, declaredPos = "") {
  const expected = normalizePartOfSpeechTokens(declaredPos);
  if (expected.length < 2) return true;
  const primary = normalizePartOfSpeechTokens(profile?.pos || profile?.partOfSpeech);
  if (primary.length !== 1 || !expected.includes(primary[0])) return false;
  const covered = new Set([
    ...primary,
    ...senseRows(profile)
      .filter((sense) => senseMeaning(sense))
      .map((sense) => normalizePartOfSpeechTokens(sensePos(sense)))
      .filter((tokens) => tokens.length === 1)
      .flat()
  ]);
  return expected.every((token) => covered.has(token));
}

export function describeMultiPosSenseCoverage(entry = {}) {
  const coverage = getMultiPosSenseCoverage(entry);
  if (!coverage.isMultiPos || coverage.complete) return "";
  if (!coverage.primaryResolved) {
    return `多词性主释义未明确（已声明：${coverage.declaredPosTokens.join(" / ")}）`;
  }
  return `缺少独立词性义项：${coverage.missingPosTokens.join(" / ")}`;
}
