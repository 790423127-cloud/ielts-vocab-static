import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = path.join(ROOT, "app/hooks/useHomeLexiconAdmin.js");
const src = fs.readFileSync(srcPath, "utf8");

if (src.includes("createLocalOps")) {
  console.log(JSON.stringify({ ok: true, skipped: true }, null, 2));
  process.exit(0);
}

const lines = src.split(/\n/);
const fnStarts = [];
for (let i = 0; i < lines.length; i += 1) {
  if (/^  (async )?function [A-Za-z0-9_]+/.test(lines[i])) {
    const name = lines[i].match(/^  (?:async )?function ([A-Za-z0-9_]+)/)[1];
    fnStarts.push({ line: i, name });
  }
}

const aiNames = new Set([
  "cleanWordList",
  "generateForIndex",
  "confirmAiCost",
  "generateCurrent",
  "aiRepairCurrentWordSymbol",
  "generateMissingBatch",
  "aiCompletePendingAndUnclassifiedOneByOne",
  "aiSlowCompleteMissing10x1",
  "aiStableRepairWrongWords10x2",
  "generateHundredByFiveBatch",
  "completeMeaningAndAudio",
  "categorizeWords",
  "aiDedupe"
]);
const ioNames = new Set([
  "importWords",
  "importFromText",
  "handleFile",
  "exportStaticSite",
  "clearAll",
  "downloadBlankVocabTemplateJson",
  "downloadBlankVocabTemplateCsv",
  "importTemplateVocabFile",
  "downloadVocabBackup",
  "downloadEnglishOnlyTxt",
  "importVocabBackup",
  "exportJSON",
  "applyRecoveredWords",
  "recoverWordsFromLocalFiles",
  "recoverWordsFromTencentCloud",
  "cleanBrowserStorageNow"
]);

function extractFunction(startLine) {
  let brace = 0;
  let started = false;
  for (let i = startLine; i < lines.length; i += 1) {
    for (const ch of lines[i]) {
      if (ch === "{") {
        brace += 1;
        started = true;
      }
      if (ch === "}") brace -= 1;
    }
    if (started && brace === 0) {
      return { end: i, text: lines.slice(startLine, i + 1).join("\n") };
    }
  }
  throw new Error(`unclosed function at ${startLine + 1}`);
}

const ranges = [];
const topLevel = [];
for (const fn of fnStarts) {
  const inside = ranges.some((r) => fn.line > r.start && fn.line < r.end);
  if (inside) continue;
  const extracted = extractFunction(fn.line);
  ranges.push({ start: fn.line, end: extracted.end });
  topLevel.push({ name: fn.name, text: extracted.text });
}

const groups = { Local: [], Ai: [], Io: [] };
for (const fn of topLevel) {
  if (aiNames.has(fn.name)) groups.Ai.push(fn);
  else if (ioNames.has(fn.name)) groups.Io.push(fn);
  else groups.Local.push(fn);
}

const sharedImports = `import {
  applyEditDraftToWord,
  buildLocalCleanResult,
  buildLocalExactDedupeResult,
  buildLocalFormFamilyResult,
  buildLocalOptimizeResult,
  cleanTtsSymbolsInWord,
  collectObscureDerivedCandidates,
  emergencyDefaultCloudUrl,
  getLocalWrongReasons,
  hasHeadwordRepair,
  isCompleteAiWord,
  isLikelyWrongAiWord,
  isMissingAiFields,
  isMissingClassification,
  isProbablyFullVocab,
  isSimpleDictionaryWord,
  mergeWord,
  normalizePhraseItems,
  normalizeStringArray,
  normalizeWord,
  parseImportText,
  repairHeadwordLocally,
  repairObviousWrongWordLocally,
  wordToEditDraft
} from "../lib/vocab/page-word-helpers.mjs";
import { buildLocalChangeLog } from "../lib/vocab/local-change-log.mjs";
import {
  buildBlankVocabTemplateCsvText,
  buildBlankVocabTemplateJsonPayload,
  csvToObjects,
  mergeBasicTemplateWord,
  normalizeTemplateWord
} from "../lib/vocab/vocab-template-io.mjs";
import {
  loadWordsFromIndexedDB,
  postExportCache,
  saveWordsToIndexedDB
} from "../lib/vocab/word-store.mjs";
import { filterKey, isIdictationFlashFilter } from "../lib/vocab/word-flashcard-study-pool.mjs";
import { LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES } from "../lib/vocab/lexicon-guard-shared.mjs";
`;

const ctxDestructure = `  const {
    words, setWords, index, setIndex, filter,
    lastLocalChange, setLastLocalChange,
    setLoading, setToast, setBatchInfo, setDuplicateInfo,
    setEditOpen, setEditDraft, editDraft,
    item, isExternalIdictationItem, pasteText, setPasteText,
    persistWordsImmediately, resetWordStudySessionState,
    cacheMetaRef, latestStateRef, entryPositionsRef, persistWordFlashSessionNow,
    compactBrowserStorageForCurrentWords,
    // cross-group helpers injected by composer
    applyLocalResult, recordLocalChange, localOptimizeWordList, generateCurrent, confirmAiCost
  } = ctx;
`;

function writeFactory(label, list) {
  const names = list.map((f) => f.name);
  const body = list.map((f) => f.text).join("\n\n");
  const content = `"use client";
/**
 * ${label} ops factory — split from useHomeLexiconAdmin (v2026-07-10.3)
 */
${sharedImports}

export function create${label}Ops(ctx) {
${ctxDestructure}
${body}

  return { ${names.join(", ")} };
}
`;
  const out = path.join(ROOT, `app/hooks/useHomeLexiconAdmin.${label.toLowerCase()}.js`);
  fs.writeFileSync(out, content);
  return names;
}

const localNames = writeFactory("Local", groups.Local);
const aiNamesOut = writeFactory("Ai", groups.Ai);
const ioNamesOut = writeFactory("Io", groups.Io);

const composer = `"use client";
/**
 * Home lexicon admin composer (local + AI + IO).
 * Split in v2026-07-10.3 for maintainability.
 */
import { createLocalOps } from "./useHomeLexiconAdmin.local.js";
import { createAiOps } from "./useHomeLexiconAdmin.ai.js";
import { createIoOps } from "./useHomeLexiconAdmin.io.js";

export function useHomeLexiconAdmin(ctx) {
  const local = createLocalOps(ctx);
  const ai = createAiOps({ ...ctx, ...local });
  const io = createIoOps({ ...ctx, ...local, ...ai });
  return { ...local, ...ai, ...io };
}
`;

fs.writeFileSync(srcPath, composer);
console.log(
  JSON.stringify(
    {
      ok: true,
      local: localNames.length,
      ai: aiNamesOut.length,
      io: ioNamesOut.length,
      localNames,
      aiNames: aiNamesOut,
      ioNames: ioNamesOut
    },
    null,
    2
  )
);
