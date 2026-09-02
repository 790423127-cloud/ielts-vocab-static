#!/usr/bin/env node

/**
 * Resolve the final optional-enrichment thin entries without filler:
 * explicit proper names receive semantic classification, while ordinary
 * words receive reviewed collocations and phrase patterns.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !shouldApply;
const now = new Date().toISOString();
const masterPublicPath = path.join(root, "public", "data", "words.json");
const masterStaticPath = path.join(root, ".static-export-cache", "words.json");
const personalPath = path.join(root, "public", "data", "personal-reading-words.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");

const patches = Object.freeze({
  suspense: {
    collocations: [{ phrase: "build suspense", chinese: "营造悬念" }],
    phraseCollocations: [{ phrase: "keep someone in suspense", chinese: "让某人悬着心等待" }]
  },
  forties: {
    collocations: [{ phrase: "in one's forties", chinese: "在某人四十多岁时" }],
    phraseCollocations: [{ phrase: "the early forties", chinese: "四十年代初；四十岁出头" }]
  },
  marshalled: {
    collocations: [{ phrase: "marshalled resources", chinese: "调集资源" }],
    phraseCollocations: [{ phrase: "marshalled evidence in support of a claim", chinese: "整理证据以支持某项主张" }]
  },
  eudimorphodon: { properNameType: "scientific-taxon" },
  pterosaurs: {
    collocations: [{ phrase: "flying pterosaurs", chinese: "飞行中的翼龙" }],
    phraseCollocations: [{ phrase: "pterosaurs of the Jurassic period", chinese: "侏罗纪时期的翼龙" }]
  },
  tenses: {
    collocations: [{ phrase: "verb tenses", chinese: "动词时态" }],
    phraseCollocations: [{ phrase: "use the correct tense", chinese: "使用正确的时态" }]
  },
  syringing: {
    collocations: [{ phrase: "ear syringing", chinese: "耳道冲洗" }],
    phraseCollocations: [{ phrase: "syringing the ear with warm water", chinese: "用温水冲洗耳道" }]
  },
  nominated: {
    collocations: [{ phrase: "nominated candidate", chinese: "获提名的候选人" }],
    phraseCollocations: [{ phrase: "be nominated for an award", chinese: "获奖项提名" }]
  },
  "nominated beneficiary": {
    collocations: [{ phrase: "name a nominated beneficiary", chinese: "指定一名受益人" }],
    phraseCollocations: [{ phrase: "change the nominated beneficiary", chinese: "更改指定受益人" }]
  },
  "continent's": {
    collocations: [{ phrase: "continent's economy", chinese: "该大陆的经济" }],
    phraseCollocations: [{ phrase: "across the continent's interior", chinese: "横跨该大陆内陆" }]
  },
  exhibited: {
    collocations: [{ phrase: "exhibited artwork", chinese: "展出的艺术品" }],
    phraseCollocations: [{ phrase: "be exhibited at a museum", chinese: "在博物馆展出" }]
  },
  rucksacks: {
    collocations: [{ phrase: "heavy rucksacks", chinese: "沉重的背包" }],
    phraseCollocations: [{ phrase: "carry a rucksack", chinese: "背着一个背包" }]
  },
  polycarbonate: {
    collocations: [{ phrase: "polycarbonate sheet", chinese: "聚碳酸酯板材" }],
    phraseCollocations: [{ phrase: "made from durable polycarbonate", chinese: "由耐用的聚碳酸酯制成" }]
  },
  investing: {
    collocations: [{ phrase: "long-term investing", chinese: "长期投资" }],
    phraseCollocations: [{ phrase: "investing in stocks", chinese: "投资股票" }]
  },
  withney: { properNameType: "place-name" },
  poppi: { properNameType: "brand-name" }
});

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function protectedSnapshot(entry = {}) {
  const snapshot = { id: entry.id, wordId: entry.wordId, word: entry.word };
  for (const field of USER_STATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) snapshot[field] = entry[field];
  }
  return snapshot;
}

function keyOf(value) {
  return String(value || "").normalize("NFC").trim().toLowerCase();
}

function applyPatch(entry, patch) {
  const next = {
    ...entry,
    ...(patch.properNameType ? { properNameType: patch.properNameType } : {}),
    ...(patch.collocations ? { collocations: patch.collocations } : {}),
    ...(patch.phraseCollocations ? { phraseCollocations: patch.phraseCollocations } : {}),
    enrichmentReviewSource: "manual-natural-collocation-review",
    enrichmentReviewedAt: now,
    updatedAt: now
  };
  if (JSON.stringify(protectedSnapshot(entry)) !== JSON.stringify(protectedSnapshot(next))) {
    throw new Error(`Protected identity or learning state changed: ${entry.word}`);
  }
  return next;
}

function rewritePersonalTree(value, counts) {
  if (Array.isArray(value)) return value.map((item) => rewritePersonalTree(item, counts));
  if (!value || typeof value !== "object") return value;
  const patch = patches[keyOf(value.word)];
  let next = patch ? applyPatch(value, patch) : { ...value };
  if (patch) counts.personal += 1;
  for (const [key, child] of Object.entries(next)) {
    if (child && typeof child === "object") next[key] = rewritePersonalTree(child, counts);
  }
  return next;
}

function main() {
  if (shouldApply && dryRun) throw new Error("--apply and --dry-run cannot be used together");
  const publicRaw = fs.readFileSync(masterPublicPath);
  const staticRaw = fs.readFileSync(masterStaticPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master lexicon files differ; write stopped.");
  const master = JSON.parse(publicRaw.toString("utf8"));
  const personal = JSON.parse(fs.readFileSync(personalPath, "utf8"));
  const counts = { master: 0, personal: 0 };
  const seen = new Set();
  const nextWords = master.words.map((entry) => {
    const key = keyOf(entry.word);
    const patch = patches[key];
    if (!patch) return entry;
    if (seen.has(key)) throw new Error(`Duplicate master enrichment target: ${entry.word}`);
    seen.add(key);
    counts.master += 1;
    return applyPatch(entry, patch);
  });
  const missing = Object.keys(patches).filter((key) => !seen.has(key));
  if (missing.length) throw new Error(`Missing master enrichment targets: ${missing.join(", ")}`);
  const nextPersonal = rewritePersonalTree(personal, counts);
  if (counts.personal < counts.master) throw new Error("Expected personal-reading occurrences for every enrichment target.");

  const nextMaster = {
    ...master,
    words: nextWords,
    count: nextWords.length,
    savedAt: now,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords)
  };
  const masterContent = `${JSON.stringify(nextMaster, null, 2)}\n`;
  const personalContent = `${JSON.stringify(nextPersonal, null, 2)}\n`;
  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    networkCalls: 0,
    paidAiCalls: 0,
    masterEntriesReviewed: counts.master,
    personalOccurrencesReviewed: counts.personal,
    properNamesClassified: Object.values(patches).filter((patch) => patch.properNameType).length,
    naturalCollocationEntries: Object.values(patches).filter((patch) => patch.collocations).length,
    stableIdsChanged: 0,
    userStateFieldsChanged: 0
  };
  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const stamp = now.replace(/[:.]/g, "-");
  const backupDirectory = path.join(root, "backups", "master-thin-enrichment-repair", stamp);
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backups = [
    [masterPublicPath, path.join(backupDirectory, "words.json")],
    [masterStaticPath, path.join(backupDirectory, "cache-words.json")],
    [personalPath, path.join(backupDirectory, "personal-reading-words.json")],
    [baselinePath, path.join(backupDirectory, "master-lexicon-baseline.mjs")]
  ];
  for (const [source, destination] of backups) fs.copyFileSync(source, destination);
  const baselineContent = renderMasterLexiconBaseline({
    count: nextMaster.count,
    version: nextMaster.version,
    fileHash: sha256(masterContent)
  });
  try {
    atomicWrite(masterPublicPath, masterContent);
    atomicWrite(masterStaticPath, masterContent);
    atomicWrite(personalPath, personalContent);
    atomicWrite(baselinePath, baselineContent);
  } catch (error) {
    for (const [destination, source] of backups) fs.copyFileSync(source, destination);
    throw error;
  }
  report.backupDirectory = path.relative(root, backupDirectory).replaceAll("\\", "/");
  console.log(JSON.stringify(report, null, 2));
}

main();
