import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mergeDueSrsRecords, srsReviewEntriesToSpellingCandidates } from "../srs-review.mjs";

test("SRS review joins due records to lexicon and orders oldest due first", () => {
  const lexicon = [
    { word: "alpha", wordId: "word_a", meaning: "第一个" },
    { word: "beta", wordId: "word_b", meaning: "第二个" }
  ];
  const merged = mergeDueSrsRecords([
    { wordId: "word_a", stage: 2, nextReviewAt: 300 },
    { wordId: "word_b", stage: 1, nextReviewAt: 100 },
    { wordId: "missing", stage: 1, nextReviewAt: 50 }
  ], lexicon);

  assert.deepEqual(merged.map((item) => item.wordId), ["word_b", "word_a"]);
  assert.equal(merged[0].srs.stage, 1);
  assert.equal(merged[0].expectedAnswer, "beta");
});

test("SRS candidates omit queue metadata without mutating source", () => {
  const items = [{ word: "alpha", wordId: "word_a", srs: { stage: 2, nextReviewAt: 100 } }];
  const candidates = srsReviewEntriesToSpellingCandidates(items);
  assert.equal(candidates[0].srs, undefined);
  assert.equal(items[0].srs.stage, 2);
});

test("production spelling page exposes SRS source and current wrong count", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = [
    fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8"),
    fs.readFileSync(path.join(root, "app/components/SpellingFocusCard.jsx"), "utf8")
  ].join("\n");
  assert.match(source, /practiceSource === "srs_review"/);
  assert.match(source, /data-testid="spelling-total-wrong-count"/);
  assert.match(source, /srsReviewEntriesToSpellingCandidates/);
});

test("progress and shortcut controls render in the page footer", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const page = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  const focus = fs.readFileSync(path.join(root, "app/components/SpellingFocusCard.jsx"), "utf8");
  const source = `${page}\n${focus}`;
  const footerStart = focus.indexOf('<footer className="spelling-training-footer">');
  const progressStart = focus.indexOf('aria-label="当前批次进度"');
  const shortcutsStart = focus.indexOf('aria-label="键盘快捷键"');

  assert.ok(footerStart >= 0);
  assert.ok(progressStart > footerStart);
  assert.ok(shortcutsStart > progressStart);
  assert.match(focus, /<b>1<\/b> 重播/);
  assert.match(focus, /<b>5<\/b> 重点复习/);
  assert.match(focus, /Ctrl\+Z 撤回/);
  assert.match(source, /handleGoToPreviousWord/);
  assert.match(source, /handleGoToNextWord/);
  assert.match(focus, /Ctrl\+← → 切词/);
  assert.match(page, /batchProgressCurrentNumber/);
  assert.match(page, /resultBatchProgress\.currentNumber/);
  assert.match(focus, /spelling-action-notice\$\{actionNotice/);
  assert.match(page, /personalWrongNavigationUnits/);
  assert.match(source, /batchNavigationWordIds/);
});

test("stored browser preferences are restored after hydration", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  const hook = fs.readFileSync(path.join(root, "app/hooks/useSpellingTrainingPreferences.js"), "utf8");
  const helpers = fs.readFileSync(path.join(root, "app/lib/spelling/spelling-training-page-helpers.mjs"), "utf8");
  assert.match(source, /useSpellingTrainingPreferences\(scope\)/);
  assert.match(hook, /const \[hydratedScope, setHydratedScope\] = useState\(""\)/);
  assert.match(hook, /loadSpellingTrainingPreferences\(normalizedScope\)/);
  assert.match(hook, /writeCategoryPrefs\(normalizedScope, storedPrefs\)/);
  assert.match(helpers, /localStorage\.getItem\(key\)/);
  assert.match(helpers, /localStorage\.setItem\(getScopeStorageKey\(scope\), JSON\.stringify\(prefs\)\)/);
  assert.doesNotMatch(source, /useState\(\(\) => readUxPrefs\(scope\)/);
});

test("spelling page persists and restores the current word for each active batch", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  const helpers = fs.readFileSync(path.join(root, "app/lib/spelling/spelling-training-page-helpers.mjs"), "utf8");
  assert.match(helpers, /export function getPositionKey\(scope\)/);
  assert.match(source, /readSpellingPosition\(scope, activeBatchId\)/);
  assert.match(source, /writeSpellingPosition\(scope, \{/);
  assert.match(source, /activeBatchId,\s*wordId,/);
  assert.match(helpers, /export function resolvePersonalWrongNavigationWordId/);
  assert.match(source, /navigationWordId/);
  assert.match(source, /saved\?\.navigationWordId \|\| saved\?\.wordId/);
  assert.match(source, /restoringPositionRef\.current/);
  assert.match(source, /navigateToWord\(savedWordId\)/);
});

test("batch selection uses an in-page picker instead of a fragile native select", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  const chrome = fs.readFileSync(path.join(root, "app/components/SpellingTrainingChrome.jsx"), "utf8");
  assert.match(chrome, /export function BatchPicker/);
  assert.match(chrome, /className="spelling-batch-picker"/);
  const rangeBar = fs.readFileSync(path.join(root, "app/components/SpellingRangeBar.jsx"), "utf8");
  assert.match(rangeBar, /BatchPicker/);
  assert.doesNotMatch(source, /className="spelling-batch-select/);
});

test("completed batches render success, daily stats, and next-round controls", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  const focus = fs.readFileSync(path.join(root, "app/components/SpellingFocusCard.jsx"), "utf8");
  const sidebar = fs.readFileSync(path.join(root, "app/components/SpellingStatsSidebar.jsx"), "utf8");
  const combined = `${source}\n${focus}\n${sidebar}`;
  assert.match(focus, /isBatchComplete && !current/);
  assert.match(focus, /className="spelling-completion-summary"/);
  assert.match(focus, /\{batchSuccessRate\}%/);
  assert.match(focus, /"进入下一轮"/);
  assert.match(sidebar, />今日统计</);
  assert.match(combined, /formatActiveLearningTime\(dailyStats\.activeMs\)/);
});

test("spelling page auto-plays speech only when presenting a question, not on correct feedback", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");

  assert.match(source, /\["show_question", "in_repair", "wrong_feedback"\]\.includes\(spelling\.uiState\)/);
  assert.doesNotMatch(source, /spelling\.uiState !== "correct_feedback" \|\| previousUiState === "correct_feedback"/);
  assert.doesNotMatch(source, /practiceSource !== "personal_wrong_book" \|\| !spelling\.ready \|\| !current/);
});
