/**
 * Local change log helpers (extracted from app/page.jsx I3.2).
 */
import { normalizeWord } from "./page-word-helpers.mjs";

export function shortFieldValue(value) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).replace(/\s+/g, " ").trim().slice(0, 120);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          return item.phrase || item.word || item.meaning || item.chinese || item.note || JSON.stringify(item);
        }
        return String(item || "");
      })
      .filter(Boolean)
      .join("；")
      .slice(0, 120);
  }

  if (typeof value === "object") return JSON.stringify(value).slice(0, 120);

  return String(value || "").slice(0, 120);
}

export function pickWordSnapshot(word) {
  if (!word) return null;

  return {
    word: word.word || "",
    phonetic: word.phonetic || "",
    pos: word.pos || "",
    meaning: word.meaning || word.definition || "",
    example: word.example || "",
    exampleCn: word.exampleCn || "",
    collocations: word.collocations || [],
    phraseCollocations: word.phraseCollocations || [],
    forms: word.forms || [],
    wordFamily: word.wordFamily || [],
    ieltsUse: word.ieltsUse || [],
    topics: word.topics || [],
    difficulty: word.difficulty || "",
    status: word.status || "",
    favorite: !!word.favorite
  };
}

export function summarizeWordChanges(beforeWord, afterWord) {
  const fields = [
    ["word", "单词"],
    ["phonetic", "音标"],
    ["pos", "词性"],
    ["meaning", "释义"],
    ["example", "例句"],
    ["exampleCn", "例句中文"],
    ["collocations", "搭配"],
    ["phraseCollocations", "短语搭配"],
    ["forms", "词形"],
    ["wordFamily", "词族"],
    ["ieltsUse", "IELTS用途"],
    ["topics", "主题"],
    ["difficulty", "难度"],
    ["status", "状态"],
    ["favorite", "收藏"]
  ];

  const before = pickWordSnapshot(beforeWord);
  const after = pickWordSnapshot(afterWord);
  const diffs = [];

  fields.forEach(([field, label]) => {
    const b = shortFieldValue(before?.[field]);
    const a = shortFieldValue(after?.[field]);

    if (b !== a) {
      diffs.push({
        field,
        label,
        before: b || "空",
        after: a || "空"
      });
    }
  });

  return diffs;
}

export function buildLocalChangeLog(actionName, beforeWords, afterWords) {
  const beforeList = Array.isArray(beforeWords) ? beforeWords : [];
  const afterList = Array.isArray(afterWords) ? afterWords : [];
  const beforeMap = new Map();

  beforeList.forEach((word, index) => {
    const key = normalizeWord(word.word);
    if (!key) return;
    if (!beforeMap.has(key)) beforeMap.set(key, []);
    beforeMap.get(key).push({ word, index });
  });

  const matchedBefore = new Set();
  const changes = [];

  afterList.forEach((afterWord, afterIndex) => {
    const key = normalizeWord(afterWord.word);
    const beforeCandidates = key ? beforeMap.get(key) || [] : [];

    // 优先按位置匹配。这样 frustrat → frustrate 这种改名会显示为“修改”，不会显示成“新增+删除”。
    let match = null;

    if (beforeList[afterIndex] && !matchedBefore.has(afterIndex)) {
      match = { word: beforeList[afterIndex], index: afterIndex };
    }

    if (!match) {
      match = beforeCandidates.find((item) => !matchedBefore.has(item.index));
    }

    if (!match) {
      changes.push({
        type: "新增",
        word: afterWord.word || "未知",
        beforeIndex: -1,
        afterIndex,
        diffs: [{ label: "新增词", before: "无", after: afterWord.word || "未知" }]
      });
      return;
    }

    matchedBefore.add(match.index);
    const diffs = summarizeWordChanges(match.word, afterWord);

    if (diffs.length) {
      changes.push({
        type: "修改",
        word: afterWord.word || match.word.word || "未知",
        beforeIndex: match.index,
        afterIndex,
        diffs
      });
    }
  });

  beforeList.forEach((beforeWord, beforeIndex) => {
    if (matchedBefore.has(beforeIndex)) return;

    changes.push({
      type: "删除",
      word: beforeWord.word || "未知",
      beforeIndex,
      afterIndex: -1,
      diffs: [{ label: "删除词", before: beforeWord.word || "未知", after: "无" }]
    });
  });

  return {
    actionName,
    createdAt: Date.now(),
    beforeWords: beforeList,
    afterWords: afterList,
    beforeCount: beforeList.length,
    afterCount: afterList.length,
    changedCount: changes.length,
    changes: changes.slice(0, 300)
  };
}

