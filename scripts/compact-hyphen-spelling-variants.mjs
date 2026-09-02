#!/usr/bin/env node

/**
 * Keep only the hyphenated spelling when a flashcard lexicon has
 * closed-compound / spaced duplicates of the same word.
 *
 * Main lexicon: convert the closed form to a reversible reference alias
 * (same pattern as checkin -> check-in).
 * G-reading: compact the closed word into the hyphenated card, and fold
 * same-meaning spaced phrases into that card as progress aliases.
 *
 * Semantically different pairs (everyday / every day, check out / checkout,
 * overtime / over time, etc.) are left untouched.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyReadingGCompaction } from "../app/lib/reading-g-vocab/compaction.mjs";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";
import { getReadingGRetirementKey } from "../app/lib/reading-g-vocab/retirements.mjs";
import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";
import {
  isBrushableWord,
  isReferenceWord
} from "../app/lib/vocab/word-study-eligibility.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shouldApply = process.argv.includes("--apply");
const VERSION = "hyphen-spelling-variant-keep-hyphen-v1-20260818";

const PUBLIC_WORDS = path.join(root, "public", "data", "words.json");
const CACHE_WORDS = path.join(root, ".static-export-cache", "words.json");
const BASELINE = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const MEANING = path.join(root, "public", "data", "meaning-6000.json");
const RG_VOCAB = path.join(root, "public", "data", "reading-g-vocab.json");
const RG_COMPACTION = path.join(root, "public", "data", "reading-g-word-family-compaction.json");
const RG_REPORT = path.join(root, "public", "data", "reading-g-import-report.json");
const RG_RETIREMENTS = path.join(root, "public", "data", "reading-g-retirements.json");

const MAIN_PAIRS = [
  ["audio-visual", "audiovisual"],
  ["build-up", "buildup"],
  ["check-up", "checkup"],
  ["co-operate", "cooperate"],
  ["co-operative", "cooperative"],
  ["co-ordinator", "coordinator"],
  ["co-worker", "coworker"],
  ["drop-off", "dropoff"],
  ["duty-free", "dutyfree"],
  ["e-mail", "email"],
  ["en-suite", "ensuite"],
  ["follow-up", "followup"],
  ["life-cycle", "lifecycle"],
  ["line-up", "lineup"],
  ["make-up", "makeup"],
  ["multi-storey", "multistorey"],
  ["non-profit", "nonprofit"],
  ["non-refundable", "nonrefundable"],
  ["on-going", "ongoing"],
  ["on-line", "online"],
  ["on-site", "onsite"],
  ["part-time", "parttime"],
  ["pick-up", "pickup"],
  ["post-graduate", "postgraduate"],
  ["south-east", "southeast"],
  ["south-west", "southwest"],
  ["touch-screen", "touchscreen"],
  ["well-being", "wellbeing"]
];

const RG_WORD_PAIRS = [
  ["audio-visual", "audiovisual"],
  ["e-mail", "email"],
  ["en-suite", "ensuite"],
  ["life-cycle", "lifecycle"],
  ["make-up", "makeup"],
  ["on-going", "ongoing"],
  ["on-site", "onsite"],
  ["post-graduate", "postgraduate"],
  ["touch-screen", "touchscreen"],
  ["well-being", "wellbeing"]
];

const RG_PHRASE_PAIRS = [
  ["sixth-form", "sixth form"],
  ["on-site", "on site"]
];

const RG_SKIPPED = [
  { pair: "check out / checkout", reason: "动词短语「退房/查看」和名词「结账处」不是同一词" },
  { pair: "drop off / drop-off", reason: "动词短语「放下」和名词「急剧下降」不是同一词" },
  { pair: "every day / everyday", reason: "副词短语「每天」和形容词「日常的」不是同一词" },
  { pair: "live in / live-in", reason: "动词短语「住在」和形容词「住家的」不是同一词" },
  { pair: "over time / overtime", reason: "介词短语「随着时间」和名词「加班」不是同一词" },
  { pair: "pick up / pick-up", reason: "动词短语「领取/接人」和名词「皮卡」不是同一词" },
  { pair: "work out / workout", reason: "动词短语「算出/解决」和名词「锻炼」不是同一词" },
  { pair: "break down / breakdown", reason: "动词短语和名词不是同一词" },
  { pair: "start up / startup", reason: "动词短语「启动」和名词「初创企业」不是同一词" },
  { pair: "take away / takeaway", reason: "动词短语「拿走」和名词「外卖」不是同一词" },
  { pair: "straight away / straightaway", reason: "没有连字符写法，且词组与单词分属不同学习卡" }
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function normalizeHeadword(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueText(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function stateSnapshot(entry = {}) {
  return Object.fromEntries(
    USER_STATE_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(entry, field))
      .map((field) => [field, entry[field]])
  );
}

function relationWord(value) {
  return typeof value === "string"
    ? String(value).trim()
    : String(value?.word || value?.form || "").trim();
}

function hasSurface(list, word) {
  const key = normalizeHeadword(word);
  return (Array.isArray(list) ? list : []).some((row) => normalizeHeadword(relationWord(row)) === key);
}

function convertMainAlias(source, target, repairedAt) {
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
    relationType: "nonstandard duplicate spelling",
    canonicalWord: target.word,
    canonicalWordId: target.id,
    referenceReason: "nonstandard-spelling-duplicate-of-valid-headword",
    phonetic: source.phonetic || "",
    pos: "reference",
    meaning: `参见 ${target.word}（${String(target.meaning || "").split("；")[0] || "连字符规范写法"}）`,
    definition: `参见 ${target.word}（${String(target.meaning || "").split("；")[0] || "连字符规范写法"}）`,
    meaningDetailZh:
      `${source.word} 是缺少连字符的重复学习词头，规范写法为 ${target.word}。` +
      "本记录保留原 ID 作为可回退的参考别名，并跳转到连字符版本，不再重复进入刷词队列。",
    meaningDetailSource: "hyphen-spelling-variant-repair",
    example: target.example || source.example || "",
    exampleCn: target.exampleCn || source.exampleCn || "",
    exampleStatus: "editorial_reference_example",
    collocations: [],
    phraseCollocations: [],
    forms: [],
    wordFamily: [],
    answer: target.word,
    acceptedAnswers: [target.word],
    difficulty: "不进入学习",
    category: "参考别名 · 非规范重复词头",
    ieltsUse: [],
    topics: ["非规范词头修复", "参考别名"],
    readingPriority: false,
    entryStatus: "canonical_reference_only",
    structuralRepair: { version: VERSION, repairedAt, action: "retained-as-reference-alias" },
    qualityFlags: [...new Set([
      ...(Array.isArray(source.qualityFlags) ? source.qualityFlags : []),
      "nonstandard_duplicate_headword_retired",
      "canonical_reference_retained"
    ])],
    updatedAt: repairedAt
  };
  if ("meaningZh" in nextSource) nextSource.meaningZh = nextSource.meaning;
  if (JSON.stringify(stateSnapshot(nextSource)) !== sourceState) {
    throw new Error(`User state changed while converting ${source.word}`);
  }
  return nextSource;
}

function attachMainLegacy(target, sourceWord) {
  const next = { ...target };
  const legacy = uniqueText([...(Array.isArray(target.legacyHeadwords) ? target.legacyHeadwords : []), sourceWord]);
  next.legacyHeadwords = legacy;
  const forms = Array.isArray(target.forms) ? [...target.forms] : [];
  if (!hasSurface(forms, sourceWord)) {
    forms.push({ word: sourceWord, type: "spelling variant" });
  }
  next.forms = forms;
  next.updatedAt = next.updatedAt || undefined;
  return next;
}

function attachReadingGAlias(canonical, alias, relationType = "form") {
  const key = normalizeReadingGKey(alias.word);
  const forms = Array.isArray(canonical.forms) ? [...canonical.forms] : [];
  if (!hasSurface(forms, alias.word)) {
    forms.push({
      word: alias.word,
      type: "spelling variant",
      entryId: alias.id,
      relation: "merged-independent-entry"
    });
  }
  const mergedAliases = Array.isArray(canonical.mergedAliases) ? [...canonical.mergedAliases] : [];
  if (!mergedAliases.some((row) => normalizeReadingGKey(row.key || row.word) === key)) {
    mergedAliases.push({
      key,
      id: alias.id,
      word: alias.word,
      relationType
    });
  }
  const mergedEntries = Array.isArray(canonical.mergedEntries) ? [...canonical.mergedEntries] : [];
  if (!mergedEntries.some((row) => normalizeReadingGKey(row.key || row.word) === key)) {
    mergedEntries.push({
      key,
      id: alias.id,
      word: alias.word,
      relationType
    });
  }
  return {
    ...canonical,
    forms,
    mergedAliases,
    mergedEntries,
    layers: uniqueText([
      ...(Array.isArray(canonical.layers) ? canonical.layers : []),
      ...(Array.isArray(alias.layers) ? alias.layers : [])
    ]),
    topics: uniqueText([
      ...(Array.isArray(canonical.topics) ? canonical.topics : []),
      ...(Array.isArray(alias.topics) ? alias.topics : [])
    ]),
    sourceFiles: uniqueText([
      ...(Array.isArray(canonical.sourceFiles) ? canonical.sourceFiles : []),
      ...(Array.isArray(alias.sourceFiles) ? alias.sourceFiles : [])
    ])
  };
}

function recountReadingG(vocab, items, repairedAt, extra = {}) {
  return {
    ...vocab,
    items,
    count: items.length,
    wordCount: items.filter((entry) => (entry.entryType || "word") !== "phrase").length,
    phraseCount: items.filter((entry) => entry.entryType === "phrase").length,
    activeCount: items.filter((entry) => entry.studyMode !== "reference").length,
    referenceCount: items.filter((entry) => entry.studyMode === "reference").length,
    updatedAt: repairedAt,
    hyphenSpellingCompaction: extra
  };
}

function appendCompactionRules(payload, candidates) {
  const next = structuredClone(payload);
  next.rules = Array.isArray(next.rules) ? next.rules : [];
  const aliasOwners = new Map();
  for (const rule of next.rules) {
    const canonicalKey = normalizeReadingGKey(rule.canonicalKey || rule.canonicalWord);
    for (const alias of rule.aliases || []) {
      aliasOwners.set(normalizeReadingGKey(alias.key || alias.word), canonicalKey);
    }
  }

  const added = [];
  for (const candidate of candidates) {
    const previousOwner = aliasOwners.get(candidate.aliasKey);
    if (previousOwner && previousOwner !== candidate.canonicalKey) {
      throw new Error(`Alias already belongs to another headword: ${candidate.aliasKey} -> ${previousOwner}`);
    }
    if (previousOwner === candidate.canonicalKey) continue;

    let rule = next.rules.find((entry) => (
      normalizeReadingGKey(entry.canonicalKey || entry.canonicalWord) === candidate.canonicalKey
    ));
    if (!rule) {
      rule = {
        canonicalKey: candidate.canonicalKey,
        canonicalId: candidate.canonicalId,
        canonicalWord: candidate.canonicalWord,
        aliases: []
      };
      next.rules.push(rule);
    }
    rule.aliases = Array.isArray(rule.aliases) ? rule.aliases : [];
    rule.aliases.push({
      key: candidate.aliasKey,
      id: candidate.aliasId,
      word: candidate.aliasWord,
      relationType: "form"
    });
    aliasOwners.set(candidate.aliasKey, candidate.canonicalKey);
    added.push(candidate);
  }

  next.rules.sort((left, right) => (
    normalizeReadingGKey(left.canonicalKey || left.canonicalWord)
      .localeCompare(normalizeReadingGKey(right.canonicalKey || right.canonicalWord))
  ));
  return { payload: next, added };
}

function repairMainLexicon(payload, repairedAt) {
  const byKey = new Map(payload.words.map((entry, index) => [normalizeHeadword(entry.word), { entry, index }]));
  const nextWords = payload.words.slice();
  const mappings = [];

  for (const [keepWord, dropWord] of MAIN_PAIRS) {
    const keep = byKey.get(normalizeHeadword(keepWord));
    const drop = byKey.get(normalizeHeadword(dropWord));
    if (!keep || !drop) {
      throw new Error(`Missing main-lexicon pair ${dropWord} -> ${keepWord}`);
    }
    if (isReferenceWord(keep.entry)) {
      throw new Error(`Hyphen keeper is already a reference: ${keepWord}`);
    }
    if (isReferenceWord(drop.entry)) continue;

    nextWords[keep.index] = attachMainLegacy(keep.entry, drop.entry.word);
    nextWords[drop.index] = convertMainAlias(drop.entry, nextWords[keep.index], repairedAt);
    keep.entry = nextWords[keep.index];
    drop.entry = nextWords[drop.index];
    mappings.push({
      from: drop.entry.word,
      fromId: drop.entry.id,
      to: keep.entry.word,
      toId: keep.entry.id
    });
  }

  const refs = nextWords.filter(isReferenceWord);
  const brushable = nextWords.filter(isBrushableWord);
  if (refs.length + brushable.length !== nextWords.length) {
    throw new Error("Main lexicon no longer partitions into references and brushable cards");
  }
  for (const mapping of mappings) {
    const source = nextWords.find((entry) => entry.id === mapping.fromId);
    const target = nextWords.find((entry) => entry.id === mapping.toId);
    if (!isReferenceWord(source) || isBrushableWord(source)) {
      throw new Error(`${mapping.from} is still brushable`);
    }
    if (!isBrushableWord(target)) throw new Error(`${mapping.to} is not brushable`);
    if (source.baseWordId !== target.id) throw new Error(`${mapping.from} does not point at ${mapping.to}`);
  }

  const nextPayload = {
    ...payload,
    words: nextWords,
    count: nextWords.length,
    savedAt: repairedAt,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords),
    morphologyAudit: {
      ...payload.morphologyAudit,
      inflectedReferences: refs.length,
      brushableHeadwords: brushable.length,
      storedFormLinksReviewed: nextWords.reduce((sum, entry) => sum + (entry.forms || []).length, 0),
      hyphenSpellingVariantRepair: VERSION,
      hyphenSpellingVariantRepairAt: repairedAt,
      hyphenSpellingVariantRepairs: mappings.length
    }
  };
  return { payload: nextPayload, mappings, refs: refs.length, brushable: brushable.length };
}

function repairReadingG(vocab, compaction, report, retirements, repairedAt) {
  const byKey = new Map(vocab.items.map((entry) => [normalizeReadingGKey(entry.word), entry]));
  const wordCandidates = [];
  for (const [keepWord, dropWord] of RG_WORD_PAIRS) {
    const keep = byKey.get(normalizeReadingGKey(keepWord));
    const drop = byKey.get(normalizeReadingGKey(dropWord));
    if (!keep || keep.entryType === "phrase") throw new Error(`Missing G-reading keeper ${keepWord}`);
    if (!drop || drop.entryType === "phrase") throw new Error(`Missing G-reading closed form ${dropWord}`);
    wordCandidates.push({
      canonicalKey: normalizeReadingGKey(keep.word),
      canonicalId: keep.id,
      canonicalWord: keep.word,
      aliasKey: normalizeReadingGKey(drop.word),
      aliasId: drop.id,
      aliasWord: drop.word
    });
  }

  const extended = appendCompactionRules(compaction, wordCandidates);
  const incrementalRules = extended.added.map((candidate) => ({
    canonicalKey: candidate.canonicalKey,
    canonicalId: candidate.canonicalId,
    canonicalWord: candidate.canonicalWord,
    aliases: [{
      key: candidate.aliasKey,
      id: candidate.aliasId,
      word: candidate.aliasWord,
      relationType: "form"
    }]
  }));
  const compacted = applyReadingGCompaction(vocab.items, { rules: incrementalRules });
  let items = compacted.items;

  const phraseMappings = [];
  const nextRetirements = {
    ...retirements,
    entries: Array.isArray(retirements.entries) ? [...retirements.entries] : []
  };
  const retiredKeys = new Set(nextRetirements.entries.map((entry) => entry.key));

  for (const [keepWord, dropWord] of RG_PHRASE_PAIRS) {
    const keepIndex = items.findIndex((entry) => (
      normalizeReadingGKey(entry.word) === normalizeReadingGKey(keepWord) && entry.entryType !== "phrase"
    ));
    const dropIndex = items.findIndex((entry) => (
      normalizeReadingGKey(entry.word) === normalizeReadingGKey(dropWord)
    ));
    if (keepIndex < 0 || dropIndex < 0) {
      throw new Error(`Missing G-reading phrase pair ${dropWord} -> ${keepWord}`);
    }
    const keep = items[keepIndex];
    const drop = items[dropIndex];
    items[keepIndex] = attachReadingGAlias(keep, drop);
    items = items.filter((_, index) => index !== dropIndex);
    const retirement = {
      key: getReadingGRetirementKey(drop),
      id: drop.id,
      word: drop.word,
      entryType: drop.entryType === "phrase" ? "phrase" : "word",
      deletedAt: repairedAt
    };
    if (!retiredKeys.has(retirement.key)) {
      nextRetirements.entries.push(retirement);
      retiredKeys.add(retirement.key);
    }
    phraseMappings.push({
      from: drop.word,
      fromId: drop.id,
      to: keep.word,
      toId: keep.id,
      kind: "phrase"
    });
  }

  const mappings = [
    ...extended.added.map((entry) => ({
      from: entry.aliasWord,
      fromId: entry.aliasId,
      to: entry.canonicalWord,
      toId: entry.canonicalId,
      kind: "word"
    })),
    ...phraseMappings
  ];

  const nextVocab = recountReadingG(vocab, items, repairedAt, {
    version: VERSION,
    updatedAt: repairedAt,
    mergedCount: mappings.length,
    mappings: mappings.map((entry) => ({
      variant: entry.from,
      headword: entry.to,
      kind: entry.kind
    }))
  });

  const nextCompaction = {
    ...extended.payload,
    updatedAt: repairedAt,
    hyphenSpellingCompaction: {
      version: VERSION,
      mergedCount: mappings.length
    }
  };
  const nextReport = {
    ...report,
    hyphenSpellingCompaction: {
      version: VERSION,
      completedAt: repairedAt,
      mergedCount: mappings.length,
      mappings: nextVocab.hyphenSpellingCompaction.mappings
    }
  };
  nextRetirements.updatedAt = repairedAt;
  nextRetirements.count = nextRetirements.entries.length;

  const afterKeys = new Set(items.map((entry) => normalizeReadingGKey(entry.word)));
  const expectedRemoved = new Set(mappings.map((entry) => `${entry.kind === "phrase" ? "phrase" : "word"}::${normalizeReadingGKey(entry.from)}`));
  const actuallyRemoved = [];
  for (const entry of vocab.items) {
    const key = `${entry.entryType === "phrase" ? "phrase" : "word"}::${normalizeReadingGKey(entry.word)}`;
    if (!items.some((item) => item.id === entry.id)) actuallyRemoved.push(key);
  }
  const unexpected = actuallyRemoved.filter((key) => !expectedRemoved.has(key));
  if (unexpected.length) {
    throw new Error(`Unexpected G-reading removals: ${unexpected.join(", ")}`);
  }
  for (const mapping of mappings) {
    if (afterKeys.has(normalizeReadingGKey(mapping.from))) {
      throw new Error(`${mapping.from} remains an independent G-reading card`);
    }
    const keeper = items.find((entry) => entry.id === mapping.toId);
    if (!keeper) throw new Error(`Missing keeper ${mapping.to}`);
    const hasAlias = (keeper.mergedAliases || []).some((alias) => (
      normalizeReadingGKey(alias.key || alias.word) === normalizeReadingGKey(mapping.from)
    ));
    if (!hasAlias) throw new Error(`Missing progress alias ${mapping.from} under ${mapping.to}`);
  }

  return {
    vocab: nextVocab,
    compaction: nextCompaction,
    report: nextReport,
    retirements: nextRetirements,
    mappings,
    beforeCount: vocab.items.length,
    afterCount: items.length
  };
}

function main() {
  const publicRaw = fs.readFileSync(PUBLIC_WORDS);
  const cacheRaw = fs.readFileSync(CACHE_WORDS);
  if (!publicRaw.equals(cacheRaw)) {
    throw new Error("public/data/words.json and .static-export-cache/words.json differ");
  }

  const repairedAt = new Date().toISOString();
  const wordsPayload = JSON.parse(publicRaw.toString("utf8"));
  const meaningPayload = readJson(MEANING);
  const rgVocab = readJson(RG_VOCAB);
  const rgCompaction = readJson(RG_COMPACTION);
  const rgReport = readJson(RG_REPORT);
  const rgRetirements = readJson(RG_RETIREMENTS);
  const baselineRaw = fs.readFileSync(BASELINE);

  const main = repairMainLexicon(wordsPayload, repairedAt);
  const readingG = repairReadingG(rgVocab, rgCompaction, rgReport, rgRetirements, repairedAt);
  const wordsContent = `${JSON.stringify(main.payload, null, 2)}\n`;
  const fileHash = sha256(wordsContent);
  const baseline = renderMasterLexiconBaseline({
    count: main.payload.count,
    version: main.payload.version,
    fileHash
  });
  const nextMeaning = {
    ...meaningPayload,
    sourceLexiconVersion: main.payload.version,
    sourceLexiconCount: main.payload.count,
    sourceLexiconSha256: fileHash
  };

  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version: VERSION,
    skippedDifferentMeanings: RG_SKIPPED,
    main: {
      converted: main.mappings.length,
      mappings: main.mappings.map((entry) => `${entry.from} -> ${entry.to}`),
      refs: main.refs,
      brushable: main.brushable,
      count: main.payload.count
    },
    readingG: {
      merged: readingG.mappings.length,
      mappings: readingG.mappings.map((entry) => `${entry.from} -> ${entry.to} (${entry.kind})`),
      beforeCount: readingG.beforeCount,
      afterCount: readingG.afterCount
    }
  };

  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const backupDirectory = path.join(
    root,
    "backups",
    "hyphen-spelling-variants",
    repairedAt.replace(/[:.]/g, "-")
  );
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.copyFileSync(PUBLIC_WORDS, path.join(backupDirectory, "public__data__words.json"));
  fs.copyFileSync(CACHE_WORDS, path.join(backupDirectory, "static-export-cache__words.json"));
  fs.copyFileSync(BASELINE, path.join(backupDirectory, "master-lexicon-baseline.mjs"));
  fs.copyFileSync(MEANING, path.join(backupDirectory, "meaning-6000.json"));
  fs.copyFileSync(RG_VOCAB, path.join(backupDirectory, "reading-g-vocab.json"));
  fs.copyFileSync(RG_COMPACTION, path.join(backupDirectory, "reading-g-word-family-compaction.json"));
  fs.copyFileSync(RG_REPORT, path.join(backupDirectory, "reading-g-import-report.json"));
  fs.copyFileSync(RG_RETIREMENTS, path.join(backupDirectory, "reading-g-retirements.json"));

  try {
    atomicWrite(PUBLIC_WORDS, wordsContent);
    atomicWrite(CACHE_WORDS, wordsContent);
    atomicWrite(BASELINE, baseline);
    atomicWrite(MEANING, `${JSON.stringify(nextMeaning, null, 2)}\n`);
    atomicWrite(RG_VOCAB, JSON.stringify(readingG.vocab));
    atomicWrite(RG_COMPACTION, `${JSON.stringify(readingG.compaction, null, 2)}\n`);
    atomicWrite(RG_REPORT, `${JSON.stringify(readingG.report, null, 2)}\n`);
    atomicWrite(RG_RETIREMENTS, `${JSON.stringify(readingG.retirements, null, 2)}\n`);
  } catch (error) {
    atomicWrite(PUBLIC_WORDS, publicRaw);
    atomicWrite(CACHE_WORDS, cacheRaw);
    atomicWrite(BASELINE, baselineRaw);
    throw error;
  }

  report.backupDirectory = path.relative(root, backupDirectory).replaceAll("\\", "/");
  console.log(JSON.stringify(report, null, 2));
}

main();
