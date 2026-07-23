import {
  isDetailedOtherMeaning,
  sanitizeAiWordCollocations
} from "./admin-ai-content-profile.mjs";
import { USER_STATE_FIELDS, wordIdentity } from "./word-cache-meta.mjs";
import { hasUsefulQualityText } from "./word-quality-status.mjs";

export const AI_REPLACE_EXISTING_FIELD = "aiReplaceExisting";

const FILL_ONLY_SCALAR_FIELDS = Object.freeze([
  "phonetic",
  "pos",
  "meaning",
  "meaningDetailZh",
  "definition",
  "example",
  "exampleCn",
  "difficulty",
  "category"
]);

const FILL_ONLY_ARRAY_FIELDS = Object.freeze([
  "forms",
  "wordFamily",
  "ieltsUse",
  "topics"
]);

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function stableWordId(entry = {}) {
  const value = entry?.id || entry?.wordId;
  return value ? wordIdentity({ id: value }) : "";
}

function normalizedHeadword(entry = {}) {
  return wordIdentity({ word: entry?.word });
}

function wordTargetError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function captureWordWriteTarget(entry = {}, inputId = "") {
  const stableId = stableWordId(entry);
  const wordKey = normalizedHeadword(entry);
  if (!wordKey) {
    throw wordTargetError("WORD_TARGET_INVALID", "AI写回目标缺少有效词头");
  }

  return Object.freeze({
    stableId,
    wordKey,
    requestedWord: String(entry.word || "").trim(),
    inputId: String(inputId || `word-target:${stableId || wordKey}`)
  });
}

export function resolveWordWriteTarget(words, target, { requireOriginalHeadword = true } = {}) {
  const list = Array.isArray(words) ? words : [];
  const matches = [];

  for (let index = 0; index < list.length; index += 1) {
    const entry = list[index];
    const matched = target?.stableId
      ? stableWordId(entry) === target.stableId
      : normalizedHeadword(entry) === target?.wordKey;
    if (matched) matches.push(index);
  }

  if (!matches.length) {
    throw wordTargetError(
      "WORD_TARGET_MISSING",
      `AI写回目标已不存在：${target?.requestedWord || target?.wordKey || "未知词条"}`
    );
  }
  if (matches.length > 1) {
    throw wordTargetError(
      "WORD_TARGET_CONFLICT",
      `AI写回目标身份冲突：${target?.requestedWord || target?.wordKey || "未知词条"}`
    );
  }

  const index = matches[0];
  if (
    requireOriginalHeadword &&
    target?.wordKey &&
    normalizedHeadword(list[index]) !== target.wordKey
  ) {
    throw wordTargetError(
      "WORD_TARGET_CHANGED",
      `AI请求期间目标词头已变化：${target.requestedWord || target.wordKey}`
    );
  }

  return { index, word: list[index] };
}

export function assertAiResponseMatchesTarget(
  target,
  response,
  { allowHeadwordChange = false } = {}
) {
  const responseInputId = String(response?.inputId || "");
  if (!responseInputId || responseInputId !== target?.inputId) {
    throw wordTargetError(
      "AI_INPUT_ID_MISMATCH",
      `AI响应inputId不匹配：期望 ${target?.inputId || "空"}，收到 ${responseInputId || "空"}`
    );
  }

  const responseWordKey = normalizedHeadword(response);
  if (!responseWordKey) {
    throw wordTargetError("AI_RESPONSE_WORD_INVALID", "AI响应缺少有效词头");
  }
  if (!allowHeadwordChange && responseWordKey !== target?.wordKey) {
    throw wordTargetError(
      "AI_RESPONSE_WORD_MISMATCH",
      `AI响应词头不匹配：期望 ${target?.requestedWord || target?.wordKey}，收到 ${response?.word || "空"}`
    );
  }
}

export function applyAiResultByIdentity(
  words,
  target,
  response,
  buildCandidate,
  options = {}
) {
  assertAiResponseMatchesTarget(target, response, options);
  const resolved = resolveWordWriteTarget(words, target, {
    requireOriginalHeadword: options.requireOriginalHeadword !== false
  });
  const candidate = typeof buildCandidate === "function"
    ? buildCandidate(resolved.word, resolved.index)
    : response;
  const next = [...words];
  next[resolved.index] = mergeAiWriteWithExisting(resolved.word, candidate);
  return { words: next, index: resolved.index, word: next[resolved.index] };
}

