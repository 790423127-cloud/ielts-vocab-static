import test from "node:test";
import assert from "node:assert/strict";

import {
  LEXICON_TIDY_FILTERS,
  buildLexiconTidyReview,
  createEmptyLexiconTidyAudit,
  findTidyCandidate,
  getTidyAuditKey,
  matchesTidyScope,
  mergeTidyAuditRecords
} from "../lexicon-tidy-review.mjs";

function word(value, patch = {}) {
  return {
    id: `id-${value}-${patch.suffix || "0"}`,
    word: value,
    meaning: value,
    pos: "noun",
    example: `${value} example`,
    collocations: [{ phrase: `${value} phrase`, chinese: "释义" }],
    phraseCollocations: [{ phrase: `${value} pattern`, chinese: "释义" }],
    ...patch
  };
}

function review(words, removable = []) {
  return buildLexiconTidyReview(words, {
    audit: createEmptyLexiconTidyAudit(),
    removableKeys: new Set(removable)
  });
}

test("只有明确进入删除候选名单的基础词才展示", () => {
  const result = review([word("good"), word("upheavals")], ["good"]);
  assert.equal(result.counts.review, 1);
  assert.equal(result.counts.basic, 1);
  assert.equal(result.candidateByIndex.get(0).reasonCodes[0], "removable_basic");
  assert.equal(result.candidateByIndex.has(1), false);
});

test("主词库难度和主题不再自动扩大候选范围", () => {
  const result = review([
    word("photosynthesis", { difficulty: "基础高频" }),
    word("commute", { topics: ["交通"], ieltsUse: ["生活高频"] })
  ]);
  assert.equal(result.counts.review, 0);
});

test("已经熟悉的基础候选默认保留", () => {
  const result = review([word("good", { status: "熟悉" })], ["good"]);
  assert.equal(result.counts.review, 0);
  assert.equal(result.counts.autoKeptFamiliar, 1);
  assert.equal(result.autoKeepRecords[0].record.decision, "keep_by_familiar");
});

test("熟悉状态不会掩盖同名重复", () => {
  const result = review([
    word("good", { id: "good-1", status: "熟悉" }),
    word("good", { id: "good-2", status: "熟悉" })
  ], ["good"]);
  assert.equal(result.counts.review, 2);
  assert.equal(result.counts.issues, 2);
});

test("人工留着后不会再次进入清单", () => {
  const target = word("good");
  const auditKey = getTidyAuditKey(target, 0);
  const audit = mergeTidyAuditRecords(createEmptyLexiconTidyAudit(), [{
    auditKey,
    record: { decision: "keep", word: "good", reviewedAt: 1 }
  }]);
  const result = buildLexiconTidyReview([target], { audit, removableKeys: new Set(["good"]) });
  assert.equal(result.counts.review, 0);
  assert.equal(result.counts.manuallyKept, 1);
});

test("候选按稳定ID匹配，删除前方单词后仍有效", () => {
  const target = word("good", { id: "stable-good" });
  const result = review([word("advanced", { id: "advanced" }), target], ["good"]);
  const shiftedCandidate = findTidyCandidate(result, target, 0);
  assert.ok(shiftedCandidate);
  assert.equal(shiftedCandidate.auditKey, "main:stable-good");
});

test("基础候选和数据问题可以分开查看", () => {
  const result = review([
    word("good", { id: "good-1" }),
    word("broken word", { id: "broken-1" })
  ], ["good"]);
  assert.equal(matchesTidyScope(result.candidateByIndex.get(0), LEXICON_TIDY_FILTERS.BASIC), true);
  assert.equal(matchesTidyScope(result.candidateByIndex.get(1), LEXICON_TIDY_FILTERS.ISSUES), true);
});
