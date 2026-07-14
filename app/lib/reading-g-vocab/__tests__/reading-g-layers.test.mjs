import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { itemMatchesRgFilter } from "../storage.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const vocabPath = path.join(root, "public/data/reading-g-vocab.json");

test("dataset has layered items and active/reference split", () => {
  assert.ok(fs.existsSync(vocabPath), "vocab file exists");
  const data = JSON.parse(fs.readFileSync(vocabPath, "utf8"));
  assert.ok((data.items || []).length > 1000);
  const active = data.items.filter((i) => i.studyMode === "active");
  const ref = data.items.filter((i) => i.studyMode === "reference");
  assert.ok(active.length > 0);
  assert.ok(ref.length > 0);
  // pure reference only
  for (const r of ref) {
    assert.ok((r.layers || []).every((l) => l === "reference701") || r.studyMode === "reference");
  }
});

test("layer filter and stage1 semantics", () => {
  const item = {
    word: "however",
    entryType: "word",
    studyMode: "active",
    layers: ["logic120", "priority1500"],
    normalizedKey: "however"
  };
  assert.equal(itemMatchesRgFilter(item, { type: "layer", value: "logic120" }, {}), true);
  assert.equal(itemMatchesRgFilter(item, { type: "stage1", value: "" }, {}), true);
  assert.equal(itemMatchesRgFilter(item, { type: "reference", value: "" }, {}), false);
  assert.equal(
    itemMatchesRgFilter(
      { ...item, studyMode: "reference", layers: ["reference701"] },
      { type: "active", value: "" },
      {}
    ),
    false
  );
});

test("active layer forces active studyMode in dataset", () => {
  const data = JSON.parse(fs.readFileSync(vocabPath, "utf8"));
  const bad = data.items.filter(
    (i) =>
      (i.layers || []).some((l) => l !== "reference701") &&
      i.studyMode !== "active" &&
      (i.layers || []).some((l) =>
        [
          "priority1500",
          "answerCore250",
          "logic120",
          "phrases400",
          "tierB1200",
          "paraCore600",
          "tierC800",
          "paraExt500"
        ].includes(l)
      )
  );
  assert.equal(bad.length, 0);
});
