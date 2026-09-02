import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReadingGAiCompletedEntry,
  buildReadingGMeaningCoverageCompletedEntry,
  isReadingGAiCompletionCandidate,
  isReadingGPendingAiEntry,
  isReadingGMeaningCoverageCandidate,
  isReadingGStandaloneStudyEntry,
  resolveReadingGMeaningCoverageProfile
} from "../ai-completion.mjs";
import { normalizeReadingGItem } from "../load-reading-g.mjs";
import { isReadingGContentIncomplete } from "../content-completeness.mjs";
import { fillReadingGRelationMeanings } from "../relation-meaning-fill.mjs";
import { itemMatchesPathStage } from "../stages.mjs";
import { buildRgStudyList } from "../storage.mjs";
import {
  applyReadingGRetirements,
  getReadingGRetirementKey
} from "../retirements.mjs";
import { shouldHandleStudyDeleteShortcut } from "../../vocab/study-keyboard-shortcuts.mjs";
import { buildAtomicDeletionNavigation } from "../../vocab/word-navigation-index.mjs";
import { wordStudyIndexAtPosition } from "../../vocab/word-study-position.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function pendingEntry() {
  return {
    id: "rg_word_zoology",
    entryType: "word",
    word: "zoology",
    normalizedKey: "zoology",
    primaryLayer: "questionBankPending",
    layers: ["questionBankPending"],
    layerRank: 12,
    studyMode: "reference",
    sourceFiles: ["scripts/data/reading-g-question-bank-3109.json"],
    qualityFlags: ["question_bank_5262_expansion", "missing_master_lexicon", "missing_meaning_filled_placeholder"]
  };
}

function profile() {
  return {
    word: "zoology",
    phonetic: "/zuːˈɒlədʒi/",
    pos: "noun",
    meaning: "动物学",
    meaningDetailZh: "研究动物种类、行为和生理的科学。",
    definition: "the scientific study of animals",
    otherMeanings: [],
    example: "She studied zoology at university.",
    exampleCn: "她在大学学习动物学。",
    forms: [],
    wordFamily: [{ word: "zoologist", pos: "noun", meaning: "动物学家", relation: "person" }],
    synonyms: [],
    collocations: [{ phrase: "study zoology", chinese: "学习动物学" }],
    phraseCollocations: [{ phrase: "a degree in zoology", chinese: "动物学学位" }],
    ieltsUse: ["Reading"],
    topics: ["Science"],
    difficulty: "中级核心",
    aiContentProfile: "full-v2",
    generatedAt: "2026-08-03T00:00:00.000Z"
  };
}

test("G-reading AI completion promotes an explicitly pending entry", () => {
  const placeholder = "全题库阅读词汇（总词库待补）";
  const pending = {
    ...pendingEntry(),
    primaryMeaningZh: placeholder,
    meaning: placeholder,
    meaningZh: placeholder,
    definition: placeholder,
    senses: [{
      senseId: "rg_word_zoology_placeholder_01",
      pos: "",
      meaningZh: placeholder
    }]
  };
  assert.equal(isReadingGPendingAiEntry(pending), true);
  const completed = buildReadingGAiCompletedEntry(pending, profile(), { aiSource: "ai-cache" });

  assert.equal(completed.id, pending.id);
  assert.equal(completed.word, pending.word);
  assert.equal(completed.primaryLayer, "questionBankAiCompleted");
  assert.equal(completed.studyMode, "active");
  assert.equal(completed.primaryMeaningZh, "动物学");
  assert.equal(completed.exampleCn, "她在大学学习动物学。");
  assert.equal(completed.phoneticSource, "ai-cache");
  assert.equal(itemMatchesPathStage(completed, "3"), true);
  assert.equal(itemMatchesPathStage(completed, "4"), false);
  assert.ok(completed.qualityFlags.includes("master_lexicon_absent"));
  assert.ok(completed.qualityFlags.includes("reading_g_ai_completed"));
  assert.ok(!completed.qualityFlags.includes("missing_master_lexicon"));
  assert.equal(completed.senses.some((sense) => /总词库待补/.test(sense.meaningZh)), false);
});