export function mergeAiWriteWithExisting(existingWord = {}, candidateWord = {}) {
  if (!candidateWord || typeof candidateWord !== "object") return candidateWord;
  if (!Object.prototype.hasOwnProperty.call(candidateWord, AI_REPLACE_EXISTING_FIELD)) {
    return sanitizeAiWordCollocations(candidateWord);
  }

  const replaceExisting = candidateWord[AI_REPLACE_EXISTING_FIELD] === true;
  const next = { ...existingWord, ...candidateWord };
  delete next[AI_REPLACE_EXISTING_FIELD];

  if (!replaceExisting && existingWord && typeof existingWord === "object") {
    if (hasUsefulQualityText(existingWord.word)) next.word = existingWord.word;

    for (const field of FILL_ONLY_SCALAR_FIELDS) {
      if (hasUsefulQualityText(existingWord[field])) next[field] = existingWord[field];
    }

    for (const field of FILL_ONLY_ARRAY_FIELDS) {
      if (hasItems(existingWord[field])) next[field] = existingWord[field];
    }

    if (
      hasItems(existingWord.otherMeanings) &&
      existingWord.otherMeanings.every(isDetailedOtherMeaning)
    ) {
      next.otherMeanings = existingWord.otherMeanings;
    }

    const cleanExisting = sanitizeAiWordCollocations(existingWord);
    if (hasItems(cleanExisting?.collocations)) next.collocations = cleanExisting.collocations;
    if (hasItems(cleanExisting?.phraseCollocations)) next.phraseCollocations = cleanExisting.phraseCollocations;
  }

  next.aiMergeMode = replaceExisting ? "replace-ai-content" : "fill-missing-ai-content";
  return sanitizeAiWordCollocations(next);
}

export function mergeAiSnapshotWithExisting(previousWords, candidateWords) {
  if (!Array.isArray(candidateWords)) return candidateWords;
  const previousList = Array.isArray(previousWords) ? previousWords : [];
  const previousByStableId = new Map();
  const previousByHeadword = new Map();

  function addIndex(map, key, index) {
    if (!key) return;
    const indexes = map.get(key) || [];
    indexes.push(index);
    map.set(key, indexes);
  }

  for (let index = 0; index < previousList.length; index += 1) {
    const entry = previousList[index];
    addIndex(previousByStableId, stableWordId(entry), index);
    addIndex(previousByHeadword, normalizedHeadword(entry), index);
  }

  function resolveIndexedTarget(target) {
    const indexes = target?.stableId
      ? previousByStableId.get(target.stableId)
      : previousByHeadword.get(target?.wordKey);

    if (!indexes?.length) {
      throw wordTargetError(
        "WORD_TARGET_MISSING",
        `AI写回目标已不存在：${target?.requestedWord || target?.wordKey || "未知词条"}`
      );
    }
    if (indexes.length > 1) {
      throw wordTargetError(
        "WORD_TARGET_CONFLICT",
        `AI写回目标身份冲突：${target?.requestedWord || target?.wordKey || "未知词条"}`
      );
    }
    return { index: indexes[0], word: previousList[indexes[0]] };
  }

  const usedPreviousIndexes = new Set();
  let changed = false;
  const next = candidateWords.map((candidateWord) => {
    const resolved = resolveIndexedTarget(captureWordWriteTarget(candidateWord));

    if (usedPreviousIndexes.has(resolved.index)) {
      throw wordTargetError(
        "WORD_TARGET_CONFLICT",
        `AI快照包含重复身份：${candidateWord?.word || "未知词条"}`
      );
    }
    usedPreviousIndexes.add(resolved.index);

    if (candidateWord === resolved.word) return resolved.word;

    const merged = mergeAiWriteWithExisting(resolved.word, candidateWord);
    for (const field of USER_STATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(resolved.word, field)) {
        merged[field] = resolved.word[field];
      } else {
        delete merged[field];
      }
    }
    changed = true;
    return merged;
  });
  return changed ? next : candidateWords;
}
