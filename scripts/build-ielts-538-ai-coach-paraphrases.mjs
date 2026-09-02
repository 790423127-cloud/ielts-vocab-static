import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const TARGET_PATH = path.join(ROOT, "public", "data", "ielts-538-words.json");
const BACKUP_DIR = path.join(
  ROOT,
  "backups",
  "ielts-538-ai-coach-question-paraphrases-20260824"
);
const BACKUP_PATH = path.join(BACKUP_DIR, "ielts-538-words.before.json");
const MAX_PHRASE_WORDS = 8;
const MAX_PHRASE_CHARS = 120;
const MAX_ORDERED_GAP_TOKENS = 4;
const MAX_PAIRS_PER_QUESTION = 5;
const DELIMITERS = ["->", "→", "↔", "=>", "¡ת"];
const EXPECTED = {
  testCount: 58,
  questionCount: 2320,
  candidateCount: 2699,
  strictAcceptedOccurrenceCount: 1273,
  identityOccurrenceCount: 12,
  nonIdentityOccurrenceCount: 1261,
  uniquePairCount: 1258
};

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function cleanText(value, limit = 500) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function cleanPhrase(value) {
  return cleanText(value, MAX_PHRASE_CHARS + 40)
    .replace(/^[\s"'‘’“”.,!?;:，。！？；：]+|[\s"'‘’“”.,!?;:，。！？；：]+$/g, "");
}

function tokens(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .match(/[\p{L}\p{N}_£$%]+(?:['’\-][\p{L}\p{N}_£$%]+)*/gu) || [];
}

function normalized(value) {
  return tokens(value).join(" ");
}

function isAtomic(value) {
  const phrase = cleanPhrase(value);
  const count = tokens(phrase).length;
  return Boolean(
    phrase &&
    phrase.length <= MAX_PHRASE_CHARS &&
    count >= 1 &&
    count <= MAX_PHRASE_WORDS &&
    !/[,，;；\n]|\s(?:vs|versus)\s/i.test(phrase)
  );
}

function containsLoose(haystack, needle) {
  const hay = normalized(haystack);
  const target = normalized(needle);
  return Boolean(target && hay.includes(target));
}

function containsOrderedGap(haystack, needle) {
  const hay = tokens(haystack);
  const target = tokens(needle);
  if (!hay.length || !target.length || target.length > hay.length) return false;
  for (let start = 0; start < hay.length; start += 1) {
    if (hay[start] !== target[0]) continue;
    let position = start;
    let inserted = 0;
    let matched = true;
    for (const expected of target.slice(1)) {
      let next = position + 1;
      while (next < hay.length && hay[next] !== expected) {
        inserted += 1;
        if (inserted > MAX_ORDERED_GAP_TOKENS) {
          matched = false;
          break;
        }
        next += 1;
      }
      if (!matched || next >= hay.length) {
        matched = false;
        break;
      }
      position = next;
    }
    if (matched) return true;
  }
  return false;
}

function containsSupported(haystack, needle) {
  return containsLoose(haystack, needle) || containsOrderedGap(haystack, needle);
}

function curatedPairs(value) {
  const text = cleanText(value, 2400);
  if (!text || /no correspondence found|does not match/i.test(text)) return [];
  const pairs = [];
  for (const segment of text.split(/[;\n]+/)) {
    const delimiter = DELIMITERS.find((candidate) => segment.includes(candidate));
    if (!delimiter) continue;
    const [left, ...rightParts] = segment.split(delimiter);
    const questionExpression = cleanPhrase(left);
    const sourceExpression = cleanPhrase(rightParts.join(delimiter));
    if (questionExpression && sourceExpression) {
      pairs.push([questionExpression, sourceExpression]);
    }
  }
  return pairs.slice(0, MAX_PAIRS_PER_QUESTION);
}

function questionText(question) {
  return [
    question.prompt,
    question.instructions,
    JSON.stringify(question.options || [])
  ].join("\n");
}

function evidenceRows(question) {
  if (typeof question.evidence === "string") return [question.evidence].filter(Boolean);
  return Array.isArray(question.evidence)
    ? question.evidence.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function evidenceText(question) {
  return evidenceRows(question).join("\n");
}

function validationReason(question, questionExpression, sourceExpression) {
  if (!isAtomic(questionExpression) || !isAtomic(sourceExpression)) {
    return "notAtomicOrOverLength";
  }
  if (!containsSupported(questionText(question), questionExpression)) {
    return "questionExpressionNotSupported";
  }
  if (!containsSupported(evidenceText(question), sourceExpression)) {
    return "sourceExpressionNotSupported";
  }
  return "";
}

function displayQuestionContext(question, expression) {
  const candidates = [
    cleanText(question.prompt, 900),
    ...(question.options || []).map((option) =>
      cleanText(typeof option === "string" ? option : `${option?.value || ""} ${option?.label || ""}`, 900)
    ),
    cleanText(question.instructions, 900)
  ].filter(Boolean);
  return candidates.find((candidate) => containsSupported(candidate, expression)) || candidates[0] || expression;
}

function displayEvidence(question, expression) {
  const rows = evidenceRows(question);
  return rows.find((row) => containsSupported(row, expression)) || rows.join(" ");
}

function stableId(questionExpression, sourceExpression) {
  const digest = crypto
    .createHash("sha256")
    .update(`${normalized(sourceExpression)}\0${normalized(questionExpression)}`)
    .digest("hex")
    .slice(0, 16);
  return `ielts538_aiq_${digest}`;
}

function pairKey(left, right) {
  return `${normalized(left)}\0${normalized(right)}`;
}

function undirectedKey(left, right) {
  return [normalized(left), normalized(right)].sort().join("\0");
}

function collectQuestionRows(test, relativePath) {
  const rows = [];
  for (const part of test.parts || []) {
    for (const group of part.groups || []) {
      for (const rawQuestion of group.questions || []) {
        rows.push({
          ...rawQuestion,
          instructions: rawQuestion.instructions || group.instructions || "",
          options: rawQuestion.options?.length ? rawQuestion.options : group.options || [],
          partNumber: Number(part.number) || 0,
          partTitle: cleanText(part.title || part.article_title, 200),
          questionType: String(group.type || ""),
          testId: String(test.id || ""),
          book: cleanText(test.book, 100),
          testName: cleanText(test.name || test.title, 100),
          relativePath
        });
      }
    }
  }
  return rows;
}

function auditExisting538(lexicon, uniquePairs) {
  const raw = [];
  const reviewed = [];
  const headwords = new Set();
  for (const word of lexicon.words || []) {
    headwords.add(normalized(word.word));
    for (const replacement of word.synonyms || []) {
      raw.push({ left: word.word, right: replacement });
    }
    for (const pair of word.paraphraseExamples || []) {
      reviewed.push({ left: word.word, right: pair.replacement });
    }
  }
  const rawDirected = new Set(raw.map((pair) => pairKey(pair.left, pair.right)));
  const rawUndirected = new Set(raw.map((pair) => undirectedKey(pair.left, pair.right)));
  const reviewedDirected = new Set(reviewed.map((pair) => pairKey(pair.left, pair.right)));
  const reviewedUndirected = new Set(reviewed.map((pair) => undirectedKey(pair.left, pair.right)));
  const newDirected = new Set(uniquePairs.map((pair) => pairKey(pair.sourceExpression, pair.questionExpression)));
  const newUndirected = new Set(uniquePairs.map((pair) => undirectedKey(pair.sourceExpression, pair.questionExpression)));
  const overlapCount = (left, right) => [...left].filter((key) => right.has(key)).length;
  return {
    existingWordCount: lexicon.words.length,
    existingRawRelationOccurrenceCount: raw.length,
    existingRawUniqueDirectedCount: rawDirected.size,
    existingRawInternalDuplicateCount: raw.length - rawDirected.size,
    existingReviewedRelationOccurrenceCount: reviewed.length,
    existingReviewedUniqueDirectedCount: reviewedDirected.size,
    existingReviewedUniqueUndirectedCount: reviewedUndirected.size,
    existingReviewedReverseDuplicateCount: reviewedDirected.size - reviewedUndirected.size,
    newExactDirectedOverlapWithRawCount: overlapCount(newDirected, rawDirected),
    newExactUndirectedOverlapWithRawCount: overlapCount(newUndirected, rawUndirected),
    newExactDirectedOverlapWithReviewedCount: overlapCount(newDirected, reviewedDirected),
    newExactUndirectedOverlapWithReviewedCount: overlapCount(newUndirected, reviewedUndirected),
    newPairsLinkedToExistingHeadwordCount: uniquePairs.filter((pair) =>
      headwords.has(normalized(pair.sourceExpression)) ||
      headwords.has(normalized(pair.questionExpression))
    ).length
  };
}

function assertExpected(name, actual) {
  if (actual !== EXPECTED[name]) {
    throw new Error(`AI教练题库统计漂移：${name} 预期 ${EXPECTED[name]}，实际 ${actual}`);
  }
}

const sourceRoot = argValue("--source-root");
if (!sourceRoot) {
  throw new Error("缺少 --source-root <AI教练新版仓库路径>");
}
const testsDir = path.join(sourceRoot, "services", "api", "data", "question-bank", "tests");
const testFiles = fs.readdirSync(testsDir)
  .filter((name) => /^b\d+-test-[^.]+\.json$/i.test(name))
  .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
const lexicon = JSON.parse(fs.readFileSync(TARGET_PATH, "utf8"));
const rejectionCounts = {
  notAtomicOrOverLength: 0,
  questionExpressionNotSupported: 0,
  sourceExpressionNotSupported: 0
};
const accepted = [];
let questionCount = 0;
let candidateCount = 0;

for (const file of testFiles) {
  const test = JSON.parse(fs.readFileSync(path.join(testsDir, file), "utf8"));
  const relativePath = `AI教练新版/services/api/data/question-bank/tests/${file}`;
  const questions = collectQuestionRows(test, relativePath);
  questionCount += questions.length;
  for (const question of questions) {
    const pairs = curatedPairs(question.paraphrasing);
    candidateCount += pairs.length;
    for (const [questionExpression, sourceExpression] of pairs) {
      const reason = validationReason(question, questionExpression, sourceExpression);
      if (reason) {
        rejectionCounts[reason] += 1;
        continue;
      }
      accepted.push({
        questionExpression,
        sourceExpression,
        book: question.book,
        test: question.testName,
        testId: question.testId,
        part: question.partTitle || `Passage ${question.partNumber}`,
        partNumber: question.partNumber,
        question: Number(question.number) || 0,
        questionId: String(question.id || ""),
        questionType: question.questionType,
        questionPrompt: cleanText(question.prompt, 900),
        questionContext: displayQuestionContext(question, questionExpression),
        evidenceSentence: displayEvidence(question, sourceExpression),
        sourceFile: question.relativePath
      });
    }
  }
}

const identity = accepted.filter((pair) => normalized(pair.questionExpression) === normalized(pair.sourceExpression));
const nonIdentity = accepted.filter((pair) => normalized(pair.questionExpression) !== normalized(pair.sourceExpression));
const grouped = new Map();
for (const pair of nonIdentity) {
  const key = pairKey(pair.questionExpression, pair.sourceExpression);
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(pair);
}
const uniquePairs = [...grouped.values()].map((sources) => ({ ...sources[0], sources }));

assertExpected("testCount", testFiles.length);
assertExpected("questionCount", questionCount);
assertExpected("candidateCount", candidateCount);
assertExpected("strictAcceptedOccurrenceCount", accepted.length);
assertExpected("identityOccurrenceCount", identity.length);
assertExpected("nonIdentityOccurrenceCount", nonIdentity.length);
assertExpected("uniquePairCount", uniquePairs.length);

const existingAudit = auditExisting538(lexicon, uniquePairs);
const repeatedGroups = uniquePairs.filter((pair) => pair.sources.length > 1);
const existingReviewedKeys = new Set(
  (lexicon.words || []).flatMap((word) =>
    (word.paraphraseExamples || []).map((pair) => pairKey(word.word, pair.replacement))
  )
);
const newPracticePairs = uniquePairs.filter((pair) =>
  !existingReviewedKeys.has(pairKey(pair.sourceExpression, pair.questionExpression))
);
const cards = newPracticePairs.map((pair) => {
  const id = stableId(pair.questionExpression, pair.sourceExpression);
  const section = `Section ${Math.max(1, Math.min(3, pair.partNumber || 3))}`;
  const contextNote = `题干“${pair.questionExpression}”对应原文“${pair.sourceExpression}”；仅表示这道真题中的语境关系。`;
  return {
    id,
    wordId: id,
    word: pair.sourceExpression,
    entryType: tokens(pair.sourceExpression).length > 1 ? "phrase" : "word",
    phonetic: "",
    pos: tokens(pair.sourceExpression).length > 1 ? "phrase" : "",
    meaning: `题干改写：${pair.questionExpression}`,
    definition: "AI教练真题中经过题干和原文证据双向核实的语境替换。",
    example: pair.evidenceSentence,
    exampleCn: `${pair.book} ${pair.test} · ${pair.part} · 第${pair.question}题原文证据`,
    synonyms: [],
    validatedSynonyms: [],
    recommendedSynonyms: [],
    paraphraseExamples: [
      {
        replacement: pair.questionExpression,
        sourceSentence: pair.evidenceSentence,
        paraphraseSentence: pair.questionContext,
        meaningCn: contextNote,
        relationType: "ai-coach-question-evidence",
        readingSection: section,
        isRecommended: false
      }
    ],
    synonymSections: { [pair.questionExpression]: section },
    synonymDetails: {
      [pair.questionExpression]: {
        pos: "",
        originalMeaning: "",
        contextualMeaning: contextNote
      }
    },
    collocations: [],
    phraseCollocations: [],
    ieltsUse: ["Reading", "538考点", "AI教练真题替换"],
    topics: ["538考点", "AI教练真题替换", pair.book],
    difficulty: "真题语境替换",
    category: "AI教练真题替换",
    sourceCategory: 0,
    sourceGroup: 0,
    sourceGroupIndex: 0,
    forms: [],
    wordFamily: [],
    readingSection: section,
    practiceKind: "aiCoachQuestionParaphrase",
    questionExpression: pair.questionExpression,
    sourceExpression: pair.sourceExpression,
    occurrenceCount: pair.sources.length,
    questionProbability: Number((pair.sources.length / questionCount).toFixed(8)),
    sourceFiles: [...new Set(pair.sources.map((source) => source.sourceFile))],
    sources: pair.sources.map((source) => ({
      book: source.book,
      test: source.test,
      testId: source.testId,
      part: source.part,
      partNumber: source.partNumber,
      question: source.question,
      questionId: source.questionId,
      questionType: source.questionType,
      questionPrompt: source.questionPrompt,
      questionContext: source.questionContext,
      evidenceSentence: source.evidenceSentence,
      sourceFile: source.sourceFile
    }))
  };
});

const audit = {
  version: 1,
  auditedAt: "2026-08-24",
  source: "AI教练新版 58套剑雅G类真题题干与原文证据",
  officialTestCount: testFiles.length,
  officialQuestionCount: questionCount,
  curatedCandidateCount: candidateCount,
  strictAcceptedOccurrenceCount: accepted.length,
  rejectedCount: candidateCount - accepted.length,
  rejectionCounts,
  identityOccurrenceExcludedCount: identity.length,
  usableContextOccurrenceCount: nonIdentity.length,
  usableContextUniquePairCount: uniquePairs.length,
  questionsWithUsablePairCount: new Set(nonIdentity.map((pair) => `${pair.testId}:${pair.questionId}`)).size,
  questionsWithUsablePairProbability: Number((new Set(nonIdentity.map((pair) => `${pair.testId}:${pair.questionId}`)).size / questionCount).toFixed(8)),
  internallyRepeatedUniquePairCount: repeatedGroups.length,
  internallyRepeatedOccurrenceCount: repeatedGroups.reduce((sum, pair) => sum + pair.sources.length, 0),
  internalDuplicateExcessCount: repeatedGroups.reduce((sum, pair) => sum + pair.sources.length - 1, 0),
  exactPairRepeatRate: Number((repeatedGroups.reduce((sum, pair) => sum + pair.sources.length, 0) / nonIdentity.length).toFixed(8)),
  ...existingAudit,
  alreadyAvailableIn538ReviewedCount: existingAudit.newExactDirectedOverlapWithReviewedCount,
  practiceEntryCount: cards.length,
  totalAvailableAcross538Count: cards.length + existingAudit.newExactDirectedOverlapWithReviewedCount,
  policy: "1258组均按真题语境关系学习；已在538审核替换中的1组不重复建卡，新入口只放1257组净新增。"
};

const output = { mode: process.argv.includes("--apply") ? "apply" : "dry-run", audit };

if (process.argv.includes("--apply")) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_PATH)) fs.copyFileSync(TARGET_PATH, BACKUP_PATH);
  const next = {
    ...lexicon,
    aiCoachQuestionParaphrases: audit,
    questionParaphrases: cards
  };
  fs.writeFileSync(TARGET_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  output.backupPath = BACKUP_PATH;
  output.targetPath = TARGET_PATH;
}

console.log(JSON.stringify(output, null, 2));
