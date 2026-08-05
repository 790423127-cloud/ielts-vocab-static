import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { getReadingGContentIssues } from "../content-completeness.mjs";
import { normalizeReadingGItem } from "../load-reading-g.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function loadStaticQualityHelpers() {
  let source = fs.readFileSync(path.join(root, "public/assets/reading-g.js"), "utf8");
  source = source.replace(
    /\n\s*boot\(\);\s*\n\}\)\(\);\s*$/,
    "\n  globalThis.__readingGQuality = { normalizeEntry: normalizeEntry, getStaticContentIssues: getStaticContentIssues };\n})();\n"
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
