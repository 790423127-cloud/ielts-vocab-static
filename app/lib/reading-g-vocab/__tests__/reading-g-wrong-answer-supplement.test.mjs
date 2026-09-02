import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildWrongAnswerSupplementPlan } from "../../../../scripts/import-reading-g-wrong-answer-supplement.mjs";
import { normalizeReadingGItem } from "../load-reading-g.mjs";
import { itemMatchesPathStage } from "../stages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("wrong-answer supplement reuses master content and preserves existing identities", () => {
  const vocab = {
    count: 1,
    items: [{ id: "rg_word_keep", entryType: "word", word: "keep", normalizedKey: "keep", studyMode: "active" }]
  };
  const master = {
    count: 1,
    words: [{
      id: "word_replenish",
      word: "replenish",
      phonetic: "/rɪˈplenɪʃ/",
      pos: "verb",
      meaning: "补充，重新装满",
      definition: "补充，重新装满",
      example: "Please replenish the water bottles after use.",
      exampleCn: "使用后请重新装满水瓶。",
      collocations: [],
      phraseCollocations: [],
      forms: [],
      wordFamily: [{ word: "replenishment", pos: "noun", meaning: "补充" }],
      synonyms: ["refill"],
      acceptedAnswers: ["replenish"],
      formsReviewed: true,
      wordFamilyReviewed: true,
      synonymsReviewed: true,
      meaningDetailZh: "指将消耗掉的东西重新填满或恢复。"
    }]
  };
  const source = {
    version: "reading-g-wrong-answer-supplement-20260823-v1",
    sourceWorkbook: "wrong-answers.xlsx",
    reviewedAt: "2026-08-23",
    policy: "test",
    count: 1,
    rows: [{ word: "replenish", difficulty: "中级核心", domain: "阅读通用", evidence: { wrongQuestions: 4 } }]
  };

  const plan = buildWrongAnswerSupplementPlan(vocab, master, { entries: [] }, source);
  const added = plan.payload.items.at(-1);

  assert.deepEqual(plan.payload.items.slice(0, 1), vocab.items);
  assert.equal(added.id, "rg_word_replenish");
  assert.equal(added.sourceWordId, "word_replenish");
  assert.equal(added.primaryMeaningZh, "补充，重新装满");
  assert.equal(added.wordFamily[0].word, "replenishment");
  assert.deepEqual(added.layers, ["wrongAnswerSupplement20260823"]);
  assert.equal(plan.summary.paidAiCalls, 0);
});

test("current G-reading data contains one complete replenish card in stage 2", () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
  const matches = vocab.items.filter((entry) => entry.word === "replenish");

  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "rg_word_replenish");
  assert.equal(matches[0].sourceWordId, "word_listening1179_df5bad0ca3b0");
  assert.ok(matches[0].sourceFiles.includes("public/data/words.json"));
  assert.ok(matches[0].layers.includes("wrongAnswerSupplement20260823"));
  assert.equal(itemMatchesPathStage(normalizeReadingGItem(matches[0]), "2"), true);
  assert.equal(vocab.count, vocab.items.length);
});
