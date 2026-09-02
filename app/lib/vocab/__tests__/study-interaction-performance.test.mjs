import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("reading word selection virtualizes the long sidebar instead of rebuilding every row", () => {
  const page = read("app/reading-words/page.jsx");
  const virtualList = read("app/components/VirtualList.jsx");

  assert.match(page, /import VirtualList from "\.\.\/components\/VirtualList\.jsx"/);
  assert.match(page, /items=\{readingListRows\}/);
  assert.match(page, /fill\s+overscan=\{5\}/);
  assert.match(page, /scrollToIndex=\{selectedIndex\}/);
  assert.doesNotMatch(page, /\{visibleWords\.map\(\(word\) =>/);
  assert.match(virtualList, /new ResizeObserver\(updateHeight\)/);
  assert.match(virtualList, /scrollToIndex = null/);
});

test("static reading word selection reuses the existing list DOM", () => {
  const source = read("public/assets/reading-words.js");
  const renderBody = source.match(/function render\(\) \{[\s\S]*?\n  function move\(/)?.[0] || "";

  assert.match(source, /function renderWordList\(visible, current\)/);
  assert.match(source, /els\.wordList\.onclick = \(event\) =>/);
  assert.match(source, /scheduleReadingWordsSessionSave\(\)/);
  assert.doesNotMatch(renderBody, /wordList\.innerHTML/);
  assert.doesNotMatch(renderBody, /querySelectorAll\("\[data-id\]"\)\.forEach/);
});

test("shared study overview counts are cached while only the active position changes", () => {
  const overview = read("app/components/WordStudyOverview.jsx");
  const basic = read("app/basic/page.jsx");

  assert.match(overview, /useMemo\([\s\S]*countWordStudyQueue\(studyWords\)[\s\S]*\[studyWords\]/);
  assert.match(basic, /const overviewWords = useMemo\(/);
  assert.match(basic, /overviewWords=\{overviewWords\}/);
  assert.doesNotMatch(basic, /overviewWords=\{studyList\.map/);
});

test("fixed study order cursor writes do not invalidate the cached full ordering", () => {
  const orderingHook = read("app/hooks/useWordStudyOrdering.js");
  const orderedRowsHook = read("app/hooks/useOrderedStudyRows.js");
  const mainPage = read("app/page.jsx");

  assert.match(orderingHook, /const cursorsRef = useRef\(\{\}\)/);
  assert.match(orderingHook, /cursorsRef\.current = next;\s*writeBrowserCursors\(next\)/);
  assert.match(orderingHook, /cursorKey: storedCursors\?\.\[orderKey\]/);
  assert.doesNotMatch(orderingHook, /setCursors\(\(current\) =>/);
  assert.match(orderedRowsHook, /const reusableSnapshot = useMemo\(/);
  assert.match(mainPage, /const reusableWordOrderSnapshot = useMemo\(/);
});

test("scene ordering indexes remaining positions instead of repeatedly sorting them", () => {
  const ordering = read("app/lib/vocab/word-study-ordering.mjs");
  const sceneOrderBody = ordering.match(
    /function orderSceneEntries\(entries, preferredScene = ""\) \{[\s\S]*?\n\}/
  )?.[0] || "";

  assert.match(sceneOrderBody, /const sceneBuckets = new Map\(\)/);
  assert.match(sceneOrderBody, /const lowestRemaining = \(bucket\) =>/);
  assert.doesNotMatch(sceneOrderBody, /\[\.\.\.remaining\]/);
  assert.doesNotMatch(sceneOrderBody, /sameSceneRemaining/);
});
