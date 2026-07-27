const MASTER_DIFFICULTY_TO_SECTION = new Map([
  ["基础高频", "Section 1"],
  ["中级核心", "Section 2"],
  ["高级加分", "Section 3"],
  ["低频认识即可", "Section 3"]
]);

const EXPRESSION_SECTION_OVERRIDES = new Map([
  ["add to", "Section 1"],
  ["arm or leg", "Section 1"],
  ["as a result of", "Section 2"],
  ["as well as", "Section 1"],
  ["be like", "Section 1"],
  ["begin", "Section 1"],
  ["body", "Section 1"],
  ["boss", "Section 1"],
  ["both ... and", "Section 1"],
  ["both...and", "Section 1"],
  ["but", "Section 1"],
  ["can be seen", "Section 1"],
  ["copy", "Section 1"],
  ["dry", "Section 1"],
  ["due to", "Section 2"],
  ["face", "Section 1"],
  ["first", "Section 1"],
  ["fix", "Section 1"],
  ["harmonize", "Section 3"],
  ["hide", "Section 1"],
  ["home", "Section 1"],
  ["hot", "Section 1"],
  ["impartial", "Section 3"],
  ["in that", "Section 2"],
  ["it", "Section 1"],
  ["like", "Section 1"],
  ["not only ... but also", "Section 2"],
  ["not only...but also...", "Section 2"],
  ["number", "Section 1"],
  ["old", "Section 1"],
  ["older", "Section 1"],
  ["on account of", "Section 2"],
  ["overrun", "Section 2"],
  ["preferential", "Section 3"],
  ["repetitive", "Section 2"],
  ["sea", "Section 1"],
  ["see", "Section 1"],
  ["shyness", "Section 2"],
  ["surmount", "Section 3"],
  ["the one", "Section 1"],
  ["the same as", "Section 1"],
  ["they", "Section 1"],
  ["this", "Section 1"],
  ["top", "Section 1"],
  ["trustworthiness", "Section 2"],
  ["unharmonious", "Section 3"],
  ["unnatural", "Section 2"],
  ["unpredictably", "Section 3"],
  ["use", "Section 1"],
  ["useful", "Section 1"],
  ["very old", "Section 1"],
  ["way", "Section 1"],
  ["word", "Section 1"]
]);

const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "the",
  "be",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "by",
  "with",
  "from",
  "as",
  "is",
  "are",
  "was",
  "were",
  "been",
  "being",
  "and",
  "or",
  "but",
  "than",
  "into",
  "over",
  "under",
  "after",
  "before",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "their",
  "oneself",
  "only",
  "not",
  "can",
  "may",
  "could",
  "will",
  "would",
  "should",
  "both",
  "also"
]);

const SECTION_RANK = new Map([
  ["Section 1", 1],
  ["Section 2", 2],
  ["Section 3", 3]
]);

function normalizeExpression(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function getTokenVariants(token) {
  return [
    token,
    token.replace(/ies$/, "y"),
    token.replace(/ing$/, ""),
    token.replace(/ing$/, "e"),
    token.replace(/ed$/, ""),
    token.replace(/ed$/, "e"),
    token.replace(/s$/, "")
  ];
}

export function buildIelts538DifficultyIndex(masterWords) {
  return new Map(
    (Array.isArray(masterWords) ? masterWords : [])
      .map((entry) => [
        normalizeExpression(entry?.word),
        String(entry?.difficulty || "").trim()
      ])
      .filter(([word, difficulty]) => word && MASTER_DIFFICULTY_TO_SECTION.has(difficulty))
  );
}

export function inferIelts538ReplacementSection(replacement, difficultyIndex = new Map()) {
  const expression = normalizeExpression(replacement);
  if (!expression) return "";

  const exactDifficulty = difficultyIndex.get(expression);
  if (MASTER_DIFFICULTY_TO_SECTION.has(exactDifficulty)) {
    return MASTER_DIFFICULTY_TO_SECTION.get(exactDifficulty);
  }

  const override = EXPRESSION_SECTION_OVERRIDES.get(expression);
  if (override) return override;

  const sections = expression
    .replace(/\.\.\./g, " ")
    .split(/[^a-z]+/)
    .filter((token) => token && !FUNCTION_WORDS.has(token))
    .map((token) => getTokenVariants(token).find((variant) => difficultyIndex.has(variant)))
    .filter(Boolean)
    .map((token) => MASTER_DIFFICULTY_TO_SECTION.get(difficultyIndex.get(token)))
    .filter(Boolean);

  if (!sections.length) return "Section 2";
  return sections.reduce((hardest, section) =>
    SECTION_RANK.get(section) > SECTION_RANK.get(hardest) ? section : hardest
  , "Section 1");
}

export function applyIelts538SynonymSections(words, difficultyIndex) {
  return (Array.isArray(words) ? words : []).map((entry) => {
    const paraphraseExamples = (Array.isArray(entry?.paraphraseExamples)
      ? entry.paraphraseExamples
      : []
    ).map((pair) => ({
      ...pair,
      readingSection: inferIelts538ReplacementSection(pair?.replacement, difficultyIndex)
    }));
    const candidates = [
      ...(Array.isArray(entry?.synonyms) ? entry.synonyms : []),
      ...paraphraseExamples.map((pair) => pair.replacement)
    ];
    const synonymSections = {};

    for (const candidate of candidates) {
      const replacement = String(candidate || "").trim();
      if (!replacement || Object.hasOwn(synonymSections, replacement)) continue;
      synonymSections[replacement] = inferIelts538ReplacementSection(
        replacement,
        difficultyIndex
      );
    }

    const recommendedKeys = new Set(
      (Array.isArray(entry?.recommendedSynonyms) ? entry.recommendedSynonyms : [])
        .map(normalizeExpression)
    );
    const recommendedPair = paraphraseExamples.find(
      (pair) => pair?.isRecommended || recommendedKeys.has(normalizeExpression(pair?.replacement))
    );

    return {
      ...entry,
      readingSection: recommendedPair?.readingSection || "",
      synonymSections,
      paraphraseExamples
    };
  });
}
