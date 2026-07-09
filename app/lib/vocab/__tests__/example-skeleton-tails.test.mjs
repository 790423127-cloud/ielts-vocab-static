import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isCorruptedExampleSkeleton,
  stripExampleSkeletonTails
} from "../example-skeleton-tails.mjs";
import { formatExampleForPrompt } from "../../spelling/spelling-display.mjs";

test("stripExampleSkeletonTails removes chained padding from minibus example", () => {
  const corrupted = "The daycare centre uses a minibus to pick up children from different neighbourhoods every morning and keep the receipt and bring photo ID and call the helpline and check the website and speak to reception and wait for email and save the reference and read the leaflet and follow the signage.";
  const cleaned = stripExampleSkeletonTails(corrupted);

  assert.equal(
    cleaned,
    "The daycare centre uses a minibus to pick up children from different neighbourhoods every morning."
  );
  assert.equal(isCorruptedExampleSkeleton(cleaned), false);
});

test("minibus example masks target word for spelling prompt after cleanup", () => {
  const example = stripExampleSkeletonTails(
    "The daycare centre uses a minibus to pick up children from different neighbourhoods every morning and keep the receipt."
  );

  assert.equal(
    formatExampleForPrompt(example, { targetWord: "minibus" }),
    "The daycare centre uses a _______ to pick up children from different neighbourhoods every morning."
  );
});

test("words.json has no corrupted example skeleton tails after repair", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const wordsPath = path.join(root, ".static-export-cache", "words.json");
  const payload = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
  const words = payload.words || payload;
  const corrupted = words.filter((entry) => isCorruptedExampleSkeleton(entry.example));

  assert.equal(corrupted.length, 0, `corrupted examples remain: ${corrupted.slice(0, 5).map((e) => e.word).join(", ")}`);
});