#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";
import { getWordFamilyStatus } from "../app/lib/vocab/word-quality-status.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const publicPath = path.join(root, "public", "data", "words.json");
const staticPath = path.join(root, ".static-export-cache", "words.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const version = "master-word-family-structure-repair-v1-20260811";

const INVALID_RELATIONS = new Set([
  "reclassified-safe-family",
  "reclassified-grammatical-form",
  "excel-source-headword"
]);

const EXCEL_RELATION_OVERRIDES = new Map([
  ["provide::provision", "noun-form"],
  ["produce::production", "noun-form"],
  ["programme::program", "related-to"],
  ["breathing::breath", "related-to"]
]);

function text(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function key(value) {
  return text(value).toLowerCase();
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

function relationWord(item) {
  return text(typeof item === "string" ? item : item?.word);
}

function relationForPartOfSpeech(item = {}) {
  const raw = `${text(item.pos)} ${text(item.type)}`.toLowerCase();
  if (/\b(?:adverb|adv\.)\b/.test(raw)) return "adverb-form";
  if (/\b(?:adjective|adj\.)\b/.test(raw)) return "adjective-form";
  if (/\b(?:noun|n\.)\b/.test(raw)) return "noun-form";
  if (/\b(?:verb|v\.)\b/.test(raw)) return "verb-form";
  return "related-to";
}

function isGrammaticalForm(owner = {}, item = {}, duplicateInForms = false) {
  if (duplicateInForms) return true;
  const type = text(item.type).toLowerCase();
  const ownerPos = text(owner.pos).toLowerCase();
  if (/plural|third[- ]person|comparative|superlative|spelling variant/.test(type)) return true;
  if (/\bform\b/.test(type) && !/adverbial/.test(type)) return true;
  if (/past|participle|gerund|present tense/.test(type) && /\bverb\b/.test(ownerPos)) return true;
  return false;
}

function mergeIntoForm(existing, familyItem) {
  const merged = {
    ...(familyItem && typeof familyItem === "object" ? familyItem : { word: relationWord(familyItem) }),
    ...(existing && typeof existing === "object" ? existing : { word: relationWord(existing) })
  };
  for (const field of ["meaning", "meaningZh", "pos", "phonetic", "id", "entryId"]) {
    if (!text(merged[field]) && text(familyItem?.[field])) merged[field] = familyItem[field];
  }
  if (INVALID_RELATIONS.has(text(merged.relation))) delete merged.relation;
  if (INVALID_RELATIONS.has(text(merged.relationOriginal))) delete merged.relationOriginal;
  return merged;
}

function normalizeInvalidFamilyItem(owner, item, formIndexByKey) {
  const rawRelation = text(item?.relation);
  const itemKey = key(relationWord(item));
  const existingFormIndex = formIndexByKey.get(itemKey);
  const duplicateInForms = existingFormIndex !== undefined;

  if (rawRelation === "reclassified-safe-family") {
    if (isGrammaticalForm(owner, item, duplicateInForms)) {
      return { action: "move-to-forms", existingFormIndex };
    }
    return {
      action: "normalize-family",
      item: {
        ...item,
        relation: relationForPartOfSpeech(item),
        relationOriginal: rawRelation
      }
    };
  }

  if (rawRelation === "reclassified-grammatical-form") {
    return {
      action: "normalize-family",
      item: {
        ...item,
        relation: relationForPartOfSpeech(item),
        relationOriginal: rawRelation
      }
    };
  }

  const relation = EXCEL_RELATION_OVERRIDES.get(`${key(owner.word)}::${itemKey}`) || "base-word";
  return {
    action: "normalize-family",
    item: {
      ...item,
      relation,
      relationOriginal: rawRelation
    }
  };
}

function repairEntry(entry) {
  if (!Array.isArray(entry.wordFamily) || !entry.wordFamily.length) {
    return { entry, changes: [] };
  }

  const forms = Array.isArray(entry.forms) ? entry.forms.map((item) => structuredClone(item)) : [];
  const formIndexByKey = new Map();
  forms.forEach((item, index) => {
    const itemKey = key(relationWord(item));
    if (itemKey && !formIndexByKey.has(itemKey)) formIndexByKey.set(itemKey, index);
  });
  const wordFamily = [];
  const changes = [];

  for (const familyItem of entry.wordFamily) {
    if (!familyItem || typeof familyItem !== "object" || !INVALID_RELATIONS.has(text(familyItem.relation))) {
      wordFamily.push(familyItem);
      continue;
    }

    const result = normalizeInvalidFamilyItem(entry, familyItem, formIndexByKey);
    const target = relationWord(familyItem);
    if (result.action === "move-to-forms") {
      if (result.existingFormIndex === undefined) {
        const merged = mergeIntoForm(null, familyItem);
        forms.push(merged);
        formIndexByKey.set(key(target), forms.length - 1);
        changes.push({ target, action: "moved-to-forms" });
      } else {
        forms[result.existingFormIndex] = mergeIntoForm(forms[result.existingFormIndex], familyItem);
        changes.push({ target, action: "merged-into-existing-form" });
      }
      continue;
    }

    wordFamily.push(result.item);
    changes.push({ target, action: "normalized-family-relation", relation: result.item.relation });
  }

  if (!changes.length) return { entry, changes };
  return {
    entry: {
      ...entry,
      forms,
      wordFamily,
      wordFamilyStructureReview: {
        version,
        reviewedAt: new Date().toISOString(),
        result: "normalized"
      }
    },
    changes
  };
}

function main() {
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) {
    throw new Error("The two authoritative master lexicon files differ; repair stopped.");
  }
  const payload = JSON.parse(publicRaw.toString("utf8"));
  if (!Array.isArray(payload.words) || payload.words.length !== Number(payload.count)) {
    throw new Error("Master lexicon words/count mismatch; repair stopped.");
  }

  const beforeIds = payload.words.map((entry) => text(entry.id || entry.wordId));
  const beforeHeadwords = payload.words.map((entry) => text(entry.word));
  const beforeStates = payload.words.map((entry) => JSON.stringify(stateSnapshot(entry)));
  const changes = [];
  const nextWords = payload.words.map((entry, index) => {
    const repaired = repairEntry(entry);
    if (repaired.changes.length) {
      changes.push({ id: entry.id || entry.wordId, word: entry.word, actions: repaired.changes });
    }
    if (beforeStates[index] !== JSON.stringify(stateSnapshot(repaired.entry))) {
      throw new Error(`User state changed: ${entry.word}`);
    }
    return repaired.entry;
  });

  const afterIds = nextWords.map((entry) => text(entry.id || entry.wordId));
  const afterHeadwords = nextWords.map((entry) => text(entry.word));
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) throw new Error("Stable IDs changed during repair.");
  if (JSON.stringify(beforeHeadwords) !== JSON.stringify(afterHeadwords)) throw new Error("Headwords changed during repair.");

  const knownHeadwords = new Set(nextWords.map((entry) => key(entry.word)).filter(Boolean));
  const remaining = nextWords.flatMap((entry) => {
    const status = getWordFamilyStatus(entry, { knownHeadwords });
    return status.needsFamilyReview ? [{ word: entry.word, items: status.familyReviewItems }] : [];
  });
  if (remaining.length) {
    throw new Error(`Word-family structure remains invalid: ${remaining.slice(0, 10).map((item) => item.word).join(", ")}`);
  }

  const repairedAt = new Date().toISOString();
  const actionCounts = {};
  for (const change of changes) {
    for (const action of change.actions) {
      actionCounts[action.action] = (actionCounts[action.action] || 0) + 1;
    }
  }
  const nextPayload = {
    ...payload,
    wordFamilyStructureRepair: {
      version,
      repairedAt,
      repairedEntries: changes.length,
      repairedRelations: changes.reduce((sum, change) => sum + change.actions.length, 0),
      remaining: 0,
      actionCounts
    },
    words: nextWords,
    count: nextWords.length,
    savedAt: repairedAt,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords)
  };
  const content = `${JSON.stringify(nextPayload, null, 2)}\n`;
  const fileHash = crypto.createHash("sha256").update(content).digest("hex");
  const baselineContent = renderMasterLexiconBaseline({
    count: nextPayload.count,
    version: nextPayload.version,
    fileHash
  });
  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version,
    repairedEntries: changes.length,
    repairedRelations: changes.reduce((sum, change) => sum + change.actions.length, 0),
    remaining: 0,
    actionCounts,
    stableIdChanges: 0,
    headwordChanges: 0,
    userStateChanges: 0,
    paidAiCalls: 0,
    preview: changes.slice(0, 40)
  };

  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const stamp = repairedAt.replace(/[:.]/g, "-");
  const backupDirectory = path.join(root, "backups", "master-word-family-structure-repair", stamp);
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backups = [
    [publicPath, path.join(backupDirectory, "words.json")],
    [staticPath, path.join(backupDirectory, "cache-words.json")],
    [baselinePath, path.join(backupDirectory, "master-lexicon-baseline.mjs")]
  ];
  for (const [sourcePath, backupPath] of backups) fs.copyFileSync(sourcePath, backupPath);
  try {
    atomicWrite(publicPath, content);
    atomicWrite(staticPath, content);
    atomicWrite(baselinePath, baselineContent);
    if (!fs.readFileSync(publicPath).equals(fs.readFileSync(staticPath))) {
      throw new Error("Authoritative copies differ after write.");
    }
  } catch (error) {
    for (const [destinationPath, backupPath] of backups) fs.copyFileSync(backupPath, destinationPath);
    throw error;
  }
  fs.writeFileSync(path.join(backupDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, backupDirectory, sha256: fileHash }, null, 2));
}

main();
