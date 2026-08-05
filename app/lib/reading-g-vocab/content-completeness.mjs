const PLACEHOLDER_CONTENT_PATTERN = /(?:总词库待补|待补(?:全|充)?(?:释义|资料|内容)|暂无(?:释义|例句|音标|词性)|等待(?:ai|音标)|to be completed|waiting ai|not available)/i;
const PLACEHOLDER_POS_PATTERN = /^(?:word|phrase|pos|词性|unknown|n\/?a|待补)$/i;

export const READING_G_CONTENT_ISSUE = Object.freeze({
  PHONETIC: "phonetic",
  POS: "pos",
  MEANING: "meaning",
  MEANING_TOO_SHORT: "meaningTooShort",
  MULTI_POS_NEEDS_SPLIT: "multiPosNeedsSplit",
  DEFINITION: "definition",
  EXAMPLE: "example",
  EXAMPLE_ZH: "exampleZh"
});

export const READING_G_CONTENT_ISSUE_LABEL = Object.freeze({
  [READING_G_CONTENT_ISSUE.PHONETIC]: "音标",
  [READING_G_CONTENT_ISSUE.POS]: "词性",
  [READING_G_CONTENT_ISSUE.MEANING]: "释义",
  [READING_G_CONTENT_ISSUE.MEANING_TOO_SHORT]: "释义过短",
  [READING_G_CONTENT_ISSUE.MULTI_POS_NEEDS_SPLIT]: "多词性义项",
  [READING_G_CONTENT_ISSUE.DEFINITION]: "英文释义",
  [READING_G_CONTENT_ISSUE.EXAMPLE]: "英文例句",
  [READING_G_CONTENT_ISSUE.EXAMPLE_ZH]: "例句翻译"
});

export const READING_G_COMPLETENESS_FIELD = Object.freeze({
  MEANING: "meaning",
  PHONETIC: "phonetic",
  EXAMPLE: "example",
  FORMS: "forms",
  WORD_FAMILY: "wordFamily",
  SYNONYMS: "synonyms",
  DIFFICULTY: "difficulty"
});

export const READING_G_COMPLETENESS_FIELD_LABEL = Object.freeze({
  [READING_G_COMPLETENESS_FIELD.MEANING]: "释义",
  [READING_G_COMPLETENESS_FIELD.PHONETIC]: "音标",
  [READING_G_COMPLETENESS_FIELD.EXAMPLE]: "例句",
  [READING_G_COMPLETENESS_FIELD.FORMS]: "词形",
  [READING_G_COMPLETENESS_FIELD.WORD_FAMILY]: "词族",
  [READING_G_COMPLETENESS_FIELD.SYNONYMS]: "同义替换",
  [READING_G_COMPLETENESS_FIELD.DIFFICULTY]: "难度标签"
});

