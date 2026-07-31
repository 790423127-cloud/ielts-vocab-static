import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../../reading-paraphrases/page.jsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../../../components/GlobalStudyHeader.jsx", import.meta.url), "utf8");
const exportRoute = readFileSync(new URL("../../../api/export-static/route.js", import.meta.url), "utf8");
const staticPage = readFileSync(
  new URL("../../../../public/reading-paraphrases.html", import.meta.url),
  "utf8"
);
const staticScript = readFileSync(
  new URL("../../../../public/assets/reading-paraphrases.js", import.meta.url),
  "utf8"
);

test("main navigation exposes the reading paraphrase notebook", () => {
  assert.match(header, /href: "\/reading-paraphrases"/);
  assert.match(header, /阅读同义替换记录本/);
});

test("notebook supports import, recall direction, reveal, ratings and position navigation", () => {
  assert.match(page, /导入学习包/);
  assert.match(page, /题目表达 → 原文表达/);
  assert.match(page, /原文表达 → 题目表达/);
  assert.match(page, /显示答案/);
  assert.match(page, /认识/);
  assert.match(page, /模糊/);
  assert.match(page, /不熟/);
  assert.match(page, /type="range"/);
});

test("static export includes the notebook and its cloud sync client", () => {
  assert.match(exportRoute, /name: "reading-paraphrases\.html"/);
  assert.match(exportRoute, /name: "assets\/reading-paraphrases\.js"/);
  assert.match(staticPage, /腾讯云学习进度同步/);
  assert.match(staticScript, /collection\("vocab_progress"\)/);
  assert.match(staticScript, /vocabId:VOCAB_ID/);
  assert.match(staticScript, /MAX_IMPORT_BYTES/);
  assert.match(staticPage, /aria-live="polite"/);
});
