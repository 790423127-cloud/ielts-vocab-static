import { normalizeSpellingAnswer } from "./word-id.mjs";

function tokenize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function joinTokens(value) {
  return tokenize(value).join("");
}

function editDistance(left = "", right = "") {
  const a = normalizeSpellingAnswer(left);
  const b = normalizeSpellingAnswer(right);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function selectClosestExpected(answer, candidates = []) {
  const unique = [...new Set(candidates.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!unique.length) return "";

  return unique.reduce((closest, candidate) => (
    editDistance(answer, candidate) < editDistance(answer, closest) ? candidate : closest
  ), unique[0]);
}

function charDiff(expected, actual) {
  const exp = normalizeSpellingAnswer(expected);
  const act = normalizeSpellingAnswer(actual);
  const missing = [];
  const extra = [];
  const expCounts = new Map();
  const actCounts = new Map();

  for (const ch of exp) {
    expCounts.set(ch, (expCounts.get(ch) || 0) + 1);
  }
  for (const ch of act) {
    actCounts.set(ch, (actCounts.get(ch) || 0) + 1);
  }

  for (const [ch, count] of expCounts) {
    const delta = count - (actCounts.get(ch) || 0);
    if (delta > 0) {
      for (let i = 0; i < delta; i += 1) missing.push(ch);
    }
  }

  for (const [ch, count] of actCounts) {
    const delta = count - (expCounts.get(ch) || 0);
    if (delta > 0) {
      for (let i = 0; i < delta; i += 1) extra.push(ch);
    }
  }

  return { missing, extra };
}

function hasTransposition(expected, actual) {
  const exp = normalizeSpellingAnswer(expected);
  const act = normalizeSpellingAnswer(actual);
  if (exp.length !== act.length || exp === act) return false;

  let mismatches = 0;
  let firstIndex = -1;

  for (let i = 0; i < exp.length; i += 1) {
    if (exp[i] !== act[i]) {
      mismatches += 1;
      if (firstIndex < 0) firstIndex = i;
    }
  }

  if (mismatches !== 2 || firstIndex < 0) return false;
  const secondIndex = firstIndex + 1;
  return exp[firstIndex] === act[secondIndex] && exp[secondIndex] === act[firstIndex];
}

function hasGeneralLetterOrderIssue(expected, actual) {
  const exp = normalizeSpellingAnswer(expected);
  const act = normalizeSpellingAnswer(actual);
  if (!exp || !act || exp === act || exp.length !== act.length || /\s/.test(exp + act)) return false;
  return [...exp].sort().join("") === [...act].sort().join("");
}

function hasSpaceSplitIssue(expected, actual) {
  const expectedWords = tokenize(expected);
  const actualWords = tokenize(actual);
  if (expectedWords.length === actualWords.length) return false;

  const expectedJoined = joinTokens(expected);
  const actualJoined = joinTokens(actual);
  const expectedNorm = normalizeSpellingAnswer(expected);
  const actualNorm = normalizeSpellingAnswer(actual);

  if (!expectedJoined || !actualJoined || expectedJoined !== actualJoined) return false;
  return expectedNorm !== actualNorm;
}

function hasPrefixSuffixConfusion(expected, actual) {
  const exp = normalizeSpellingAnswer(expected);
  const act = normalizeSpellingAnswer(actual);
  if (!exp || !act || exp === act) return false;

  const longer = exp.length >= act.length ? exp : act;
  const shorter = exp.length < act.length ? exp : act;
  const delta = longer.length - shorter.length;
  if (delta < 1 || delta > 2) return false;
  if (longer.length > 4) return false;
  if (!longer.startsWith(shorter)) return false;
  if (delta === 1 && (longer === `${shorter}s` || longer === `${shorter}e`)) return false;

  return true;
}

function wordOrderIssues(expected, actual) {
  const expectedWords = tokenize(expected);
  const actualWords = tokenize(actual);
  if (expectedWords.length <= 1 || expectedWords.length !== actualWords.length) {
    return [];
  }

  const issues = [];
  for (let i = 0; i < expectedWords.length; i += 1) {
    if (expectedWords[i] !== actualWords[i]) {
      issues.push({
        position: i + 1,
        expected: expectedWords[i],
        actual: actualWords[i]
      });
    }
  }
  return issues;
}

export function diagnoseSpellingError(answer = "", expectedAnswer = "", acceptedAnswers = []) {
  const submittedAnswer = String(answer || "").trim();
  const normalizedAnswer = normalizeSpellingAnswer(answer);
  const candidates = [expectedAnswer, ...acceptedAnswers].filter(Boolean);
  const primaryExpected = selectClosestExpected(answer, candidates);
  const isCorrect = candidates.some(
    (candidate) => normalizeSpellingAnswer(candidate) === normalizedAnswer
  );

  if (!normalizedAnswer) {
    return {
      isCorrect: false,
      missingLetters: [],
      extraLetters: [],
      orderError: false,
      transposition: false,
      wordOrderIssues: [],
      submittedAnswer,
      expectedAnswer: primaryExpected,
      summary: "未输入答案"
    };
  }

  if (isCorrect) {
    return {
      isCorrect: true,
      missingLetters: [],
      extraLetters: [],
      orderError: false,
      transposition: false,
      wordOrderIssues: [],
      submittedAnswer,
      expectedAnswer: primaryExpected,
      summary: "拼写正确"
    };
  }

  const spaceSplitIssue = hasSpaceSplitIssue(primaryExpected, answer);
  const prefixSuffixConfusion = hasPrefixSuffixConfusion(primaryExpected, answer);
  const { missing, extra } = charDiff(primaryExpected, answer);
  const transposition = hasTransposition(primaryExpected, answer);
  const generalLetterOrderIssue = !transposition && hasGeneralLetterOrderIssue(primaryExpected, answer);
  const orderIssues = wordOrderIssues(primaryExpected, answer);
  const orderError = transposition || generalLetterOrderIssue || orderIssues.length > 0;
  const parts = [];

  if (spaceSplitIssue) {
    parts.push(tokenize(answer).length > tokenize(primaryExpected).length ? "不应拆开输入" : "缺少连写");
  } else if (prefixSuffixConfusion) {
    const expectedNorm = normalizeSpellingAnswer(primaryExpected);
    const actualNorm = normalizeSpellingAnswer(answer);
    parts.push(
      expectedNorm.length > actualNorm.length ? "少写了字母或音节" : "多写了字母或音节"
    );
  } else {
    const missingLetters = missing.filter((character) => /[a-z]/i.test(character));
    const missingSymbols = missing.filter((character) => !/[a-z]/i.test(character));
    const extraLetters = extra.filter((character) => /[a-z]/i.test(character));
    const extraSymbols = extra.filter((character) => !/[a-z]/i.test(character));
    if (missingLetters.length) parts.push(`缺字母：${missingLetters.join("")}`);
    if (missingSymbols.length) parts.push(`缺少符号：${missingSymbols.join("")}`);
    if (extraLetters.length) parts.push(`多字母：${extraLetters.join("")}`);
    if (extraSymbols.length) parts.push(`多余符号：${extraSymbols.join("")}`);
  }

  if (transposition) parts.push("字母顺序错误（相邻换位）");
  if (generalLetterOrderIssue) parts.push("字母顺序错误");
  if (orderIssues.length) parts.push(`词序错误：第 ${orderIssues.map((item) => item.position).join("、")} 处`);

  return {
    isCorrect: false,
    missingLetters: missing,
    extraLetters: extra,
    orderError,
    transposition,
    generalLetterOrderIssue,
    wordOrderIssues: orderIssues,
    submittedAnswer,
    expectedAnswer: primaryExpected,
    summary: parts.length ? parts.join("；") : "拼写不匹配"
  };
}

export function formatSpellingErrorDiagnosis(diagnosis = {}) {
  if (!diagnosis || diagnosis.isCorrect) return "";
  return diagnosis.summary || "拼写错误";
}
