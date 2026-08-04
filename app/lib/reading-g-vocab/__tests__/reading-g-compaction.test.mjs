import test from "node:test";
import assert from "node:assert/strict";
import {
  applyReadingGCompaction,
  buildReadingGCompactionPlan
} from "../compaction.mjs";
import { buildItemKeyIndex } from "../migration.mjs";

function word(value, meaning, {
  id = `rg_word_${value}`,
  pos = "noun",
  forms = [],
  wordFamily = [],
  layers = ["priority1500"]
} = {}) {
  return {
    id,
    entryType: "word",
    word: value,
    normalizedKey: value,
    primaryMeaningZh: meaning,
    pos,
    forms,
    wordFamily,
    layers,
    sourceFiles: [`${value}.json`],
    qualityFlags: []
  };
}

test("compaction only groups existing compatible G-reading words", () => {
  const items = [
    word("access", "进入；访问", {
      pos: "verb",
      forms: [{ word: "accessed", type: "past tense / past participle" }],
      wordFamily: [{ word: "accessible", meaning: "可进入的" }]
    }),
    word("accessed", "进入；访问（过去式）", { pos: "verb" }),
    word("accessible", "可进入的；易接近的", { pos: "adjective" }),
    word("outside", "外部", { pos: "noun" })
  ];
  const plan = buildReadingGCompactionPlan(items, { generatedAt: "2026-08-04T00:00:00.000Z" });
  assert.equal(plan.sourceWordCount, 4);
  assert.equal(plan.resultingWordCount, 2);
  assert.deepEqual(plan.rules[0].aliases.map((entry) => entry.word).sort(), ["accessed", "accessible"]);
  assert.equal(plan.rules[0].aliases.find((entry) => entry.word === "accessed").relationType, "form");
  assert.equal(plan.rules[0].aliases.find((entry) => entry.word === "accessible").relationType, "family");
  assert.equal(JSON.stringify(plan).includes("outside.json"), false);
});

test("unsafe lookalikes with different meanings are not compacted", () => {
  const items = [
    word("fee", "费用；酬金", {
      pos: "noun",
      forms: [{ word: "feed", type: "form" }]
    }),
    word("feed", "喂养；进食", {
      pos: "verb",
      forms: [{ word: "fee", type: "form" }]
    }),
    word("find", "找到；发现", {
      pos: "verb",
      forms: [{ word: "found", type: "past tense / past participle" }]
    }),
    word("found", "建立；创办", { pos: "verb" }),
    word("careful", "小心的", {
      wordFamily: [{ word: "career" }]
    }),
    word("career", "事业；生涯")
  ];
  const plan = buildReadingGCompactionPlan(items);
  assert.equal(plan.rules.length, 0);
  assert.equal(plan.resultingWordCount, items.length);
});

test("applying compaction preserves alias data and progress lookup", () => {
  const items = [
    word("play", "玩；比赛", {
      id: "main-play",
      pos: "verb",
      forms: [{ word: "played", type: "past tense / past participle" }]
    }),
    word("played", "玩过；比赛过", {
      id: "old-played",
      pos: "verb",
      layers: ["questionBankActive"]
    })
  ];
  const plan = buildReadingGCompactionPlan(items);
  const result = applyReadingGCompaction(items, plan);
  assert.equal(result.items.length, 1);
  assert.equal(result.stats.removedIndependentWordCount, 1);
  assert.deepEqual(result.items[0].layers.sort(), ["priority1500", "questionBankActive"]);
  assert.equal(result.items[0].mergedEntries[0].meaning, "玩过；比赛过");
  assert.equal(result.items[0].forms.some((entry) => entry.word === "played"), true);

  const index = buildItemKeyIndex(result.items);
  assert.equal(index.byId.get("old-played").word, "play");
  assert.equal(index.byMerge.get("word::played").word, "play");
  assert.equal(index.byNormSingle.get("played").word, "play");
});

test("incremental compaction keeps aliases merged in earlier runs", () => {
  const items = [
    {
      ...word("play", "玩；比赛", {
        id: "main-play",
        pos: "verb",
        forms: [{ word: "played", type: "past tense / past participle" }]
      }),
      mergedAliases: [{ key: "plays", id: "old-plays", word: "plays", relationType: "form" }],
      mergedEntries: [{ key: "plays", id: "old-plays", word: "plays", meaning: "第三人称单数" }]
    },
    word("played", "玩过；比赛过", {
      id: "old-played",
      pos: "verb",
      layers: ["questionBankPending"]
    })
  ];
  const plan = {
    rules: [{
      canonicalKey: "play",
      canonicalId: "main-play",
      canonicalWord: "play",
      aliases: [{ key: "played", id: "old-played", word: "played", relationType: "form" }]
    }]
  };
  const result = applyReadingGCompaction(items, plan);
  const merged = result.items[0];

  assert.deepEqual(merged.mergedAliases.map((entry) => entry.word).sort(), ["played", "plays"]);
  assert.deepEqual(merged.mergedEntries.map((entry) => entry.word).sort(), ["played", "plays"]);
});

test("persistent alias ids survive a source refresh before compaction", () => {
  const items = [
    word("play", "玩；比赛", { id: "main-play", pos: "verb" }),
    word("played", "玩过；比赛过", { id: "refreshed-played", pos: "verb" })
  ];
  const plan = {
    rules: [{
      canonicalKey: "play",
      canonicalId: "main-play",
      canonicalWord: "play",
      aliases: [{ key: "played", id: "old-independent-played", word: "played", relationType: "form" }]
    }]
  };

  const result = applyReadingGCompaction(items, plan);
  const index = buildItemKeyIndex(result.items);

  assert.equal(index.byId.get("old-independent-played").word, "play");
  assert.equal(index.byId.has("refreshed-played"), false);
});

test("deleting a compacted canonical suppresses its aliases on rebuild", () => {
  const items = [word("played", "玩过；比赛过", { pos: "verb" })];
  const plan = {
    rules: [{
      canonicalKey: "play",
      canonicalWord: "play",
      aliases: [{ key: "played", word: "played", relationType: "form" }]
    }]
  };
  const result = applyReadingGCompaction(items, plan);
  assert.equal(result.items.length, 0);
  assert.equal(result.suppressedKeys.has("played"), true);
});
