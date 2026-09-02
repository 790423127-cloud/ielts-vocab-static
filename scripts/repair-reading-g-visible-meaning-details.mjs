#!/usr/bin/env node

/**
 * Repairs visible G-reading meaning details from the local master lexicon.
 *
 * This is deliberately not an AI-completion script. It only reuses an exact
 * headword's already-reviewed detail, and supplies four manual profiles where
 * no usable local source exists. Reference-layer lookup cards remain reference
 * cards: this changes their teaching text, never their studyMode or identity.
 *
 * Usage:
 *   node scripts/repair-reading-g-visible-meaning-details.mjs --dry-run
 *   node scripts/repair-reading-g-visible-meaning-details.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";

import {
  MEANING_COVERAGE_PENDING_FLAG,
  MEANING_COVERAGE_REVIEWED_FLAG
} from "../app/lib/vocab/meaning-coverage-audit.mjs";
import { isMeaningDetailInformative } from "../app/lib/vocab/meaning-display.mjs";
import {
  getReadingGContentIssues,
  isReadingGContextOnlyMeaningDetail
} from "../app/lib/reading-g-vocab/content-completeness.mjs";
import { atomicWriteReadingGJson } from "../app/lib/reading-g-vocab/write-lock.server.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !shouldApply;
const readingGPath = path.join(root, "public", "data", "reading-g-vocab.json");
const masterPath = path.join(root, "public", "data", "words.json");
const backupRoot = path.join(root, "backups", "reading-g-visible-meaning-detail-repair");
const repairVersion = "reading-g-visible-meaning-detail-repair-v1-20260812";

const MANUAL_DETAILS = Object.freeze({
  "on-site": "表示在某一地点的现场进行、提供或发生；作形容词常修饰 parking、training、service 等，作副词则表示在现场进行。常见于工作、服务和设施说明。",
  about: "最常作介词表示“关于、涉及”，说明谈话、文章或活动的主题；还可作副词表示“大约”或“到处”，be about to do 则表示“正要做某事”。",
  higher: "是 high 的比较级，表示在高度、数量、程度、等级或价格等方面更高；作形容词可修饰 score、price、level，作副词表示“更高地”或“达到更高程度”。",
  more: "表示数量或程度比原来更多或更高；可作限定词修饰名词，如 more time，也可作副词修饰动词、形容词或副词，如 learn more、more useful，还可作代词指更多的人或事物。",
  Artlingly: "雅思材料中用作城镇名称，主要用于辨认地点、交通或服务信息；它不是按普通英语词义学习的词汇。",
  Nylso: "源材料中用作人名或署名，主要用于辨认人物、身份或预约信息；它不是按普通英语词义学习的词汇。",
  Gobridge: "雅思材料中用作线路、地点或服务名称，主要用于辨认交通和地点信息；它不是按普通英语词义学习的词汇。"
});

// These records were previously written as an explanation of just the current
// G-reading sentence. Their cards must instead lead with the ordinary/common
// sense. The source is still local: an exact master headword where usable, or
// the existing G card where it already has a sound common-sense structure.
const CONTEXT_PRIMARY_OVERRIDES = Object.freeze({
  thousand: {
    primaryPos: "numeral",
    pos: "numeral / noun",
    primaryMeaningZh: "一千；数千",
    meaning: "一千；数千",
    meaningZh: "一千；数千",
    definition: "the number 1,000; also a large but indefinite number"
  },
  enough: {
    primaryPos: "adjective",
    pos: "adjective / adverb",
    primaryMeaningZh: "足够的；充分的",
    meaning: "足够的；充分的",
    meaningZh: "足够的；充分的",
    definition: "as much or as many as is needed"
  },
  around: {
    primaryPos: "adverb",
    pos: "adverb / preposition",
    primaryMeaningZh: "大约；在周围",
    meaning: "大约；在周围",
    meaningZh: "大约；在周围",
    definition: "approximately; or on every side of something",
    otherMeanings: [{
      pos: "preposition",
      meaningZh: "在……周围；环绕着",
      definitionEn: "on every side of or surrounding something"
    }]
  },
  more: {
    primaryPos: "determiner",
    pos: "determiner / adverb / pronoun",
    primaryMeaningZh: "更多的；更",
    meaning: "更多的；更",
    meaningZh: "更多的；更",
    definition: "a greater amount, number, or degree",
    otherMeanings: [
      { pos: "adverb", meaningZh: "更；更多地", definitionEn: "to a greater degree or extent" },
      { pos: "pronoun", meaningZh: "更多的人或事物", definitionEn: "a greater amount or number" }
    ]
  },
  hand: {
    primaryPos: "noun",
    pos: "noun / verb",
    primaryMeaningZh: "手；递给",
    meaning: "手；递给",
    meaningZh: "手；递给",
    definition: "the body part at the end of an arm; or to give something directly to someone",
    otherMeanings: [{
      pos: "verb",
      meaningZh: "递给；交给",
      definitionEn: "to give or pass something directly to someone"
    }]
  },
  migrant: {
    primaryPos: "noun",
    pos: "noun / adjective",
    primaryMeaningZh: "移民；迁徙的",
    meaning: "移民；迁徙的",
    meaningZh: "移民；迁徙的",
    definition: "a person who moves to another place to live or work; relating to such movement",
    otherMeanings: [{
      pos: "adjective",
      meaningZh: "迁徙的；移民的",
      definitionEn: "relating to people or animals that move from one place to another"
    }]
  },
  lace: {
    primaryPos: "noun",
    pos: "noun / verb",
    primaryMeaningZh: "蕾丝；鞋带；系紧",
    meaning: "蕾丝；鞋带；系紧",
    meaningZh: "蕾丝；鞋带；系紧",
    definition: "a delicate open fabric or a cord used to fasten shoes; also to fasten with a lace",
    otherMeanings: [{
      pos: "verb",
      meaningZh: "系紧；用带子系",
      definitionEn: "to fasten or decorate with a lace or cord"
    }]
  }
});

function text(value) {
  return String(value == null ? "" : value).normalize("NFC").trim();
}

function key(value) {
  return text(value).toLowerCase();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function protectedIdentity(entry = {}) {
  return {
    id: entry.id,
    wordId: entry.wordId,
    word: entry.word,
    normalizedKey: entry.normalizedKey,
    entryType: entry.entryType,
    studyMode: entry.studyMode,
    baseWord: entry.baseWord,
    baseWordId: entry.baseWordId,
    redirectToWord: entry.redirectToWord
  };
}

function sameIdentity(before, after) {
  return JSON.stringify(protectedIdentity(before)) === JSON.stringify(protectedIdentity(after));
}

function isVisibleWord(entry) {
  return Boolean(entry && (entry.entryType || "word") === "word");
}

function detailIssue(entry) {
  return !isMeaningDetailInformative(entry) || isReadingGContextOnlyMeaningDetail(entry);
}

function needsRepair(entry) {
  if (!isVisibleWord(entry)) return false;
  const manual = MANUAL_DETAILS[entry.word] || MANUAL_DETAILS[key(entry.word)];
  // A manual profile remains authoritative when this local repair script is
  // adjusted after its first run; that makes a corrected editorial sentence
  // safely re-applicable without weakening the general quality gate.
  return detailIssue(entry) || Boolean(manual && text(entry.meaningDetailZh) !== text(manual));
}

function buildMasterByKey(words) {
  const result = new Map();
  for (const entry of words) {
    const normalized = key(entry?.word);
    if (!normalized || result.has(normalized)) continue;
    result.set(normalized, entry);
  }
  return result;
}

function resolveDetail(entry, masterByKey) {
  const manual = MANUAL_DETAILS[entry.word] || MANUAL_DETAILS[key(entry.word)];
  if (manual) return { detail: manual, source: "manual-editorial" };

  const master = masterByKey.get(key(entry.word));
  if (!master || !isMeaningDetailInformative(master)) {
    throw new Error(`No usable local detail for visible G word: ${entry.word}`);
  }
  return {
    detail: text(master.meaningDetailZh || master.meaningDetailedZh),
    source: "master-lexicon-exact-headword"
  };
}

function reviewEntry(entry, resolved, reviewedAt) {
  const qualityFlags = unique([
    ...list(entry.qualityFlags).filter((flag) => flag !== MEANING_COVERAGE_PENDING_FLAG),
    MEANING_COVERAGE_REVIEWED_FLAG,
    "reading_g_local_meaning_detail_repaired"
  ]);
  const primaryOverride = isReadingGContextOnlyMeaningDetail(entry)
    ? CONTEXT_PRIMARY_OVERRIDES[key(entry.word)]
    : null;
  const next = {
    ...entry,
    ...(primaryOverride || {}),
    meaningDetailZh: resolved.detail,
    meaningCoveragePending: false,
    meaningCoverageReviewed: true,
    meaningCoverageAuditStatus: "reviewed",
    meaningCoverageReviewSource: resolved.source,
    meaningCoverageReviewedAt: reviewedAt,
    meaningCoveragePromptVersion: repairVersion,
    qualityFlags,
    updatedAt: reviewedAt
  };
  if (!sameIdentity(entry, next)) {
    throw new Error(`Stable identity changed while repairing ${entry.word}`);
  }
  if (!isMeaningDetailInformative(next) || isReadingGContextOnlyMeaningDetail(next)) {
    throw new Error(`Repaired detail did not pass quality verification: ${entry.word}`);
  }
  return next;
}

function summarizeOutstanding(items) {
  return items
    .filter(isVisibleWord)
    .filter(detailIssue)
    .map((entry) => ({ id: entry.id, word: entry.word, issue: getReadingGContentIssues(entry) }));
}

function main() {
  if (shouldApply && dryRun) throw new Error("--apply and --dry-run cannot be used together");

  const readingG = JSON.parse(fs.readFileSync(readingGPath, "utf8"));
  const master = JSON.parse(fs.readFileSync(masterPath, "utf8"));
  const items = list(readingG.items);
  const masterWords = list(master.words);
  if (!items.length || !masterWords.length || masterWords.length !== Number(master.count)) {
    throw new Error("Reading-G or master lexicon is structurally invalid; write stopped.");
  }

  const before = items.filter(needsRepair);
  const masterByKey = buildMasterByKey(masterWords);
  const reviewedAt = new Date().toISOString();
  const repaired = [];
  const nextItems = items.map((entry) => {
    if (!needsRepair(entry)) return entry;
    const resolved = resolveDetail(entry, masterByKey);
    const next = reviewEntry(entry, resolved, reviewedAt);
    repaired.push({ id: entry.id, word: entry.word, source: resolved.source });
    return next;
  });

  if (nextItems.length !== items.length || nextItems.some((entry, index) => !sameIdentity(items[index], entry))) {
    throw new Error("Reading-G count/order/identity changed; write stopped.");
  }

  const remaining = summarizeOutstanding(nextItems);
  if (remaining.length) {
    throw new Error(`Visible G details still fail verification: ${JSON.stringify(remaining)}`);
  }

  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    repairVersion,
    eligibleVisibleWords: before.length,
    repaired: repaired.length,
    masterExactReuse: repaired.filter((item) => item.source === "master-lexicon-exact-headword").length,
    manualEditorial: repaired.filter((item) => item.source === "manual-editorial").length,
    remaining: remaining.length,
    stableIdsChanged: 0,
    userStateFieldsChanged: 0,
    paidAiCalls: 0,
    networkCalls: 0,
    preview: repaired.slice(0, 30)
  };
  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const stamp = reviewedAt.replace(/[:.]/g, "-");
  const backupDirectory = path.join(backupRoot, stamp);
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupPath = path.join(backupDirectory, "reading-g-vocab.json");
  atomicWriteReadingGJson(backupPath, readingG);

  const nextPayload = {
    ...readingG,
    visibleMeaningDetailRepair: {
      version: repairVersion,
      repairedAt: reviewedAt,
      masterExactReuse: report.masterExactReuse,
      manualEditorial: report.manualEditorial,
      remaining: 0,
      paidAiCalls: 0
    },
    items: nextItems,
    updatedAt: reviewedAt
  };
  try {
    atomicWriteReadingGJson(readingGPath, nextPayload);
  } catch (error) {
    atomicWriteReadingGJson(readingGPath, readingG);
    throw error;
  }
  report.backupDirectory = path.relative(root, backupDirectory).replaceAll("\\", "/");
  console.log(JSON.stringify(report, null, 2));
}

main();
