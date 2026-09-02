import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { getReadingGContentIssues } from "../content-completeness.mjs";
import { normalizeReadingGItem } from "../load-reading-g.mjs";
import { itemMatchesPathStage } from "../stages.mjs";
import { getReadingGSynonymStatus } from "../synonym-relations.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function loadStaticQualityHelpers() {
  let source = fs.readFileSync(path.join(root, "public/assets/reading-g.js"), "utf8");
  source = source.replace(
    /\n\s*boot\(\);\s*/,
    "\n  globalThis.__readingGQuality = { normalizeEntry: normalizeEntry, getStaticContentIssues: getStaticContentIssues, matchStage: matchStage, getStaticSynonymStatus: getStaticSynonymStatus, isStaticSynonymSupportedEntry: isStaticSynonymSupportedEntry, inlineStaticStudyMeaning: inlineStaticStudyMeaning };\n"
  );
  assert.match(source, /__readingGQuality/);

  const noop = () => {};
  const context = {
    console,
    setTimeout: noop,
    clearTimeout: noop,
    window: {
      matchMedia: () => ({ matches: false }),
      addEventListener: noop,
      removeEventListener: noop
    },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: noop
    },
    localStorage: { getItem: () => null, setItem: noop },
    globalThis: {}
  };
  context.window.localStorage = context.localStorage;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.globalThis.__readingGQuality;
}

test("static G-reading display hides a retired pending marker after AI completion", () => {
  const vocab = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8")
  );
  const boar = vocab.items.find((item) => item.word === "boar");
  const staticHelpers = loadStaticQualityHelpers();

  assert.ok(boar);
  assert.equal(
    staticHelpers.inlineStaticStudyMeaning(boar),
    "野猪；公猪（未阉割的雄性家猪）"
  );
});

test("dynamic and static G-reading completion queues classify every word identically", () => {
  const vocab = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8")
  );
  const staticQuality = loadStaticQualityHelpers();
  const dynamic = [];
  const staticItems = [];

  for (let index = 0; index < vocab.items.length; index += 1) {
    const dynamicItem = normalizeReadingGItem(vocab.items[index], index);
    const staticItem = staticQuality.normalizeEntry(vocab.items[index], index);
    if (dynamicItem?.entryType !== "word" || staticItem?.entryType !== "word") continue;
    dynamic.push({ id: dynamicItem.id, issues: getReadingGContentIssues(dynamicItem) });
    staticItems.push({
      id: staticItem.id,
      issues: Array.from(staticQuality.getStaticContentIssues(staticItem))
    });
  }

  assert.deepEqual(staticItems, dynamic);
});

test("dynamic and static G-reading stages assign every entry identically", () => {
  const vocab = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8")
  );
  const staticHelpers = loadStaticQualityHelpers();

  for (let index = 0; index < vocab.items.length; index += 1) {
    const dynamicItem = normalizeReadingGItem(vocab.items[index], index);
    const staticItem = staticHelpers.normalizeEntry(vocab.items[index], index);
    const dynamicStages = ["1", "2", "3", "4"].filter((stage) =>
      itemMatchesPathStage(dynamicItem, stage)
    );
    const staticStages = ["1", "2", "3", "4"].filter((stage) =>
      staticHelpers.matchStage(staticItem, stage)
    );

    assert.deepEqual(
      staticStages,
      dynamicStages,
      `stage mismatch for ${dynamicItem.word} (${dynamicItem.id})`
    );
  }
});

test("dynamic and static G-reading synonym statuses agree for every entry", () => {
  const vocab = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8")
  );
  const staticHelpers = loadStaticQualityHelpers();
  for (let index = 0; index < vocab.items.length; index += 1) {
    const dynamicItem = normalizeReadingGItem(vocab.items[index], index);
    const staticItem = staticHelpers.normalizeEntry(vocab.items[index], index);
    assert.deepEqual(
      JSON.parse(JSON.stringify(staticHelpers.getStaticSynonymStatus(staticItem))),
      getReadingGSynonymStatus(dynamicItem),
      `synonym status mismatch for ${dynamicItem.word} (${dynamicItem.id})`
    );
    assert.equal(
      staticHelpers.isStaticSynonymSupportedEntry(staticItem),
      ["word", "phrase"].includes(dynamicItem.entryType),
      `synonym queue support mismatch for ${dynamicItem.word} (${dynamicItem.id})`
    );
  }
});