test("G-reading full completion repairs a missing core field without changing relations", () => {
  const active = {
    ...pendingEntry(),
    id: "rg_word_zoology_active",
    primaryLayer: "priority1500",
    layers: ["priority1500"],
    layerRank: 1,
    studyMode: "active",
    category: "IELTS G类 · 阅读核心",
    domain: "阅读通用",
    qualityFlags: [],
    primaryPos: "noun",
    primaryMeaningZh: "动物学",
    meaning: "动物学",
    definition: "the scientific study of animals",
    example: "She studied zoology at university.",
    exampleCn: "她在大学学习动物学。",
    forms: [{ word: "zoologies", type: "plural", meaning: "动物学（复数）" }],
    wordFamily: [{ word: "zoological", pos: "adjective", meaning: "动物学的" }],
    phonetic: ""
  };

  assert.equal(isReadingGPendingAiEntry(active), false);
  assert.equal(isReadingGAiCompletionCandidate(active), true);
  const completed = buildReadingGAiCompletedEntry(active, profile(), { aiSource: "ai-cache" });

  assert.equal(completed.phonetic, "/zuːˈɒlədʒi/");
  assert.equal(completed.primaryMeaningZh, active.primaryMeaningZh);
  assert.equal(completed.example, active.example);
  assert.deepEqual(completed.forms, active.forms);
  assert.deepEqual(completed.wordFamily, active.wordFamily);
  assert.equal(isReadingGContentIncomplete(completed), false);
});

test("G-reading full completion rebuilds a corrupt multi-POS sense list", () => {
  const active = {
    id: "rg_word_hand",
    entryType: "word",
    word: "hand",
    normalizedKey: "hand",
    primaryLayer: "priority1500",
    layers: ["priority1500"],
    studyMode: "active",
    phonetic: "/hænd/",
    primaryPos: "noun / verb",
    pos: "noun / verb",
    primaryMeaningZh: "手；递给",
    meaning: "手；递给",
    meaningZh: "手；递给",
    meaningDetailZh: "在当前例句中表示把某物直接递给某人。",
    definition: "a hand; to pass something",
    example: "Please hand me the book.",
    exampleCn: "请把书递给我。",
    senses: [{ pos: "noun", meaningZh: "手（的复数）", definition: "plural of hand" }],
    formsReviewed: true,
    wordFamilyReviewed: true,
    synonymsReviewed: true,
    collocationsReviewed: true,
    phraseCollocationsReviewed: true,
    aiCompletionLastFailure: { mode: "g-main", reason: "old failure" }
  };
  const generated = {
    word: "hand",
    phonetic: "/hænd/",
    pos: "noun",
    meaning: "手",
    meaningDetailZh: "首先指手臂末端用于抓取、触摸和操作物体的身体部位，也常用于描述人工帮助或参与。",
    definition: "the part of the body at the end of the arm",
    otherMeanings: [{
      pos: "verb",
      meaningZh: "递给；交给",
      definitionEn: "to give or pass something to someone directly"
    }],
    example: "Please hand me the book.",
    exampleCn: "请把书递给我。",
    forms: [],
    wordFamily: [],
    synonyms: [],
    synonymDetails: [],
    collocations: [{ phrase: "hand something over", chinese: "移交某物" }],
    phraseCollocations: [{ phrase: "hand something to somebody", chinese: "把某物递给某人" }],
    ieltsUse: ["Listening"],
    topics: ["Daily life"],
    difficulty: "基础高频"
  };

  assert.equal(isReadingGAiCompletionCandidate(active), true);
  const completed = buildReadingGAiCompletedEntry(active, generated, { aiSource: "ai-cache" });
  assert.equal(completed.primaryMeaningZh, "手");
  assert.deepEqual(completed.senses.map((sense) => sense.pos), ["noun", "verb"]);
  assert.equal(completed.senses.some((sense) => /复数/.test(sense.meaningZh)), false);
  assert.equal(completed.aiCompletionLastFailure, undefined);
  assert.equal(isReadingGContentIncomplete(completed), false);

  assert.throws(
    () => buildReadingGAiCompletedEntry(active, { ...generated, otherMeanings: [] }, { aiSource: "ai-cache" }),
    /multiPosNeedsSplit/
  );
});

