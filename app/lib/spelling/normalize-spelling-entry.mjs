import { getWordId, isInternalSpellingIdentifier, normalizeSpellingAnswer } from "./word-id.mjs";

const POS_LABELS = {
  noun: "名词",
  verb: "动词",
  adjective: "形容词",
  adverb: "副词",
  preposition: "介词",
  conjunction: "连词",
  pronoun: "代词",
  interjection: "感叹词",
  phrase: "短语",
  word: "单词",
  n: "名词",
  "n.": "名词",
  v: "动词",
  "v.": "动词",
  adj: "形容词",
  "adj.": "形容词",
  adv: "副词",
  "adv.": "副词",
  prep: "介词",
  "prep.": "介词",
  conj: "连词",
  "conj.": "连词",
  pron: "代词",
  "pron.": "代词",
  num: "数词",
  "num.": "数词",
  "proper noun": "专有名词"
};

function normalizePosLabel(pos = "") {
  const normalized = String(pos || "").trim().toLowerCase();
  if (!normalized) return "";
  if (POS_LABELS[normalized]) return POS_LABELS[normalized];

  const parts = normalized.split(/\s*(?:\/|,|&|\band\b)\s*/).filter(Boolean);
  if (parts.length > 1) {
    return parts.map((part) => POS_LABELS[part] || part).join(" / ");
  }

  return String(pos).trim();
}

export function getSpellingMeaning(item = {}) {
  return String(
    item?.meaning ||
    item?.meaningZh ||
    item?.translation ||
    item?.chinese ||
    item?.definition ||
    ""
  ).trim();
}

export function getSpellingPhonetic(item = {}) {
  const value =
    item?.phonetic ||
    item?.ipa ||
    item?.ukPhonetic ||
    item?.usPhonetic ||
    item?.pronunciation ||
    "";
  return typeof value === "string" ? value.trim() : "";
}

export function getSpellingExpectedAnswer(item = {}) {
  const values = [
    item?.expectedAnswer,
    item?.personalWrong?.targetAnswer,
    item?.displayText,
    item?.word,
    item?.answer,
    item?.text,
    item?.phrase
  ];

  for (const value of values) {
    const answer = String(value || "").trim();
    if (answer && !isInternalSpellingIdentifier(answer)) return answer;
  }

  return "";
}

export function resolveSpellingEntryType(item = {}, expectedAnswer = "") {
  if (item?.entryType === "phrase" || item?.isPhrase === true) return "phrase";
  if (item?.entryType === "word" || item?.entryType === "headword") return "word";
  if (String(item?.pos || "").trim().toLowerCase() === "phrase") return "phrase";
  if (/\s/.test(String(expectedAnswer || "").trim())) return "phrase";
  return "word";
}

export function friendlyPosLabel(entryType, pos = "") {
  if (entryType === "phrase") return "短语";

  const normalized = String(pos || "").trim().toLowerCase();
  if (!normalized) return "单词";
  return normalizePosLabel(pos);
}

export function getAcceptedAnswers(item = {}, expectedAnswer = "") {
  const values = [
    expectedAnswer,
    item?.word,
    item?.answer,
    item?.text,
    item?.phrase,
    ...(Array.isArray(item?.acceptedAnswers) ? item.acceptedAnswers : [])
  ];

  return Array.from(new Set(values.map(normalizeSpellingAnswer).filter(Boolean)));
}

export function normalizeSpellingEntry(item = {}) {
  const expectedAnswer = getSpellingExpectedAnswer(item);
  const entryType = resolveSpellingEntryType(item, expectedAnswer);
  const wordId = getWordId(item);
  const displayText = expectedAnswer;
  const rawPos = String(item?.pos || "").trim();

  return {
    wordId,
    displayText,
    expectedAnswer,
    entryType,
    meaning: getSpellingMeaning(item),
    phonetic: getSpellingPhonetic(item),
    pos: friendlyPosLabel(entryType, rawPos),
    example: String(item?.example || "").trim(),
    exampleCn: String(item?.exampleCn || "").trim(),
    spellingHint: String(item?.spellingHint || "").trim(),
    acceptedAnswers: getAcceptedAnswers(item, expectedAnswer),
    sourceWord: item
  };
}

export function normalizeSpellingEntries(items = []) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => normalizeSpellingEntry(item));
}
