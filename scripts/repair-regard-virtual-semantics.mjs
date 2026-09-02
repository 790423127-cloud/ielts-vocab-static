#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const repairedAt = new Date().toISOString();
const version = "manual-regard-virtual-semantic-repair-v1-20260812";

const paths = Object.freeze({
  publicMaster: path.join(root, "public", "data", "words.json"),
  staticMaster: path.join(root, ".static-export-cache", "words.json"),
  baseline: path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs"),
  readingG: path.join(root, "public", "data", "reading-g-vocab.json"),
  readingGAi: path.join(root, "public", "data", "reading-g-ai-completions.json"),
  readingGSynonyms: path.join(root, "public", "data", "reading-g-synonym-completions.json"),
  personalReading: path.join(root, "public", "data", "personal-reading-words.json"),
  meaning6000: path.join(root, "public", "data", "meaning-6000.json")
});

const regard = Object.freeze({
  pos: "verb / noun",
  primaryPos: "verb",
  meaning: "看待；认为；尊重；关注；方面；问候",
  primaryMeaning: "看待；认为",
  detail: "作动词时常用 regard A as B，表示“把 A 看作或认为是 B”；作名词时可指尊重、关注或某个方面，如 with regard to 表示“关于”。复数 regards 才常用于书信或口语中的“问候、致意”。",
  example: "Many people regard education as a lifelong process.",
  exampleCn: "许多人把教育看作一个终身过程。",
  otherMeanings: [
    { pos: "noun", meaningZh: "尊重；关注", definitionEn: "respect or attention shown towards someone or something", example: "She has little regard for other people's feelings.", exampleCn: "她很少顾及别人的感受。" },
    { pos: "noun", meaningZh: "方面", definitionEn: "a particular aspect or point", example: "The two plans are similar in this regard.", exampleCn: "这两个方案在这方面很相似。" },
    { pos: "plural noun", meaningZh: "问候；致意", definitionEn: "good wishes or greetings, usually used in the plural", example: "Please give my regards to your family.", exampleCn: "请代我向你的家人问好。" }
  ],
  synonyms: ["consider", "view", "respect", "esteem"],
  synonymDetails: [
    { word: "consider", pos: "verb", meaningZh: "认为；看待" },
    { word: "view", pos: "verb", meaningZh: "把……看作" },
    { word: "respect", pos: "noun / verb", meaningZh: "尊重；重视" },
    { word: "esteem", pos: "noun / verb", meaningZh: "尊敬；敬重" }
  ],
  collocations: [
    { phrase: "high regard", chinese: "高度评价；十分尊重" },
    { phrase: "due regard", chinese: "应有的重视" },
    { phrase: "regard A as B", chinese: "把 A 看作 B" }
  ],
  phraseCollocations: [
    { phrase: "with regard to", chinese: "关于；就……而言" },
    { phrase: "in this regard", chinese: "在这方面" },
    { phrase: "give/send my regards", chinese: "代我问候；致意" }
  ]
});

const virtual = Object.freeze({
  pos: "adjective",
  primaryPos: "adjective",
  meaning: "虚拟的；实质上的；几乎等同于……的",
  primaryMeaning: "虚拟的",
  detail: "首先指由计算机或网络模拟、并非以实体形式存在的事物，如 virtual meeting“线上会议”。也可表示虽非名义上如此、但在效果或程度上几乎等同于某事，如 a virtual certainty“几乎确定的事”。这里的“实质上的”不等于 practical“实用的”。",
  example: "Virtual reality is becoming popular.",
  exampleCn: "虚拟现实正变得流行。",
  otherMeanings: [
    { pos: "adjective", meaningZh: "实质上的；几乎等同于……的", definitionEn: "almost or effectively a particular thing, although not officially so", example: "The country was in a state of virtual civil war.", exampleCn: "这个国家实际上已接近内战状态。" }
  ],
  synonyms: ["simulated", "online", "digital", "effective"],
  synonymDetails: [
    { word: "simulated", pos: "adjective", meaningZh: "模拟的；仿真的" },
    { word: "online", pos: "adjective", meaningZh: "在线的；线上的" },
    { word: "digital", pos: "adjective", meaningZh: "数字的；数码的" },
    { word: "effective", pos: "adjective", meaningZh: "实际起作用的；事实上的" }
  ],
  collocations: [
    { phrase: "virtual reality", chinese: "虚拟现实" },
    { phrase: "virtual meeting", chinese: "线上会议" },
    { phrase: "virtual assistant", chinese: "虚拟助手" }
  ],
  phraseCollocations: [
    { phrase: "virtual environment", chinese: "虚拟环境" },
    { phrase: "virtual classroom", chinese: "虚拟课堂；线上课堂" },
    { phrase: "a virtual certainty", chinese: "几乎确定的事" }
  ]
});

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stateSnapshot(entry = {}) {
  return Object.fromEntries(USER_STATE_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(entry, field))
    .map((field) => [field, entry[field]]));
}