test("G-reading main completion queues every requested teaching dimension", () => {
  const complete = {
    ...pendingEntry(),
    primaryLayer: "priority1500",
    layers: ["priority1500"],
    studyMode: "active",
    phonetic: "/zuːˈɒlədʒi/",
    primaryPos: "noun",
    primaryMeaningZh: "动物学",
    meaning: "动物学",
    meaningZh: "动物学",
    meaningDetailZh: "研究动物种类、结构、生理和行为等内容的科学领域。",
    definition: "the scientific study of animals",
    example: "She studied zoology at university.",
    exampleCn: "她在大学学习动物学。",
    formsReviewed: true,
    wordFamilyReviewed: true,
    synonymsReviewed: true,
    collocationsReviewed: true,
    phraseCollocationsReviewed: true
  };
  assert.equal(isReadingGAiCompletionCandidate(complete), false);
  assert.equal(isReadingGAiCompletionCandidate({ ...complete, phonetic: "" }), true);
  assert.equal(isReadingGAiCompletionCandidate({ ...complete, primaryPos: "", pos: "" }), true);
  assert.equal(isReadingGAiCompletionCandidate({ ...complete, primaryMeaningZh: "", meaning: "", meaningZh: "" }), true);
  assert.equal(isReadingGAiCompletionCandidate({ ...complete, example: "" }), true);
  assert.equal(isReadingGAiCompletionCandidate({ ...complete, wordFamilyReviewed: false }), true);
  assert.equal(isReadingGAiCompletionCandidate({ ...complete, forms: [], formsReviewed: false }), true);
  assert.equal(isReadingGAiCompletionCandidate({ ...complete, synonyms: [], synonymsReviewed: false }), true);
  assert.equal(isReadingGAiCompletionCandidate({ ...complete, collocations: [], collocationsReviewed: false }), true);
  assert.equal(isReadingGAiCompletionCandidate({ ...complete, phraseCollocations: [], phraseCollocationsReviewed: false }), true);
});

test("G-reading main completion excludes reference-only and grammatical-reference records", () => {
  const activeWord = {
    ...pendingEntry(),
    primaryLayer: "priority1500",
    layers: ["priority1500"],
    studyMode: "active"
  };
  assert.equal(isReadingGStandaloneStudyEntry(activeWord), true);
  assert.equal(isReadingGAiCompletionCandidate(activeWord), true);
  assert.equal(isReadingGAiCompletionCandidate({ ...activeWord, studyMode: "reference" }), false);
  assert.equal(isReadingGAiCompletionCandidate({
    ...activeWord,
    entryType: "inflected-form",
    studyMode: "reference",
    relationType: "plural",
    baseWord: "zoology"
  }), false);
});

test("G-reading main completion excludes phrases even when their old profile is incomplete", () => {
  const atLeast = {
    ...pendingEntry(),
    id: "rg_phrase_at_least",
    word: "at least",
    entryType: "phrase",
    primaryLayer: "logic120",
    layers: ["logic120", "phrases400"],
    studyMode: "active",
    meaningDetailZh: "现有资料只确认了主释义，语义范围和实际用法仍待补充。"
  };

  assert.equal(isReadingGStandaloneStudyEntry(atLeast), false);
  assert.equal(isReadingGAiCompletionCandidate(atLeast), false);
});

test("G-reading semantic queue preserves the primary gloss and clears only its own pending marker", () => {
  const semanticPending = {
    ...pendingEntry(),
    primaryLayer: "priority1500",
    layers: ["priority1500"],
    layerRank: 1,
    studyMode: "active",
    primaryPos: "noun",
    primaryMeaningZh: "动物学",
    meaning: "动物学",
    meaningZh: "动物学",
    definition: "the scientific study of animals",
    example: "She studied zoology at university.",
    exampleCn: "她在大学学习动物学。",
    phonetic: "/zuːˈɒlədʒi/",
    wordFamilyReviewed: true,
    meaningCoveragePending: true,
    meaningCoverageAuditStatus: "pending",
    qualityFlags: ["meaning_coverage_ai_pending"]
  };

  assert.equal(isReadingGAiCompletionCandidate(semanticPending), true);
  const completed = buildReadingGAiCompletedEntry(semanticPending, profile(), { aiSource: "ai-cache" });
  assert.equal(completed.primaryMeaningZh, "动物学");
  assert.equal(completed.meaningCoveragePending, false);
  assert.equal(completed.meaningCoverageAuditStatus, "reviewed");
  assert.ok(completed.qualityFlags.includes("meaning_coverage_ai_reviewed"));
  assert.ok(!completed.qualityFlags.includes("meaning_coverage_ai_pending"));
});

