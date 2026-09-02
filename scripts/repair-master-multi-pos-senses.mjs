#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import {
  getMultiPosSenseCoverage,
  normalizePartOfSpeechTokens
} from "../app/lib/vocab/multi-pos-sense-coverage.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";
import { isBrushableWord } from "../app/lib/vocab/word-study-eligibility.mjs";
import { manualMultiPosGlosses } from "./data/main-multi-pos-manual-senses.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const publicPath = path.join(root, "public", "data", "words.json");
const staticPath = path.join(root, ".static-export-cache", "words.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const readingGPath = path.join(root, "public", "data", "reading-g-vocab.json");
const previousVersion = "master-multi-pos-sense-repair-v1-20260811";
const version = "master-multi-pos-sense-repair-v2-20260811";
const source = "master-multi-pos-sense-repair-v2";

const POS_ZH = Object.freeze({
  noun: "名词",
  verb: "动词",
  adjective: "形容词",
  adverb: "副词",
  preposition: "介词",
  conjunction: "连词",
  pronoun: "代词",
  determiner: "限定词",
  article: "冠词",
  interjection: "感叹词",
  auxiliary: "助动词",
  modal: "情态动词",
  numeral: "数词",
  prefix: "前缀",
  suffix: "后缀",
  phrase: "短语"
});

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function text(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function meaningOf(sense = {}) {
  return text(sense.meaningZh || sense.meaning_zh || sense.gloss || sense.meaning || sense.chinese);
}

function definitionOf(sense = {}) {
  return text(sense.definitionEn || sense.definition_en || sense.definition || sense.english_definition);
}

function exampleOf(sense = {}) {
  return text(sense.example || sense.exampleEn || sense.ielts_example);
}

function exampleCnOf(sense = {}) {
  return text(sense.exampleCn || sense.exampleZh || sense.example_chinese || sense.translation);
}

function singlePos(sense = {}) {
  const tokens = normalizePartOfSpeechTokens(sense.pos || sense.posFamily || sense.partOfSpeech || sense.part_of_speech);
  return tokens.length === 1 ? tokens[0] : "";
}

function splitMeaning(value) {
  return text(value).split(/[；;]+/u).map(text).filter(Boolean);
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

function senseId(entry, pos, index) {
  return `${entry.id || entry.wordId}_${pos}_${String(index + 1).padStart(2, "0")}`
    .replace(/[^a-zA-Z0-9_]+/g, "_");
}

function candidateRows(entry, readingGEntry) {
  const rows = [];
  const append = (values, origin) => {
    for (const sense of Array.isArray(values) ? values : []) {
      if (
        origin === "master-senses"
        && Array.isArray(sense?.sourceFiles)
        && sense.sourceFiles.includes("master-multi-pos-sense-repair-v1")
      ) continue;
      const pos = singlePos(sense);
      const meaningZh = meaningOf(sense);
      if (!pos || !meaningZh) continue;
      rows.push({
        pos,
        meaningZh,
        definition: definitionOf(sense),
        example: exampleOf(sense),
        exampleZh: exampleCnOf(sense),
        origin,
        isPrimary: sense?.isPrimary === true || sense?.readingCommon === true,
        sourceFiles: Array.isArray(sense.sourceFiles) ? sense.sourceFiles : []
      });
    }
  };
  append(entry.senses, "master-senses");
  append(entry.otherMeanings, "master-other-meanings");
  append(entry.meaningsZh, "master-meaning-rows");
  const readingPrimaryPos = normalizePartOfSpeechTokens(readingGEntry?.primaryPos || readingGEntry?.pos);
  const readingPrimaryMeaning = text(readingGEntry?.primaryMeaningZh || readingGEntry?.meaningZh || readingGEntry?.meaning);
  if (readingPrimaryPos.length === 1 && readingPrimaryMeaning) {
    rows.push({
      pos: readingPrimaryPos[0],
      meaningZh: readingPrimaryMeaning,
      definition: text(readingGEntry?.definition),
      example: text(readingGEntry?.example),
      exampleZh: text(readingGEntry?.exampleCn || readingGEntry?.exampleZh),
      origin: "reading-g-primary",
      isPrimary: true,
      sourceFiles: Array.isArray(readingGEntry?.sourceFiles) ? readingGEntry.sourceFiles : []
    });
  }
  append(readingGEntry?.senses, "reading-g-senses");
  append(readingGEntry?.otherMeanings, "reading-g-other-meanings");
  return rows;
}

function coreGlosses(entry, declared, candidates) {
  const manual = manualMultiPosGlosses[normalize(entry.word)];
  if (manual) {
    if (manual.length !== declared.length || manual.some((value) => !text(value))) {
      throw new Error(`Manual POS gloss count mismatch: ${entry.word}`);
    }
    return { glosses: manual.map(text), origin: "manual-pos-editorial-review" };
  }

  const parts = splitMeaning(entry.meaning || entry.meaningZh || entry.definition);
  if (parts.length === declared.length) {
    return { glosses: parts, origin: "exact-existing-meaning-split" };
  }

  const glosses = declared.map((pos, index) => {
    if (index === 0) {
      const explicitPrimary = candidates.find((candidate) => candidate.pos === pos && candidate.isPrimary);
      // An unmatched top-level gloss is still safer than promoting a known
      // secondary meaning such as deposit = sediment or stroke = a hit.
      return explicitPrimary?.meaningZh || text(entry.primaryMeaningZh || entry.meaningZh || entry.meaning);
    }
    return candidates.find((candidate) => candidate.pos === pos)?.meaningZh || "";
  });
  if (glosses.every(Boolean)) {
    return { glosses, origin: "local-sense-row-reuse" };
  }

  const missing = declared.filter((_, index) => !glosses[index]);
  throw new Error(`No reliable POS gloss for ${entry.word}: ${missing.join(", ")}`);
}

function buildSenses(entry, readingGEntry) {
  const coverage = getMultiPosSenseCoverage(entry);
  const declared = coverage.declaredPosTokens;
  const candidates = candidateRows(entry, readingGEntry);
  const { glosses, origin } = coreGlosses(entry, declared, candidates);
  const used = new Set();
  const senses = declared.map((pos, index) => {
    const gloss = glosses[index];
    const matching = candidates.find((candidate, candidateIndex) => {
      if (used.has(candidateIndex) || candidate.pos !== pos) return false;
      return normalize(candidate.meaningZh) === normalize(gloss);
    }) || candidates.find((candidate, candidateIndex) => !used.has(candidateIndex) && candidate.pos === pos);
    const matchingIndex = matching ? candidates.indexOf(matching) : -1;
    if (matchingIndex >= 0) used.add(matchingIndex);
    const primary = index === 0;
    return {
      senseId: senseId(entry, pos, index),
      pos,
      meaningZh: gloss,
      definition: matching?.definition || (primary
        ? text(entry.definition || entry.meaning)
        : `作${POS_ZH[pos] || pos}时表示“${gloss}”。`),
      example: primary ? text(entry.example) : (matching?.example || ""),
      exampleZh: primary ? text(entry.exampleCn || entry.exampleZh) : (matching?.exampleZh || ""),
      ...(primary ? { isPrimary: true, readingCommon: true } : {}),
      sourceFiles: [...new Set([...(matching?.sourceFiles || []), source])],
      editorialSource: primary ? origin : (matching?.origin || origin)
    };
  });

  for (const [candidateIndex, candidate] of candidates.entries()) {
    if (used.has(candidateIndex)) continue;
    const duplicate = senses.some((sense) => (
      sense.pos === candidate.pos && normalize(sense.meaningZh) === normalize(candidate.meaningZh)
    ));
    if (duplicate) continue;
    senses.push({
      senseId: senseId(entry, candidate.pos, senses.length),
      pos: candidate.pos,
      meaningZh: candidate.meaningZh,
      definition: candidate.definition || `作${POS_ZH[candidate.pos] || candidate.pos}时表示“${candidate.meaningZh}”。`,
      example: candidate.example,
      exampleZh: candidate.exampleZh,
      sourceFiles: [...new Set([...(candidate.sourceFiles || []), source])],
      editorialSource: candidate.origin
    });
  }

  return { senses, primaryPos: declared[0], primaryMeaningZh: glosses[0], origin };
}

function main() {
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master lexicon files differ; repair stopped.");
  const payload = JSON.parse(publicRaw.toString("utf8"));
  const readingG = JSON.parse(fs.readFileSync(readingGPath, "utf8"));
  if (!Array.isArray(payload.words) || payload.words.length !== Number(payload.count)) {
    throw new Error("Master lexicon words/count mismatch; repair stopped.");
  }
  const readingGByKey = new Map((readingG.items || []).map((entry) => [normalize(entry.word), entry]));
  const repairedAt = new Date().toISOString();
  const provenance = new Map();
  const repaired = [];
  const beforeState = payload.words.map((entry) => JSON.stringify(stateSnapshot(entry)));

  const nextWords = payload.words.map((entry, index) => {
    if (!isBrushableWord(entry)) return entry;
    const coverage = getMultiPosSenseCoverage(entry);
    const needsRefresh = entry?.multiPosSenseReview?.version === previousVersion;
    if (!coverage.isMultiPos || (coverage.complete && !needsRefresh)) return entry;
    const built = buildSenses(entry, readingGByKey.get(normalize(entry.word)));
    provenance.set(built.origin, (provenance.get(built.origin) || 0) + 1);
    const next = {
      ...entry,
      declaredPos: entry.declaredPos || entry.pos,
      primaryPos: built.primaryPos,
      primaryMeaningZh: built.primaryMeaningZh,
      senses: built.senses,
      multiPosSenseReview: {
        version,
        reviewedAt: repairedAt,
        primaryPolicy: "first declared common POS; reading-context preference is not used in the master lexicon",
        origin: built.origin
      },
      updatedAt: repairedAt
    };
    const after = getMultiPosSenseCoverage(next);
    if (!after.complete) throw new Error(`Multi-POS repair incomplete: ${entry.word}`);
    if ((entry.id || entry.wordId) !== (next.id || next.wordId)) throw new Error(`Stable id changed: ${entry.word}`);
    if (beforeState[index] !== JSON.stringify(stateSnapshot(next))) throw new Error(`User state changed: ${entry.word}`);
    repaired.push({ id: entry.id || entry.wordId, word: entry.word, primaryPos: built.primaryPos, origin: built.origin, senseCount: built.senses.length });
    return next;
  });

  const remaining = nextWords.filter((entry) => {
    if (!isBrushableWord(entry)) return false;
    const coverage = getMultiPosSenseCoverage(entry);
    return coverage.isMultiPos && !coverage.complete;
  });
  if (remaining.length) throw new Error(`Remaining incomplete multi-POS entries: ${remaining.slice(0, 10).map((entry) => entry.word).join(", ")}`);
  if (nextWords.length !== payload.words.length) throw new Error("Word count changed during multi-POS repair.");

  const nextPayload = {
    ...payload,
    multiPosSenseRepair: {
      version,
      repairedAt,
      repairedCount: repaired.length,
      remainingCount: 0,
      provenance: Object.fromEntries([...provenance.entries()].sort())
    },
    words: nextWords,
    count: nextWords.length,
    savedAt: repairedAt,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords)
  };
  const content = `${JSON.stringify(nextPayload, null, 2)}\n`;
  const fileHash = crypto.createHash("sha256").update(content).digest("hex");
  const baselineContent = renderMasterLexiconBaseline({ count: nextPayload.count, version: nextPayload.version, fileHash });
  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version,
    repairedCount: repaired.length,
    remainingCount: 0,
    provenance: Object.fromEntries([...provenance.entries()].sort()),
    stableIdChanges: 0,
    userStateChanges: 0,
    paidAiCalls: 0,
    preview: repaired.slice(0, 50)
  };
  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const stamp = repairedAt.replace(/[:.]/g, "-");
  const backupDirectory = path.join(root, "backups", "master-multi-pos-sense-repair", stamp);
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
    if (!fs.readFileSync(publicPath).equals(fs.readFileSync(staticPath))) throw new Error("Authoritative copies differ after write.");
  } catch (error) {
    for (const [destination, sourcePath] of backups) fs.copyFileSync(sourcePath, destination);
    throw error;
  }
  fs.writeFileSync(path.join(backupDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, backupDirectory, sha256: fileHash }, null, 2));
}

main();
