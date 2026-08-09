import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  enrichReadingGParaphraseSources,
  normalizeReadingGQuestionEvidence
} from "../question-evidence.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const evidencePath = path.join(root, "public/data/reading-g-question-evidence.json");

test("G类真题证据覆盖所有原题并显式标记待定位答案句", () => {
  const raw = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const evidence = normalizeReadingGQuestionEvidence(raw);
  assert.equal(evidence.count, 2322);
  assert.equal(evidence.questions.length, 2322);
  assert.equal(raw.coverage.questionType.available, 2322);
  assert.equal(raw.coverage.questionType.pending, 0);
  assert.equal(raw.coverage.answerSentence.available, 2234);
  assert.equal(raw.coverage.answerSentence.pending, 88);
  assert.ok(evidence.questions.every((question) => question.questionType));
  assert.ok(evidence.questions.every((question) => ["available", "needs_location"].includes(question.answerSentenceStatus)));
});

test("剑雅8 Test B 第26题保留题型、答案和答案句", () => {
  const raw = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const evidence = normalizeReadingGQuestionEvidence(raw);
  const question = evidence.byKey.get("剑雅8|Test B|Passage 2|26");
  assert.ok(question);
  assert.equal(question.questionType, "句子填空题");
  assert.equal(question.answer, "lies");
  assert.match(question.answerSentence, /steer clear of lies/i);
  assert.equal(question.answerSentenceStatus, "available");
});

test("同义关系来源从题目证据索引补入题型和答案", () => {
  const raw = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const evidence = normalizeReadingGQuestionEvidence(raw);
  const [group] = enrichReadingGParaphraseSources([
    {
      groupId: "test-group",
      sources: [{ book: "剑雅8", test: "Test B", part: "Passage 2", question: 26, answerSentence: "" }]
    }
  ], evidence.byKey);
  assert.equal(group.sources.length, 1);
  assert.equal(group.sources[0].questionType, "句子填空题");
  assert.equal(group.sources[0].answer, "lies");
  assert.match(group.sources[0].answerSentence, /steer clear of lies/i);
});
