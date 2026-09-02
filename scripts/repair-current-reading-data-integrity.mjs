#!/usr/bin/env node

/**
 * Repairs current, verified reading-data defects without an AI request:
 * - two malformed personal-reading headwords;
 * - two personal-reading examples polluted by question-number placeholders;
 * - G-reading examples with visible truncation or whitespace-before-punctuation.
 *
 * Usage:
 *   node scripts/repair-current-reading-data-integrity.mjs --dry-run
 *   node scripts/repair-current-reading-data-integrity.mjs --apply
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { buildStaticReadingWordsPublishSnapshot } from "../app/lib/reading-words/static-publish.mjs";
import {
  exampleMentionsTarget,
  isExampleLikelyTruncated
} from "../app/lib/vocab/example-clean.mjs";
import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";
import { MANUAL_READING_G_EXAMPLE_REPAIRS } from "./data/reading-g-example-manual-repairs.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const publicWordsPath = path.join(root, "public", "data", "words.json");
const staticWordsPath = path.join(root, ".static-export-cache", "words.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const personalReadingPath = path.join(root, "public", "data", "personal-reading-words.json");
const readingGPath = path.join(root, "public", "data", "reading-g-vocab.json");
const version = "current-reading-data-integrity-repair-v1-20260812";

const PERSONAL_STATE_FIELDS = [
  "status",
  "lastReviewedAt",
  "favorite",
  "importCount",
  "highFrequency",
  "firstImportedAt",
  "lastImportedAt",
  "createdAt"
];

const HEADWORD_REPAIRS = Object.freeze({
  "tolerated.": {
    word: "tolerated",
    readingMeaning: "容忍；忍受",
    readingNote: "原选词末尾误带句号，已更正为 tolerated；当前语境中指“容忍”。"
  },
  driling: {
    word: "drilling",
    teaching: {
      pos: "noun",
      meaning: "钻孔；钻探",
      meaningDetailZh: "作名词时通常指用钻头在材料、墙体或地层中打孔、钻探的过程；在军事、体育等语境中也可指反复操练。当前阅读句中指“钻孔前”。",
      definition: "The process of making holes in a material or in the ground with a drill.",
      otherMeanings: [{
        pos: "noun",
        meaningZh: "操练；训练",
        definitionEn: "Repeated practice of a skill or procedure.",
        example: "The recruits spent the morning in drilling.",
        exampleCn: "新兵上午在进行操练。"
      }],
      example: "Careful drilling is needed before the wall is altered.",
      exampleCn: "改动这面墙之前需要小心钻孔。"
    },
    readingMeaning: "钻孔；钻探",
    readingNote: "原选词“driling”漏掉一个 l，已更正为 drilling；当前阅读语境中指钻孔。",
    replaceReadingSource: ["driling", "drilling"]
  }
});

const PERSONAL_EXAMPLE_REPAIRS = Object.freeze({
  accordance: {
    example: "The contract was signed in accordance with the law.",
    exampleCn: "合同是依法签署的。"
  },
  clearance: {
    example: "We need security clearance to enter the building.",
    exampleCn: "我们需要安全许可才能进入大楼。",
    readingNote: "原始阅读材料包含题号占位符；教学例句已改为完整句，原始来源记录仍保留。"
  }
});

function text(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function key(value) {
  return text(value).toLowerCase();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function unique(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function atomicWrite(filePath, content) {
  const tempPath = filePath + ".tmp-" + process.pid + "-" + Date.now();
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

function stableId(entry = {}) {
  return text(entry.id || entry.wordId);
}

function stateSnapshot(entry = {}, fields) {
  const snapshot = {};
  for (const field of fields) {
    if (Object.hasOwn(entry, field)) snapshot[field] = entry[field];
  }
  return snapshot;
}

function assertStableIds(before, after, label) {
  const beforeIds = before.map(stableId);
  const afterIds = after.map(stableId);
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
    throw new Error(label + " stable ID order changed; write stopped.");
  }
}

function assertStatePreserved(before, after, fields, label) {
  const beforeState = new Map(before.map((entry) => [stableId(entry), JSON.stringify(stateSnapshot(entry, fields))]));
  for (const entry of after) {
    const id = stableId(entry);
    if (beforeState.get(id) !== JSON.stringify(stateSnapshot(entry, fields))) {
      throw new Error(label + " user state changed for " + entry.word + "; write stopped.");
    }
  }
}

function assertNoDuplicateHeadwords(entries, label) {
  const seen = new Set();
  for (const entry of entries) {
    const entryKey = key(entry.word);
    if (!entryKey) throw new Error(label + " contains an empty headword.");
    if (seen.has(entryKey)) throw new Error(label + " would contain a duplicate headword: " + entry.word);
    seen.add(entryKey);
  }
}

function applyHeadwordRepair(entry, repair, oldWord, now, { readingRecord = false } = {}) {
  const next = {
    ...entry,
    word: repair.word,
    correctedFrom: text(entry.correctedFrom) || oldWord,
    legacyHeadwords: unique([...(Array.isArray(entry.legacyHeadwords) ? entry.legacyHeadwords : []), oldWord]),
    correctionType: "manual-headword-data-repair",
    updatedAt: now
  };
  if (repair.teaching) Object.assign(next, repair.teaching);
  if (readingRecord) {
    next.mainWordId = stableId(entry);
    next.readingMeaning = repair.readingMeaning;
    next.readingContextPending = false;
    next.readingContextReviewed = true;
    next.readingContextReviewSource = "manual-headword-data-repair";
    next.readingContextReviewedAt = now;
    next.readingNote = repair.readingNote;
    if (Array.isArray(repair.replaceReadingSource)) {
      const [from, to] = repair.replaceReadingSource;
      next.readingSources = (Array.isArray(entry.readingSources) ? entry.readingSources : []).map((source) => ({
        ...source,
        sentence: String(source?.sentence || "").replace(new RegExp("\\b" + from + "\\b", "gi"), to)
      }));
    }
  }
  return next;
}

function isHeadwordRepairAlreadyApplied(entry, repair, oldWord) {
  return key(entry?.word) === key(repair.word)
    && key(entry?.correctedFrom) === oldWord
    && (Array.isArray(entry?.legacyHeadwords) ? entry.legacyHeadwords : [])
      .some((legacy) => key(legacy) === oldWord);
}

function headwordRepairState(entries, oldWord, repair, label) {
  const byKey = new Map(entries.map((entry) => [key(entry.word), entry]));
  const source = byKey.get(oldWord);
  const target = byKey.get(key(repair.word));
  if (source && target) {
    throw new Error(label + " contains both the old and corrected headword for " + oldWord);
  }
  if (source) return "needs_repair";
  if (target && isHeadwordRepairAlreadyApplied(target, repair, oldWord)) return "already_repaired";
  throw new Error(label + " has neither a repairable nor a verified corrected headword for " + oldWord);
}

function isPersonalExampleRepairAlreadyApplied(entry, repair) {
  return String(entry?.example || "") === repair.example
    && String(entry?.exampleCn || "") === repair.exampleCn
    && (!repair.readingNote || String(entry?.readingNote || "") === repair.readingNote);
}

function hasUsableMainExample(mainEntry, target) {
  const example = text(mainEntry?.example);
  const exampleCn = text(mainEntry?.exampleCn);
  return Boolean(
    example
    && exampleCn
    && exampleMentionsTarget(example, target)
    && !isExampleLikelyTruncated(example)
    && !/\s+[.!?]$/.test(example)
  );
}

function isGExampleCandidate(entry) {
  if (!entry) return false;
  // A reviewed manual repair is deliberately allowed for a phrase or a
  // reference-layer record. Those entries are not queued for normal bulk AI
  // work, but an explicitly named broken example must still be repairable.
  if (Object.hasOwn(MANUAL_READING_G_EXAMPLE_REPAIRS, entry.id)) return true;
  return Boolean(
    entry.entryType === "word"
    && entry.studyMode !== "reference"
    && (
      /\s+[.!?]$/.test(String(entry.example || ""))
      || isExampleLikelyTruncated(entry.example)
    )
  );
}

function repairGExamples(items, mainByKey, now) {
  const unresolved = [];
  const repaired = [];
  const alreadyRepaired = [];
  let mainReused = 0;
  let manualRepaired = 0;

  const nextItems = items.map((entry) => {
    if (!isGExampleCandidate(entry)) return entry;
    const manual = MANUAL_READING_G_EXAMPLE_REPAIRS[entry.id];
    if (manual) {
      if (
        String(entry.example || "") === manual.example
        && String(entry.exampleCn || "") === manual.exampleCn
      ) {
        alreadyRepaired.push(entry.id);
        return entry;
      }
      if (String(entry.example || "") !== manual.from) {
        throw new Error("Manual G example source changed for " + entry.word + "; write stopped.");
      }
      manualRepaired += 1;
      repaired.push({ id: entry.id, word: entry.word, source: "manual" });
      return {
        ...entry,
        example: manual.example,
        exampleCn: manual.exampleCn,
        exampleSource: "manual-reading-g-editorial-repair",
        exampleReviewedAt: now,
        updatedAt: now
      };
    }

    const mainEntry = mainByKey.get(key(entry.word));
    if (!hasUsableMainExample(mainEntry, entry.word)) {
      unresolved.push({ id: entry.id, word: entry.word, example: entry.example });
      return entry;
    }
    if (
      String(entry.example || "") === String(mainEntry.example || "")
      && String(entry.exampleCn || "") === String(mainEntry.exampleCn || "")
    ) {
      alreadyRepaired.push(entry.id);
      return entry;
    }
    mainReused += 1;
    repaired.push({ id: entry.id, word: entry.word, source: "exact-main" });
    return {
      ...entry,
      example: mainEntry.example,
      exampleCn: mainEntry.exampleCn,
      exampleSource: "main-lexicon-exact-example-reuse",
      exampleReviewedAt: now,
      updatedAt: now
    };
  });

  if (unresolved.length) {
    throw new Error("G example repairs still need manual content: " + JSON.stringify(unresolved));
  }
  return { nextItems, repaired, alreadyRepaired, mainReused, manualRepaired };
}

function main() {
  const publicWordsRaw = fs.readFileSync(publicWordsPath);
  const staticWordsRaw = fs.readFileSync(staticWordsPath);
  const baselineRaw = fs.readFileSync(baselinePath);
  const personalRaw = fs.readFileSync(personalReadingPath);
  const readingGRaw = fs.readFileSync(readingGPath);
  if (!publicWordsRaw.equals(staticWordsRaw)) {
    throw new Error("The two authoritative master lexicon files differ; repair stopped.");
  }

  const masterPayload = JSON.parse(publicWordsRaw.toString("utf8"));
  const personalPayload = JSON.parse(personalRaw.toString("utf8"));
  const readingGPayload = JSON.parse(readingGRaw.toString("utf8"));
  const masterWords = Array.isArray(masterPayload.words) ? masterPayload.words : [];
  const personalWords = Array.isArray(personalPayload?.transfer?.readingWords)
    ? personalPayload.transfer.readingWords
    : [];
  const linkedMainEntries = Array.isArray(personalPayload?.transfer?.linkedMainEntries)
    ? personalPayload.transfer.linkedMainEntries
    : [];
  const gItems = Array.isArray(readingGPayload.items) ? readingGPayload.items : [];

  if (!masterWords.length || masterWords.length !== Number(masterPayload.count)) {
    throw new Error("Master lexicon words/count mismatch; repair stopped.");
  }
  if (!personalWords.length || personalWords.length !== linkedMainEntries.length) {
    throw new Error("Personal reading transfer data is incomplete; repair stopped.");
  }
  if (!gItems.length) throw new Error("G reading data is empty; repair stopped.");

  const now = new Date().toISOString();
  const headwordStates = Object.fromEntries(Object.entries(HEADWORD_REPAIRS).map(([oldWord, repair]) => {
    const masterState = headwordRepairState(masterWords, oldWord, repair, "Master lexicon");
    const personalState = headwordRepairState(personalWords, oldWord, repair, "Personal reading");
    if (masterState !== personalState) {
      throw new Error("Master and personal reading headword repair states differ for " + oldWord);
    }
    return [oldWord, masterState];
  }));
  const personalExampleStates = Object.fromEntries(Object.entries(PERSONAL_EXAMPLE_REPAIRS).map(([word, repair]) => {
    const entry = personalWords.find((candidate) => key(candidate.word) === word);
    if (!entry) throw new Error("Personal reading example repair target is missing: " + word);
    return [word, isPersonalExampleRepairAlreadyApplied(entry, repair) ? "already_repaired" : "needs_repair"];
  }));

  const nextMasterWords = masterWords.map((entry) => {
    const oldWord = key(entry.word);
    const repair = headwordStates[oldWord] === "needs_repair" ? HEADWORD_REPAIRS[oldWord] : null;
    return repair ? applyHeadwordRepair(entry, repair, oldWord, now) : entry;
  });
  assertStableIds(masterWords, nextMasterWords, "Master lexicon");
  assertStatePreserved(masterWords, nextMasterWords, USER_STATE_FIELDS, "Master lexicon");
  assertNoDuplicateHeadwords(nextMasterWords, "Master lexicon");

  const nextMasterById = new Map(nextMasterWords.map((entry) => [stableId(entry), entry]));
  const nextPersonalWords = personalWords.map((entry) => {
    const oldWord = key(entry.word);
    const headwordRepair = headwordStates[oldWord] === "needs_repair" ? HEADWORD_REPAIRS[oldWord] : null;
    if (headwordRepair) return applyHeadwordRepair(entry, headwordRepair, oldWord, now, { readingRecord: true });

    const exampleRepair = PERSONAL_EXAMPLE_REPAIRS[oldWord];
    if (!exampleRepair) return entry;
    if (personalExampleStates[oldWord] !== "needs_repair") return entry;
    const next = {
      ...entry,
      example: exampleRepair.example,
      exampleCn: exampleRepair.exampleCn,
      exampleSource: "manual-reading-notebook-editorial-repair",
      exampleReviewedAt: now,
      updatedAt: now
    };
    if (exampleRepair.readingNote) next.readingNote = exampleRepair.readingNote;
    return next;
  });
  assertStableIds(personalWords, nextPersonalWords, "Personal reading");
  assertStatePreserved(personalWords, nextPersonalWords, PERSONAL_STATE_FIELDS, "Personal reading");
  assertNoDuplicateHeadwords(nextPersonalWords, "Personal reading");

  const nextLinkedMainEntries = linkedMainEntries.map((entry) => {
    const oldWord = key(entry.word);
    const headwordRepair = headwordStates[oldWord] === "needs_repair" ? HEADWORD_REPAIRS[oldWord] : null;
    if (!headwordRepair) return entry;
    const masterEntry = nextMasterById.get(stableId(entry));
    if (!masterEntry) throw new Error("Cannot find repaired master entry for " + entry.word);
    const next = applyHeadwordRepair(entry, headwordRepair, oldWord, now);
    for (const field of [
      "phonetic",
      "pos",
      "meaning",
      "meaningDetailZh",
      "definition",
      "otherMeanings",
      "example",
      "exampleCn"
    ]) {
      next[field] = masterEntry[field];
    }
    return next;
  });
  assertStableIds(linkedMainEntries, nextLinkedMainEntries, "Personal reading linked-main entries");
  assertStatePreserved(linkedMainEntries, nextLinkedMainEntries, USER_STATE_FIELDS, "Personal reading linked-main entries");
  assertNoDuplicateHeadwords(nextLinkedMainEntries, "Personal reading linked-main entries");

  const nextMasterByKey = new Map(nextMasterWords.map((entry) => [key(entry.word), entry]));
  const gRepair = repairGExamples(gItems, nextMasterByKey, now);
  assertStableIds(gItems, gRepair.nextItems, "G reading");
  assertNoDuplicateHeadwords(
    gRepair.nextItems.filter((entry) => entry.entryType === "word" && entry.studyMode !== "reference"),
    "G reading active words"
  );

  const masterWordsChanged = nextMasterWords.some((entry, index) => entry !== masterWords[index]);
  const personalWordsChanged = nextPersonalWords.some((entry, index) => entry !== personalWords[index]);
  const linkedMainEntriesChanged = nextLinkedMainEntries.some((entry, index) => entry !== linkedMainEntries[index]);
  const personalChanged = personalWordsChanged || linkedMainEntriesChanged;
  const gChanged = gRepair.repaired.length > 0;

  const nextMasterPayload = masterWordsChanged
    ? {
        ...masterPayload,
        currentReadingDataIntegrityRepair: {
          version,
          repairedAt: now,
          headwords: Object.keys(HEADWORD_REPAIRS),
          paidAiCalls: 0
        },
        words: nextMasterWords,
        count: nextMasterWords.length,
        savedAt: now,
        lexiconHash: computeLexiconHash(nextMasterWords),
        integrityHash: computeIntegrityHash(nextMasterWords)
      }
    : masterPayload;
  const masterContent = masterWordsChanged
    ? JSON.stringify(nextMasterPayload, null, 2) + "\n"
    : publicWordsRaw.toString("utf8");
  const baselineContent = masterWordsChanged
    ? renderMasterLexiconBaseline({
        count: nextMasterPayload.count,
        version: nextMasterPayload.version,
        fileHash: sha256(masterContent)
      })
    : baselineRaw.toString("utf8");

  const nextPersonalPayload = personalChanged
    ? buildStaticReadingWordsPublishSnapshot({
        ...personalPayload.transfer,
        exportedAt: now,
        readingWords: nextPersonalWords,
        linkedMainEntries: nextLinkedMainEntries,
        sourceMainMeta: {
          ...(personalPayload.transfer.sourceMainMeta || {}),
          version: nextMasterPayload.version,
          lexiconHash: nextMasterPayload.lexiconHash
        }
      }, {
        sourceUpdatedAt: now,
        publishedAt: now
      })
    : personalPayload;
  const personalContent = personalChanged
    ? JSON.stringify(nextPersonalPayload, null, 2) + "\n"
    : personalRaw.toString("utf8");

  const nextReadingGPayload = gChanged
    ? {
        ...readingGPayload,
        exampleEditorialRepair: {
          ...(readingGPayload.exampleEditorialRepair || {}),
          version,
          repairedAt: now,
          exactMainReuse: gRepair.mainReused,
          manualRepair: gRepair.manualRepaired,
          remaining: 0,
          paidAiCalls: 0
        },
        items: gRepair.nextItems,
        updatedAt: now
      }
    : readingGPayload;
  const readingGContent = gChanged
    ? JSON.stringify(nextReadingGPayload, null, 2) + "\n"
    : readingGRaw.toString("utf8");
  const hasChanges = masterWordsChanged || personalChanged || gChanged;

  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version,
    masterHeadwordRepairs: Object.values(headwordStates).filter((state) => state === "needs_repair").length,
    masterHeadwordsAlreadyRepaired: Object.values(headwordStates).filter((state) => state === "already_repaired").length,
    personalExampleRepairs: Object.values(personalExampleStates).filter((state) => state === "needs_repair").length,
    personalExamplesAlreadyRepaired: Object.values(personalExampleStates).filter((state) => state === "already_repaired").length,
    gExamplesReusedFromMain: gRepair.mainReused,
    gExamplesManuallyRepaired: gRepair.manualRepaired,
    gExamplesAlreadyRepaired: gRepair.alreadyRepaired.length,
    stableIdsChanged: 0,
    userStateFieldsChanged: 0,
    paidAiCalls: 0,
    networkCalls: 0,
    noChangesNeeded: !hasChanges,
    gPreview: gRepair.repaired.slice(0, 25)
  };
  if (!shouldApply || !hasChanges) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const stamp = now.replace(/[:.]/g, "-");
  const backupDirectory = path.join(root, "backups", "current-reading-data-integrity-repair", stamp);
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backups = [
    [publicWordsPath, path.join(backupDirectory, "words.json")],
    [staticWordsPath, path.join(backupDirectory, "cache-words.json")],
    [baselinePath, path.join(backupDirectory, "master-lexicon-baseline.mjs")],
    [personalReadingPath, path.join(backupDirectory, "personal-reading-words.json")],
    [readingGPath, path.join(backupDirectory, "reading-g-vocab.json")]
  ];
  for (const [source, destination] of backups) fs.copyFileSync(source, destination);

  try {
    atomicWrite(publicWordsPath, masterContent);
    atomicWrite(staticWordsPath, masterContent);
    atomicWrite(baselinePath, baselineContent);
    atomicWrite(personalReadingPath, personalContent);
    atomicWrite(readingGPath, readingGContent);
    if (!fs.readFileSync(publicWordsPath).equals(fs.readFileSync(staticWordsPath))) {
      throw new Error("Authoritative master copies differ after write.");
    }
  } catch (error) {
    atomicWrite(publicWordsPath, publicWordsRaw);
    atomicWrite(staticWordsPath, staticWordsRaw);
    atomicWrite(baselinePath, baselineRaw);
    atomicWrite(personalReadingPath, personalRaw);
    atomicWrite(readingGPath, readingGRaw);
    throw error;
  }

  fs.writeFileSync(
    path.join(backupDirectory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf8"
  );
  console.log(JSON.stringify({
    ...report,
    backupDirectory,
    masterSha256: sha256(masterContent),
    readingGSha256: sha256(readingGContent)
  }, null, 2));
}

main();
