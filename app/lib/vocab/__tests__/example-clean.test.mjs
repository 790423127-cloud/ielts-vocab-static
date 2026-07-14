import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanExampleField,
  exampleFieldsNeedCleanup,
  pickBestExampleSentence,
  stripExampleBulletsAndNoise,
  exampleMentionsTarget
} from "../example-clean.mjs";

test("fast cleanup guard skips clean examples and catches noisy ones", () => {
  assert.equal(exampleFieldsNeedCleanup("A clean example contains the target word.", "一个干净的例句。"), false);
  assert.equal(exampleFieldsNeedCleanup("  A noisy example contains the target word.  ", "一个例句。"), true);
  assert.equal(exampleFieldsNeedCleanup("A first sentence. A second sentence.", "一个例句。"), true);
});

test("strips leading bullet and picks sentence with target", () => {
  const raw =
    "• Try to send each mailing in a white envelope. It might be cheaper to use a brown envelope but it doesn't make for such good presentation.";
  const cleaned = cleanExampleField(raw, "good", { synthesizeIfEmpty: false });
  assert.equal(cleaned.repaired, true);
  assert.ok(!cleaned.example.startsWith("•"));
  assert.ok(exampleMentionsTarget(cleaned.example, "good"));
  assert.ok(cleaned.example.split(/\s+/).length < 40);
});

test("shortens multi-sentence corpus dump", () => {
  const raw =
    "A recent survey found that consumers are 50% more likely to be influenced by word-of-mouth recommendations than by TV or radio ads. So your reputation is your greatest asset. If your current customers are impressed with your company, they'll be more inclined to recommend you to others.";
  const best = pickBestExampleSentence(raw, "bad");
  // "bad" may not appear — still returns a single shorter sentence
  assert.ok(best.split(/\s+/).length <= 40);
  assert.ok(!best.includes("greatest asset") || best.split(/[.!?]/).filter(Boolean).length <= 2);
});

test("synthesizes empty phrase example", () => {
  const cleaned = cleanExampleField("", "according to", {
    entryType: "phrase",
    meaningZh: "根据",
    synthesizeIfEmpty: true
  });
  assert.equal(cleaned.repaired, true);
  assert.match(cleaned.example, /according to/i);
});

test("strip bullets helper", () => {
  assert.equal(stripExampleBulletsAndNoise("• Hello world."), "Hello world.");
});
