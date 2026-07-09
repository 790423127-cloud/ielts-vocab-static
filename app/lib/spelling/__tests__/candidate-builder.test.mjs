import test from "node:test";
import assert from "node:assert/strict";

import { buildSpellingCandidates, buildSpellingCandidatesWithBreakdown, getWordId } from "../index.mjs";

test("candidate builder filters familiar flashcards by default without mutating words", () => {
  const words = [
    { word: "abandon", translation: "放弃" },
    { word: "benevolent", translation: "仁慈的" },
    { word: "candid", translation: "坦率的" }
  ];
  const original = JSON.stringify(words);
  const familiarId = getWordId(words[1]);

  const candidates = buildSpellingCandidates(words, {
    statuses: {
      [familiarId]: "熟悉"
    }
  });

  assert.deepEqual(candidates.map((candidate) => candidate.expectedAnswer), ["abandon", "candid"]);
  assert.equal(candidates[0].wordId, getWordId(words[0]));
  assert.equal(JSON.stringify(words), original);
});

test("candidate builder can include familiar flashcards when configured", () => {
  const words = [{ word: "abandon" }, { word: "benevolent" }];
  const familiarId = getWordId(words[1]);

  const candidates = buildSpellingCandidates(
    words,
    { statuses: { [familiarId]: "熟悉" } },
    { excludeFamiliarFlashcards: false }
  );

  assert.deepEqual(candidates.map((candidate) => candidate.expectedAnswer), ["abandon", "benevolent"]);
});

test("candidate builder accepts exported words.json object shape", () => {
  const exportedWords = {
    count: 2,
    savedAt: "2026-06-18T00:00:00.000Z",
    words: [{ word: "abandon" }, { word: "benevolent" }]
  };

  const candidates = buildSpellingCandidates(exportedWords, { statuses: {} });

  assert.deepEqual(candidates.map((candidate) => candidate.expectedAnswer), ["abandon", "benevolent"]);
});

test("candidate builder filters internal personal wrong ids as answers", () => {
  const { candidates, breakdown } = buildSpellingCandidatesWithBreakdown([
    {
      id: "personal_wrong_word_484cfc2:write-2",
      wordId: "personal_wrong_word_484cfc2:write-2",
      word: "personal_wrong_word_484cfc2:write-2",
      expectedAnswer: "personal_wrong_word_484cfc2:write-2",
      meaning: "词条待匹配"
    },
    {
      id: "word_valid",
      word: "accommodation",
      expectedAnswer: "accommodation",
      meaning: "住宿"
    }
  ], {}, { scope: "word", entryMode: "headwords" });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].expectedAnswer, "accommodation");
  assert.equal(breakdown.filteredByInvalidAnswer, 1);
});
