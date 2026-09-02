#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { buildStaticReadingWordsPublishSnapshot } from "../app/lib/reading-words/static-publish.mjs";
import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";
import { isInflectedReferenceWord } from "../app/lib/vocab/word-study-eligibility.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const publicPath = path.join(root, "public", "data", "words.json");
const staticPath = path.join(root, ".static-export-cache", "words.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const readingPath = path.join(root, "public", "data", "personal-reading-words.json");
const version = "reading-import-selection-fragment-repair-v1-20260812";

const repairs = new Map([
  ["cam", { canonical: "campus", evidence: "cam was selected from campus in the stored source sentence" }],
  ["pport", { canonical: "opportunity", evidence: "pport was selected from opportunity in the stored source sentence" }],
  ["suggests t", { canonical: "suggest", evidence: "suggests t is a truncated selection from suggests that" }]
]);

function text(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function key(value) {
  return text(value).toLowerCase();
}

function unique(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function stateSnapshot(entry = {}) {
  const result = {};
  for (const field of USER_STATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) result[field] = entry[field];
  }
  return result;
}

function referenceEntry(entry, canonical, repairedAt) {
  return {
    ...entry,
    entryType: "word-reference",
    studyMode: "reference",
    relationType: "spelling repair",
    baseWord: canonical.word,
    baseWordId: canonical.id || canonical.wordId,
    redirectToWord: canonical.word,
    meaning: `错误的阅读选词残片；请学习 ${canonical.word}`,
    definition: `错误的阅读选词残片；请学习 ${canonical.word}`,
    meaningDetailZh: `该记录是从原阅读句中误截取的残片，已保留原 ID 以兼容历史进度；学习与搜索时会转到正确词条“${canonical.word}”。`,
    forms: [],
    wordFamily: [],
    synonyms: [],
    synonymDetails: [],
    collocations: [],
    phraseCollocations: [],
    spellingEligible: false,
    referenceReason: "reading selection fragment preserved for progress redirect",
    correctedTo: canonical.word,
    updatedAt: repairedAt
  };
}

function repairReadingWord(entry, canonical, oldWord, repairedAt) {
  const sourceSentence = text(entry?.readingSources?.[0]?.sentence);
  const exampleCn = oldWord === "cam"
    ? "我们还在校园内提供自行车存放处和骑车上班计划。"
    : "有机会假装自己正在参加一场音乐会。";
  return {
    ...entry,
    word: canonical.word,
    mainWordId: canonical.id || canonical.wordId,
    correctedFrom: text(entry.correctedFrom) || oldWord,
    phonetic: canonical.phonetic,
    pos: canonical.primaryPos || canonical.pos,
    meaning: canonical.primaryMeaningZh || canonical.meaning,
    meaningDetailZh: canonical.meaningDetailZh,
    definition: canonical.definition,
    otherMeanings: Array.isArray(canonical.otherMeanings) ? canonical.otherMeanings : [],
    example: sourceSentence || canonical.example,
    exampleCn,
    forms: Array.isArray(canonical.forms) ? canonical.forms : [],
    wordFamily: Array.isArray(canonical.wordFamily) ? canonical.wordFamily : [],
    synonyms: Array.isArray(canonical.synonyms) ? canonical.synonyms : [],
    synonymDetails: Array.isArray(canonical.synonymDetails) ? canonical.synonymDetails : [],
    collocations: Array.isArray(canonical.collocations) ? canonical.collocations : [],
    phraseCollocations: Array.isArray(canonical.phraseCollocations) ? canonical.phraseCollocations : [],
    readingMeaning: canonical.primaryMeaningZh || canonical.meaning,
    readingContextPending: false,
    readingContextReviewed: true,
    readingContextReviewSource: "manual-selection-fragment-repair",
    readingContextReviewedAt: repairedAt,
    readingNote: `原选词“${oldWord}”是从原句中的“${canonical.word}”误截取的片段，已按原句纠正。`,
    updatedAt: repairedAt
  };
}

function linkedStateEntry(canonical, oldLinked = {}) {
  const next = {
    id: canonical.id,
    wordId: canonical.wordId,
    word: canonical.word,
    transferType: "user-state"
  };
  for (const field of USER_STATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(oldLinked, field)) next[field] = oldLinked[field];
  }
  return next;
}

function main() {
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  const baselineRaw = fs.readFileSync(baselinePath);
  const readingRaw = fs.readFileSync(readingPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master lexicon files differ; repair stopped.");
  const payload = JSON.parse(publicRaw.toString("utf8"));
  const readingPayload = JSON.parse(readingRaw.toString("utf8"));
  if (!Array.isArray(payload.words) || payload.words.length !== Number(payload.count)) {
    throw new Error("Master lexicon words/count mismatch; repair stopped.");
  }
  if (!Array.isArray(readingPayload?.transfer?.readingWords) || !Array.isArray(readingPayload?.transfer?.linkedMainEntries)) {
    throw new Error("Personal reading transfer data is invalid; repair stopped.");
  }

  const repairedAt = new Date().toISOString();
  const beforeStates = new Map(payload.words.map((entry) => [entry.id || entry.wordId, JSON.stringify(stateSnapshot(entry))]));
  const byKey = new Map(payload.words.map((entry) => [key(entry.word), entry]));
  for (const [fragment, repair] of repairs) {
    if (!byKey.has(fragment) || !byKey.has(repair.canonical)) {
      throw new Error(`Missing fragment mapping: ${fragment} -> ${repair.canonical}`);
    }
  }

  const redirected = [];
  let nextWords = payload.words.map((entry) => {
    const repair = repairs.get(key(entry.word));
    if (!repair) return entry;
    const canonical = byKey.get(repair.canonical);
    redirected.push({ id: entry.id || entry.wordId, from: entry.word, to: canonical.word, evidence: repair.evidence });
    return referenceEntry(entry, canonical, repairedAt);
  });
  const redirectedByTarget = new Map(redirected.map((item) => [key(item.to), item]));
  nextWords = nextWords.map((entry) => {
    const redirect = redirectedByTarget.get(key(entry.word));
    if (!redirect) return entry;
    return {
      ...entry,
      legacyHeadwords: unique([...(entry.legacyHeadwords || []), redirect.from]),
      legacyWordIds: unique([...(entry.legacyWordIds || []), redirect.id]),
      updatedAt: repairedAt
    };
  });
  const nextByKey = new Map(nextWords.map((entry) => [key(entry.word), entry]));
  for (const item of redirected) {
    const reference = nextWords.find((entry) => (entry.id || entry.wordId) === item.id);
    if (!isInflectedReferenceWord(reference)) throw new Error(`Redirect is not recognized as a reference: ${item.from}`);
  }
  for (const entry of nextWords) {
    const id = entry.id || entry.wordId;
    if (beforeStates.get(id) !== JSON.stringify(stateSnapshot(entry))) throw new Error(`User state changed: ${entry.word}`);
  }

  const personalRepairs = new Map([
    ["cam", "campus"],
    ["pport", "opportunity"]
  ]);
  const beforeReadingIds = readingPayload.transfer.readingWords.map((entry) => entry.id || entry.wordId);
  const repairedReadingWords = [];
  const nextReadingWords = readingPayload.transfer.readingWords.map((entry) => {
    const canonicalKey = personalRepairs.get(key(entry.word));
    if (!canonicalKey) return entry;
    const canonical = nextByKey.get(canonicalKey);
    const next = repairReadingWord(entry, canonical, entry.word, repairedAt);
    repairedReadingWords.push({ id: entry.id || entry.wordId, from: entry.word, to: canonical.word });
    return next;
  });
  if (repairedReadingWords.length !== personalRepairs.size) {
    throw new Error(`Expected ${personalRepairs.size} personal reading repairs, got ${repairedReadingWords.length}.`);
  }
  const afterReadingIds = nextReadingWords.map((entry) => entry.id || entry.wordId);
  if (JSON.stringify(beforeReadingIds) !== JSON.stringify(afterReadingIds)) {
    throw new Error("Personal reading stable IDs changed; repair stopped.");
  }

  const linkedByKey = new Map(readingPayload.transfer.linkedMainEntries.map((entry) => [key(entry.word), entry]));
  const removedLinkedKeys = new Set(personalRepairs.keys());
  const nextLinkedEntries = readingPayload.transfer.linkedMainEntries.filter((entry) => !removedLinkedKeys.has(key(entry.word)));
  for (const [oldWord, canonicalKey] of personalRepairs) {
    if (nextLinkedEntries.some((entry) => key(entry.word) === canonicalKey)) continue;
    nextLinkedEntries.push(linkedStateEntry(nextByKey.get(canonicalKey), linkedByKey.get(oldWord)));
  }

  const nextPayload = {
    ...payload,
    readingSelectionFragmentRepair: {
      version,
      repairedAt,
      redirected,
      personalReadingRepairs: repairedReadingWords,
      remaining: 0
    },
    words: nextWords,
    count: nextWords.length,
    savedAt: repairedAt,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords)
  };
  const masterContent = `${JSON.stringify(nextPayload, null, 2)}\n`;
  const baselineContent = renderMasterLexiconBaseline({
    count: nextPayload.count,
    version: nextPayload.version,
    fileHash: sha256(masterContent)
  });
  const nextTransfer = {
    ...readingPayload.transfer,
    exportedAt: repairedAt,
    readingWords: nextReadingWords,
    linkedMainEntries: nextLinkedEntries,
    sourceMainMeta: {
      ...(readingPayload.transfer.sourceMainMeta || {}),
      version: nextPayload.version,
      lexiconHash: nextPayload.lexiconHash
    }
  };
  const nextReadingPayload = buildStaticReadingWordsPublishSnapshot(nextTransfer, {
    sourceUpdatedAt: repairedAt,
    publishedAt: repairedAt
  });
  const readingContent = `${JSON.stringify(nextReadingPayload, null, 2)}\n`;
  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version,
    masterRedirects: redirected,
    personalReadingRepairs: repairedReadingWords,
    masterCount: nextWords.length,
    personalReadingCount: nextReadingWords.length,
    stableIdChanges: 0,
    userStateChanges: 0,
    paidAiCalls: 0
  };

  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const stamp = repairedAt.replace(/[:.]/g, "-");
  const backupDirectory = path.join(root, "backups", "reading-selection-fragment-repair", stamp);
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backups = [
    [publicPath, path.join(backupDirectory, "words.json")],
    [staticPath, path.join(backupDirectory, "cache-words.json")],
    [baselinePath, path.join(backupDirectory, "master-lexicon-baseline.mjs")],
    [readingPath, path.join(backupDirectory, "personal-reading-words.json")]
  ];
  for (const [sourcePath, backupPath] of backups) fs.copyFileSync(sourcePath, backupPath);
  try {
    atomicWrite(publicPath, masterContent);
    atomicWrite(staticPath, masterContent);
    atomicWrite(baselinePath, baselineContent);
    atomicWrite(readingPath, readingContent);
    if (!fs.readFileSync(publicPath).equals(fs.readFileSync(staticPath))) {
      throw new Error("Authoritative master copies differ after write.");
    }
  } catch (error) {
    atomicWrite(publicPath, publicRaw);
    atomicWrite(staticPath, staticRaw);
    atomicWrite(baselinePath, baselineRaw);
    atomicWrite(readingPath, readingRaw);
    throw error;
  }
  fs.writeFileSync(path.join(backupDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, backupDirectory, masterSha256: sha256(masterContent) }, null, 2));
}

main();
