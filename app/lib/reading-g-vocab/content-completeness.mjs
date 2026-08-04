const PLACEHOLDER_CONTENT_PATTERN = /(?:总词库待补|待补(?:全|充)?(?:释义|资料|内容)|暂无(?:释义|例句|音标|词性)|等待(?:ai|音标)|to be completed|waiting ai|not available)/i;
const PLACEHOLDER_POS_PATTERN = /^(?:word|phrase|pos|词性|unknown|n\/?a|待补)$/i;

export const READING_G_CONTENT_ISSUE = Object.freeze({
  PHONETIC: "phonetic",
  POS: "pos",
  MEANING: "meaning",
  DEFINITION: "definition",
  EXAMPLE: "example",
  EXAMPLE_ZH: "exampleZh"
});

function text(value) {
  return String(value == null ? "" : value).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
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

/**
 * Check only the fields rendered as core teaching content on a G-reading word
 * card. Forms and word-family arrays are deliberately excluded: an empty array
 * can be linguistically correct and does not mean that the card is incomplete.
 */
export function getReadingGContentIssues(entry) {
  if (!entry || (entry.entryType || "word") !== "word") return [];

  const senses = list(entry.senses);
  const checks = [
    [READING_G_CONTENT_ISSUE.PHONETIC, [entry.phonetic]],
    [
      READING_G_CONTENT_ISSUE.POS,
      [entry.primaryPos, entry.pos, ...senses.map((sense) => sense?.pos)],
      hasUsablePos
    ],
    [
      READING_G_CONTENT_ISSUE.MEANING,
      [entry.primaryMeaningZh, entry.meaningZh, entry.meaning, ...senses.map((sense) => sense?.meaningZh)]
    ],
    [READING_G_CONTENT_ISSUE.DEFINITION, [entry.definition, ...senses.map((sense) => sense?.definition)]],
    [READING_G_CONTENT_ISSUE.EXAMPLE, [entry.example, ...senses.map((sense) => sense?.example)]],
    [
      READING_G_CONTENT_ISSUE.EXAMPLE_ZH,
      [entry.exampleCn, entry.exampleZh, ...senses.map((sense) => sense?.exampleZh)]
    ]
  ];

  return checks.flatMap(([issue, values, validator = hasUsableContent]) => (
    validator(values) ? [] : [issue]
  ));
}

export function isReadingGContentIncomplete(entry) {
  return getReadingGContentIssues(entry).length > 0;
}

export function isReadingGContentComplete(entry) {
  return Boolean(entry && (entry.entryType || "word") === "word" && !isReadingGContentIncomplete(entry));
}
