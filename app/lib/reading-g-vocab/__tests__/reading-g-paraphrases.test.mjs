import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const paraPath = path.join(root, "public/data/reading-g-paraphrases.json");

test("high confidence paraphrases: 300 groups; auto-quiz requires commonMeaningZh", () => {
  const data = JSON.parse(fs.readFileSync(paraPath, "utf8"));
  const groups = data.groups || [];
  assert.equal(groups.length, 300);
  const high = groups.filter((g) => g.confidence === "high");
  assert.equal(high.length, 300);
  const auto = groups.filter((g) => g.confidence === "high" && g.canAutoQuiz === true);
  assert.ok(auto.length >= 200 && auto.length <= 300);
  for (const g of auto) {
    assert.ok(g.anchor);
    assert.ok(Array.isArray(g.members) && g.members.length);
    assert.ok(String(g.commonMeaningZh || "").trim(), "auto-quiz needs commonMeaningZh");
    assert.notEqual(String(g.anchor).toLowerCase(), String(g.members[0]).toLowerCase());
  }
  // empty commonMeaning must not remain auto-quiz
  const badEmpty = auto.filter((g) => !String(g.commonMeaningZh || "").trim());
  assert.equal(badEmpty.length, 0);
});

test("no candidate auto-quiz groups in verified file", () => {
  const data = JSON.parse(fs.readFileSync(paraPath, "utf8"));
  const bad = (data.groups || []).filter((g) => g.canAutoQuiz && g.confidence !== "high");
  assert.equal(bad.length, 0);
});
