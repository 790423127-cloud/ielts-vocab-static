import test from "node:test";
import assert from "node:assert/strict";
import {
  getLikelyWrongAiWordReasons,
  isLikelyWrongAiWord
} from "../page-word-helpers.mjs";

function word(overrides = {}) {
  return {
    word: "complete",
    phonetic: "/kəmˈpliːt/",
    pos: "verb",
    meaning: "完成",
    definition: "to finish doing something",
    example: "Please complete the form.",
    exampleCn: "请完成这张表格。",
    collocations: [{ phrase: "complete a task", chinese: "完成任务" }],
    phraseCollocations: [{ phrase: "complete with", chinese: "配有" }],
    forms: [],
    wordFamily: [],
    difficulty: "基础高频",
    ...overrides
  };
}

test("normal Chinese 完成 and null terminology are not structure anomalies", () => {
  assert.equal(isLikelyWrongAiWord(word()), false);
  assert.equal(isLikelyWrongAiWord(word({
    word: "null",
    meaning: "无效的；空值的",
    definition: "having no legal or binding force",
    collocations: [{ phrase: "null hypothesis", chinese: "零假设" }]
  })), false);
});

test("exact placeholders remain repairable anomalies", () => {
  assert.equal(isLikelyWrongAiWord(word({ definition: "undefined" })), true);
  assert.deepEqual(getLikelyWrongAiWordReasons(word({ definition: "undefined" })), ["placeholder:definition"]);
});

test("only exact truncated relation headwords are flagged", () => {
  assert.equal(isLikelyWrongAiWord(word({
    word: "experience",
    forms: [{ word: "experienc", type: "broken" }]
  })), true);
  assert.equal(isLikelyWrongAiWord(word({
    word: "experience",
    forms: [{ word: "experiences", type: "plural" }],
    wordFamily: [{ word: "experienced", relation: "adjective-form" }]
  })), false);
});
