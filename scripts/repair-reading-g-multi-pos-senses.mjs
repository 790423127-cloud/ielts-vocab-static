import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeReadingGItem } from "../app/lib/reading-g-vocab/load-reading-g.mjs";
import { getReadingGContentIssues } from "../app/lib/reading-g-vocab/content-completeness.mjs";
import { getStudyEntryDisplay } from "../app/lib/vocab/study-entry-display.mjs";
import { normalizePartOfSpeechTokens } from "../app/lib/vocab/multi-pos-sense-coverage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const BACKUP_ROOT = path.join(ROOT, "backups");
const VERSION = "reading-g-multi-pos-sense-repair-v2-20260811";
const SOURCE = "reading-g-multi-pos-sense-repair-v2";

const REPAIRS = new Map([
  ["hand", {
    primaryPos: "verb",
    primaryMeaningZh: "递给；交给",
    definition: "to give or pass something to someone directly",
    meaningDetailZh: "在当前例句中作动词，表示把某物直接递给某人，常用结构为 hand somebody something 或 hand something to somebody。",
    example: "Please hand me the book.",
    exampleCn: "请把书递给我。",
    otherSenses: [
      { pos: "noun", meaningZh: "手", definitionEn: "the part of the body at the end of the arm, including the fingers and thumb" }
    ]
  }],
  ["migrant", {
    primaryPos: "adjective",
    primaryMeaningZh: "移民的；迁居的",
    definition: "relating to people who move to another place or region to live or work",
    meaningDetailZh: "在当前例句中作形容词，表示从一地迁往另一地生活或工作的，常修饰 workers、population 等表示人群的名词。",
    example: "Migrant workers often face challenges.",
    exampleCn: "流动务工人员经常面临各种困难。",
    otherSenses: [
      { pos: "noun", meaningZh: "移民；迁居者", definitionEn: "a person who moves from one place or country to another in order to live or work" }
    ]
  }],
  ["hope", {
    primaryPos: "verb",
    primaryMeaningZh: "希望；期望",
    definition: "to want something to happen or to be true",
    meaningDetailZh: "在当前例句中作动词，表示希望某事发生或成为事实，常用结构为 hope to do 或 hope that...。",
    example: "I hope to pass the IELTS exam.",
    exampleCn: "我希望通过雅思考试。",
    otherSenses: [
      { pos: "noun", meaningZh: "希望；期望", definitionEn: "a feeling of expectation and desire for a particular thing to happen" }
    ]
  }],
  ["lace", {
    primaryPos: "noun",
    primaryMeaningZh: "蕾丝；花边织物",
    definition: "a delicate decorative fabric made from threads in an open pattern",
    meaningDetailZh: "在当前例句中作名词，表示由线织成的镂空装饰织物，常用于衣服、窗帘或饰边。",
    example: "She wore a dress with lace trim.",
    exampleCn: "她穿了一件带蕾丝花边的裙子。",
    otherSenses: [
      { pos: "noun", meaningZh: "鞋带", definitionEn: "a cord used for fastening a shoe" },
      { pos: "verb", meaningZh: "系紧；用带子系", definitionEn: "to fasten or tie something with a lace or cord" }
    ]
  }],
  ["more", {
    primaryPos: "adverb",
    primaryMeaningZh: "更多地；更加",
    definition: "to a greater degree or extent",
    meaningDetailZh: "在当前例句中作副词，表示在程度或数量上更多；learn more about... 表示“更多地了解……”。",
    example: "She wants to learn more about science.",
    exampleCn: "她想更多地了解科学。",
    otherSenses: [
      { pos: "adjective", meaningZh: "更多的", definitionEn: "a greater number or amount of people or things" },
      { pos: "pronoun", meaningZh: "更多的人或事物", definitionEn: "an additional or greater amount or number" }
    ]
  }]
]);

