import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalCleanResult,
  buildLocalFormFamilyResult,
  mergeWord,
  repairObviousWrongWordLocally
} from "../page-word-helpers.mjs";

function aiWord(word, overrides = {}) {
  return {
    id: `id-${word}`,
    word,
    meaning: `${word}主释义`,
    meaningDetailZh: `${word}详解`,
    definition: `${word} definition`,
    otherMeanings: [{ meaningZh: `${word}其他义项` }],
    example: `${word} example`,
    exampleCn: `${word}例句`,
    aiContentProfile: "profile-v-test",
    status: "熟悉",
    favorite: true,
    ...overrides
  };
}

test("local headword formatting preserves the AI content package and learning state", () => {
  const before = aiWord("1. access");
  const result = buildLocalCleanResult([before]).words[0];
  assert.equal(result.word, "access");
  assert.equal(result.meaning, before.meaning);
  assert.deepEqual(result.otherMeanings, before.otherMeanings);
  assert.equal(result.aiContentProfile, before.aiContentProfile);
  assert.equal(result.status, "熟悉");
  assert.equal(result.favorite, true);
});

test("exact dedupe picks one complete AI package instead of mixing fields", () => {
  const first = aiWord("access", {
    meaning: "第一套主释义",
    definition: "",
    aiContentProfile: ""
  });
  const second = aiWord("access", {
    meaning: "第二套主释义",
    definition: "第二套英文释义",
    aiContentProfile: "complete-profile",
    status: "不熟"
  });
  const merged = mergeWord(first, second);
  assert.equal(merged.meaning, "第二套主释义");
  assert.equal(merged.definition, "第二套英文释义");
  assert.equal(merged.aiContentProfile, "complete-profile");
  assert.equal(merged.favorite, true);
});

test("local wrong-word repair does not clear AI-authored content", () => {
  const before = aiWord("access", {
    meaning: "undefined",
    example: "example sentence"
  });
  const repaired = repairObviousWrongWordLocally(before).word;
  assert.equal(repaired.meaning, "undefined");
  assert.equal(repaired.example, "example sentence");
  assert.equal(repaired.aiContentProfile, before.aiContentProfile);
});

test("local relation validation leaves AI-generated relation suggestions unchanged", () => {
  const generatedForm = {
    word: "accesses",
    type: "third-person singular",
    note: "AI suggestion",
    source: "ai-generated"
  };
  const before = aiWord("access", { forms: [generatedForm], wordFamily: [] });
  const after = buildLocalFormFamilyResult([before]).words[0];
  assert.deepEqual(after.forms, [generatedForm]);
  assert.equal(after.aiContentProfile, before.aiContentProfile);
});