const POS_TOKEN_PATTERN = /\b(?:noun|verb|adjective|adverb|preposition|conjunction|pronoun|determiner|article)\b|(?:^|[\s,;/，；])(?:n|v|adj|adv|prep|conj|pron|det|art)(?=$|[\s,;/，；.])/gi;
const POS_TOKEN_ALIASES = Object.freeze({
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  conj: "conjunction",
  pron: "pronoun",
  det: "determiner",
  art: "article"
});
const FUNCTION_WORD_POS = new Set([
  "preposition",
  "conjunction",
  "article",
  "determiner",
  "pronoun",
  "interjection"
]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function posTokens(value) {
  return unique(
    (text(value).match(POS_TOKEN_PATTERN) || []).map((token) => {
      const normalized = token.trim().toLowerCase().replace(/^[,;/，；]+/, "");
      return POS_TOKEN_ALIASES[normalized] || normalized;
    })
  );
}

function entryPosValues(entry) {
  const rawPos = text(entry?.rawPos);
  return rawPos
    ? [entry?.primaryPos, rawPos]
    : [entry?.primaryPos, entry?.pos];
}

function hasMultipleSenseMarkers(value) {
  const matches = text(value).match(/\[(?:noun|verb|adjective|adverb|preposition|conjunction|pronoun|determiner|article|n|v|adj|adv)\]/gi) || [];
  return matches.length > 1;
}

export function isReadingGPlaceholderContent(value) {
  const normalized = text(value);
  return Boolean(normalized && PLACEHOLDER_CONTENT_PATTERN.test(normalized));
}

function hasUsableContent(values) {
  return values.some((value) => {
    const normalized = text(value);
    return Boolean(normalized && !isReadingGPlaceholderContent(normalized));
  });
}

function hasUsablePos(values) {
  return values.some((value) => {
    const normalized = text(value);
    return Boolean(
      normalized &&
      !isReadingGPlaceholderContent(normalized) &&
      !PLACEHOLDER_POS_PATTERN.test(normalized)
    );
  });
}

export function isReadingGMeaningTooShort(entry) {
  const meaning = [
    entry?.primaryMeaningZh,
    entry?.meaningZh,
    entry?.meaning,
    ...list(entry?.senses).map((sense) => sense?.meaningZh || sense?.meaning)
  ].map(text).find((value) => value && !isReadingGPlaceholderContent(value));
  if (!meaning) return false;

  const chineseCharacters = (meaning.match(/[\u3400-\u9fff]/gu) || []).length;
  if (chineseCharacters >= 2) return false;

  const entryPos = unique([
    ...entryPosValues(entry).flatMap(posTokens)
  ]);
  return !entryPos.length || !entryPos.every((pos) => FUNCTION_WORD_POS.has(pos));
}

export function needsReadingGMultiPosSplit(entry) {
  const entryPos = unique([
    ...entryPosValues(entry).flatMap(posTokens)
  ]);
  const senses = list(entry?.senses).filter((sense) => (
    text(sense?.meaningZh || sense?.meaning) && !isReadingGPlaceholderContent(sense?.meaningZh || sense?.meaning)
  ));
  const sensePos = unique(senses.flatMap((sense) => posTokens(sense?.pos)));
  const hasMultipleEntryPos = entryPos.length > 1;
  const hasUnsplittedMeaningMarkers = hasMultipleSenseMarkers(
    entry?.primaryMeaningZh || entry?.meaningZh || entry?.meaning
  ) && (senses.length < 2 || sensePos.length < 2);

  return hasUnsplittedMeaningMarkers || (hasMultipleEntryPos && (senses.length < 2 || sensePos.length < 2));
}

function hasReviewedRelation(entry, field, reviewedField, extraCount = 0) {
  return list(entry?.[field]).length > 0 || entry?.[reviewedField] === true || Number(extraCount) > 0;
}

function hasUsableDifficulty(value) {
  const normalized = text(value);
  return Boolean(
    normalized &&
    !isReadingGPlaceholderContent(normalized) &&
    !/(?:待补|待完善|unknown|n\/?a)/i.test(normalized)
  );
}

/**
 * Check only the fields rendered as core teaching content on a G-reading word
 * card. Forms and word-family arrays are deliberately excluded: an empty array
 * can be linguistically correct and does not mean that the card is incomplete.
 */
export function getReadingGContentIssues(entry) {
  if (!entry || (entry.entryType || "word") !== "word") return [];

  const senses = list(entry.senses);
  const meaningValues = [
    entry.primaryMeaningZh,
    entry.meaningZh,
    entry.meaning,
    ...senses.map((sense) => sense?.meaningZh)
  ];
  const checks = [
    [READING_G_CONTENT_ISSUE.PHONETIC, [entry.phonetic]],
    [
      READING_G_CONTENT_ISSUE.POS,
      [...entryPosValues(entry), ...senses.map((sense) => sense?.pos)],
      hasUsablePos
    ],
    [
      READING_G_CONTENT_ISSUE.MEANING,
      meaningValues
    ],
    [READING_G_CONTENT_ISSUE.DEFINITION, [entry.definition, ...senses.map((sense) => sense?.definition)]],
    [READING_G_CONTENT_ISSUE.EXAMPLE, [entry.example, ...senses.map((sense) => sense?.example)]],
    [
      READING_G_CONTENT_ISSUE.EXAMPLE_ZH,
      [entry.exampleCn, entry.exampleZh, ...senses.map((sense) => sense?.exampleZh)]
    ]
  ];

  const issues = checks.flatMap(([issue, values, validator = hasUsableContent]) => (
    validator(values) ? [] : [issue]
  ));
  if (hasUsableContent(meaningValues) && isReadingGMeaningTooShort(entry)) {
    issues.push(READING_G_CONTENT_ISSUE.MEANING_TOO_SHORT);
  }
  if (needsReadingGMultiPosSplit(entry)) {
    issues.push(READING_G_CONTENT_ISSUE.MULTI_POS_NEEDS_SPLIT);
  }
  return unique(issues);
}

export function isReadingGContentIncomplete(entry) {
  return getReadingGContentIssues(entry).length > 0;
}

export function isReadingGContentComplete(entry) {
  return Boolean(entry && (entry.entryType || "word") === "word" && !isReadingGContentIncomplete(entry));
}

/**
 * Reports visible G-reading teaching coverage without treating an empty
 * morphology/family/synonym list as a broken lexical relationship. Those
 * three dimensions lower the score, while only core teaching issues block
 * normal study and enter the completion queue.
 */
export function getReadingGCompleteness(entry, options = {}) {
  const totalCount = Object.keys(READING_G_COMPLETENESS_FIELD).length;
  if (!entry || (entry.entryType || "word") !== "word") {
    return {
      fields: {},
      issues: [],
      issueLabels: [],
      completedCount: 0,
      totalCount,
      percent: 0,
      isScored: false,
      isLearningBlocked: false
    };
  }

  const issues = getReadingGContentIssues(entry);
  const fields = {
    [READING_G_COMPLETENESS_FIELD.MEANING]: ![
      READING_G_CONTENT_ISSUE.MEANING,
      READING_G_CONTENT_ISSUE.MEANING_TOO_SHORT,
      READING_G_CONTENT_ISSUE.MULTI_POS_NEEDS_SPLIT,
      READING_G_CONTENT_ISSUE.DEFINITION
    ].some((issue) => issues.includes(issue)),
    [READING_G_COMPLETENESS_FIELD.PHONETIC]: !issues.includes(READING_G_CONTENT_ISSUE.PHONETIC),
    [READING_G_COMPLETENESS_FIELD.EXAMPLE]: ![
      READING_G_CONTENT_ISSUE.EXAMPLE,
      READING_G_CONTENT_ISSUE.EXAMPLE_ZH
    ].some((issue) => issues.includes(issue)),
    [READING_G_COMPLETENESS_FIELD.FORMS]: hasReviewedRelation(entry, "forms", "formsReviewed"),
    [READING_G_COMPLETENESS_FIELD.WORD_FAMILY]: hasReviewedRelation(entry, "wordFamily", "wordFamilyReviewed"),
    [READING_G_COMPLETENESS_FIELD.SYNONYMS]: hasReviewedRelation(
      entry,
      "synonyms",
      "synonymsReviewed",
      options.relatedSynonymCount
    ),
    [READING_G_COMPLETENESS_FIELD.DIFFICULTY]: hasUsableDifficulty(entry.difficulty)
  };
  const completedCount = Object.values(fields).filter(Boolean).length;

  return {
    fields,
    issues,
    issueLabels: issues.map((issue) => READING_G_CONTENT_ISSUE_LABEL[issue] || issue),
    completedCount,
    totalCount,
    percent: Math.round((completedCount / totalCount) * 100),
    isScored: true,
    isLearningBlocked: issues.length > 0
  };
}