const STRUCTURE_REPAIRS = new Map([
  ["inside", { primaryPos: "preposition", declaredPos: "preposition / adverb / noun", meaning: "在……里面", definition: "in or into the inner part of something", detail: "在当前例句中作介词，后接 the drawer，表示钥匙位于抽屉里面。" }],
  ["million", { primaryPos: "numeral", declaredPos: "numeral / noun", meaning: "一百万；百万", definition: "the number 1,000,000", detail: "在当前例句中作数词，two million people 表示“两百万人”；million 作名词时还可泛指大量。" }],
  ["thousand", { primaryPos: "noun", declaredPos: "numeral / noun", meaning: "数千；成千上万", definition: "a number in the thousands or a very large number", detail: "在当前例句中以复数名词 thousands 出现在 thousands of dollars 中，表示“数千美元”；表示确切数字时也可作数词。", additionalSenses: [{ pos: "numeral", meaningZh: "一千", definitionEn: "the number 1,000" }] }],
  ["either", { primaryPos: "determiner", declaredPos: "determiner / pronoun", meaning: "（两者中的）任一；任一的", definition: "one or the other of two people or things", detail: "在当前例句中作限定词，either the blue or the red dress 表示蓝色或红色连衣裙中的任意一件。", additionalSenses: [{ pos: "pronoun", meaningZh: "两者中的任意一个", definitionEn: "either one of two people or things" }] }],
  ["neither", { primaryPos: "pronoun", declaredPos: "determiner / pronoun", meaning: "两者都不", definition: "not either of two people or things", detail: "在当前例句中作代词，Neither of the two restaurants 表示“两家餐厅都不”。", additionalSenses: [{ pos: "determiner", meaningZh: "两者都不的", definitionEn: "not one or the other of two people or things" }] }],
  ["since", { primaryPos: "preposition", declaredPos: "preposition / conjunction / adverb", meaning: "自从；自……以来", definition: "from a time in the past until a later time or now", detail: "在当前例句中作介词，后接时间点 2010，表示从 2010 年开始一直持续到现在。" }],
  ["though", { primaryPos: "conjunction", declaredPos: "conjunction / adverb", meaning: "虽然；尽管", definition: "despite the fact that", detail: "在当前例句中作连词，引出让步信息“虽然很累”，再说明她仍继续工作。" }],
  ["while", { primaryPos: "conjunction", declaredPos: "conjunction / noun", meaning: "虽然；尽管", definition: "although or despite the fact that", detail: "在当前例句中作连词，引出让步和转折：虽然同意，但仍有一些担忧。" }],
  ["about", { primaryPos: "preposition", declaredPos: "preposition / adverb", meaning: "关于；涉及", definition: "on the subject of or connected with", detail: "在当前例句中作介词，be about animals 表示“内容是关于动物的”；这里不是动词。" }],
  ["enough", { primaryPos: "adverb", declaredPos: "adverb / adjective", meaning: "足够地；充分地", definition: "to the necessary degree or extent", detail: "在当前例句中作副词，放在 fast 后修饰程度，fast enough 表示“足够快”；这里不是动词。" }],
  ["several", { primaryPos: "determiner", declaredPos: "determiner / pronoun / adjective", meaning: "几个；若干", definition: "more than two but not many", detail: "在当前例句中作限定词，直接修饰复数名词 books，表示数量不多的几本书。" }],
  ["throughout", { primaryPos: "preposition", declaredPos: "preposition / adverb", meaning: "遍及；在……各处", definition: "in every part of a place", detail: "在当前例句中作介词，后接 the country，表示旅行遍及全国；这里不是动词。" }],
  ["alone", { primaryPos: "adverb", declaredPos: "adverb / adjective", meaning: "独自；单独", definition: "without other people", detail: "在当前例句中作副词，修饰 walked，表示他没有他人陪伴地散步；这里不是动词。" }],
  ["around", { primaryPos: "preposition", declaredPos: "preposition / adverb", meaning: "在……周围；环绕着", definition: "on every side of something", detail: "在当前例句中作介词，后接 the tree，表示孩子们围着树跑；这里不是动词。" }],
  ["as", { primaryPos: "adverb", declaredPos: "adverb / preposition / conjunction", meaning: "像……一样；如同", definition: "used in comparisons to refer to the same degree or way", detail: "在当前例句的 as fast as 结构中作副词，用于同级比较，表示“跑得像猎豹一样快”；这里不是动词。" }],
  ["even", { primaryPos: "adverb", declaredPos: "adverb / adjective", meaning: "甚至；连……都", definition: "used to emphasize something surprising or extreme", detail: "在当前例句中作副词，用来强调连说再见这件事都没有发生；本词条原来的 verb 声明没有对应义项。" }],
  ["first", { primaryPos: "adjective", declaredPos: "adjective / adverb / noun", meaning: "第一的；最先的", definition: "coming before all others in order, time, or importance", detail: "在当前例句中作形容词，直接修饰 prize，表示“第一名的奖项”；原来的 verb 声明没有对应义项。" }],
  ["higher", { primaryPos: "adjective", declaredPos: "adjective / adverb", meaning: "更高的；较高的", definition: "at a greater level, amount, or position", detail: "在当前例句中作形容词，修饰 score，表示分数更高；higher 是 high 的比较级，这里不是动词。" }],
  ["whichever", { primaryPos: "determiner", declaredPos: "determiner / pronoun", meaning: "无论哪个；任何一个……都", definition: "any one of the possible choices, with no difference which", detail: "在当前例句中作限定词，直接修饰 color，表示可以选择任意一种最喜欢的颜色。", additionalSenses: [{ pos: "pronoun", meaningZh: "无论哪一个；任何一个", definitionEn: "any one from a set of possible choices" }] }],
  ["on-site", { primaryPos: "adjective", declaredPos: "adjective / adverb", meaning: "现场的；位于现场的", definition: "located or taking place at a particular site", detail: "在当前例句中作形容词，直接修饰 parking，表示酒店现场提供的停车设施；作副词时表示在现场进行。", additionalSenses: [{ pos: "adverb", meaningZh: "在现场；在工地", definitionEn: "at the place where an activity or job is happening" }] }],
  ["hose", { primaryPos: "noun", declaredPos: "noun / verb", meaning: "软管；水管", definition: "a long flexible tube used for carrying water or another liquid", detail: "在当前例句中作名词，指给花园浇水使用的软管；作动词时表示用软管冲洗或浇水。" }],
  ["strand", { primaryPos: "noun", declaredPos: "noun / verb", meaning: "一股；一缕；一串", definition: "a single thin length of something such as hair, thread, or wire", detail: "在当前例句中作名词，a strand of hair 表示“一缕头发”；作动词时表示使搁浅或使陷入困境。" }]
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function atomicWrite(filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function senseId(entry, pos, index) {
  return `${entry.id}_${pos}_${String(index + 1).padStart(2, "0")}`
    .replace(/[^a-zA-Z0-9_]+/g, "_");
}

function buildSenses(entry, repair) {
  const primary = {
    senseId: senseId(entry, repair.primaryPos, 0),
    pos: repair.primaryPos,
    meaningZh: repair.primaryMeaningZh,
    definition: repair.definition,
    example: repair.example,
    exampleZh: repair.exampleCn,
    isPrimary: true,
    readingCommon: true,
    sourceFiles: [SOURCE]
  };
  return [
    primary,
    ...repair.otherSenses.map((sense, index) => ({
      senseId: senseId(entry, sense.pos, index + 1),
      pos: sense.pos,
      meaningZh: sense.meaningZh,
      definition: sense.definitionEn,
      example: "",
      exampleZh: "",
      sourceFiles: [SOURCE]
    }))
  ];
}

function applyStructureRepair(entry, repair, repairedAt) {
  const primaryPosToken = normalizePartOfSpeechTokens(repair.primaryPos)[0];
  let primaryFound = false;
  const cleanedSenses = (Array.isArray(entry.senses) ? entry.senses : [])
    .filter((sense) => !(
      normalizePartOfSpeechTokens(sense?.pos).length === 0
      && /待补|placeholder/i.test(String(sense?.meaningZh || sense?.meaning || ""))
    ))
    .map((sense) => {
      const tokens = normalizePartOfSpeechTokens(sense?.pos);
      const isPrimary = !primaryFound && tokens.length === 1 && tokens[0] === primaryPosToken;
      if (isPrimary) primaryFound = true;
      const { isPrimary: _oldPrimary, readingCommon: _oldReadingCommon, ...rest } = sense;
      return isPrimary
        ? {
          ...rest,
          pos: repair.primaryPos,
          meaningZh: repair.meaning,
          definition: repair.definition,
          example: entry.example,
          exampleZh: entry.exampleCn || entry.exampleZh || "",
          isPrimary: true,
          readingCommon: true,
          sourceFiles: unique([...(sense?.sourceFiles || []), SOURCE])
        }
        : rest;
    });

  if (!primaryFound) {
    cleanedSenses.unshift({
      senseId: senseId(entry, repair.primaryPos, 0),
      pos: repair.primaryPos,
      meaningZh: repair.meaning,
      definition: repair.definition,
      example: entry.example,
      exampleZh: entry.exampleCn || entry.exampleZh || "",
      isPrimary: true,
      readingCommon: true,
      sourceFiles: [SOURCE]
    });
  }

  for (const [index, sense] of (repair.additionalSenses || []).entries()) {
    const targetTokens = normalizePartOfSpeechTokens(sense.pos);
    const alreadyPresent = cleanedSenses.some((candidate) => {
      const tokens = normalizePartOfSpeechTokens(candidate?.pos);
      return tokens.length === 1 && targetTokens.length === 1 && tokens[0] === targetTokens[0];
    });
    if (!alreadyPresent) {
      cleanedSenses.push({
        senseId: senseId(entry, sense.pos, cleanedSenses.length + index),
        pos: sense.pos,
        meaningZh: sense.meaningZh,
        definition: sense.definitionEn,
        example: "",
        exampleZh: "",
        sourceFiles: [SOURCE]
      });
    }
  }

  const { aiCompletionLastFailure: _completionFailure, ...withoutFailure } = entry;
  return {
    ...withoutFailure,
    primaryPos: repair.primaryPos,
    pos: repair.declaredPos,
    primaryMeaningZh: repair.meaning,
    meaning: repair.meaning,
    meaningZh: repair.meaning,
    definition: repair.definition,
    meaningDetailZh: repair.detail,
    senses: cleanedSenses,
    sourceFiles: unique([...(entry.sourceFiles || []), SOURCE]),
    qualityFlags: unique([...(entry.qualityFlags || []), "reading_g_multi_pos_structure_repaired"]),
    updatedAt: repairedAt
  };
}

function applyRepair(entry, repair, repairedAt) {
  const { aiCompletionLastFailure: _completionFailure, ...withoutFailure } = entry;
  return {
    ...withoutFailure,
    primaryPos: repair.primaryPos,
    pos: repair.primaryPos,
    primaryMeaningZh: repair.primaryMeaningZh,
    meaning: repair.primaryMeaningZh,
    meaningZh: repair.primaryMeaningZh,
    definition: repair.definition,
    meaningDetailZh: repair.meaningDetailZh,
    example: repair.example,
    exampleCn: repair.exampleCn,
    exampleZh: repair.exampleCn,
    senses: buildSenses(entry, repair),
    otherMeanings: repair.otherSenses.map((sense) => ({ ...sense })),
    sourceFiles: unique([...(entry.sourceFiles || []), SOURCE]),
    qualityFlags: unique([...(entry.qualityFlags || []), "reading_g_multi_pos_senses_repaired"]),
    updatedAt: repairedAt
  };
}

function buildRepair(payload, repairedAt) {
  const next = structuredClone(payload);
  const repaired = [];
  for (const [word, repair] of STRUCTURE_REPAIRS) {
    const index = next.items.findIndex((entry) => String(entry.word || "").toLowerCase() === word);
    if (index < 0) throw new Error(`找不到待修词：${word}`);
    const original = next.items[index];
    const updated = applyStructureRepair(original, repair, repairedAt);
    const normalized = normalizeReadingGItem(updated, index);
    const issues = getReadingGContentIssues(normalized);
    if (issues.length) throw new Error(`${word} 修复后仍有问题：${issues.join(", ")}`);
    const display = getStudyEntryDisplay(updated);
    if (normalizePartOfSpeechTokens(display.pos)[0] !== normalizePartOfSpeechTokens(repair.primaryPos)[0]) {
      throw new Error(`${word} 修复后显示层未使用当前例句的主词性`);
    }
    next.items[index] = updated;
    repaired.push({
      id: original.id,
      word,
      repairType: "structure",
      stableIdPreserved: updated.id === original.id,
      primaryPos: updated.primaryPos,
      primaryMeaningZh: updated.primaryMeaningZh,
      supplementalSenseCount: display.supplementalSenses.length
    });
  }

  for (const [word, repair] of REPAIRS) {
    const index = next.items.findIndex((entry) => String(entry.word || "").toLowerCase() === word);
    if (index < 0) throw new Error(`找不到待修词：${word}`);
    const original = next.items[index];
    const updated = applyRepair(original, repair, repairedAt);
    const normalized = normalizeReadingGItem(updated, index);
    const issues = getReadingGContentIssues(normalized);
    if (issues.length) throw new Error(`${word} 修复后仍有问题：${issues.join(", ")}`);
    const display = getStudyEntryDisplay(updated);
    if (display.supplementalSenses.length !== repair.otherSenses.length) {
      throw new Error(`${word} 的附加词性义项在显示层仍被错误去重`);
    }
    next.items[index] = updated;
    repaired.push({
      id: original.id,
      word,
      repairType: "full",
      stableIdPreserved: updated.id === original.id,
      primaryPos: updated.primaryPos,
      primaryMeaningZh: updated.primaryMeaningZh,
      supplementalSenseCount: display.supplementalSenses.length
    });
  }

  next.updatedAt = repairedAt;
  next.multiSenseCount = next.items.filter((entry) => (entry.senses || []).length > 1).length;
  next.multiPosSenseRepair = {
    version: VERSION,
    repairedAt,
    count: repaired.length,
    words: repaired.map((entry) => entry.word),
    policy: "contextual primary sense first; additional common parts of speech retained separately"
  };
  if (next.questionBankExpansion) {
    next.questionBankExpansion = {
      ...next.questionBankExpansion,
      contentIncompleteCount: next.items.filter((entry, index) => (
        getReadingGContentIssues(normalizeReadingGItem(entry, index)).length > 0
      )).length
    };
  }
  return { next, repaired };
}

function main() {
  const write = process.argv.includes("--write");
  const payload = readJson(VOCAB_PATH);
  const repairedAt = new Date().toISOString();
  const { next, repaired } = buildRepair(payload, repairedAt);
  const remaining = next.items.flatMap((entry, index) => {
    const issues = getReadingGContentIssues(normalizeReadingGItem(entry, index));
    return issues.length ? [{ word: entry.word, issues }] : [];
  });
  const result = {
    mode: write ? "write" : "dry-run",
    version: VERSION,
    repaired,
    remainingContentIssues: remaining.length,
    remaining,
    stableIdsPreserved: repaired.every((entry) => entry.stableIdPreserved)
  };

  if (!write) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const stamp = repairedAt.replace(/[:.]/g, "-");
  const backupDir = path.join(BACKUP_ROOT, `reading-g-multi-pos-sense-repair-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(VOCAB_PATH, path.join(backupDir, "reading-g-vocab.json.before"));
  try {
    atomicWrite(VOCAB_PATH, next);
  } catch (error) {
    fs.copyFileSync(path.join(backupDir, "reading-g-vocab.json.before"), VOCAB_PATH);
    throw error;
  }
  console.log(JSON.stringify({ ...result, backupDir }, null, 2));
}

main();
