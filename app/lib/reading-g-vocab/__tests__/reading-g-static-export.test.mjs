import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildParaphraseQuizQueue } from "../paraphrase-quiz.mjs";
import { STATIC_RESPONSIVE_VERSION } from "../../static-export-responsive.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("static export assets and data files exist", () => {
  const files = [
    "public/reading-g.html",
    "public/assets/reading-g.js",
    "public/data/reading-g-vocab.json",
    "public/data/reading-g-paraphrases.json",
    "public/data/reading-g-question-evidence.json",
    "public/data/reading-g-import-report.json",
    "public/data/reading-g-retirements.json"
  ];
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
  }
});

test("static HTML references relative data paths", () => {
  const html = fs.readFileSync(path.join(root, "public/reading-g.html"), "utf8");
  assert.match(html, /reading-g\.js/);
  assert.match(html, new RegExp(STATIC_RESPONSIVE_VERSION));
  assert.match(html, /静态便携版/);
  const js = fs.readFileSync(path.join(root, "public/assets/reading-g.js"), "utf8");
  assert.match(js, /\.\/data\/reading-g-vocab\.json/);
  assert.match(js, /\.\/data\/reading-g-paraphrases\.json/);
  assert.match(js, /\.\/data\/reading-g-question-evidence\.json/);
  assert.match(js, /function questionEvidenceHtml\(/);
  assert.match(js, /function versionedDataUrl\(url\)/);
  assert.doesNotMatch(js, /DATA_URL \+ "\?v="/);
  assert.match(js, /paraphraseQuiz|同义/);
  assert.match(js, /questionBankActive/);
  assert.match(js, /questionBankAiCompleted/);
  assert.match(js, /questionBankPending/);
  assert.match(js, /difficulty === "基础高频"/);
  assert.match(js, /questionBankAiCompleted/);
  assert.match(js, /targetStage === "3"/);
  assert.match(js, /文章强化/);
  assert.match(js, /previousStudyPosition/);
  assert.match(js, /POSITIONS_KEY = "ielts_reading_g_positions_v3"/);
  assert.match(js, /function restoreStudyPosition\(/);
  assert.match(js, /function resetStudyToStart\(/);
  assert.match(js, /function seekStudyPosition\(/);
  assert.match(js, /progressSeek\.addEventListener\("input"/);
  assert.match(html, /id="progressSeek"/);
  assert.match(html, /id="progressJump"/);
  assert.match(js, /function scheduleAutoPlayAdvance\(/);
  assert.doesNotMatch(html, /senseHint|sense-hint/);
  assert.match(js, /function inlineStaticStudyMeaning\(/);
  assert.doesNotMatch(js, /renderStaticSenseHint|收起其他义项|个常见义项/);
  assert.match(html, /id="relationBlocks"/);
  assert.match(html, /body class="reading-g-static"/);
  assert.match(html, /id="readingTopbar"/);
  assert.match(html, /id="wordOrderSelect"/);
  assert.match(html, /id="difficultyOrderSelect"/);
  assert.match(html, /id="entrySelect"/);
  assert.match(html, /id="readingEntryBtn"/);
  assert.match(html, /id="hfQuickEntryBtn"/);
  assert.match(html, /id="part12OnlyHfQuickEntryBtn"/);
  assert.match(html, /id="unfamiliarQuickEntryBtn"/);
  assert.match(html, /id="hfPanelEntryBtn"/);
  assert.match(html, /id="part12OnlyHfPanelEntryBtn"/);
  assert.match(html, /id="unfamiliarPanelEntryBtn"/);
  assert.match(html, /id="restPanelEntryBtn"/);
  assert.match(html, /id="articleFrequencyPanel"/);
  assert.match(html, /剑雅5–21文章高频（Part 1–3）/);
  assert.match(html, /其余词汇（非文章高频）/);
  assert.match(html, /id="readingEntryBtn"/);
  assert.match(html, /全部范围/);
  assert.match(html, /reading-g-entry-tools/);
  assert.match(html, /id="readingControlsClose"/);
  assert.match(html, /id="prevBtn"[\s\S]*id="knownBtn"[\s\S]*id="unknownBtn"[\s\S]*id="nextBtn"/);
  assert.match(js, /function staticPosDisplay\(/);
  assert.match(js, /STATIC_POS_ZH/);
  assert.doesNotMatch(js, /filter\(function \(row\) \{ return row\.word; \}\)\.slice\(0, 6\)/);
  assert.doesNotMatch(js, /filter\(function \(row\) \{ return row\.word && !formKeys\[row\.word\.toLowerCase\(\)\]; \}\)\.slice\(0, 6\)/);
  assert.match(js, /function getStaticContentQuality\(/);
  assert.match(js, /type: "contentIncomplete"/);
  assert.match(js, /已转入内容补全队列/);
  assert.match(js, /资料完整度/);
  assert.match(js, /function getStaticSynonymStatus\(/);
  assert.match(js, /同义替换待补全/);
  assert.match(js, /if \(!rows\.length\) return false;/);
  assert.doesNotMatch(js, /当前词暂无重要变形|当前词暂无词族信息|已由 AI 核查 · 当前义项暂无安全常见替换/);
  assert.match(js, /document\.addEventListener\("visibilitychange"/);
  assert.doesNotMatch(js, /window\.setInterval/);
  assert.doesNotMatch(js, /rebuildStudy\(\);\s*if \(next === "熟悉"\) go\(1\);/);
  // forbid root-absolute data paths that break under /beidanci/
  assert.doesNotMatch(js, /["']\/data\/reading-g-vocab\.json["']/);
  assert.doesNotMatch(js, /["']\/data\/reading-g-paraphrases\.json["']/);
  assert.doesNotMatch(js, /["']\/data\/reading-g-question-evidence\.json["']/);
});

test("static G reading exposes functional brush-style tools and entry chooser", () => {
  const html = fs.readFileSync(path.join(root, "public/reading-g.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "public/assets/reading-g.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "public/assets/style.css"), "utf8");
  assert.match(html, /id="topToolsToggle"/);
  assert.match(html, /id="readingControlsSummary"/);
  assert.match(html, /value="family">词族关系/);
  assert.match(html, /value="association">场景关联/);
  assert.match(html, /value="easy-to-hard">简单→困难/);
  assert.match(html, /value="harder-only">只刷相对较难/);
  assert.match(js, /ielts_static_reading_g_tools_collapsed_v1/);
  assert.match(js, /function orderStudyIndices\(/);
  assert.match(js, /ORDERING_MODULE_ROOT = "\.\/study-ordering-v64\/"/);
  assert.match(js, /import\(ORDERING_MODULE_ROOT \+ "word-study-ordering\.mjs"\)/);
  assert.match(js, /import\(ORDERING_MODULE_ROOT \+ "word-internal-difficulty\.mjs"\)/);
  assert.match(js, /sharedWordStudyOrdering\.orderStudyWordIndices/);
  assert.match(js, /function applyOrderPreference\(/);
  assert.match(js, /resetStudyToStart\(\);/);
  assert.match(js, /shouldResumeParaSession/);
  assert.match(js, /filterSummaryLabel/);
  assert.match(css, /body\.reading-g-static \.reading-g-topbar/);
  assert.match(css, /body\.reading-g-static \.reading-g-topbar\.is-tools-collapsed \.top-actions\{display:none\}/);
  assert.match(css, /reading-g-entry-tools/);
  assert.match(css, /entry-btn-featured/);
  assert.match(js, /featured: true/);
  assert.match(js, /剑雅5–21文章高频（Part 1–3）/);
  assert.match(js, /剑雅5–21文章高频（Part 1–2）/);
  assert.match(js, /part12OnlyHighFrequency/);
  assert.match(js, /其余词汇（非文章高频）/);
  assert.match(js, /articleNonHighFrequency/);
  assert.match(js, /不熟复习/);
  assert.match(js, /openReadingGUnfamiliar/);
  assert.match(js, /renderArticleFrequencyPanel/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:520px\)/);
});

test("static and Next study surfaces package the exact same ordering modules", () => {
  const modules = [
    "word-study-ordering.mjs",
    "word-internal-difficulty.mjs",
    "word-internal-difficulty.generated.mjs",
    "word-surface-morphology.mjs"
  ];
  for (const name of modules) {
    const nextSource = fs.readFileSync(path.join(root, "app/lib/vocab", name));
    const staticSource = fs.readFileSync(path.join(root, "public/assets/study-ordering-v64", name));
    assert.deepEqual(staticSource, nextSource, `${name} must stay byte-identical across desktop and static builds`);
  }
});

test("satellite flashcards do not reserve an absent insight sidebar", () => {
  const source = fs.readFileSync(
    path.join(root, "app/components/SatelliteLexiconFlashcard.jsx"),
    "utf8"
  );
  const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
  assert.match(source, /const insightVisible = !isIelts538 && showInsight;/);
  assert.match(source, /<InlineStudyMeaning/);
  assert.match(source, /supplementalSenses=\{supplementalSenses\}/);
  assert.doesNotMatch(source, /showSupplementalSenses|补充义项|其他释义|熟词生义/);
  assert.match(source, /isContentCompletionQueue/);
  assert.match(source, /资料完整度/);
  assert.match(source, /showInsight=\{insightVisible\}/);
  assert.match(source, /<footer className="bottom bottombar">/);
  assert.match(css, /\.page--word-flash \.word,[\s\S]*\.page--word-flash \.footer-grid \{\s*margin-inline: auto;/);
  assert.match(css, /D2\.3 high-visibility study action dock/);
  assert.match(css, /\.page--word-flash \.top-actions:has\(\.menu\[open\]\) \{\s*overflow: visible;/);
  assert.match(css, /\.bottom\.bottombar--status-only \{\s*grid-template-columns: auto minmax\(280px, 1fr\);/);
  assert.match(css, /\.page--word-flash \.progress \{\s*height: 9px;/);
});

test("Next learning entrances share a stable loading state without fake percentage jumps", () => {
  const pageFiles = [
    "app/basic/page.jsx",
    "app/reading-g/page.jsx",
    "app/expressions/page.jsx",
    "app/meaning/page.jsx",
    "app/meaning-en/page.jsx"
  ];
  const sources = pageFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8"));
  const component = fs.readFileSync(path.join(root, "app/components/StableLoadingState.jsx"), "utf8");
  const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

  for (const source of sources) {
    assert.match(source, /StableLoadingState/);
    assert.doesNotMatch(source, /loadingPct|setLoadingPct/);
  }
  assert.match(component, /正在准备学习内容/);
  assert.match(css, /animation: system-loading-reveal 180ms ease 180ms forwards/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("export-static route packs paraphrases", () => {
  const route = fs.readFileSync(
    path.join(root, "app/api/export-static/route.js"),
    "utf8"
  );
  const responsive = fs.readFileSync(
    path.join(root, "app/lib/static-export-responsive.mjs"),
    "utf8"
  );
  assert.match(route, /reading-g-paraphrases\.json/);
  assert.match(route, /reading-g-question-evidence\.json/);
  assert.match(route, /reading-g-import-report\.json/);
  assert.match(route, /reading-g-retirements\.json/);
  assert.match(route, /name: "assets\/style\.css",[\s\S]*?readFileSync\(publicAssetPath\("assets", "style\.css"\), "utf-8"\)/);
  assert.match(route, /STATIC_EXPORT_VERSION = STATIC_RESPONSIVE_VERSION/);
  assert.match(route, /patchStaticExportZip[\s\S]*?STATIC_EXPORT_VERSION/);
  assert.match(responsive, new RegExp(`STATIC_RESPONSIVE_VERSION = "${STATIC_RESPONSIVE_VERSION}"`));
});

test("raw static pages and data loaders use the current release cache token", () => {
  const staticPages = [
    "public/spelling.html",
    "public/basic.html",
    "public/meaning.html",
    "public/reading-g.html",
    "public/reading-paraphrases.html",
    "public/reading-words.html",
    "public/ielts-538.html"
  ];
  for (const file of staticPages) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const tokens = [...source.matchAll(/\?v=([A-Za-z0-9_.-]+)/g)].map((match) => match[1]);
    assert.ok(tokens.length > 0, `${file} declares cache tokens`);
    assert.ok(tokens.every((token) => token === STATIC_RESPONSIVE_VERSION), `${file} has only current cache tokens`);
    assert.match(source, /data-static-primary-nav/, `${file} uses the shared static primary navigation`);
    assert.match(source, /data-static-sidebar/, `${file} uses the shared static sidebar`);
    assert.match(source, /assets\/static-navigation\.js/, `${file} loads the shared static navigation source`);
  }

  const navigationSource = fs.readFileSync(path.join(root, "public/assets/static-navigation.js"), "utf8");
  assert.match(navigationSource, /label: "阅读同义替换"/);
  assert.match(navigationSource, /label: "阅读生词本"/);
  assert.match(navigationSource, /label: "错词本"/);
  assert.match(navigationSource, /label: "SRS 复习"/);
  assert.match(navigationSource, /静态学习包/);
  assert.match(navigationSource, /不会自动和正式网页共享/);

  const dataAssets = [
    ["public/assets/basic.js", /DATA_VERSION = "([^"]+)"/],
    ["public/assets/spelling.js", /STATIC_DATA_VERSION = "([^"]+)"/],
    ["public/assets/meaning-static.js", /DATA_VERSION = "([^"]+)"/],
    ["public/assets/reading-g.js", /DATA_VERSION = "([^"]+)"/],
    ["public/assets/reading-words.js", /VERSION = "([^"]+)"/]
  ];
  for (const [file, pattern] of dataAssets) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal(source.match(pattern)?.[1], STATIC_RESPONSIVE_VERSION, `${file} data cache version`);
  }
});

test("static paraphrase quiz can initialize from real data", () => {
  const para = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/reading-g-paraphrases.json"), "utf8")
  );
  const q = buildParaphraseQuizQueue(para.groups || [], 10, () => 0.33);
  assert.ok(q.questions.length > 0);
  assert.equal(q.questions[0].options.length, 4);
});
