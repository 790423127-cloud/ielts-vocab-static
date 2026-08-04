import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReadingGAiCompletedEntry,
  isReadingGPendingAiEntry
} from "../ai-completion.mjs";
import { normalizeReadingGItem } from "../load-reading-g.mjs";
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
    meaningDetailZh: "研究动物的科学。",
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

test("G-reading AI completion only promotes an explicitly pending entry", () => {
  const pending = pendingEntry();
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
});

test("the visible '仅单词' entry matches the current post-deletion dataset", () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
  const items = vocab.items.map((entry, index) => normalizeReadingGItem(entry, index)).filter(Boolean);
  const visibleWords = buildRgStudyList(items, { type: "entryType", value: "word" }, {}, "meaning");

  assert.equal(visibleWords.length, vocab.wordCount);
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

test("G-reading navigation hides unrelated shortcuts and exposes the scoped AI action", () => {
  const page = fs.readFileSync(path.join(root, "app/reading-g/page.jsx"), "utf8");
  const header = fs.readFileSync(path.join(root, "app/components/GlobalStudyHeader.jsx"), "utf8");
  const route = fs.readFileSync(path.join(root, "app/api/reading-g/complete-pending/route.js"), "utf8");
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
  assert.match(page, /AI_COMPLETION_BATCH_SIZE = 10/);
  assert.match(page, /自动补全全部/);
  assert.match(page, /停止自动补全/);
  assert.match(page, /autoAll/);
  assert.match(page, /aiAutoStopRef/);
  assert.match(page, /失败词本轮不自动重试/);
  assert.match(page, /新增完整词/);
  assert.match(page, /待补词/);
  assert.match(page, /type: "questionBankComplete", value: ""/);
  assert.match(page, /type: "contentIncomplete", value: ""/);
  assert.match(page, /setFilter\(\{ type: "primaryLayer", value: "questionBankPending" \}\)/);
  assert.match(route, /requireLocalAdmin/);
  assert.match(route, /MAX_BATCH_WORDS = 10/);
  assert.match(route, /maxSplitDepth: 0/);
  assert.match(route, /isReadingGPendingAiEntry/);
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
  // Fast delete path: retirements + splice vocab, no full question-bank re-expand.
  assert.doesNotMatch(deleteRoute, /runReadingGQuestionBankExpansion/);
  assert.match(deleteRoute, /fastPath:\s*true/);
  assert.match(deleteRoute, /alreadyDeleted: true/);
  assert.doesNotMatch(page, /确定从G类阅读词库删除/);
  assert.match(page, /liveDeleteRef/);
  assert.match(page, /studyQueueOverride/);
  assert.match(page, /scheduleReadingGDeletePersist/);
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
  assert.match(staticPage, /id="autoPlayBtn"/);
  assert.match(staticScript, /function startAutoPlay\(\)/);
  assert.match(staticScript, /speak\(currentItem\(\) && currentItem\(\)\.word\)/);
});
