import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanExampleField,
  exampleFieldsNeedCleanup,
  isExampleLikelyTruncated,
  pickBestExampleSentence,
  stripExampleBulletsAndNoise,
  exampleMentionsTarget
} from "../example-clean.mjs";

test("detects a dangling tail without treating a complete time phrase as truncated", () => {
  assert.equal(isExampleLikelyTruncated("She is recovering from."), true);
  assert.equal(isExampleLikelyTruncated("The company offered me."), false);
  assert.equal(isExampleLikelyTruncated("I feel sick and need to lie down for a while."), false);
  assert.equal(isExampleLikelyTruncated("According to the weather report, it will rain."), false);
  assert.equal(isExampleLikelyTruncated("Which channel is the news on?"), false);
  assert.equal(isExampleLikelyTruncated("She has not learnt which qualities employers look for."), false);
  assert.equal(isExampleLikelyTruncated("Please inform us of the place you are travelling to."), false);
  assert.equal(isExampleLikelyTruncated("My new colleague is very sociable and easy to talk to."), false);
  assert.equal(isExampleLikelyTruncated("Softwood is easy to work with."), false);
});

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

test("does not synthesize a meta-description for an empty phrase example", () => {
  const cleaned = cleanExampleField("", "according to", {
    entryType: "phrase",
    meaningZh: "根据",
    synthesizeIfEmpty: true
  });
  assert.equal(cleaned.repaired, true);
  assert.equal(cleaned.example, "");
  assert.equal(cleaned.reason, "missing_real_example");
});

test("preserves complete examples that end in short words or time abbreviations", () => {
  const examples = [
    ["I don't like coffee; rather, I prefer tea.", "rather"],
    ["Driving without a license is against the law.", "law"],
    ["She gained experience from the job.", "gain"],
    ["The museum is showing a new exhibition of modern art.", "showing"],
    ["Guests must check out by 11 am.", "check out"],
    ["The gym is open from 6 a.m. to 10 p.m.", "open"]
  ];

  for (const [example, target] of examples) {
    assert.equal(
      cleanExampleField(example, target, { synthesizeIfEmpty: false }).example,
      example
    );
  }
});

test("removes legacy meta-description examples", () => {
  const cleaned = cleanExampleField(
    'You will often see the expression "copy of" in IELTS reading passages.',
    "copy of",
    { entryType: "phrase", synthesizeIfEmpty: false }
  );
  assert.equal(cleaned.repaired, true);
  assert.equal(cleaned.example, "");
  assert.equal(cleaned.reason, "removed_meta_placeholder");
});

test("strip bullets helper", () => {
  assert.equal(stripExampleBulletsAndNoise("• Hello world."), "Hello world.");
});
