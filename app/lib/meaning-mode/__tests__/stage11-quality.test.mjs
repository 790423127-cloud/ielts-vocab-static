import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { buildQuestionWithValidation, buildQuestion, validateQuestion } from "../builder.mjs";
import { generateDistractorCombinations, resetGlobalFrequency } from "../distractor-ranking.mjs";
import { scoreCandidate, _relationIndex } from "../sense-relation-engine.mjs";
import { MEANING_POS_INDEX } from "../meaning-pos-index.generated.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..", "..");
const DATA_PATH = join(ROOT, "public", "data", "meaning-6000.json");
const PAGE_PATH = join(ROOT, "app", "meaning", "page.jsx");

const wordBank = JSON.parse(readFileSync(DATA_PATH, "utf-8")).items.map(item => ({
  ...item,
  _posFamily: MEANING_POS_INDEX[item.wordId] || "unknown"
}));

function byWord(word) {
  for (const entry of _relationIndex.values()) {
    if (entry.word === word) return entry;
  }
  return null;
}

function firstValidQuestion() {
  resetGlobalFrequency();
  for (let i = 0; i < Math.min(600, wordBank.length); i++) {
    const q = buildQuestionWithValidation(wordBank[i], wordBank, "stage11", i, null, null, 2);
    if (!q.qualityDeferred && validateQuestion(q).valid) return q;
  }
  return null;
}

describe("Stage 11 semantic quality gates", () => {
  it("P3/P4 and hard-blacklisted relations are not usable", () => {
    const commitment = byWord("commitment");
    const culture = byWord("culture");
    const limited = byWord("limited");
    const early = byWord("early");
    assert.ok(commitment && culture && limited && early);

    const c1 = scoreCandidate(commitment.wordId, culture.wordId);
    const c2 = scoreCandidate(limited.wordId, early.wordId);

    assert.equal(c1.usable, false);
    assert.equal(c1.qualityClass, "P4");
    assert.equal(c2.usable, false);
    assert.equal(c2.qualityClass, "P4");
  });

  it("wide axis without approved evidence cannot become usable", () => {
    const commitment = byWord("commitment");
    const relation = byWord("relation");
    assert.ok(commitment && relation);
    const s = scoreCandidate(commitment.wordId, relation.wordId);
    assert.equal(s.usable, false);
    assert.notEqual(s.qualityClass, "P1");
    assert.notEqual(s.qualityClass, "P2");
  });

  it("learnerDistinctionZh and relationEvidence are required for usable candidates", () => {
    const experience = byWord("experience");
    const expertise = byWord("expertise");
    assert.ok(experience && expertise);
    const s = scoreCandidate(experience.wordId, expertise.wordId);
    assert.equal(s.usable, true);
    assert.ok(s.learnerDistinctionZh);
    assert.ok(s.relationReason);
    assert.ok(s.relationEvidence);
    assert.ok(s.relationEvidence.sourceFields.length > 0);
  });

  it("final options preserve full metadata and use derived sense keys honestly", () => {
    const q = firstValidQuestion();
    assert.ok(q, "No valid Stage 11 question found");
    for (const opt of q.options) {
      assert.ok(opt.sourceWordId);
      assert.ok(opt.sourceHeadword);
      assert.ok(opt.posFamily);
      assert.ok(opt.senseKey);
      assert.ok(opt.senseKeySource === "native" || opt.senseKeySource === "derived");
      assert.ok(opt.quizMeaningZh);
      assert.ok(opt.meaningDetailedZh);
      assert.ok(opt.relationType);
      assert.ok(opt.relationReason);
      assert.notEqual(opt.relationReason, opt.relationType);
      assert.ok(opt.learnerDistinctionZh);
      assert.ok(opt.relationEvidence);
      assert.ok(opt.qualityClass === "P1" || opt.qualityClass === "P2");
      assert.ok(opt.qualityTier === "A" || opt.qualityTier === "B");
      if (opt.senseKeySource === "derived") {
        assert.ok(!opt.senseKey.endsWith("-sense-1"));
      }
    }
  });

  it("third distractor uses the same P1/P2 standard", () => {
    const q = firstValidQuestion();
    assert.ok(q);
    const distractors = q.options.filter(o => !o.isCorrect);
    assert.equal(distractors.length, 3);
    for (const opt of distractors) {
      assert.ok(opt.qualityClass === "P1" || opt.qualityClass === "P2");
      assert.ok(opt.learnerDistinctionZh);
      assert.ok(opt.relationEvidence);
    }
  });

  it("frequency balancing never admits P3/P4", () => {
    resetGlobalFrequency();
    const target = wordBank.find(w => w.word === "impression") || wordBank[0];
    const result = generateDistractorCombinations(wordBank, target.wordId, target.meaningZh, 5, null);
    for (const combo of result.combinations) {
      for (const d of combo.distractors) {
        assert.ok(d.qualityClass === "P1" || d.qualityClass === "P2");
      }
    }
  });

  it("formerly mixed targets use one quiz sense and keep forbidden distractors out", () => {
    const commitment = wordBank.find(w => w.word === "commitment");
    const experience = wordBank.find(w => w.word === "experience");
    assert.ok(commitment && experience);

    const q1 = buildQuestionWithValidation(commitment, wordBank, "stage12-single-sense", 0, null, null, 3);
    const q2 = buildQuestionWithValidation(experience, wordBank, "stage12-single-sense", 1, null, null, 3);

    for (const q of [q1, q2]) {
      assert.equal(q.semanticQualityDeferred, undefined);
      assert.equal(validateQuestion(q).valid, true);
      assert.ok(!String(q.correctAnswer).includes("；"));
    }

    const commitmentForbidden = new Set(["culture", "relation", "independence"]);
    for (const opt of q1.options.filter(o => !o.isCorrect)) {
      assert.equal(commitmentForbidden.has(opt.sourceHeadword), false);
    }

    const experienceForbidden = new Set(["satisfaction", "anxiety", "happiness"]);
    for (const opt of q2.options.filter(o => !o.isCorrect)) {
      assert.equal(experienceForbidden.has(opt.sourceHeadword), false);
    }
  });
});

describe("Stage 11 page disclosure", () => {
  it("question phase does not render hidden distinction fields, result phase does", () => {
    const src = readFileSync(PAGE_PATH, "utf-8");
    const questionBlock = src.slice(src.indexOf("function QuestionCard"), src.indexOf("function ResultCard"));
    const resultBlock = src.slice(src.indexOf("function ResultCard"));
    assert.ok(!questionBlock.includes("learnerDistinctionZh"));
    assert.ok(!questionBlock.includes("relationReason"));
    assert.ok(!questionBlock.includes("meaningDetailedZh"));
    assert.ok(resultBlock.includes("learnerDistinctionZh"));
    assert.ok(resultBlock.includes("optionDistinction"));
  });
});
