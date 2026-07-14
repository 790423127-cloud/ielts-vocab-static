import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  asSynonymItems,
  isValidSynonymItem,
  normalizeSynonymItem
} from "../load-lr-synonyms.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("reading-synonyms only shows items with baseWord and synonyms", () => {
  const payload = JSON.parse(fs.readFileSync(path.join(root, "public/data/listening-reading-synonyms.json"), "utf8"));
  const items = asSynonymItems(payload);

  assert.equal(items.length, payload.count);
  assert.ok(items.length > 0);
  assert.equal(items.every(isValidSynonymItem), true);
  assert.equal(items.some((item) => !item.baseWord || !item.synonyms.length), false);
});

test("ordinary word-only rows are excluded", () => {
  const items = asSynonymItems({
    items: [
      { word: "about", meaning: "关于；大约" },
      { baseWord: "important", meaning: "重要的", synonyms: ["significant"] }
    ]
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].baseWord, "important");
});

test("legacy paraphrase rows normalize into synonym groups", () => {
  const item = normalizeSynonymItem({
    id: "lr_para_1",
    questionExpression: "important issue",
    sourceExpression: "significant issue",
    meaningZh: "重要议题",
    questionSentence: "This is an important issue.",
    sourceSentence: "This is a significant issue.",
    skills: ["reading"]
  });

  assert.equal(item.baseWord, "important issue");
  assert.deepEqual(item.synonyms, ["significant issue"]);
  assert.equal(item.example, "This is an important issue.");
  assert.equal(item.paraphraseExample, "This is a significant issue.");
});

test("homepage count equals valid synonym group count", () => {
  const source = fs.readFileSync(path.join(root, "app/page.jsx"), "utf8");
  assert.match(source, /LR_SYNONYM_URL/);
  assert.match(source, /asSynonymItems\(payload\)\.length/);
  assert.match(source, /lrSynonymCount == null \? "—" : `\$\{lrSynonymCount\.toLocaleString\(\)\} 组`/);
});

test("progress stores known and unknown in localStorage", () => {
  const source = fs.readFileSync(path.join(root, "app/components/LrParaphrasePanel.jsx"), "utf8");
  assert.match(source, /LISTENING_READING_SYNONYM_PROGRESS_KEY = "listeningReadingSynonymProgress"/);
  assert.match(source, /LISTENING_READING_SYNONYM_SESSION_KEY = "listeningReadingSynonymSession"/);
  assert.match(source, /status,\s*\n\s*updatedAt: Date\.now\(\)/);
  assert.match(source, /writeSession/);
  assert.match(source, /readSession/);
  assert.match(source, /mark\("known"\)/);
  assert.match(source, /mark\("unknown"\)/);
});

test("page renders example fallback safely", () => {
  const source = fs.readFileSync(path.join(root, "app/components/LrParaphrasePanel.jsx"), "utf8");
  assert.match(source, /例句待补充/);
  assert.match(source, /替换待补充/);
  assert.match(source, /exampleFallback/);
  assert.match(source, /visibleSynonyms\.map/);
});

test("paraphrase page is organized as synonym group study, not word flashcards", () => {
  const source = fs.readFileSync(path.join(root, "app/components/LrParaphrasePanel.jsx"), "utf8");
  assert.match(source, /lr-view-tabs/);
  assert.match(source, /核心词/);
  assert.match(source, /常见替换/);
  assert.match(source, /同组词群/);
  assert.match(source, /clusterMembers/);
  assert.match(source, /prevItem/);
  assert.match(source, /上一个/);
  assert.match(source, /例句对照/);
  assert.match(source, /viewMode === "unknown"/);
});

test("202606271150 reading synonym bank is merged as word clusters", () => {
  const payload = JSON.parse(fs.readFileSync(path.join(root, "public/data/listening-reading-synonyms.json"), "utf8"));
  const items = asSynonymItems(payload);
  const clustered = items.filter((item) => item.clusterId && item.members.length);

  assert.ok(payload.sourceWordCount >= 1799);
  assert.ok(payload.groupCount >= 500);
  assert.ok(items.length >= 2000);
  assert.ok(clustered.length >= 1700);
  assert.ok(clustered.every((item) => item.members.length >= 2));
});

test("imported reading synonym source fields are readable Chinese, not encoding placeholders", () => {
  const payload = JSON.parse(fs.readFileSync(path.join(root, "public/data/listening-reading-synonyms.json"), "utf8"));
  const imported = payload.items.filter((item) => String(item.id || "").includes("202606271150") || item.clusterId);
  assert.ok(imported.length >= 1700);
  assert.equal(imported.some((item) => String(item.source || "").includes("?")), false);
  assert.equal(imported.some((item) => String(item.notesZh || "").includes("?")), false);
  assert.ok(imported.some((item) => String(item.notesZh || "").includes("1799词源表")));
});