function patchMasterEntry(entry, spec) {
  const primaryDefinition = spec.primaryMeaning;
  const next = {
    ...entry,
    pos: spec.pos,
    posOriginal: spec.pos,
    declaredPos: spec.pos,
    primaryPos: spec.primaryPos,
    meaning: spec.meaning,
    definition: spec.meaning,
    meaningOriginal: spec.meaning,
    primaryMeaningZh: spec.primaryMeaning,
    meaningDetailZh: spec.detail,
    meaningDetailedZh: spec.detail,
    meaningDetailSource: "manual-common-meaning-review",
    meaningDetailReviewedAt: repairedAt,
    example: spec.example,
    exampleCn: spec.exampleCn,
    exampleStatus: "editorial_example",
    otherMeanings: spec.otherMeanings,
    synonyms: spec.synonyms,
    synonymDetails: spec.synonymDetails,
    synonymsReviewed: true,
    synonymsReviewSource: "manual-semantic-repair",
    synonymsReviewedAt: repairedAt,
    collocations: spec.collocations,
    phraseCollocations: spec.phraseCollocations,
    meaningsZh: [
      { gloss: spec.primaryMeaning, posFamily: spec.primaryPos, label: "核心义", confidence: "manual-reviewed", evidence: [version] },
      ...spec.otherMeanings.map((sense) => ({ gloss: sense.meaningZh, posFamily: sense.pos, label: "常见义", confidence: "manual-reviewed", evidence: [version] }))
    ],
    quizSenses: [
      { senseId: `${entry.id}-quiz-primary`, quizMeaningZh: spec.primaryMeaning, meaningDetailedZh: spec.detail, posFamily: spec.primaryPos, confidence: "manual-reviewed", generatedAt: repairedAt }
    ],
    senses: [
      { senseId: `${entry.id}_${spec.primaryPos}_01`, pos: spec.primaryPos, meaningZh: spec.primaryMeaning, definition: primaryDefinition, example: spec.example, exampleZh: spec.exampleCn, isPrimary: true, readingCommon: true, sourceFiles: [version], editorialSource: "manual-semantic-repair" },
      ...spec.otherMeanings.map((sense, index) => ({ senseId: `${entry.id}_${String(sense.pos).replaceAll(" ", "-")}_${index + 2}`, pos: sense.pos, meaningZh: sense.meaningZh, definition: sense.definitionEn, example: sense.example, exampleZh: sense.exampleCn, sourceFiles: [version], editorialSource: "manual-semantic-repair" }))
    ],
    multiPosSenseReview: { version, reviewedAt: repairedAt, primaryPolicy: "common independent headword meaning first", origin: "manual-semantic-repair" },
    entryStatus: "editorially_reviewed",
    updatedAt: repairedAt
  };
  return next;
}

function patchReadingGHeadword(entry, spec) {
  return {
    ...entry,
    pos: spec.pos,
    primaryPos: spec.primaryPos,
    primaryMeaningZh: spec.primaryMeaning,
    meaning: spec.meaning,
    meaningZh: spec.meaning,
    definition: spec.meaning,
    meaningDetailZh: spec.detail,
    example: spec.example,
    exampleCn: spec.exampleCn,
    otherMeanings: spec.otherMeanings,
    synonyms: spec.synonyms,
    synonymDetails: spec.synonymDetails,
    synonymsReviewed: true,
    synonymsReviewSource: "manual-semantic-repair",
    synonymsReviewedAt: repairedAt,
    collocations: spec.collocations,
    phraseCollocations: spec.phraseCollocations,
    senses: [
      { senseId: `${entry.id}_${spec.primaryPos}_01`, pos: spec.primaryPos, meaningZh: spec.primaryMeaning, definition: spec.primaryMeaning, example: spec.example, exampleZh: spec.exampleCn, isPrimary: true, sourceFiles: [version] },
      ...spec.otherMeanings.map((sense, index) => ({ senseId: `${entry.id}_${String(sense.pos).replaceAll(" ", "-")}_${index + 2}`, pos: sense.pos, meaningZh: sense.meaningZh, definition: sense.definitionEn, example: sense.example, exampleZh: sense.exampleCn, sourceFiles: [version] }))
    ],
    meaningCoveragePending: false,
    meaningCoverageReviewed: true,
    meaningCoverageAuditStatus: "reviewed",
    meaningCoverageReviewSource: "manual-semantic-repair",
    meaningCoverageReviewedAt: repairedAt,
    meaningCoveragePromptVersion: version,
    aiContentProfile: version,
    aiCompletionSource: "manual-semantic-repair",
    aiCompletedAt: repairedAt,
    updatedAt: repairedAt
  };
}

