#!/usr/bin/env node

/** Retire known malformed imports as reversible aliases of valid headwords. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const publicPath = path.join(root, "public", "data", "words.json");
const staticPath = path.join(root, ".static-export-cache", "words.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const aliasSpecs = Object.freeze({
  rais: {
    sourceWord: "rais",
    targetWord: "raise",
    meaning: "参见 raise（提高；举起；提出；抚养）",
    detail: "rais 是旧导入中被截断的错误拼写，标准词形为 raise。本记录只保留为可回退的历史别名，并会自动跳转到 raise，不再进入刷词队列。",
    example: "Raise your hand if you agree.",
    exampleCn: "如果你同意，请举手。"
  },
  nowaday: {
    sourceWord: "nowaday",
    targetWord: "nowadays",
    meaning: "参见 nowadays（如今；现在）",
    detail: "nowaday 是旧导入中缺少词尾 s 的非标准学习词形，现代标准副词为 nowadays。本记录只保留为可回退的历史别名，并会自动跳转到 nowadays，不再进入刷词队列。",
    example: "Nowadays, many people work from home.",
    exampleCn: "如今，许多人在家工作。"
  },
  explosife: {
    sourceWord: "explosife",
    targetWord: "explosive",
    meaning: "参见 explosive（爆炸的；易爆的；爆炸物）",
    detail: "explosife 是旧导入中把 explosive 末尾字母写错形成的非标准词头。该记录只保留为可回退的历史别名，并会跳转到 explosive，不再进入刷词队列。",
    example: "The factory was fined for storing explosive materials improperly.",
    exampleCn: "该工厂因不当储存易爆材料而被罚款。"
  },
  checkin: {
    sourceWord: "checkin",
    targetWord: "check-in",
    meaning: "参见 check-in（办理入住或登机手续；登记）",
    detail: "checkin 是旧导入中缺少连字符的重复学习词头，名词的规范写法为 check-in，动词写作 check in。本记录保留原 ID 作为可回退的参考别名，并跳转到 check-in，不再重复进入刷词队列。",
    example: "Online check-in saves time at the airport.",
    exampleCn: "在线办理登机手续可以节省在机场的时间。",
    relationType: "nonstandard duplicate spelling",
    referenceReason: "nonstandard-spelling-duplicate-of-valid-headword",
    qualityFlag: "nonstandard_duplicate_headword_retired",
    category: "参考别名 · 非规范重复词头"
  },
  maingate: {
    sourceWord: "maingate",
    targetWord: "gate",
    meaning: "参见 gate（大门；出入口）",
    detail: "maingate 是旧导入中把标准短语 main gate 错误粘连形成的词头。该记录保留原 ID 作为可回退的参考别名，并跳转到核心词 gate，不再作为独立单词进入刷词队列。",
    example: "The main gate of the castle is locked at night.",
    exampleCn: "城堡的主门夜间会上锁。",
    relationType: "concatenated phrase import",
    referenceReason: "concatenated-phrase-import-redirected-to-valid-headword",
    qualityFlag: "concatenated_phrase_headword_retired",
    category: "参考别名 · 粘连短语修复"
  },
  verylittle: {
    sourceWord: "verylittle",
    targetWord: "little",
    meaning: "参见 little（少量；几乎没有）",
    detail: "verylittle 是旧导入把标准短语 very little 错误粘连形成的词头。该记录保留原 ID 作为参考别名，并跳转到核心词 little，不再作为独立单词进入刷词队列。",
    example: "He has very little money left.",
    exampleCn: "他剩下的钱很少。",
    relationType: "concatenated phrase import",
    referenceReason: "concatenated-phrase-import-redirected-to-valid-headword",
    qualityFlag: "concatenated_phrase_headword_retired",
    category: "参考别名 · 粘连短语修复"
  },
  lateron: {
    sourceWord: "lateron",
    targetWord: "afterward",
    meaning: "参见 afterward（后来；随后）",
    detail: "lateron 是旧导入把标准短语 later on 错误粘连形成的词头。主词库没有把该短语作为独立词条收录，因此保留原 ID 为参考别名并跳转到同义核心词 afterward。",
    example: "He felt better later on.",
    exampleCn: "后来他感觉好多了。",
    relationType: "concatenated phrase import",
    referenceReason: "concatenated-phrase-import-redirected-to-equivalent-headword",
    qualityFlag: "concatenated_phrase_headword_retired",
    category: "参考别名 · 粘连短语修复"
  },
  parkcar: {
    sourceWord: "parkcar",
    targetWord: "park",
    meaning: "参见 park（停车）",
    detail: "parkcar 不是英语单词，而是旧导入把动词短语 park a car 或 park the car 粘连后产生的错误词头。该记录保留原 ID 为参考别名，并跳转到动词 park。",
    example: "She parked the car outside the station.",
    exampleCn: "她把车停在车站外面。",
    relationType: "concatenated phrase import",
    referenceReason: "invalid-concatenated-verb-phrase-redirected-to-valid-headword",
    qualityFlag: "invalid_concatenated_headword_retired",
    category: "参考别名 · 粘连短语修复"
  },
  leed: {
    sourceWord: "leed",
    targetWord: "lead",
    meaning: "参见 lead（带领；导致；铅）",
    detail: "leed 是旧资料中对 lead 的误拼或非标准拼写。本记录保留原 ID 作为可回退的参考别名，并跳转到规范词头 lead，不再进入任何刷词队列。",
    example: "The tour guide will lead us through the museum.",
    exampleCn: "导游将带领我们参观博物馆。",
    relationType: "spelling variant",
    referenceReason: "nonstandard-spelling-redirected-to-valid-headword",
    qualityFlag: "nonstandard_spelling_headword_retired",
    category: "参考别名 · 拼写修复"
  },
  lable: {
    sourceWord: "lable",
    targetWord: "label",
    meaning: "参见 label（标签；标注）",
    detail: "lable 是旧资料中对 label 的常见误拼。本记录保留原 ID 作为可回退的参考别名，并跳转到规范词头 label，不再进入任何刷词队列。",
    example: "Please read the label before using the product.",
    exampleCn: "使用产品前请阅读标签。",
    relationType: "spelling variant",
    referenceReason: "misspelling-redirected-to-valid-headword",
    qualityFlag: "misspelled_headword_retired",
    category: "参考别名 · 拼写修复"
  }
});
const aliasKey = process.argv.includes("--lable")
  ? "lable"
  : process.argv.includes("--leed")
  ? "leed"
  : process.argv.includes("--parkcar")
  ? "parkcar"
  : process.argv.includes("--lateron")
  ? "lateron"
  : process.argv.includes("--verylittle")
  ? "verylittle"
  : process.argv.includes("--maingate")
  ? "maingate"
  : process.argv.includes("--checkin")
  ? "checkin"
  : process.argv.includes("--explosife")
  ? "explosife"
  : process.argv.includes("--nowaday")
    ? "nowaday"
    : "rais";
const aliasSpec = aliasSpecs[aliasKey];
const version = `manual-${aliasKey}-reference-alias-v1-20260812`;
const transientCodes = new Set(["EBUSY", "EPERM", "EACCES", "UNKNOWN"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function retryFileLock(operation, label) {
  const delays = [25, 50, 100, 200, 400, 800];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      if (!transientCodes.has(error?.code) || attempt >= delays.length) {
        error.message = `${label}: ${error.message}`;
        throw error;
      }
      wait(delays[attempt]);
    }
  }
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporaryPath, content, "utf8");
    retryFileLock(() => fs.renameSync(temporaryPath, filePath), `Unable to replace ${path.relative(root, filePath)}`);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
}

function stateSnapshot(entry = {}) {
  return Object.fromEntries(USER_STATE_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(entry, field))
    .map((field) => [field, entry[field]]));
}

function main() {
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master lexicon files differ; repair stopped.");

  const baselineRaw = fs.readFileSync(baselinePath);
  const payload = JSON.parse(publicRaw.toString("utf8"));
  const sourceIndexes = payload.words.map((entry, index) => entry.word === aliasSpec.sourceWord ? index : -1).filter((index) => index >= 0);
  const targets = payload.words.filter((entry) => entry.word === aliasSpec.targetWord);
  if (sourceIndexes.length !== 1 || targets.length !== 1) {
    throw new Error(`Expected one source and one target, got ${sourceIndexes.length}/${targets.length}.`);
  }

  const repairedAt = new Date().toISOString();
  const sourceIndex = sourceIndexes[0];
  const source = payload.words[sourceIndex];
  const target = targets[0];
  const sourceState = JSON.stringify(stateSnapshot(source));
  const nextSource = {
    ...source,
    studyMode: "reference",
    entryType: "word-reference",
    isReferenceOnly: true,
    deprecatedHeadword: true,
    baseWord: target.word,
    baseWordId: target.id,
    redirectToWord: target.word,
    relationType: aliasSpec.relationType || "truncated import",
    canonicalWord: target.word,
    canonicalWordId: target.id,
    referenceReason: aliasSpec.referenceReason || "truncated-import-duplicate-of-valid-headword",
    phonetic: "",
    pos: "reference",
    meaning: aliasSpec.meaning,
    definition: aliasSpec.meaning,
    meaningDetailZh: aliasSpec.detail,
    meaningDetailSource: "manual-structural-reference-repair",
    example: aliasSpec.example,
    exampleCn: aliasSpec.exampleCn,
    exampleStatus: "editorial_reference_example",
    collocations: [],
    phraseCollocations: [],
    forms: [],
    wordFamily: [],
    answer: target.word,
    acceptedAnswers: [target.word],
    difficulty: "不进入学习",
    category: aliasSpec.category || "参考别名 · 截断导入",
    ieltsUse: [],
    topics: [aliasKey === "checkin" ? "非规范词头修复" : "截断词修复", "参考别名"],
    readingPriority: false,
    gtPlanStage: 4,
    aiGenerated: false,
    entryStatus: "canonical_reference_only",
    structuralRepair: { version, repairedAt, action: "retained-as-reference-alias" },
    qualityFlags: [...new Set([...(source.qualityFlags || []), aliasSpec.qualityFlag || "truncated_headword_retired", "canonical_reference_retained"])],
    updatedAt: repairedAt
  };
  if (JSON.stringify(stateSnapshot(nextSource)) !== sourceState) throw new Error("User state changed; repair stopped.");

  const nextWords = payload.words.map((entry, index) => index === sourceIndex ? nextSource : entry);
  if (nextWords.length !== payload.words.length || nextSource.id !== source.id || nextSource.wordId !== source.wordId) {
    throw new Error("Word count or stable identity changed; repair stopped.");
  }
  const nextPayload = {
    ...payload,
    words: nextWords,
    count: nextWords.length,
    savedAt: repairedAt,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords)
  };
  const content = `${JSON.stringify(nextPayload, null, 2)}\n`;
  const baseline = renderMasterLexiconBaseline({ count: nextPayload.count, version: nextPayload.version, fileHash: sha256(content) });
  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version,
    source: { word: source.word, id: source.id },
    target: { word: target.word, id: target.id },
    action: "retained-as-reference-alias",
    deletedEntries: 0,
    stableIdsChanged: 0,
    userStateFieldsChanged: 0,
    networkCalls: 0,
    paidAiCalls: 0
  };
  if (!shouldApply) return console.log(JSON.stringify(report, null, 2));

  const backupDirectory = path.join(root, "backups", `${aliasKey}-reference-alias`, repairedAt.replace(/[:.]/g, "-"));
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backups = [
    [publicPath, path.join(backupDirectory, "public__data__words.json")],
    [staticPath, path.join(backupDirectory, "static-export-cache__words.json")],
    [baselinePath, path.join(backupDirectory, "master-lexicon-baseline.mjs")]
  ];
  for (const [sourcePath, backupPath] of backups) fs.copyFileSync(sourcePath, backupPath);
  try {
    atomicWrite(publicPath, content);
    atomicWrite(staticPath, content);
    atomicWrite(baselinePath, baseline);
  } catch (error) {
    for (const [destination, backupPath] of backups) {
      retryFileLock(() => fs.copyFileSync(backupPath, destination), `Unable to restore ${path.relative(root, destination)}`);
    }
    throw error;
  }
  report.backupDirectory = path.relative(root, backupDirectory).replaceAll("\\", "/");
  console.log(JSON.stringify(report, null, 2));
}

main();
