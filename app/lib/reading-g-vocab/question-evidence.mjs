function text(value) {
  return String(value || "").trim();
}

export function readingGQuestionEvidenceKey(source = {}) {
  const question = Number(source.question);
  if (!text(source.book) || !text(source.test) || !text(source.part) || !Number.isInteger(question) || question < 1) {
    return "";
  }
  return [text(source.book), text(source.test), text(source.part), question].join("|");
}

function normalizeQuestionEvidence(entry = {}) {
  const key = text(entry.key) || readingGQuestionEvidenceKey(entry);
  if (!key) return null;
  const answerSentence = text(entry.answerSentence);
  return {
    key,
    book: text(entry.book),
    test: text(entry.test),
    part: text(entry.part),
    question: Number(entry.question),
    questionLabel: text(entry.questionLabel),
    questionType: text(entry.questionType),
    instructions: text(entry.instructions),
    answer: text(entry.answer),
    answerSentence,
    answerSentenceStatus: answerSentence ? "available" : "needs_location"
  };
}

export function normalizeReadingGQuestionEvidence(data = {}) {
  const questions = (Array.isArray(data?.questions) ? data.questions : [])
    .map(normalizeQuestionEvidence)
    .filter(Boolean);
  const byKey = new Map();
  for (const question of questions) {
    if (!byKey.has(question.key)) byKey.set(question.key, question);
  }
  return {
    version: text(data?.version),
    count: Number.isFinite(data?.count) ? data.count : questions.length,
    coverage: data?.coverage || {},
    questions,
    byKey
  };
}

export function enrichReadingGParaphraseSources(groups = [], evidenceByKey = new Map()) {
  return (Array.isArray(groups) ? groups : []).map((group) => {
    const seen = new Set();
    const sources = (Array.isArray(group?.sources) ? group.sources : [])
      .map((source) => {
        const key = readingGQuestionEvidenceKey(source);
        const evidence = key ? evidenceByKey.get(key) : null;
        const answerSentence = text(evidence?.answerSentence || source?.answerSentence);
        return {
          ...source,
          key,
          questionType: text(evidence?.questionType),
          instructions: text(evidence?.instructions),
          questionLabel: text(evidence?.questionLabel),
          answer: text(evidence?.answer),
          answerSentence,
          answerSentenceStatus: evidence?.answerSentenceStatus || (answerSentence ? "available" : "needs_location"),
          evidenceStatus: evidence ? "linked" : "unmapped"
        };
      })
      .filter((source) => {
        const sourceKey = source.key || [text(source.book), text(source.test), text(source.part), text(source.question), text(source.answerSentence)].join("|");
        if (!sourceKey || seen.has(sourceKey)) return false;
        seen.add(sourceKey);
        return true;
      });
    return { ...group, sources };
  });
}
