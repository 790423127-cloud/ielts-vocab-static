import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  clampWordStudyPosition,
  wordStudyIndexAtPosition,
  wordStudyPositionPercent
} from "../word-study-position.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("study position clamps typed and dragged values to the active queue", () => {
  assert.equal(clampWordStudyPosition(-20, 3396), 1);
  assert.equal(clampWordStudyPosition(2300.4, 3396), 2300);
  assert.equal(clampWordStudyPosition(9000, 3396), 3396);
  assert.equal(clampWordStudyPosition("", 0), 0);
});

test("study position resolves inside the current ordered queue without rebuilding it", () => {
  const fixedOrder = [91, 5, 2024, 16];
  assert.equal(wordStudyIndexAtPosition(fixedOrder, 3), 2024);
  assert.equal(wordStudyIndexAtPosition(fixedOrder, 999), 16);
  assert.equal(wordStudyIndexAtPosition([], 1), null);
});

test("study position percent follows the preview position", () => {
  assert.equal(wordStudyPositionPercent(1, 4), 25);
  assert.equal(wordStudyPositionPercent(3, 4), 75);
  assert.equal(wordStudyPositionPercent(1, 0), 0);
});

test("main and static study pages expose drag and exact-position controls", () => {
  const page = fs.readFileSync(path.join(ROOT, "app", "page.jsx"), "utf8");
  const progress = fs.readFileSync(path.join(ROOT, "app", "components", "WordStudyProgress.jsx"), "utf8");
  const staticExport = fs.readFileSync(path.join(ROOT, "app", "api", "export-static", "route.js"), "utf8");

  assert.match(page, /wordStudyIndexAtPosition\(studyWordIndices,\s*position\)/);
  assert.match(progress, /type="range"/);
  assert.match(progress, /type="number"/);
  assert.match(progress, /onInput=\{\(event\) =>/);
  assert.match(progress, /onPointerUp=\{\(event\) => commitPosition/);
  assert.match(progress, /<output className="word-study-progress__preview"/);
  assert.match(progress, /\{previewWord \|\| percentLabel\}/);
  assert.match(staticExport, /id="progressSeek"/);
  assert.match(staticExport, /function seekProgressPosition/);
  assert.match(staticExport, /progressPreview\.textContent=target\.word/);
});