function replaceNamedDetail(details, word, patch) {
  if (!Array.isArray(details)) return details;
  return details.map((detail) => detail?.word === word ? { ...detail, ...patch } : detail);
}

function patchReadingG(data) {
  const items = data.items.map((entry) => {
    if (entry.word === "regard") return patchReadingGHeadword(entry, regard);
    if (entry.word === "virtual") return patchReadingGHeadword(entry, virtual);
    if (entry.word === "digital") return { ...entry, synonymDetails: replaceNamedDetail(entry.synonymDetails, "virtual", { pos: "adjective", meaningZh: "虚拟的；线上的" }) };
    if (entry.word === "respect") return { ...entry, synonymDetails: replaceNamedDetail(entry.synonymDetails, "regard", { pos: "noun / verb", meaningZh: "尊重；重视" }) };
    if (entry.word === "treat") return { ...entry, synonymDetails: replaceNamedDetail(entry.synonymDetails, "regard", { pos: "verb", meaningZh: "看待；对待" }) };
    if (entry.word === "consideration") return { ...entry, synonymDetails: replaceNamedDetail(entry.synonymDetails, "regard", { pos: "noun", meaningZh: "关注；考虑" }) };
    if (entry.word === "regardless") return { ...entry, wordFamily: Array.isArray(entry.wordFamily) ? entry.wordFamily.map(patchRegardRelation) : patchRegardRelation(entry.wordFamily) };
    return entry;
  });
  return { ...data, items, updatedAt: repairedAt };
}

function patchRegardRelation(value) {
  if (!value || value.word !== "regard") return value;
  return { ...value, pos: regard.pos, meaning: regard.meaning };
}

function patchPersonalReading(value) {
  if (Array.isArray(value)) return value.map(patchPersonalReading);
  if (!value || typeof value !== "object") return value;
  const next = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, patchPersonalReading(item)]));
  return next.word === "regard" && "relation" in next ? patchRegardRelation(next) : next;
}

function patchAiCompletionEntry(entry, spec) {
  if (!entry?.profile) return entry;
  return {
    ...entry,
    source: "manual-semantic-repair",
    completedAt: repairedAt,
    profile: {
      ...entry.profile,
      pos: spec.pos,
      meaning: spec.meaning,
      meaningDetailZh: spec.detail,
      definition: spec.meaning,
      otherMeanings: spec.otherMeanings,
      example: spec.example,
      exampleCn: spec.exampleCn,
      synonyms: spec.synonyms,
      synonymDetails: spec.synonymDetails,
      collocations: spec.collocations,
      phraseCollocations: spec.phraseCollocations,
      aiGenerated: false,
      aiContentProfile: version,
      aiProfileKind: "meaning-coverage",
      generatedAt: repairedAt
    }
  };
}

function patchReadingGAi(data) {
  return {
    ...data,
    updatedAt: repairedAt,
    entries: {
      ...data.entries,
      regard: patchAiCompletionEntry(data.entries.regard, regard),
      virtual: patchAiCompletionEntry(data.entries.virtual, virtual)
    }
  };
}

function patchReadingGSynonyms(data) {
  const entries = { ...data.entries };
  entries.regard = { ...entries.regard, synonyms: regard.synonyms, synonymDetails: regard.synonymDetails, state: "available", source: "manual-semantic-repair", reviewedAt: repairedAt };
  entries.virtual = { ...entries.virtual, synonyms: virtual.synonyms, synonymDetails: virtual.synonymDetails, state: "available", source: "manual-semantic-repair", reviewedAt: repairedAt };
  entries.digital = { ...entries.digital, synonymDetails: replaceNamedDetail(entries.digital?.synonymDetails, "virtual", { pos: "adjective", meaningZh: "虚拟的；线上的" }) };
  entries.respect = { ...entries.respect, synonymDetails: replaceNamedDetail(entries.respect?.synonymDetails, "regard", { pos: "noun / verb", meaningZh: "尊重；重视" }) };
  entries.treat = { ...entries.treat, synonymDetails: replaceNamedDetail(entries.treat?.synonymDetails, "regard", { pos: "verb", meaningZh: "看待；对待" }) };
  entries.consideration = { ...entries.consideration, synonymDetails: replaceNamedDetail(entries.consideration?.synonymDetails, "regard", { pos: "noun", meaningZh: "关注；考虑" }) };
  return { ...data, entries, updatedAt: repairedAt };
}

