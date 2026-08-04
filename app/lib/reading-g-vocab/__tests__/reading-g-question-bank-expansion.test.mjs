import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeReadingGKey } from "../normalize.mjs";
import { itemMatchesPathStage } from "../stages.mjs";
import {
  READING_G_RETIREMENTS_SOURCE,
  getReadingGRetirementKey,
  normalizeReadingGRetirements
} from "../retirements.mjs";
import { applyReadingGQuestionBankExpansion } from "../../../../scripts/expand-reading-g-question-bank.mjs";
import { normalizeReadingGCompactionPlan } from "../compaction.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

const externalSupplementFlags = new Set([
  "grok_full_bank_true_missing_supplement_v1",
  "grok_excel_part1_2_missing_supplement_v1"
]);
const externalSupplementLayers = new Set([
  "grokFullBankSupplement",
  "grokExcelPart12Supplement"
]);

function isExternalSupplement(item) {
  return (
    (item?.qualityFlags || []).some((flag) => externalSupplementFlags.has(flag))
    || (item?.layers || []).some((layer) => externalSupplementLayers.has(layer))
  );
}

test("question-bank expansion keeps every unretired source headword with stable classification", () => {
  const vocab = read("public/data/reading-g-vocab.json");
  const source = read("scripts/data/reading-g-question-bank-3109.json");
  const compaction = normalizeReadingGCompactionPlan(
    read("public/data/reading-g-word-family-compaction.json")
  );
  const aliasToCanonical = new Map(
    compaction.rules.flatMap((rule) => rule.aliases.map((alias) => [alias.key, rule.canonicalKey]))
  );
  const retirements = normalizeReadingGRetirements(read(READING_G_RETIREMENTS_SOURCE));
  const retiredKeys = new Set(retirements.map((entry) => entry.key));
  const ids = new Set(vocab.items.map((item) => item.id));
  const words = new Map(
    vocab.items
      .filter((item) => (item.entryType || "word") === "word")
      .map((item) => [normalizeReadingGKey(item.word), item])
  );

  assert.equal(source.words.length, 3109);
  assert.equal(new Set(source.words.map(normalizeReadingGKey)).size, 3109);
  assert.equal(ids.size, vocab.items.length);
  assert.equal(words.size, vocab.wordCount);

  let present = 0;
  let alreadyInCore = 0;
  let compacted = 0;
  let suppressed = 0;
  let retired = 0;
  for (const rawWord of source.words) {
    const word = normalizeReadingGKey(rawWord);
    const retirementKey = getReadingGRetirementKey({ word, entryType: "word" });
    const item = words.get(word);
    if (retiredKeys.has(retirementKey)) {
      retired += 1;
      if (item) {
        assert.equal(isExternalSupplement(item), true, `retired source word visible without external supplement: ${word}`);
        alreadyInCore += 1;
      }
      continue;
    }
    if (item) {
      present += 1;
      if (!(item.qualityFlags || []).includes("question_bank_5262_expansion")) {
        alreadyInCore += 1;
        if (!isExternalSupplement(item)) {
          assert.ok((item.qualityFlags || []).includes("master_lexicon_reused"));
          assert.equal((item.layers || []).includes("questionBankActive"), false);
        }
      }
      continue;
    }
    const canonicalKey = aliasToCanonical.get(word);
    const canonical = words.get(canonicalKey);
    if (!canonical) {
      assert.equal(retiredKeys.has(`word::${canonicalKey}`), true, `missing compacted family for expanded word: ${word}`);
      suppressed += 1;
      continue;
    }
    assert.ok((canonical.mergedAliases || []).some((alias) => alias.key === word));
    compacted += 1;
  }
  assert.equal(present + compacted + suppressed + retired, 3109);
  assert.equal(present, vocab.questionBankExpansion.effectiveTargetCount);
  assert.equal(compacted, vocab.questionBankExpansion.compactedSourceHeadwordCount);
  assert.equal(suppressed, vocab.questionBankExpansion.suppressedSourceHeadwordCount);
  assert.equal(present + compacted, vocab.questionBankExpansion.representedTargetCount);
  assert.ok(vocab.questionBankExpansion.alreadyInCoreCount >= alreadyInCore);
});

