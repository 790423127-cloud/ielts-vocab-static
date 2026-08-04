/**
 * Promote EVERY nested wordFamily member in reading-g to a standalone brushable card,
 * then clear all wordFamily arrays so headwords only keep forms (变形).
 *
 * Why: deleting a headword used to erase nested family members that were never
 * independent entries. After this pass, family members survive as their own cards.
 *
 * Scope: reading-g only. Master lexicon is read-only.
 *
 * Usage:
 *   node scripts/promote-all-reading-g-word-family.mjs --dry-run
 *   node scripts/promote-all-reading-g-word-family.mjs --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeReadingGKey,
  stableReadingGId
} from "../app/lib/reading-g-vocab/normalize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const READING_G_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const RETIREMENTS_PATH = path.join(ROOT, "public", "data", "reading-g-retirements.json");
const COMPACTION_PATH = path.join(ROOT, "public", "data", "reading-g-word-family-compaction.json");
const MASTER_PATH = path.join(ROOT, "public", "data", "words.json");
const HEADER_PATH = path.join(ROOT, "app", "components", "GlobalStudyHeader.jsx");
const REPORTS_DIR = path.join(ROOT, "reports");
const BACKUPS_DIR = path.join(ROOT, "backups");

const FRAGMENT_WORDS = new Set(["advertis", "announc", "inspir", "organiz", "continu", "oppos"]);
const PENDING_MARKERS = ["总词库待补", "待补"];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function uniqueText(values) {
  const out = [];
  const seen = new Set();
  for (const value of asArray(values)) {
    const t = text(value);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function relationWord(value) {
  return typeof value === "string"
    ? text(value)
    : text(value?.word || value?.form || value?.value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath);
  return { raw, data: JSON.parse(raw.toString("utf8")), hash: sha256(raw) };
}

function parseArgs(argv) {
  const options = { mode: "dry-run" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.mode = "dry-run";
    else if (arg === "--apply") options.mode = "apply";
    else throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function timestampParts(date = new Date()) {
  const iso = date.toISOString();
  return {
    iso,
    date: iso.slice(0, 10).replaceAll("-", ""),
    slug: iso.replace(/[-:]/g, "").replace("T", "-").replace(/\.\d{3}Z$/, "Z")
  };
}

function entryMeaning(entry) {
  return text(
    entry?.primaryMeaningZh
    || entry?.meaning
    || entry?.meaningZh
    || entry?.meaningDetailZh
    || entry?.definition
  );
}

function isPhraseLike(word) {
  return /\s/.test(text(word));
}

function recomputeTotals(items) {
  let wordCount = 0;
  let phraseCount = 0;
  let activeCount = 0;
  let referenceCount = 0;
  let multiSenseCount = 0;
  for (const item of items) {
    if ((item?.entryType || "word") === "phrase") phraseCount += 1;
    else wordCount += 1;
    if (item?.studyMode === "reference") referenceCount += 1;
    else activeCount += 1;
    if (asArray(item?.senses).length > 1) multiSenseCount += 1;
  }
  return {
    count: items.length,
    wordCount,
    phraseCount,
    activeCount,
    referenceCount,
    multiSenseCount
  };
}

function collectFamilyCandidates(items, masterByKey, retiredKeys) {
  const existingWordKeys = new Set(
    items
      .filter((entry) => (entry?.entryType || "word") === "word")
      .map((entry) => normalizeReadingGKey(entry?.word))
      .filter(Boolean)
  );

  const candidates = new Map();
  const skipped = {
    alreadyStandalone: 0,
    retired: [],
    fragment: [],
    phraseLike: [],
    empty: 0
  };
  let nestedFamilyRows = 0;

  for (const owner of items) {
    for (const row of asArray(owner?.wordFamily)) {
      nestedFamilyRows += 1;
      const word = relationWord(row);
      const key = normalizeReadingGKey(word);
      if (!key) {
        skipped.empty += 1;
        continue;
      }
      if (isPhraseLike(word)) {
        skipped.phraseLike.push({ word, owner: owner.word });
        continue;
      }
      if (FRAGMENT_WORDS.has(key)) {
        skipped.fragment.push({ word, owner: owner.word });
        continue;
      }
      if (existingWordKeys.has(key)) {
        skipped.alreadyStandalone += 1;
        continue;
      }
      if (retiredKeys.has(`word::${key}`)) {
        skipped.retired.push({ word, owner: owner.word });
        continue;
      }

      const masterEntry = masterByKey.get(key) || null;
      const rowMeaning = typeof row === "object"
        ? text(row.meaning || row.meaningZh)
        : "";
      const meaning = entryMeaning(masterEntry) || rowMeaning;
      if (!meaning || PENDING_MARKERS.some((marker) => meaning.includes(marker))) {
        // still promote with a fallback gloss so the card is not lost
      }

      const current = candidates.get(key) || {
        key,
        word,
        masterEntry,
        relationRow: row && typeof row === "object" ? row : { word },
        owners: [],
        meanings: []
      };
      current.owners.push(owner);
      if (meaning) current.meanings.push(meaning);
      if (!current.masterEntry && masterEntry) current.masterEntry = masterEntry;
      if (row && typeof row === "object" && !current.relationRow?.meaning && rowMeaning) {
        current.relationRow = row;
      }
      candidates.set(key, current);
    }
  }

  return {
    nestedFamilyRows,
    candidates: [...candidates.values()].sort((a, b) => a.key.localeCompare(b.key)),
    skipped,
    existingWordKeys
  };
}

function buildStandaloneEntry(candidate) {
  const master = candidate.masterEntry ? structuredClone(candidate.masterEntry) : null;
  const row = candidate.relationRow || {};
  const owner = candidate.owners[0] || {};
  const ownerWord = text(owner.word) || "相关词";
  const meaning =
    entryMeaning(master)
    || text(row.meaning || row.meaningZh)
    || candidate.meanings.find(Boolean)
    || `与 ${ownerWord} 同词族`;
  const pos = text(master?.pos || row.pos || master?.primaryPos) || "word";
  const id = stableReadingGId("word", candidate.key);
  const base = master || {
    word: candidate.word,
    phonetic: text(row.phonetic),
    pos,
    meaning,
    definition: meaning,
    example: "",
    exampleCn: "",
    collocations: [],
    phraseCollocations: [],
    topics: asArray(owner.topics).slice(0, 4),
    forms: [],
    wordFamily: []
  };

  return {
    ...base,
    id,
    wordId: id,
    sourceWordId: text(master?.wordId || master?.id),
    word: candidate.word,
    normalizedKey: candidate.key,
    entryType: "word",
    isPhrase: false,
    studyMode: "active",
    primaryMeaningZh: meaning,
    primaryPos: pos,
    meaning,
    pos,
    definition: text(base.definition) || meaning,
    forms: [],
    wordFamily: [],
    layers: uniqueText([...asArray(owner.layers), "wordFamilyStandalone"]),
    primaryLayer: text(owner.primaryLayer) || "wordFamilyStandalone",
    sourceFiles: uniqueText([
      ...asArray(owner.sourceFiles),
      ...(master ? ["public/data/words.json"] : [])
    ]),
    qualityFlags: uniqueText([
      ...asArray(owner.qualityFlags).filter((flag) => flag !== "missing_master_lexicon"),
      ...(master ? ["master_lexicon_reused"] : ["built_from_family_relation"]),
      "word_family_fully_promoted"
    ]),
    standaloneRestoration: {
      version: "reading-g-word-family-full-promote-v1",
      ownerWords: uniqueText(candidate.owners.map((entry) => entry.word)),
      relationFields: ["wordFamily"],
      reason: master ? "family-member-with-master" : "family-member-from-relation"
    }
  };
}

function clearAllWordFamilies(items) {
  let clearedRows = 0;
  let touchedEntries = 0;
  const next = items.map((entry) => {
    const family = asArray(entry?.wordFamily);
    if (!family.length) return entry;
    clearedRows += family.length;
    touchedEntries += 1;
    return { ...entry, wordFamily: [] };
  });
  return { items: next, clearedRows, touchedEntries };
}

function pruneCompaction(payload, standaloneKeys, timestamp) {
  const sourceRules = asArray(payload?.rules);
  let removedAliasCount = 0;
  const rules = sourceRules.flatMap((rule) => {
    const aliases = asArray(rule?.aliases).filter((alias) => {
      const remove = standaloneKeys.has(normalizeReadingGKey(alias?.key || alias?.word));
      if (remove) removedAliasCount += 1;
      return !remove;
    });
    return aliases.length ? [{ ...rule, aliases }] : [];
  });
  const previousAliasCount = sourceRules.reduce((sum, rule) => sum + asArray(rule?.aliases).length, 0);
  return {
    payload: {
      ...payload,
      version: `reading-g-internal-family-compaction-v2-${timestamp.date}`,
      updatedAt: timestamp.iso,
      rules,
      resultingWordCount: Number(payload?.resultingWordCount || 0) + removedAliasCount,
      stats: {
        ...(payload?.stats || {}),
        familyCount: rules.length,
        aliasCount: previousAliasCount - removedAliasCount,
        standaloneAliasesRestored: Number(payload?.stats?.standaloneAliasesRestored || 0) + removedAliasCount
      }
    },
    removedAliasCount
  };
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function buildPlan(options, now = new Date()) {
  const timestamp = timestampParts(now);
  const readingGFile = readJson(READING_G_PATH);
  const retirementFile = readJson(RETIREMENTS_PATH);
  const compactionFile = readJson(COMPACTION_PATH);
  const masterFile = readJson(MASTER_PATH);

  const beforeItems = asArray(readingGFile.data?.items);
  const masterByKey = new Map(
    asArray(masterFile.data?.words).map((entry) => [normalizeReadingGKey(entry?.word), entry])
  );
  const retiredKeys = new Set(
    asArray(retirementFile.data?.entries).map((entry) => (
      text(entry?.key)
      || `${entry?.entryType === "phrase" ? "phrase" : "word"}::${normalizeReadingGKey(entry?.word)}`
    ))
  );

  const collected = collectFamilyCandidates(beforeItems, masterByKey, retiredKeys);
  const promotedEntries = collected.candidates.map(buildStandaloneEntry);
  const promotedKeys = new Set(promotedEntries.map((entry) => normalizeReadingGKey(entry.word)));

  // Append new standalone cards, then strip nested families from everyone.
  const withPromotions = [...beforeItems, ...promotedEntries];
  const cleared = clearAllWordFamilies(withPromotions);
  const afterItems = cleared.items;
  const totals = recomputeTotals(afterItems);
  const compaction = pruneCompaction(compactionFile.data, promotedKeys, timestamp);

  const output = {
    ...readingGFile.data,
    ...totals,
    items: afterItems,
    wordFamilyFullPromotion: {
      version: `reading-g-word-family-full-promote-v1-${timestamp.date}`,
      updatedAt: timestamp.iso,
      scope: "reading-g-only",
      policy: "all-wordFamily-members-become-standalone; headwords-keep-forms-only",
      nestedFamilyRowsBefore: collected.nestedFamilyRows,
      nestedFamilyRowsAfter: 0,
      promotedStandaloneCount: promotedEntries.length,
      familyRowsCleared: cleared.clearedRows,
      entriesWithFamilyCleared: cleared.touchedEntries,
      compactionAliasesReleased: compaction.removedAliasCount,
      skipped: {
        alreadyStandalone: collected.skipped.alreadyStandalone,
        retired: collected.skipped.retired.length,
        fragment: collected.skipped.fragment.length,
        phraseLike: collected.skipped.phraseLike.length,
        empty: collected.skipped.empty
      }
    }
  };

  const content = `${JSON.stringify(output, null, 2)}\n`;
  const idsBefore = beforeItems.map((entry) => text(entry?.id));
  const idsAfter = afterItems.map((entry) => text(entry?.id));
  const invariantFailures = [];
  if (JSON.stringify(idsBefore) !== JSON.stringify(idsAfter.slice(0, idsBefore.length))) {
    invariantFailures.push("existing-stable-id-or-order-changed");
  }
  if (afterItems.length !== beforeItems.length + promotedEntries.length) {
    invariantFailures.push("unexpected-item-count");
  }
  const afterWordKeys = new Set(
    afterItems
      .filter((entry) => (entry?.entryType || "word") === "word")
      .map((entry) => normalizeReadingGKey(entry.word))
  );
  const stillNested = afterItems.reduce((sum, entry) => sum + asArray(entry.wordFamily).length, 0);
  if (stillNested !== 0) invariantFailures.push("wordFamily-not-fully-cleared");
  for (const entry of promotedEntries) {
    if (!afterWordKeys.has(normalizeReadingGKey(entry.word))) {
      invariantFailures.push(`promoted-missing:${entry.word}`);
      break;
    }
  }
  // Remaining family members that were already standalone are fine; any non-promoted
  // non-standalone family key (except retired/fragment/phrase) is a failure.
  for (const candidate of collected.candidates) {
    if (!afterWordKeys.has(candidate.key)) {
      invariantFailures.push(`candidate-not-standalone:${candidate.word}`);
      break;
    }
  }

  return {
    timestamp,
    readingGFile,
    retirementFile,
    compactionFile,
    masterFile,
    compactionOutput: compaction.payload,
    compactionContent: `${JSON.stringify(compaction.payload, null, 2)}\n`,
    output,
    content,
    promotedEntries,
    report: {
      mode: options.mode,
      generatedAt: timestamp.iso,
      before: {
        itemCount: beforeItems.length,
        wordCount: beforeItems.filter((e) => (e?.entryType || "word") === "word").length,
        nestedFamilyRows: collected.nestedFamilyRows
      },
      after: {
        itemCount: afterItems.length,
        wordCount: totals.wordCount,
        nestedFamilyRows: stillNested,
        formsRows: afterItems.reduce((sum, e) => sum + asArray(e.forms).length, 0)
      },
      promotion: {
        applied: promotedEntries.length,
        fromMaster: promotedEntries.filter((e) => e.sourceWordId).length,
        fromRelationOnly: promotedEntries.filter((e) => !e.sourceWordId).length,
        sample: promotedEntries.slice(0, 40).map((e) => ({
          word: e.word,
          meaning: e.meaning,
          owners: e.standaloneRestoration?.ownerWords
        })),
        allWords: promotedEntries.map((e) => e.word)
      },
      cleared: {
        familyRows: cleared.clearedRows,
        entries: cleared.touchedEntries
      },
      skipped: collected.skipped,
      compactionAliasesReleased: compaction.removedAliasCount,
      invariants: {
        failures: invariantFailures,
        passed: invariantFailures.length === 0
      }
    }
  };
}

function writeReports(plan) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stem = `word-family-full-promote-${plan.timestamp.slug}`;
  const jsonPath = path.join(REPORTS_DIR, `${stem}.json`);
  const mdPath = path.join(REPORTS_DIR, `${stem}.md`);
  const md = [
    "# G 类阅读提升：词族全部独立 + 仅保留变形",
    "",
    `- 模式：${plan.report.mode}`,
    `- 生成时间：${plan.report.generatedAt}`,
    "",
    "## 数量",
    "",
    `- 条目：${plan.report.before.itemCount} → ${plan.report.after.itemCount}`,
    `- 单词：${plan.report.before.wordCount} → ${plan.report.after.wordCount}`,
    `- 嵌套词族行：${plan.report.before.nestedFamilyRows} → ${plan.report.after.nestedFamilyRows}`,
    `- 新独立可刷词：${plan.report.promotion.applied}`,
    `- 清空词族行：${plan.report.cleared.familyRows}（涉及 ${plan.report.cleared.entries} 条）`,
    `- 变形(forms)保留行数：${plan.report.after.formsRows}`,
    `- 解除合并别名：${plan.report.compactionAliasesReleased}`,
    "",
    "## 跳过",
    "",
    `- 已是独立词头：${plan.report.skipped.alreadyStandalone}`,
    `- 已退役：${plan.report.skipped.retired.length}`,
    `- 截断词干：${plan.report.skipped.fragment.length}`,
    `- 短语形态：${plan.report.skipped.phraseLike.length}`,
    "",
    "## 完整性",
    "",
    plan.report.invariants.passed
      ? "- 全部通过"
      : plan.report.invariants.failures.map((f) => `- ${f}`).join("\n"),
    ""
  ].join("\n");
  atomicWrite(jsonPath, `${JSON.stringify(plan.report, null, 2)}\n`);
  atomicWrite(mdPath, md);
  return { jsonPath, mdPath };
}

function applyPlan(plan) {
  if (!plan.report.invariants.passed) {
    throw new Error(`完整性检查未通过，停止写入：${plan.report.invariants.failures.join(", ")}`);
  }
  if (sha256(fs.readFileSync(READING_G_PATH)) !== plan.readingGFile.hash) {
    throw new Error("G 类词库在分析后发生变化，请重新运行。");
  }
  if (sha256(fs.readFileSync(COMPACTION_PATH)) !== plan.compactionFile.hash) {
    throw new Error("词族合并规则在分析后发生变化，请重新运行。");
  }
  if (sha256(fs.readFileSync(MASTER_PATH)) !== plan.masterFile.hash) {
    throw new Error("主词库在分析后发生变化，请重新运行。");
  }

  const backupDir = path.join(BACKUPS_DIR, `word-family-full-promote-${plan.timestamp.slug}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(READING_G_PATH, path.join(backupDir, "reading-g-vocab.json.before"));
  fs.copyFileSync(COMPACTION_PATH, path.join(backupDir, "reading-g-word-family-compaction.json.before"));
  fs.copyFileSync(HEADER_PATH, path.join(backupDir, "GlobalStudyHeader.jsx.before"));

  atomicWrite(READING_G_PATH, plan.content);
  atomicWrite(COMPACTION_PATH, plan.compactionContent);

  const cacheVersion = `${plan.timestamp.date}-word-family-full-promote-v1`;
  const headerSource = fs.readFileSync(HEADER_PATH, "utf8");
  const updatedHeader = headerSource.replace(
    /\/data\/reading-g-vocab\.json\?v=[^"'`\s]+/g,
    `/data/reading-g-vocab.json?v=${cacheVersion}`
  );
  if (updatedHeader === headerSource) {
    throw new Error("未找到 G 类词库缓存版本位置，已备份但未写入。");
  }
  atomicWrite(HEADER_PATH, updatedHeader);
  return { backupDir, cacheVersion };
}

function main() {
  const options = parseArgs(process.argv);
  const plan = buildPlan(options);
  const reportPaths = writeReports(plan);
  let applied = null;
  if (options.mode === "apply") applied = applyPlan(plan);

  console.log(JSON.stringify({
    ok: true,
    mode: options.mode,
    reportPaths,
    applied,
    summary: {
      itemCount: `${plan.report.before.itemCount} -> ${plan.report.after.itemCount}`,
      nestedFamilyRows: `${plan.report.before.nestedFamilyRows} -> ${plan.report.after.nestedFamilyRows}`,
      promotedStandalone: plan.report.promotion.applied,
      familyRowsCleared: plan.report.cleared.familyRows,
      formsRowsKept: plan.report.after.formsRows,
      alreadyStandaloneSkipped: plan.report.skipped.alreadyStandalone,
      invariantsPassed: plan.report.invariants.passed
    }
  }, null, 2));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

export { buildPlan, parseArgs, collectFamilyCandidates, clearAllWordFamilies };
