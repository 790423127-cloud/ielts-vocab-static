import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditPhrases } from "../../../../scripts/phrase-quality-gate.mjs";
import { buildPhraseLexiconMeta, normalizePhraseKey } from "../load-phrases.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const phrasesPath = path.join(root, "public/data/phrases.json");

function phrase(id, word, meaning, extra = {}) {
  return {
    id,
    word,
    answer: word,
    meaning,
    definition: "synthetic test definition",
    example: "This is a synthetic test example.",
    ...extra
  };
}

test("fatal semantic rules reject grammar labels, placeholders, and clear truncation", () => {
  const report = auditPhrases({
    count: 4,
    phrases: [
      phrase("grammar", "went", "went 是 go 的过去式"),
      phrase("placeholder", "take part in", "待补充"),
      phrase("machine-placeholder", "on balance", "AI 生成占位释义，待人工校对"),
      phrase("truncated", "Would I be correct in supposin", "我这样假设对吗？")
    ]
  });

  assert.equal(report.ok, false);
  assert.equal(report.fatalCounts.grammarOnlyMeaning, 1);
  assert.equal(report.fatalCounts.machinePlaceholderMeaning, 2);
  assert.equal(report.fatalCounts.truncatedHeadword, 1);
  assert.equal(report.findings.grammarOnlyMeaning[0].severity, "fatal");
  assert.equal(report.findings.machinePlaceholderMeaning[0].field, "meaning");
});

test("heuristic semantic and editorial clues warn without failing the gate", () => {
  const report = auditPhrases({
    phrases: [
      phrase("mismatch", "increase in demand", "需求下降"),
      phrase("mechanical", "take action", "“take action”的中文意思是“采取行动”"),
      phrase("delimiter", "as a result (of", "由于；因此")
    ]
  });

  assert.equal(report.ok, true);
  assert.equal(report.fatalTotal, 0);
  assert.deepEqual(report.warningCounts, {
    semanticPolarityMismatch: 1,
    mechanicalMeaning: 1,
    unbalancedDelimiter: 1
  });
  assert.equal(report.warningTotal, 3);
  assert.equal(report.findings.semanticPolarityMismatch[0].severity, "warning");
  assert.match(report.findings.unbalancedDelimiter[0].message, /truncated text/);
});

test("grammar terminology inside a real semantic gloss is not treated as grammar-only", () => {
  const report = auditPhrases({
    phrases: [
      phrase("pronoun", "he or she", "他或她（用于指代性别不明或需兼顾男女的第三人称单数）"),
      phrase("advanced", "most advanced", "最先进的；最高级的；最发达的")
    ]
  });

  assert.equal(report.ok, true);
  assert.equal(report.fatalCounts.grammarOnlyMeaning, 0);
});

test("the active phrase dataset passes fatals and exposes structured warnings", () => {
  const payload = JSON.parse(fs.readFileSync(phrasesPath, "utf8"));
  const report = auditPhrases(payload);

  assert.equal(report.count, payload.count);
  assert.equal(report.ok, true, report.errors.join("; "));
  assert.equal(report.fatalTotal, 0);
  assert.equal(typeof report.warningTotal, "number");
  assert.deepEqual(Object.keys(report.warningCounts), [
    "semanticPolarityMismatch",
    "mechanicalMeaning",
    "unbalancedDelimiter"
  ]);
  assert.equal(Array.isArray(report.findings.unbalancedDelimiter), true);
  for (const rows of Object.values(report.findings)) assert.equal(Array.isArray(rows), true);
});

test("editorial delimiter repairs preserve stable ids and expose real accepted forms", () => {
  const payload = JSON.parse(fs.readFileSync(phrasesPath, "utf8"));
  const byId = new Map(payload.phrases.map((entry) => [entry.id, entry]));
  const expected = [
    {
      id: "phrase_0f74d343388a",
      phraseOrder: 1048,
      word: "as a result (of)",
      acceptedAnswers: ["as a result", "as a result of"]
    },
    {
      id: "phrase_6981f0438102",
      phraseOrder: 1123,
      word: "(is/are/be) associated with",
      acceptedAnswers: ["is associated with", "are associated with", "be associated with"]
    },
    {
      id: "phrase_f1bbf1fcbcf8",
      phraseOrder: 1208,
      word: "beyond the scope of (this book/article/chapter)",
      acceptedAnswers: [
        "beyond the scope of this book",
        "beyond the scope of this article",
        "beyond the scope of this chapter"
      ]
    },
    {
      id: "phrase_4ba2a7abd016",
      phraseOrder: 1209,
      word: "it is important (to)",
      acceptedAnswers: ["it is important", "it is important to"]
    },
    {
      id: "phrase_f5ce0d76a93a",
      phraseOrder: 1212,
      word: "(to) take into account",
      acceptedAnswers: ["take into account", "to take into account"]
    }
  ];

  assert.match(payload.version, /^phrase-layer-v\d+-\d+-/);
  const previousVersion = `${payload.version}-previous`;
  const previousMeta = buildPhraseLexiconMeta({ ...payload, version: previousVersion }, payload.phrases);
  const currentMeta = buildPhraseLexiconMeta(payload, payload.phrases);
  assert.notEqual(currentMeta.phraseLexiconHash, previousMeta.phraseLexiconHash);

  for (const item of expected) {
    const entry = byId.get(item.id);
    assert.ok(entry, `missing stable phrase id ${item.id}`);
    assert.equal(entry.wordId, item.id);
    assert.equal(entry.phraseOrder, item.phraseOrder);
    assert.equal(normalizePhraseKey(entry), item.id);
    assert.equal(entry.word, item.word);
    assert.equal(entry.answer, item.word);
    assert.deepEqual(entry.acceptedAnswers, item.acceptedAnswers);
    assert.match(entry.meaningDetailZh, /[\u4e00-\u9fff]/);
    assert.equal(entry.meaningDetailSource, "manual-editorial-review-2026-07-10");
  }
});