test("question-bank words follow the exclusive active/reference stage route", () => {
  const vocab = read("public/data/reading-g-vocab.json");
  const meta = vocab.questionBankExpansion;
  const active = vocab.items.filter((item) => (
    (item.layers || []).includes("questionBankActive")
    && (item.qualityFlags || []).includes("question_bank_5262_expansion")
    && !isExternalSupplement(item)
  ));
  const aiCompleted = vocab.items.filter((item) => (
    (item.layers || []).includes("questionBankAiCompleted")
    && (item.qualityFlags || []).includes("question_bank_5262_expansion")
    && !isExternalSupplement(item)
  ));
  const activeExpansionKeys = new Set(
    [...active, ...aiCompleted].map((item) => `${item.type || "word"}::${item.normalized || item.word}`)
  );
  const pendingCarriers = vocab.items.filter((item) => (item.layers || []).includes("questionBankPending"));
  const pendingIndependent = vocab.items.filter((item) => (
    item.primaryLayer === "questionBankPending"
    && item.studyMode === "reference"
    && (item.qualityFlags || []).includes("missing_master_lexicon")
  ));

  assert.equal(meta.targetCount, 3109);
  assert.equal(meta.masterMatchedCount, 1338);
  assert.equal(meta.masterMissingCount, 1771);
  assert.equal(activeExpansionKeys.size, meta.activeCount);
  assert.equal(aiCompleted.length, meta.aiCompletedCount || 0);
  assert.equal(pendingIndependent.length, meta.pendingCount);
  assert.equal(pendingIndependent.length, meta.pendingIndependentCount);
  assert.equal(pendingCarriers.length, meta.pendingLayerCount);
  assert.equal(
    meta.effectiveTargetCount
      + meta.compactedSourceHeadwordCount
      + meta.suppressedSourceHeadwordCount
      + meta.retiredSourceHeadwordCount,
    meta.targetCount
  );
  assert.equal(
    meta.representedTargetCount
      + meta.suppressedSourceHeadwordCount
      + meta.retiredSourceHeadwordCount,
    meta.targetCount
  );

  for (const item of active) {
    assert.equal(item.studyMode, "active");
    assert.equal(
      ["1", "2", "3"].filter((stage) => itemMatchesPathStage(item, stage)).length,
      1
    );
    assert.equal(itemMatchesPathStage(item, "4"), false);
    assert.equal(
      (item.qualityFlags || []).includes("master_lexicon_reused")
        || (item.qualityFlags || []).includes("built_without_master"),
      true
    );
    assert.ok(item.primaryMeaningZh);
  }
  for (const item of aiCompleted) {
    assert.equal(item.studyMode, "active");
    assert.equal(
      ["1", "2", "3"].filter((stage) => itemMatchesPathStage(item, stage)).length,
      1
    );
    assert.equal(itemMatchesPathStage(item, "4"), false);
    assert.ok((item.qualityFlags || []).includes("reading_g_ai_completed"));
  }
  for (const item of pendingIndependent) {
    assert.ok((item.qualityFlags || []).includes("missing_master_lexicon"));
    assert.equal(item.studyMode, "reference");
    assert.equal(itemMatchesPathStage(item, "4"), true);
  }
});

test("expansion is idempotent and keeps the master sources consistent", () => {
  const vocab = structuredClone(read("public/data/reading-g-vocab.json"));
  const report = structuredClone(read("public/data/reading-g-import-report.json"));
  const beforeCount = vocab.items.length;
  const beforePending = vocab.questionBankExpansion.pendingCount;
  const beforePendingLayer = vocab.questionBankExpansion.pendingLayerCount;
  const beforeRetired = vocab.questionBankExpansion.retiredCount;
  const result = applyReadingGQuestionBankExpansion({ vocab, report, projectRoot: root });

  assert.equal(vocab.items.length, beforeCount);
  // Retired source headwords are re-materialized then filtered out each run, so
  // addedCount can be non-zero even when the visible lexicon is unchanged.
  assert.equal(result.masterMatchedCount + result.masterMissingCount, 3109);
  assert.equal(
    result.representedTargetCount
      + vocab.questionBankExpansion.suppressedSourceHeadwordCount
      + vocab.questionBankExpansion.retiredSourceHeadwordCount,
    3109
  );
  assert.equal(vocab.questionBankExpansion.pendingCount, beforePending);
  assert.equal(vocab.questionBankExpansion.pendingLayerCount, beforePendingLayer);
  assert.equal(vocab.questionBankExpansion.retiredCount, beforeRetired);
  assert.equal(report.summary.itemCount, vocab.items.length);
});
