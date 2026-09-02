import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("every configurable desktop and static brush surface uses the shared ordering core", () => {
  const mainPage = read("app/page.jsx");
  const orderedRowsHook = read("app/hooks/useOrderedStudyRows.js");
  const basicPage = read("app/basic/page.jsx");
  const readingGPage = read("app/reading-g/page.jsx");
  const readingWordsPage = read("app/reading-words/page.jsx");
  const staticExport = read("app/api/export-static/route.js");
  const staticReadingG = read("public/assets/reading-g.js");

  assert.match(mainPage, /orderStudyWordIndices/);
  assert.match(orderedRowsHook, /orderStudyWordIndices/);
  [basicPage, readingGPage, readingWordsPage].forEach((source) => {
    assert.match(source, /useOrderedStudyRows/);
  });
  assert.match(staticExport, /sharedWordStudyOrdering\.orderStudyWordIndices/);
  assert.match(staticReadingG, /sharedWordStudyOrdering\.orderStudyWordIndices/);
});

test("the static package keeps byte-identical copies of the desktop ordering modules", () => {
  [
    "word-study-ordering.mjs",
    "word-internal-difficulty.mjs",
    "word-internal-difficulty.generated.mjs",
    "word-surface-morphology.mjs"
  ].forEach((name) => {
    assert.deepEqual(
      fs.readFileSync(path.join(ROOT, "public/assets/study-ordering-v64", name)),
      fs.readFileSync(path.join(ROOT, "app/lib/vocab", name)),
      name
    );
  });
});
