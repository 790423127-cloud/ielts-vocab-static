import test from "node:test";
import assert from "node:assert/strict";

import {
  LEXICON_TIDY_FILTERS,
  buildLexiconTidyReview,
  createEmptyLexiconTidyAudit,
  getTidyAuditKey,
  matchesTidyScope,
  mergeTidyAuditRecords
} from "../lexicon-tidy-review.mjs";

function word(value, patch = {}) {
  return {
    id: `id-${value}-${patch.suffix || "0"}`,
    word: value,
    meaning: value,
    pos: "word",
    example: `${value} example`,
    collocations: [{ phrase: `${value} phrase`, chinese: "释义" }],
    phraseCollocations: [{ phrase: `${value} pattern`, chinese: "释义" }],
    ...patch
  };
}

test("零基础1500重叠词进入友好整理清单", () => {
  const words = [word("good"), word("accommodation")];
  const review = buildLexiconTidyReview(words, {
    basicWordKeys: new Set(["good"]),
    audit: createEmptyLexiconTidyAudit()
  });

  assert.equal(review.counts.review, 1);
  assert.equal(review.counts.basic, 1);
  assert.deepEqual(review.candidateByIndex.get(0).reasonCodes, ["basic_1500_overlap"]);
  assert.equal(review.candidateByIndex.has(1), false);
});

test("已经熟悉的简单词默认保留，不再重复展示", () => {
  const words = [word("good", { status: "熟悉" })];
  const review = buildLexiconTidyReview(words, {
    basicWordKeys: new Set(["good"]),
    audit: createEmptyLexiconTidyAudit()
  });

  assert.equal(review.counts.review, 0);
  assert.equal(review.counts.autoKeptFamiliar, 1);
  assert.equal(review.autoKeepRecords.length, 1);
  assert.equal(review.autoKeepRecords[0].record.decision, "keep_by_familiar");
});

test("熟悉状态不会掩盖同名重复等数据问题", () => {
  const words = [
    word("good", { id: "good-1", status: "熟悉" }),
    word("good", { id: "good-2", status: "熟悉" })
  ];
  const review = buildLexiconTidyReview(words, {
    basicWordKeys: new Set(["good"]),
    audit: createEmptyLexiconTidyAudit()
  });

  assert.equal(review.counts.review, 2);
  assert.equal(review.counts.issues, 2);
  assert.ok(review.candidateByIndex.get(0).reasonCodes.includes("duplicate_headword"));
});

test("人工选择留着后，该词不会再次进入清单", () => {
  const target = word("good");
  const auditKey = getTidyAuditKey(target, 0);
  const audit = mergeTidyAuditRecords(createEmptyLexiconTidyAudit(), [{
    auditKey,
    record: { decision: "keep", word: "good", reviewedAt: 1 }
  }]);
  const review = buildLexiconTidyReview([target], {
    basicWordKeys: new Set(["good"]),
    audit
  });

  assert.equal(review.counts.review, 0);
  assert.equal(review.counts.manuallyKept, 1);
});

test("整理清单可按基础重叠和数据问题查看", () => {
  const words = [
    word("good", { id: "good-1" }),
    word("broken word", { id: "broken-1" })
  ];
  const review = buildLexiconTidyReview(words, {
    basicWordKeys: new Set(["good"]),
    audit: createEmptyLexiconTidyAudit()
  });

  const basicCandidate = review.candidateByIndex.get(0);
  const issueCandidate = review.candidateByIndex.get(1);
  assert.equal(matchesTidyScope(basicCandidate, LEXICON_TIDY_FILTERS.BASIC), true);
  assert.equal(matchesTidyScope(basicCandidate, LEXICON_TIDY_FILTERS.ISSUES), false);
  assert.equal(matchesTidyScope(issueCandidate, LEXICON_TIDY_FILTERS.ISSUES), true);
});