test("dedicated common-sense review leaves non-meaning teaching fields untouched", () => {
  const pending = {
    ...pendingEntry(),
    primaryLayer: "priority1500",
    layers: ["priority1500"],
    studyMode: "active",
    meaningCoveragePending: true,
    qualityFlags: ["meaning_coverage_ai_pending"],
    forms: [{ word: "zoologies", type: "plural", meaning: "动物学（复数）" }],
    wordFamily: [{ word: "zoological", pos: "adjective", meaning: "动物学的" }]
  };
  assert.equal(isReadingGMeaningCoverageCandidate(pending), true);
  const completed = buildReadingGMeaningCoverageCompletedEntry(pending, profile(), { aiSource: "ai-cache" });
  assert.deepEqual(completed.forms, pending.forms);
  assert.deepEqual(completed.wordFamily, pending.wordFamily);
  assert.equal(completed.meaningCoveragePending, false);
});

test("local common-sense reconciliation falls back to a usable cached profile", () => {
  const pending = {
    ...pendingEntry(),
    primaryLayer: "priority1500",
    layers: ["priority1500"],
    studyMode: "active",
    meaningCoveragePending: true,
    qualityFlags: ["meaning_coverage_ai_pending"]
  };
  const cached = profile();
  const resolved = resolveReadingGMeaningCoverageProfile(pending, cached);

  assert.equal(resolved?.profile, cached);
  assert.equal(resolved?.aiSource, "ai-cache");
  assert.equal(resolveReadingGMeaningCoverageProfile(pending, null), null);
});

test("G-reading item normalization keeps a persisted common-sense failure reason", () => {
  const normalized = normalizeReadingGItem({
    id: "rg_word_record",
    word: "record",
    meaningCoverageLastFailure: {
      mode: "meaning-coverage",
      reason: "primary explanation is too short",
      source: "existing-cache",
      recordedAt: "2026-08-10T00:00:00.000Z"
    }
  });
  assert.deepEqual(normalized.meaningCoverageLastFailure, {
    mode: "meaning-coverage",
    reason: "primary explanation is too short",
    source: "existing-cache",
    recordedAt: "2026-08-10T00:00:00.000Z"
  });
});

test("G-reading answer record separates its noun and verb senses", () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
  const answer = vocab.items.find((entry) => entry.id === "rg_word_answer");

  assert.ok(answer);
  assert.deepEqual(answer.senses.map((sense) => sense.pos), ["noun", "verb"]);
  assert.equal(isReadingGContentIncomplete(answer), false);
});

test("local relation completion fills safe meanings without inventing derivative meanings", () => {
  const items = [{
    id: "rg_word_research",
    word: "research",
    entryType: "word",
    primaryMeaningZh: "研究",
    forms: [{ word: "researched", type: "past tense" }],
    wordFamily: [
      { word: "researcher", pos: "noun" },
      { word: "researchish", pos: "adjective" }
    ]
  }];
  const master = new Map([
    ["researcher", { word: "researcher", meaning: "研究人员" }]
  ]);
  const result = fillReadingGRelationMeanings(items, master);

  assert.match(result.items[0].forms[0].meaning, /研究/);
  assert.equal(result.items[0].wordFamily[0].meaning, "研究人员");
  assert.equal(result.items[0].wordFamily[1].meaning, undefined);
  assert.equal(result.stats.stillMissing, 1);
});

