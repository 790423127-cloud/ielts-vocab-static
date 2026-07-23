import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_REPLACE_EXISTING_FIELD,
  mergeAiWriteWithExisting
} from "../ai-write-merge.mjs";

test("non-force AI completion fills missing fields without overwriting populated content", () => {
  const existing = {
    word: "charge",
    meaning: "人工主释义",
    definition: "",
    example: "A manually reviewed example.",
    collocations: [
      { phrase: "manual charge", chinese: "人工收费" },
      { phrase: "service charge", chinese: "服务费" }
    ],
    phraseCollocations: []
  };
  const candidate = {
    ...existing,
    [AI_REPLACE_EXISTING_FIELD]: false,
    meaning: "AI释义",
    definition: "AI definition",
    example: "AI example.",
    collocations: [
      { phrase: "charge a fee", chinese: "收费" },
      { phrase: "additional charge", chinese: "额外费用" },
      { phrase: "charge a customer", chinese: "向顾客收费" },
      { phrase: "service charge", chinese: "服务费" }
    ],
    phraseCollocations: [
      { phrase: "charge for a service", chinese: "为服务收费" },
      { phrase: "be charged with a crime", chinese: "被控犯罪" },
      { phrase: "in charge of a team", chinese: "负责团队" },
      { phrase: "charge something to an account", chinese: "记到账户" }
    ]
  };

  const merged = mergeAiWriteWithExisting(existing, candidate);
  assert.equal(merged.meaning, "人工主释义");
  assert.equal(merged.example, "A manually reviewed example.");
  assert.equal(merged.definition, "AI definition");
  assert.deepEqual(merged.collocations, existing.collocations);
  assert.equal(merged.phraseCollocations.length, 4);
  assert.equal(Object.hasOwn(merged, AI_REPLACE_EXISTING_FIELD), false);
});

test("force AI completion may replace populated content", () => {
  const existing = {
    word: "injur",
    meaning: "旧释义",
    collocations: [{ phrase: "old injury", chinese: "旧伤" }]
  };
  const candidate = {
    ...existing,
    [AI_REPLACE_EXISTING_FIELD]: true,
    word: "injure",
    meaning: "使受伤",
    collocations: [
      { phrase: "injure a player", chinese: "使运动员受伤" },
      { phrase: "seriously injure someone", chinese: "使某人严重受伤" },
      { phrase: "injure the knee", chinese: "伤到膝盖" },
      { phrase: "injure workers at work", chinese: "使工人工作中受伤" }
    ]
  };

  const merged = mergeAiWriteWithExisting(existing, candidate);
  assert.equal(merged.word, "injure");
  assert.equal(merged.meaning, "使受伤");
  assert.equal(merged.collocations.length, 4);
  assert.equal(Object.hasOwn(merged, AI_REPLACE_EXISTING_FIELD), false);
});
