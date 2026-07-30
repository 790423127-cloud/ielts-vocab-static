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
  const source = [
    fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8"),
    fs.readFileSync(path.join(root, "app/components/SpellingStatsSidebar.jsx"), "utf8")
  ].join("\n");

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
  const dock = fs.readFileSync(path.join(root, "app/components/SpellingPersonalWrongDock.jsx"), "utf8");
  const helpers = fs.readFileSync(path.join(root, "app/lib/spelling/spelling-training-page-helpers.mjs"), "utf8");
  const combined = `${source}\n${dock}\n${helpers}`;

  assert.match(source, /const personalWrongCurrentBatchRecords = personalWrongBatchSelection\.records \|\| \[\]/);
  assert.match(source, /const personalWrongCurrentBatchWriteCount = Number\(personalWrongBatchSelection\.writeCount/);
  assert.match(source, /const personalWrongTotalWriteCount = personalWrongSourceEntries\.length/);
  assert.match(helpers, /export function formatPersonalWrongRepeatLabel/);
  assert.match(helpers, /return `原形\$\{PERSONAL_WRONG_BOOK_BASE_REPS\}遍`/);
  assert.match(source, /handleDeletePersonalWrongRecord/);
  assert.match(dock, /spelling-personal-wrong-list__index/);
  assert.match(dock, /spelling-personal-wrong-list__delete/);
  assert.match(source, /practiceSource === "personal_wrong_book" && spelling\.ready/);
  assert.match(dock, /本组练习 \{personalWrongCurrentBatchWriteCount\} 遍/);
  assert.match(dock, /全部练习 \{personalWrongTotalWriteCount\} 遍/);
  assert.match(dock, /personalWrongCurrentBatchRecords/);
  assert.match(dock, /spelling-personal-wrong-list--virtual/);
  assert.doesNotMatch(combined, /\$\{PERSONAL_WRONG_BOOK_REPETITIONS\}遍`\}/);
  assert.doesNotMatch(combined, /personalWrongCurrentBatchRecords\.slice\(0, 16\)/);
  assert.doesNotMatch(combined, /personalWrongCurrentBatchRecords\.slice\(0, 12\)/);
  assert.doesNotMatch(combined, /personalWrongScopedRecords\.slice\(0, 16\)/);
  assert.doesNotMatch(combined, /personalWrongScopedRecords\.slice\(0, 12\)/);
  assert.doesNotMatch(combined, /本组[^`\\n]*personalWrongSourceEntries\.length/);
});