test("the visible '仅单词' entry matches the current post-deletion dataset", () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
  const items = vocab.items.map((entry, index) => normalizeReadingGItem(entry, index)).filter(Boolean);
  const visibleWords = buildRgStudyList(items, { type: "entryType", value: "word" }, {}, "meaning");
  const expectedWords = items.filter((entry) => (
    entry.entryType === "word" && !isReadingGContentIncomplete(entry)
  ));

  assert.equal(visibleWords.length, expectedWords.length);
  assert.ok(visibleWords.length <= vocab.wordCount);
});

test("D/Delete shortcut removes only the selected G entry outside editors", () => {
  const entries = [pendingEntry(), { ...pendingEntry(), id: "rg_word_alpha", word: "alpha", normalizedKey: "alpha" }];
  const target = entries[0];
  const payload = {
    entries: [{
      key: getReadingGRetirementKey(target),
      id: target.id,
      word: target.word,
      entryType: target.entryType,
      deletedAt: "2026-08-03T00:00:00.000Z"
    }]
  };
  const result = applyReadingGRetirements(entries, payload);

  assert.deepEqual(result.items.map((entry) => entry.id), ["rg_word_alpha"]);
  assert.deepEqual(result.removed.map((entry) => entry.id), [target.id]);
  assert.equal(shouldHandleStudyDeleteShortcut({ key: "d", code: "KeyD", target: { tagName: "BODY" } }), true);
  assert.equal(shouldHandleStudyDeleteShortcut({ key: "Delete", target: { tagName: "DIV" } }), true);
  assert.equal(shouldHandleStudyDeleteShortcut({ key: "d", target: { tagName: "INPUT" } }), false);
  assert.equal(shouldHandleStudyDeleteShortcut({ key: "d", ctrlKey: true, target: { tagName: "BODY" } }), false);
});

test("G-reading deletion follows the active ordered queue instead of the source order", () => {
  const entries = [
    { id: "rg_word_alpha", word: "alpha" },
    { id: "rg_word_beta", word: "beta" },
    { id: "rg_word_gamma", word: "gamma" },
    { id: "rg_word_delta", word: "delta" }
  ];
  const orderedQueue = [
    { ...entries[2], originalIndex: 2 },
    { ...entries[0], originalIndex: 0 },
    { ...entries[3], originalIndex: 3 },
    { ...entries[1], originalIndex: 1 }
  ];
  const visibleIds = new Set(entries.map((entry) => entry.id));
  const result = buildAtomicDeletionNavigation({
    words: entries,
    currentIndex: 0,
    filter: { type: "entryType", value: "word" },
    wordMatchesFilter: (entry) => visibleIds.has(entry?.id),
    getEntryKey: (entry) => entry?.id,
    orderedQueue
  });

  assert.equal(result.deletedCount, 1);
  assert.equal(result.words[result.index].id, "rg_word_delta");
  assert.deepEqual(
    result.queueIndices.map((sourceIndex) => result.words[sourceIndex].id),
    ["rg_word_gamma", "rg_word_delta", "rg_word_beta"]
  );
});

test("G-reading progress seeking follows the active ordered queue", () => {
  const orderedIndices = [12, 3, 27, 8];

  assert.equal(wordStudyIndexAtPosition(orderedIndices, 1), 12);
  assert.equal(wordStudyIndexAtPosition(orderedIndices, 3), 27);
  assert.equal(wordStudyIndexAtPosition(orderedIndices, 99), 8);
});

test("G-main AI completion uses the synonym-verification throughput pattern", () => {
  const page = fs.readFileSync(path.join(root, "app/reading-g/page.jsx"), "utf8");
  const route = fs.readFileSync(path.join(root, "app/api/reading-g/complete-pending/route.js"), "utf8");

  assert.match(page, /AI_COMPLETION_BATCH_SIZE = 120/);
  assert.match(page, /AI_COMPLETION_REQUEST_BATCH_SIZE = 40/);
  assert.match(page, /AI_COMPLETION_CONCURRENCY = 3/);
  assert.match(page, /每轮最多120词，拆成最多3个每批40词的并发请求/);
  assert.match(route, /MAX_BATCH_WORDS = 120/);
  assert.match(route, /AI_REQUEST_BATCH_SIZE = 40/);
  assert.match(route, /MAX_CONCURRENT_AI_REQUESTS = 3/);
  assert.match(route, /Promise\.allSettled/);
  assert.match(route, /requestBatches\.slice\(0, MAX_CONCURRENT_AI_REQUESTS\)/);
  assert.match(route, /maxSplitDepth: 0/);
  assert.match(route, /syncReadingGAiCompletedEntriesToMaster/);
  assert.match(route, /masterSync/);
  assert.match(route, /addedCount: 0/);
  assert.match(page, /masterAddedTotal/);
});

