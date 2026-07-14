import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const DATA = path.join(ROOT, "data", "gt-complete");

function parseTsv(name) {
  const lines = fs.readFileSync(path.join(DATA, name), "utf8").trim().split(/\r?\n/);
  const headers = lines.shift().split("\t");
  return lines.map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/[‐‑‒–—]/g, "-").replace(/\s+/g, " ");
}

const active = parseTsv("active-words.tsv");
const reference = parseTsv("reference-words.tsv");
const phrases = parseTsv("phrases.tsv");
const updates = fs.readdirSync(DATA)
  .filter((name) => /^word-updates.*\.tsv$/i.test(name))
  .sort()
  .flatMap(parseTsv);

test("GT patch word and phrase heads are unique", () => {
  const wordHeads = [...active, ...reference].map((row) => normalized(row.word));
  const phraseHeads = phrases.map((row) => normalized(row.word));
  assert.equal(new Set(wordHeads).size, wordHeads.length);
  assert.equal(new Set(phraseHeads).size, phraseHeads.length);
  assert.equal(wordHeads.some((head) => head.includes(" ")), false, "word additions must not contain phrases");
});

test("required editorial repairs are explicitly specified", () => {
  const byWord = new Map(updates.map((row) => [normalized(row.word), row]));
  for (const word of ["advert", "bite", "pad", "bark", "concession"]) {
    assert.equal(byWord.has(word), true, `${word} repair is required`);
  }
  assert.match(byWord.get("advert").set, /广告/);
  assert.match(byWord.get("bite").set, /寒冷/);
  assert.match(byWord.get("pad").set, /衬垫/);
  assert.match(byWord.get("bark").addSenses, /树皮/);
  assert.match(byWord.get("concession").addSenses, /优惠/);
});

test("corpus-grounded uncommon senses are included", () => {
  const byWord = new Map(updates.map((row) => [normalized(row.word), row]));
  const expected = {
    stock: "种群",
    carrier: "传播媒介",
    host: "宿主",
    conductor: "导体",
    litter: "枯枝落叶",
    gum: "树胶",
    bill: "宣传或描述",
    fuel: "加剧"
  };
  for (const [word, sense] of Object.entries(expected)) {
    assert.equal(byWord.has(word), true, `${word} must have a corpus sense patch`);
    assert.match(`${byWord.get(word).set} ${byWord.get(word).addSenses}`, new RegExp(sense));
  }
});

test("active and reference additions have correct plan stages", () => {
  assert.equal(active.every((row) => ["1", "2"].includes(row.gtPlanStage)), true);
  assert.equal(reference.every((row) => row.gtPlanStage === "4"), true);
  assert.equal(reference.every((row) => row.studyMode === "reference"), true);
  assert.equal(active.some((row) => row.word === "chargeback"), true);
  assert.equal(reference.some((row) => row.word === "eutrophication"), true);
});

test("answer phrases and compound expressions stay in phrase data", () => {
  const byPhrase = new Map(phrases.map((row) => [normalized(row.word), row]));
  for (const phrase of [
    "academic calendar", "community service", "credit card", "dress code", "immune system",
    "impact assessment", "power cut", "response rate", "website content", "antenatal clinic",
    "confidential helpline", "cutting chart", "family-friendly", "self-sufficient", "well-defined"
  ]) {
    assert.equal(byPhrase.has(phrase), true, `${phrase} phrase is required`);
  }
  assert.equal(byPhrase.get("antenatal clinic").spellingPriority, "True");
  assert.equal(byPhrase.get("confidential helpline").spellingPriority, "True");
  assert.equal(byPhrase.get("cutting chart").spellingPriority, "True");
});

test("patcher is idempotent and protects user progress fields by construction", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "apply-gt-complete-vocab-patch.mjs"), "utf8");
  assert.match(source, /headword:/);
  assert.match(source, /wordMap\.has|wordMap\.get/);
  assert.match(source, /status/);
  assert.match(source, /favorite/);
  assert.match(source, /USER_FIELDS/);
  assert.match(source, /word-updates.*\\\.tsv/);
});

test("learning plan menu patch exposes the word stages", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "apply-gt-complete-ui-patch.mjs"), "utf8");
  assert.match(source, /G类完整学习计划/);
  assert.match(source, /阶段1 · 核心理解/);
  assert.match(source, /阶段2 · 扩展识别/);
  assert.match(source, /阶段4 · 专业参考/);
});