test("spelling page does not render placeholder questions before lexicon is ready", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  const focus = fs.readFileSync(path.join(root, "app/components/SpellingFocusCard.jsx"), "utf8");
  const combined = `${source}\n${focus}`;

  assert.match(source, /if \(!lexicon\) return \[\]/);
  assert.match(source, /resolveSpellingLoadingState\(\{/);
  assert.match(source, /const isSpellingLoading = loadingState\.loading/);
  assert.match(source, /activeSourceLoading/);
  assert.match(source, /const current = !isPagePreparing \? spelling\.currentWord : null/);
  assert.match(source, /const hadCachedLexiconAtMountRef = useRef\(Boolean\(lexicon\)\)/);
  assert.match(source, /isPagePreparing\s*&& !hadCachedLexiconAtMountRef\.current/);
  assert.match(source, /const isStatsSidebarVisible = !isPagePreparing && statsSidebarOpen/);
  assert.match(source, /spelling-page-layout\$\{isStatsSidebarVisible \? " is-sidebar-open" : ""\}/);
  assert.match(focus, /isSpellingLoading \? \(/);
  assert.match(combined, /正在准备本轮训练/);
  assert.match(focus, /spellingPreparingPanel/);
  assert.doesNotMatch(focus, /spelling-line-input--preparing|音标准备中|词性与释义准备中/);
});

test("home page can deep-link to the AI tools menu", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/page.jsx"), "utf8");
  const wordFlashcardView = fs.readFileSync(path.join(root, "app/components/WordFlashcardView.jsx"), "utf8");
  const adminPanel = fs.readFileSync(path.join(root, "app/components/VocabAdminToolsPanel.jsx"), "utf8");
  const adminHook = fs.readFileSync(path.join(root, "app/hooks/useHomeLexiconAdmin.js"), "utf8");

  assert.match(source, /openAiTools/);
  assert.match(source, /toolsMenuRef/);
  assert.match(source, /aiToolsRef/);
  assert.match(wordFlashcardView, /VocabAdminToolsPanel/);
  assert.match(adminHook, /import\("\.\/useHomeLexiconAdmin\.ai\.js"\)/);
  assert.match(adminHook, /import\("\.\/useHomeLexiconAdmin\.io\.js"\)/);
  // AI tools markup lives in the extracted admin panel component.
  assert.match(adminPanel, /id="ai-tools"/);
  assert.match(adminPanel, /AI工具（会扣费）/);
  assert.match(source, /AI工具（会扣费）/);
});

test("static learning pages expose working reading, error-bank, and SRS navigation", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const staticFiles = ["basic.html", "meaning.html", "reading-g.html", "spelling.html", "ielts-538.html"];
  const sources = staticFiles.map((name) => fs.readFileSync(path.join(root, "public", name), "utf8"));
  const spellingSource = sources[3];
  const spellingScript = fs.readFileSync(path.join(root, "public/assets/spelling.js"), "utf8");
  const exportRoute = fs.readFileSync(path.join(root, "app/api/export-static/route.js"), "utf8");

  for (const source of sources) {
    assert.match(source, /reading-g\.html/);
    assert.match(source, /spelling\.html\?source=error_bank/);
    assert.match(source, /spelling\.html\?source=srs_review/);
    assert.doesNotMatch(source, /href="#"/);
    assert.match(source, /20260726_ielts538_v2/);
  }

  assert.match(spellingScript, /const query = new URLSearchParams\(window\.location\.search\)/);
  assert.match(spellingScript, /query\.get\("source"\)/);
  assert.match(spellingScript, /VALID_PRACTICE_SOURCES\.has\(requestedSource\)/);
  assert.match(spellingScript, /VALID_ENTRY_MODES\.has\(requestedMode\)/);
  assert.match(spellingSource, /id="settingsToggle"/);
  assert.match(spellingScript, /SETTINGS_PANEL_PREF_PREFIX/);
  assert.match(spellingScript, /settingsCollapsed = saved === null \? viewport === "mobile"/);
  assert.doesNotMatch(spellingSource, /href="\/spelling-(?:words|phrases)"/);
  assert.match(exportRoute, /STATIC_EXPORT_VERSION = "20260730_mobile_sync_cursor_v11"/);
  assert.match(exportRoute, /href="\.\/reading-words\.html">阅读生词本<\/a>/);
  assert.match(exportRoute, /wordId: stableId/);
  assert.match(exportRoute, /otherMeanings: Array\.isArray\(item\?\.otherMeanings\)/);
  assert.match(exportRoute, /id="topToolsToggle"/);
  assert.match(exportRoute, /topToolsCollapsed=saved===null\?\(viewport==="mobile"\|\|viewport==="compact-desktop"\)/);
  assert.match(exportRoute, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(exportRoute, /classList\.toggle\("mobile-mode",narrow&&mobileMode\)/);
  assert.doesNotMatch(exportRoute, /<button id="mobileModeBtn"/);
  assert.match(fs.readFileSync(path.join(root, "public/assets/spelling.css"), "utf8"), /D2\.1 responsive system/);
  assert.match(exportRoute, /static_vocab_audio_\$\{STATIC_EXPORT_VERSION\}/);
  assert.doesNotMatch(exportRoute, /function audioFor\(text\) \{\s*if \(!includeAudioFiles\) return "";/);
  assert.match(exportRoute, /if \(includeAudioFiles && !audioFiles\.has\(target\)\)/);
  assert.match(exportRoute, /audio=new Audio\(url\)/);
  assert.match(exportRoute, /audio\.playsInline=true/);
  assert.doesNotMatch(exportRoute, /createMediaElementSource/);
  assert.match(exportRoute, /function completeToolbarSelectAction\(control\)/);
  assert.match(exportRoute, /if\(document\.activeElement===control\)control\.blur\(\)/);
  assert.match(exportRoute, /const oldOrderedQueue=list\(\)/);
  assert.match(exportRoute, /remapWordOrderSnapshotsAfterDeletion\(pref\.snapshots,previousWords\)/);
  assert.match(exportRoute, /saveWordOrderSnapshot\(filter,snapshotKey,createWordOrderSnapshot\(preservedQueue,index\)\)/);
  assert.match(spellingScript, /audioPlayer = new Audio\(url\)/);
  assert.match(spellingScript, /audioPlayer\.playsInline = true/);
  assert.doesNotMatch(spellingScript, /createMediaElementSource/);
  assert.match(exportRoute, /D2\.3 high-visibility study action dock/);
  assert.match(exportRoute, /\.status\{min-width:112px;min-height:50px/);
  assert.match(exportRoute, /\.progress\{position:relative;height:9px/);
});