test("G-reading navigation hides unrelated shortcuts and exposes the scoped AI action", () => {
  const page = fs.readFileSync(path.join(root, "app/reading-g/page.jsx"), "utf8");
  const header = fs.readFileSync(path.join(root, "app/components/GlobalStudyHeader.jsx"), "utf8");
  const route = fs.readFileSync(path.join(root, "app/api/reading-g/complete-pending/route.js"), "utf8");
  const synonymRoute = fs.readFileSync(path.join(root, "app/api/reading-g/complete-synonyms/route.js"), "utf8");
  const deleteRoute = fs.readFileSync(path.join(root, "app/api/reading-g/delete-entry/route.js"), "utf8");
  const loader = fs.readFileSync(path.join(root, "app/lib/reading-g-vocab/load-reading-g.mjs"), "utf8");
  const keys = fs.readFileSync(path.join(root, "app/lib/reading-g-vocab/keys.mjs"), "utf8");
  const satellite = fs.readFileSync(path.join(root, "app/components/SatelliteLexiconFlashcard.jsx"), "utf8");
  const staticPage = fs.readFileSync(path.join(root, "public/reading-g.html"), "utf8");
  const staticScript = fs.readFileSync(path.join(root, "public/assets/reading-g.js"), "utf8");

  assert.match(header, /label: "专项提升"[\s\S]*href: "\/basic", label: "零基础单词"/);
  assert.doesNotMatch(page, /href: "\/spelling-words", label: "单词拼写训练"/);
  assert.doesNotMatch(page, /href: "\/meaning", label: "看词选意思/);
  assert.doesNotMatch(staticPage, /href="\.\/basic\.html" class="top-btn"/);
  assert.doesNotMatch(staticPage, /href="\.\/meaning\.html" class="top-btn"/);
  assert.doesNotMatch(staticPage, /href="\.\/spelling\.html" class="top-btn"/);
  assert.match(page, /AI补全待补词/);
  assert.match(page, /AI_COMPLETION_BATCH_SIZE = 120/);
  assert.match(page, /AI_COMPLETION_REQUEST_BATCH_SIZE = 40/);
  assert.match(page, /AI_COMPLETION_CONCURRENCY = 3/);
  assert.match(page, /SYNONYM_AI_COMPLETION_BATCH_SIZE = 120/);
  assert.match(page, /SYNONYM_AI_REQUEST_BATCH_SIZE = 40/);
  assert.match(page, /SYNONYM_AI_CONCURRENCY = 3/);
  assert.match(page, /自动补全全部/);
  assert.match(page, /停止自动补全/);
  assert.match(page, /autoAll/);
  assert.match(page, /aiAutoStopRef/);
  assert.match(page, /失败词本轮不自动重试/);
  assert.match(page, /新增完整词/);
  assert.match(page, /主资料补全/);
  assert.match(page, /type: "questionBankComplete", value: ""/);
  assert.match(page, /type: "contentIncomplete", value: ""/);
  assert.match(page, /setFilter\(\{ type: "layer", value: "questionBankPending" \}\)/);
  assert.match(route, /requireLocalAdmin/);
  assert.match(route, /MAX_BATCH_WORDS = 120/);
  assert.match(route, /AI_REQUEST_BATCH_SIZE = 40/);
  assert.match(route, /MAX_CONCURRENT_AI_REQUESTS = 3/);
  assert.match(route, /Promise\.allSettled/);
  assert.match(synonymRoute, /MAX_BATCH_WORDS = 120/);
  assert.match(synonymRoute, /AI_REQUEST_BATCH_SIZE = 40/);
  assert.match(synonymRoute, /MAX_CONCURRENT_AI_REQUESTS = 3/);
  assert.match(synonymRoute, /Promise\.allSettled/);
  assert.match(synonymRoute, /timeoutMs: 90000/);
  assert.match(synonymRoute, /maxTokens: 6000/);
  assert.match(route, /maxSplitDepth: 0/);
  assert.match(route, /isReadingGAiCompletionCandidate/);
  assert.match(route, /withReadingGVocabWriteLock/);
  assert.match(route, /atomicWriteReadingGJson\(VOCAB_PATH, nextVocab\)/);
  assert.doesNotMatch(route, /runReadingGQuestionBankExpansion/);
  assert.match(page, /shouldHandleStudyDeleteShortcut/);
  assert.match(page, /studyQueueOverride/);
  assert.match(page, /freezeStudyQueueRows\(nextStudyList\)/);
  assert.match(page, /wordStudyIndexAtPosition\(studyIndices, position\)/);
  assert.match(page, /onPositionCommit=\{isQuizMode \? null : seekStudyPosition\}/);
  assert.match(page, /getPositionPreview=\{isQuizMode \? null : getStudyPositionPreview\}/);
  assert.match(page, /DELETE_CURRENT_WORD_EVENT/);
  assert.match(page, /\/api\/reading-g\/delete-entry/);
  assert.match(deleteRoute, /requireLocalAdmin/);
  assert.match(deleteRoute, /backups["], ["]reading-g-delete/);
  assert.match(deleteRoute, /syncReadingGDeletedEntriesToMaster/);
  assert.match(deleteRoute, /masterDelete/);
  // Fast delete path: retirements + splice vocab, no full question-bank re-expand.
  assert.doesNotMatch(deleteRoute, /runReadingGQuestionBankExpansion/);
  assert.match(deleteRoute, /fastPath:\s*true/);
  assert.match(deleteRoute, /alreadyDeleted: true/);
  assert.doesNotMatch(page, /确定从G类阅读词库删除/);
  assert.match(page, /liveDeleteRef/);
  assert.match(page, /studyQueueOverride/);
  assert.match(page, /scheduleReadingGDeletePersist/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /entryIds/);
  assert.match(page, /freezeStudyQueueRows\(nextStudyList\)/);
  assert.doesNotMatch(page, /flushSync/);
  assert.match(page, /shouldResumeParaphraseOnLoad/);
  assert.match(page, /savedSession\?\.filter\?\.type === "paraphraseQuiz"/);
  assert.doesNotMatch(page, /sessionIsQuiz = savedSession\?\.filter\?\.type === "paraphraseQuiz" \|\| Boolean\(savedParaSession\)/);
  assert.match(deleteRoute, /batched:\s*true/);
  assert.match(deleteRoute, /entryIds/);
  assert.match(keys, /READING_G_VOCAB_CACHE_KEY = "reading-g-vocab:normalized:[^"]+"/);
  assert.match(loader, /fetchImpl\(READING_G_DATA_URL, \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(loader, /loadSessionValue\(\s*READING_G_VOCAB_CACHE_KEY/);
  assert.match(loader, /clearSessionValue\(READING_G_VOCAB_CACHE_KEY\)/);
  assert.match(satellite, /data-testid="reading-g-auto-play-toggle"/);
  assert.match(satellite, /!isReadingG \|\| quizMode/);
  assert.match(satellite, /onSpeakWordRef\.current\?\.\(\)/);
  assert.match(satellite, /onNextRef\.current\?\.\(\)/);
  assert.match(satellite, /await onSpeakWordRef\.current\?\.\(\)/);
  assert.match(satellite, /document\.addEventListener\("visibilitychange"/);
  assert.doesNotMatch(satellite, /window\.setInterval/);
  assert.match(staticPage, /id="autoPlayBtn"/);
  assert.match(staticScript, /function startAutoPlay\(\)/);
  assert.match(staticScript, /function scheduleAutoPlayAdvance\(\)/);
  assert.match(staticScript, /speak\(currentItem\(\) && currentItem\(\)\.word\)/);
});
