import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCombinedExportFilename,
  buildCombinedLexiconExportPayload,
  buildCurrentBatchExportFilename,
  buildCurrentBatchExportPayload,
  buildCurrentCategoryExportFilename,
  buildCurrentCategoryExportPayload,
  buildEnglishTxtLines,
  compactSpellingExportEntry
} from "../spelling-export.mjs";

test("compactSpellingExportEntry keeps spelling-facing fields", () => {
  const row = compactSpellingExportEntry({
    word: "minibus",
    meaning: "小型巴士，面包车",
    phonetic: "/ˈmɪnibʌs/",
    pos: "noun",
    example: "The daycare centre uses a minibus every morning.",
    exampleCn: "托儿所每天早上用小型巴士。",
    difficulty: "基础高频",
    category: "IELTS G类 · 交通"
  });

  assert.equal(row.word, "minibus");
  assert.equal(row.meaning, "小型巴士，面包车");
  assert.equal(row.phonetic, "/ˈmɪnibʌs/");
  assert.equal(row.example, "The daycare centre uses a minibus every morning.");
});

test("buildCombinedLexiconExportPayload exports words and phrases together", () => {
  const payload = buildCombinedLexiconExportPayload({
    headwords: [{ word: "alpha", meaning: "甲" }],
    phrases: [{ word: "look after", meaning: "照顾" }],
    lexiconVersion: "v1",
    lexiconHash: "abc"
  }, { exportedAt: "2026-06-23T08:00:00.000Z" });

  assert.equal(payload.exportType, "spelling-lexicon-combined");
  assert.equal(payload.counts.words, 1);
  assert.equal(payload.counts.phrases, 1);
  assert.equal(payload.words[0].word, "alpha");
  assert.equal(payload.phrases[0].word, "look after");
});

test("buildCurrentBatchExportPayload and txt lines preserve order", () => {
  const payload = buildCurrentBatchExportPayload({
    scope: "word",
    practiceSource: "category",
    rangeLabel: "基础高频 · 第1批",
    entries: [
      { word: "alpha", meaning: "甲" },
      { word: "beta", meaning: "乙" }
    ],
    exportedAt: "2026-06-23T08:00:00.000Z"
  });

  assert.equal(payload.count, 2);
  assert.equal(payload.entries[1].word, "beta");
  assert.deepEqual(buildEnglishTxtLines(payload.entries), ["alpha", "beta"]);
});

test("current category export contains the full selected category instead of one batch", () => {
  const entries = Array.from({ length: 4903 }, (_, index) => ({
    word: `reading-${index + 1}`,
    meaning: `meaning-${index + 1}`
  }));
  const payload = buildCurrentCategoryExportPayload({
    scope: "word",
    categoryType: "lr_high_frequency",
    categoryValue: "listening_reading",
    rangeLabel: "听读高频",
    entries,
    exportedAt: "2026-06-24T08:00:00.000Z"
  });

  assert.equal(payload.exportType, "spelling-current-category");
  assert.equal(payload.count, 4903);
  assert.equal(payload.entries[4902].word, "reading-4903");
});

test("export filenames include counts and date", () => {
  const exportedAt = new Date("2026-06-23T08:00:00.000Z");
  assert.equal(
    buildCombinedExportFilename({ words: 10500, phrases: 600 }, exportedAt),
    "spelling-words-phrases-10500-600-2026-06-23.json"
  );
  assert.equal(
    buildCurrentBatchExportFilename("phrase", 120, "txt", exportedAt),
    "spelling-batch-phrases-120-2026-06-23.txt"
  );
  assert.equal(
    buildCurrentCategoryExportFilename("word", 2563, "json", exportedAt),
    "spelling-category-words-2563-2026-06-23.json"
  );
});

test("SpellingTrainingPage exposes one-click combined export controls", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");

  assert.match(source, /buildCombinedLexiconExportPayload/);
  assert.match(source, /data-testid="spelling-export-combined"/);
  assert.match(source, /data-testid="spelling-export-current-batch"/);
  assert.match(source, /data-testid="spelling-export-current-category-json"/);
  assert.match(source, /data-testid="spelling-export-current-category-txt"/);
  assert.match(source, /导出当前分类全部 JSON/);
  assert.match(source, /导出当前分类全部 TXT/);
  assert.match(source, /SpellingAiToolsPanel/);
  assert.match(source, /AI工具/);
  assert.doesNotMatch(source, /href="\/\?openAiTools=1#ai-tools"/);
});

test("personal wrong book lists render the selected batch records", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");

  assert.match(source, /const personalWrongCurrentBatchRecords = personalWrongBatchSelection\.records \|\| \[\]/);
  assert.match(source, /const personalWrongCurrentBatchWriteCount = Number\(personalWrongBatchSelection\.writeCount/);
  assert.match(source, /const personalWrongTotalWriteCount = personalWrongSourceEntries\.length/);
  assert.match(source, /function formatPersonalWrongRepeatLabel/);
  assert.match(source, /return `原形\$\{PERSONAL_WRONG_BOOK_BASE_REPS\}遍`/);
  assert.match(source, /handleDeletePersonalWrongRecord/);
  assert.match(source, /spelling-personal-wrong-list__index/);
  assert.match(source, /spelling-personal-wrong-list__delete/);
  assert.match(source, /practiceSource === "personal_wrong_book" && spelling\.ready/);
  assert.match(source, /本组练习 \{personalWrongCurrentBatchWriteCount\} 遍/);
  assert.match(source, /全部练习 \{personalWrongTotalWriteCount\} 遍/);
  assert.match(source, /personalWrongCurrentBatchRecords\.map/);
  assert.doesNotMatch(source, /\$\{PERSONAL_WRONG_BOOK_REPETITIONS\}遍`\}/);
  assert.doesNotMatch(source, /personalWrongCurrentBatchRecords\.slice\(0, 16\)/);
  assert.doesNotMatch(source, /personalWrongCurrentBatchRecords\.slice\(0, 12\)/);
  assert.doesNotMatch(source, /personalWrongScopedRecords\.slice\(0, 16\)/);
  assert.doesNotMatch(source, /personalWrongScopedRecords\.slice\(0, 12\)/);
  assert.doesNotMatch(source, /本组[^`\\n]*personalWrongSourceEntries\.length/);
});

test("spelling page does not render placeholder questions before lexicon is ready", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");

  assert.match(source, /if \(!lexicon\) return \[\]/);
  assert.match(source, /const isSpellingLoading = !lexicon \|\| !spelling\.ready/);
  assert.match(source, /const current = !isSpellingLoading \? spelling\.currentWord : null/);
  assert.match(source, /isSpellingLoading \? \(/);
  assert.match(source, /正在读取词库，请稍候/);
});

test("home page can deep-link to the AI tools menu", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/page.jsx"), "utf8");
  const adminPanel = fs.readFileSync(path.join(root, "app/components/VocabAdminToolsPanel.jsx"), "utf8");

  assert.match(source, /openAiTools/);
  assert.match(source, /toolsMenuRef/);
  assert.match(source, /aiToolsRef/);
  assert.match(source, /VocabAdminToolsPanel/);
  // AI tools markup lives in the extracted admin panel component.
  assert.match(adminPanel, /id="ai-tools"/);
  assert.match(adminPanel, /AI工具（会扣费）/);
  assert.match(source, /AI工具（会扣费）/);
});
