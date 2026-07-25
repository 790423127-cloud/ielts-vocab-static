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

test("常见基础词直接进入整理清单，不依赖独立词库", () => {
  const words = [word("good"), word("accommodation")];
  const review = buildLexiconTidyReview(words, {
    audit: createEmptyLexiconTidyAudit()
  });

  assert.equal(review.counts.review, 1);
  assert.equal(review.counts.basic, 1);
  assert.equal(review.counts.simpleDetected, 1);
  assert.ok(review.candidateByIndex.get(0).reasonCodes.includes("core_basic_headword"));
  assert.equal(review.candidateByIndex.has(1), false);
});

test("主词库自身标记为基础的词会进入简单词清单", () => {
  const review = buildLexiconTidyReview([
    word("photosynthesis", { difficulty: "基础高频" })
  ], {
    audit: createEmptyLexiconTidyAudit()
  });

  assert.equal(review.counts.basic, 1);
  assert.ok(review.candidateByIndex.get(0).reasonCodes.includes("basic_difficulty"));
});

test("日常标签需要多项信号共同命中，避免把长难词都判成简单词", () => {
  const review = buildLexiconTidyReview([
    word("commute", {
      pos: "verb",
      ieltsUse: ["工作高频"],
      topics: ["交通"]
    }),
    word("accommodation", {
      pos: "noun",
      ieltsUse: ["生活高频"],
      topics: ["住房"]
    })
  ], {
    audit: createEmptyLexiconTidyAudit()
  });

  assert.equal(review.candidateByIndex.get(0).isSimple, true);
  assert.equal(review.candidateByIndex.has(1), false);
});

test("常见基础词形也会被识别", () => {
  const review = buildLexiconTidyReview([
    word("running", { pos: "verb" }),
    word("children", { pos: "noun" })
  ], {
    audit: createEmptyLexiconTidyAudit()
  });

  assert.equal(review.counts.basic, 2);
  assert.equal(review.candidateByIndex.get(0).matchedBase, "run");
  assert.equal(review.candidateByIndex.get(1).isSimple, true);
});

test("已经熟悉的简单词默认保留，不再重复展示", () => {
  const words = [word("good", { status: "熟悉" })];
  const review = buildLexiconTidyReview(words, {
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
    audit
  });

  assert.equal(review.counts.review, 0);
  assert.equal(review.counts.manuallyKept, 1);
});

test("候选按稳定ID匹配，删除前方单词后不会因索引移动失效", () => {
  const target = word("good", { id: "stable-good" });
  const review = buildLexiconTidyReview([
    word("advanced", { id: "advanced" }),
    target
  ], {
    audit: createEmptyLexiconTidyAudit()
  });

  const shiftedCandidate = findTidyCandidate(review, target, 0);
  assert.ok(shiftedCandidate);
  assert.equal(shiftedCandidate.auditKey, "main:stable-good");
  assert.equal(shiftedCandidate.isSimple, true);
});

test("整理清单可按简单词和数据问题查看", () => {
  const words = [
    word("good", { id: "good-1" }),
    word("broken word", { id: "broken-1" })
  ];
  const review = buildLexiconTidyReview(words, {
    audit: createEmptyLexiconTidyAudit()
  });

  const basicCandidate = review.candidateByIndex.get(0);
  const issueCandidate = review.candidateByIndex.get(1);
  assert.equal(matchesTidyScope(basicCandidate, LEXICON_TIDY_FILTERS.BASIC), true);
  assert.equal(matchesTidyScope(basicCandidate, LEXICON_TIDY_FILTERS.ISSUES), false);
  assert.equal(matchesTidyScope(issueCandidate, LEXICON_TIDY_FILTERS.ISSUES), true);
});
