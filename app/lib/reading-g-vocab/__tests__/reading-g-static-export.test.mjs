import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildParaphraseQuizQueue } from "../paraphrase-quiz.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("static export assets and data files exist", () => {
  const files = [
    "public/reading-g.html",
    "public/assets/reading-g.js",
    "public/data/reading-g-vocab.json",
    "public/data/reading-g-paraphrases.json",
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
  assert.match(html, /静态便携版/);
  const js = fs.readFileSync(path.join(root, "public/assets/reading-g.js"), "utf8");
  assert.match(js, /\.\/data\/reading-g-vocab\.json/);
  assert.match(js, /\.\/data\/reading-g-paraphrases\.json/);
  assert.match(js, /paraphraseQuiz|同义/);
  assert.match(js, /questionBankActive/);
  assert.match(js, /questionBankAiCompleted/);
  assert.match(js, /questionBankPending/);
  assert.match(js, /if \(stage === "3"\) return !inStage1 && !inStage2;/);
  assert.match(js, /previousStudyPosition/);
  assert.doesNotMatch(js, /rebuildStudy\(\);\s*if \(next === "熟悉"\) go\(1\);/);
  // forbid root-absolute data paths that break under /beidanci/
  assert.doesNotMatch(js, /["']\/data\/reading-g-vocab\.json["']/);
  assert.doesNotMatch(js, /["']\/data\/reading-g-paraphrases\.json["']/);
});

test("static G reading settings collapse on mobile without hiding study status", () => {
  const html = fs.readFileSync(path.join(root, "public/reading-g.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "public/assets/reading-g.js"), "utf8");
  assert.match(html, /id="readingControlsToggle"/);
  assert.match(html, /id="readingControlsSummary"/);
  assert.match(html, /reading-controls\.is-collapsed \.reading-controls-body/);
  assert.match(js, /ielts_static_reading_g_controls_collapsed_v1_/);
  assert.match(js, /controlsViewport === "mobile"/);
  assert.match(js, /filterSummaryLabel/);
  assert.match(js, /c\.f\.type !== "paraphraseQuiz"/);
  assert.match(js, /max-width: 900px/);
  assert.match(html, /min-width:1600px/);
});

test("satellite flashcards do not reserve an absent insight sidebar", () => {
  const source = fs.readFileSync(
    path.join(root, "app/components/SatelliteLexiconFlashcard.jsx"),
    "utf8"
  );
  const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
  assert.match(source, /const insightVisible = !isIelts538 && showInsight;/);
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
  assert.match(route, /reading-g-paraphrases\.json/);
  assert.match(route, /reading-g-import-report\.json/);
  assert.match(route, /reading-g-retirements\.json/);
  assert.match(route, /20260804_reading_g_autoplay_v18/);
});

test("static paraphrase quiz can initialize from real data", () => {
  const para = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/reading-g-paraphrases.json"), "utf8")
  );
  const q = buildParaphraseQuizQueue(para.groups || [], 10, () => 0.33);
  assert.ok(q.questions.length > 0);
  assert.equal(q.questions[0].options.length, 4);
});
