import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const vocab = JSON.parse(
  fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8")
);
const repairPatch = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/data/reading-g-example-repairs.json"), "utf8")
);
const retirements = JSON.parse(
  fs.readFileSync(path.join(root, "public/data/reading-g-retirements.json"), "utf8")
);
const retiredIds = new Set((retirements.entries || []).map((entry) => entry.id).filter(Boolean));

const metaExample = /^(?:You will often see the expression\b|In the passage,\s*["'].*["']\s+relates to\b|The word\s+["'].*["']\s+appears in many IELTS General Training reading texts\b)/i;

function tokens(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
}

function tokenMatchesTarget(word, target) {
  if (word === target) return true;
  const irregularForms = {
    bring: ["brought"], buy: ["bought"], choose: ["chose", "chosen"], come: ["came"],
    do: ["did", "done"], get: ["got", "gotten"], give: ["gave", "given"], go: ["went", "gone"],
    have: ["had"], know: ["knew", "known"], leave: ["left"], make: ["made"], pay: ["paid"],
    run: ["ran"], see: ["saw", "seen"], take: ["took", "taken"], write: ["wrote", "written"]
  };
  if (irregularForms[target]?.includes(word)) return true;
  if (target === "be") {
    return new Set(["am", "is", "are", "was", "were", "been", "being"]).has(word);
  }
  const variants = new Set([`${target}s`, `${target}es`, `${target}ed`, `${target}ing`]);
  if (target.endsWith("e")) {
    variants.add(`${target}d`);
    variants.add(`${target.slice(0, -1)}ing`);
  }
  if (target.endsWith("y") && target.length > 2) {
    variants.add(`${target.slice(0, -1)}ies`);
    variants.add(`${target.slice(0, -1)}ied`);
  }
  return variants.has(word);
}

function usesTarget(example, target) {
  const haystack = tokens(example);
  const wanted = tokens(target);
  let cursor = 0;
  let first = -1;
  let last = -1;
  for (const token of wanted) {
    if (new Set(["a", "an", "the"]).has(token)) continue;
    const isPlaceholder = /^(?:someone|somebody|something|one)(?:'s)?$/.test(token);
    const relativeIndex = haystack.slice(cursor).findIndex((word) =>
      isPlaceholder ? /^[a-z][a-z']*$/.test(word) : tokenMatchesTarget(word, token)
    );
    const found = relativeIndex < 0 ? -1 : cursor + relativeIndex;
    if (found < 0) return false;
    if (first < 0) first = found;
    last = found;
    cursor = found + 1;
  }
  return wanted.length > 0 && last - first <= wanted.length + 8;
}

test("reading-g contains no legacy meta-description examples", () => {
  const failures = vocab.items.filter((item) => metaExample.test(item.example || ""));
  assert.deepEqual(failures.map((item) => item.word), []);
});

test("all reviewed repairs are bilingual real-usage examples", () => {
  assert.equal(repairPatch.count, 657);
  assert.equal(repairPatch.repairs.length, 657);
  const seenExamples = new Set();
  const issues = [];
  for (const repair of repairPatch.repairs) {
    let item = vocab.items.find((candidate) => candidate.id === repair.id);
    if (!item) {
      item = vocab.items
        .flatMap((candidate) => candidate.mergedEntries || [])
        .find((candidate) => candidate.id === repair.id);
    }
    const normalizedExample = String(repair.example || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!item && !retiredIds.has(repair.id)) issues.push(`${repair.id}:missing_item`);
    if (metaExample.test(repair.example || "")) issues.push(`${repair.id}:meta_example`);
    if (!usesTarget(repair.example, repair.word)) issues.push(`${repair.id}:target_missing`);
    if (!/[\u3400-\u9fff]/u.test(repair.exampleCn || "")) issues.push(`${repair.id}:chinese_missing`);
    if (seenExamples.has(normalizedExample)) issues.push(`${repair.id}:duplicate_example`);
    const itemExampleCn = item?.exampleCn || item?.exampleZh || "";
    if (item && (item.example !== repair.example || itemExampleCn !== repair.exampleCn)) {
      issues.push(`${repair.id}:dataset_mismatch`);
    }
    seenExamples.add(normalizedExample);
  }
  assert.deepEqual(issues, []);
});

test("copy of has a practical bilingual example", () => {
  const item = vocab.items.find((candidate) => candidate.word === "copy of");
  assert.ok(item);
  assert.equal(usesTarget(item.example, item.word), true);
  assert.match(item.exampleCn, /[\u3400-\u9fff]/u);
  assert.equal(metaExample.test(item.example), false);
});
