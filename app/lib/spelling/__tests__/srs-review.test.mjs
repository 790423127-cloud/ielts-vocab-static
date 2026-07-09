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
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  assert.match(source, /practiceSource === "srs_review"/);
  assert.match(source, /data-testid="spelling-total-wrong-count"/);
  assert.match(source, /srsReviewEntriesToSpellingCandidates/);
});

test("progress and shortcut controls render in the page footer", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  const footerStart = source.indexOf('<footer className="spelling-training-footer">');
  const progressStart = source.indexOf('aria-label="当前批次进度"');
  const shortcutsStart = source.indexOf('aria-label="键盘快捷键"');

  assert.ok(footerStart > 0);
  assert.ok(progressStart > footerStart);
  assert.ok(shortcutsStart > progressStart);
  assert.match(source, /<b>1<\/b> 重播/);
  assert.match(source, /<b>5<\/b> 重点复习/);
  assert.match(source, /Ctrl\+Z 撤回/);
  assert.match(source, /handleGoToPreviousWord/);
  assert.match(source, /handleGoToNextWord/);
  assert.match(source, /Ctrl\+← → 切词/);
  assert.match(source, /batchProgressCurrentNumber/);
  assert.match(source, /resultBatchProgress\.currentNumber/);
  assert.match(source, /spelling-action-notice\$\{actionNotice/);
  assert.match(source, /personalWrongNavigationUnits/);
  assert.match(source, /batchNavigationWordIds/);
});

test("stored browser preferences are restored after hydration", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  assert.match(source, /const \[prefsHydrated, setPrefsHydrated\] = useState\(false\)/);
  assert.match(source, /useEffect\(\(\) => \{\s*const uxPrefs = readUxPrefs\(scope\)/);
  assert.match(source, /localStorage\.getItem\(key\)/);
  assert.match(source, /localStorage\.setItem\(getScopeStorageKey\(scope\), JSON\.stringify\(prefs\)\)/);
  assert.doesNotMatch(source, /useState\(\(\) => readUxPrefs\(scope\)/);
});

test("spelling page persists and restores the current word for each active batch", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  assert.match(source, /function getPositionKey\(scope\)/);
  assert.match(source, /readSpellingPosition\(scope, activeBatchId\)/);
  assert.match(source, /writeSpellingPosition\(scope, \{/);
  assert.match(source, /activeBatchId,\s*wordId,/);
  assert.match(source, /function resolvePersonalWrongNavigationWordId/);
  assert.match(source, /navigationWordId/);
  assert.match(source, /saved\?\.navigationWordId \|\| saved\?\.wordId/);
  assert.match(source, /restoringPositionRef\.current/);
  assert.match(source, /spelling\.navigateToWord\(savedWordId\)/);
});

test("batch selection uses an in-page picker instead of a fragile native select", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  assert.match(source, /function BatchPicker/);
  assert.match(source, /className="spelling-batch-picker"/);
  assert.doesNotMatch(source, /className="spelling-batch-select/);
});

test("completed batches render success, daily stats, and next-round controls", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  assert.match(source, /isBatchComplete && !current/);
  assert.match(source, /className="spelling-completion-summary"/);
  assert.match(source, /\{batchSuccessRate\}%/);
  assert.match(source, /"进入下一轮"/);
  assert.match(source, />今日统计</);
  assert.match(source, /formatActiveLearningTime\(dailyStats\.activeMs\)/);
});

test("spelling page auto-plays speech only when presenting a question, not on correct feedback", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");

  assert.match(source, /\["show_question", "in_repair", "wrong_feedback"\]\.includes\(spelling\.uiState\)/);
  assert.doesNotMatch(source, /spelling\.uiState !== "correct_feedback" \|\| previousUiState === "correct_feedback"/);
  assert.doesNotMatch(source, /practiceSource !== "personal_wrong_book" \|\| !spelling\.ready \|\| !current/);
});
