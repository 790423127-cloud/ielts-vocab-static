import test from "node:test";
import assert from "node:assert/strict";

import {
  LEXICON_TIDY_FILTERS,
  MAX_REMOVABLE_WORD_CANDIDATES,
  buildLexiconTidyReview,
  buildRemovableWordKeySet,
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

test("只把参考名单里真实存在于主词库的词加入候选", () => {
  const words = [word("good"), word("upheavals")];
  const keys = buildRemovableWordKeySet({ words: [{ word: "good" }, { word: "hello" }] }, words);
  const result = review(words, keys);

  assert.deepEqual([...keys], ["good"]);
  assert.equal(result.counts.review, 1);
  assert.equal(result.candidateByIndex.get(0).reasonCodes[0], "removable_basic");
  assert.equal(result.candidateByIndex.has(1), false);
});

test("候选总量最多1500个，不为数量硬扩展规则", () => {
  const words = Array.from({ length: 1600 }, (_, index) => word(`basic${index}`));
  const reference = { words: words.map((entry) => ({ word: entry.word })) };
  const keys = buildRemovableWordKeySet(reference, words);

  assert.equal(keys.size, MAX_REMOVABLE_WORD_CANDIDATES);
  assert.equal(keys.has("basic1499"), true);
  assert.equal(keys.has("basic1500"), false);
});

test("参考名单未占满时可补少量明确低价值名词", () => {
  const words = [
    word("good"),
    word("paris", { category: "地名专名", difficulty: "低频认识即可" }),
    word("upheaval", { category: "IELTS Reading", difficulty: "高级加分" })
  ];
  const keys = buildRemovableWordKeySet({ words: [{ word: "good" }] }, words);

  assert.equal(keys.has("good"), true);
  assert.equal(keys.has("paris"), true);
  assert.equal(keys.has("upheaval"), false);
});

test("低频学习标签不会把抽象学术名词误判为低价值名词", () => {
  const words = [word("fabrication", {
    difficulty: "低频认识即可",
    category: "IELTS Reading",
    topics: ["媒体", "社会"]
  })];
  const keys = buildRemovableWordKeySet({ words: [] }, words);

  assert.equal(keys.has("fabrication"), false);
});

test("熟悉状态不再自动隐藏，仍交给用户人工筛选", () => {
  const result = review([word("good", { status: "熟悉" })], ["good"]);
  assert.equal(result.counts.review, 1);
  assert.equal(result.candidateByIndex.has(0), true);
});

test("旧版因熟悉自动保留记录不再阻止人工复核", () => {
  const target = word("good");
  const audit = mergeTidyAuditRecords(createEmptyLexiconTidyAudit(), [{
    auditKey: getTidyAuditKey(target, 0),
    record: { decision: "keep_by_familiar", word: "good", reviewedAt: 1 }
  }]);
  const result = buildLexiconTidyReview([target], { audit, removableKeys: new Set(["good"]) });

  assert.equal(result.counts.review, 1);
});

test("旧版只保存在浏览器的删除记录不会隐藏正式词库中的词", () => {
  const target = word("good");
  const audit = mergeTidyAuditRecords(createEmptyLexiconTidyAudit(), [{
    auditKey: getTidyAuditKey(target, 0),
    record: { decision: "deleted", word: "good", deletedAt: 1 }
  }]);
  const result = buildLexiconTidyReview([target], { audit, removableKeys: new Set(["good"]) });

  assert.equal(result.counts.review, 1);
  assert.equal(result.counts.deleted, 1);
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