function patchMeaning6000(data) {
  const items = data.items.map((entry) => {
    if (entry.word === "regard") return { ...entry, quizMeaningZh: "尊重", meaningZh: "尊重", meaningDetailedZh: regard.detail };
    if (entry.word === "virtual") return { ...entry, quizMeaningZh: "虚拟的", meaningZh: "虚拟的", meaningDetailedZh: virtual.detail };
    return entry;
  });
  return { ...data, items };
}

function main() {
  const raw = Object.fromEntries(Object.entries(paths).map(([key, filePath]) => [key, fs.readFileSync(filePath)]));
  if (!raw.publicMaster.equals(raw.staticMaster)) throw new Error("The two authoritative master lexicon files differ; repair stopped.");

  const master = JSON.parse(raw.publicMaster.toString("utf8"));
  const targetIndexes = Object.fromEntries(["regard", "virtual"].map((word) => {
    const indexes = master.words.map((entry, index) => entry.word === word ? index : -1).filter((index) => index >= 0);
    if (indexes.length !== 1) throw new Error(`Expected one ${word} master entry, got ${indexes.length}.`);
    return [word, indexes[0]];
  }));
  const beforeState = Object.fromEntries(Object.entries(targetIndexes).map(([word, index]) => [word, JSON.stringify(stateSnapshot(master.words[index]))]));
  const nextWords = master.words.map((entry, index) => {
    if (index === targetIndexes.regard) return patchMasterEntry(entry, regard);
    if (index === targetIndexes.virtual) return patchMasterEntry(entry, virtual);
    return entry;
  });
  for (const [word, index] of Object.entries(targetIndexes)) {
    if (JSON.stringify(stateSnapshot(nextWords[index])) !== beforeState[word]) throw new Error(`${word} user state changed; repair stopped.`);
  }

  const nextMaster = { ...master, words: nextWords, count: nextWords.length, savedAt: repairedAt, lexiconHash: computeLexiconHash(nextWords), integrityHash: computeIntegrityHash(nextWords) };
  const masterContent = `${JSON.stringify(nextMaster, null, 2)}\n`;
  const contents = {
    publicMaster: masterContent,
    staticMaster: masterContent,
    baseline: renderMasterLexiconBaseline({ count: nextMaster.count, version: nextMaster.version, fileHash: sha256(masterContent) }),
    readingG: `${JSON.stringify(patchReadingG(JSON.parse(raw.readingG.toString("utf8"))), null, 2)}\n`,
    readingGAi: `${JSON.stringify(patchReadingGAi(JSON.parse(raw.readingGAi.toString("utf8"))), null, 2)}\n`,
    readingGSynonyms: `${JSON.stringify(patchReadingGSynonyms(JSON.parse(raw.readingGSynonyms.toString("utf8"))), null, 2)}\n`,
    personalReading: `${JSON.stringify(patchPersonalReading(JSON.parse(raw.personalReading.toString("utf8"))), null, 2)}\n`,
    meaning6000: `${JSON.stringify(patchMeaning6000(JSON.parse(raw.meaning6000.toString("utf8"))), null, 2)}\n`
  };

  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version,
    repairedHeadwords: ["regard", "virtual"],
    sourceFilesUpdated: Object.keys(contents).length,
    stableIdsChanged: 0,
    userStateFieldsChanged: 0,
    paidAiCalls: 0
  };
  if (!shouldApply) return console.log(JSON.stringify(report, null, 2));

  const backupDirectory = path.join(root, "backups", "regard-virtual-semantic-repair", repairedAt.replace(/[:.]/g, "-"));
  fs.mkdirSync(backupDirectory, { recursive: true });
  for (const [key, filePath] of Object.entries(paths)) fs.copyFileSync(filePath, path.join(backupDirectory, `${key}-${path.basename(filePath)}`));
  try {
    for (const [key, content] of Object.entries(contents)) atomicWrite(paths[key], content);
  } catch (error) {
    for (const [key, content] of Object.entries(raw)) atomicWrite(paths[key], content);
    throw error;
  }
  console.log(JSON.stringify({ ...report, backupDirectory: path.relative(root, backupDirectory).replaceAll("\\", "/") }, null, 2));
}

main();
