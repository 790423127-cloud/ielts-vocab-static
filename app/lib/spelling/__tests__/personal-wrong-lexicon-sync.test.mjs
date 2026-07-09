import test from "node:test";
import assert from "node:assert/strict";

import {
  appendPersonalWrongRecordsToLexicon,
  buildLexiconEntryFromPersonalWrongRecord,
  findPersonalWrongRecordsMissingFromLexicon,
  isPersonalWrongRecordInLexicon,
  pruneStalePersonalWrongLexiconEntries,
  resolveSpellingEntryAiTarget,
  syncPersonalWrongRecordsToLocalLexicon
} from "../personal-wrong-lexicon-sync.mjs";
import { mergeHeadwordsWithLocalCache } from "../load-spelling-lexicon.mjs";
import {
  buildPersonalWrongBookCandidates,
  parsePersonalWrongBookInput
} from "../personal-wrong-book.mjs";

test("buildLexiconEntryFromPersonalWrongRecord creates a persistent headword entry", () => {
  const [record] = parsePersonalWrongBookInput("unlistedword | 本地补充");
  const entry = buildLexiconEntryFromPersonalWrongRecord(record);

  assert.equal(entry.word, "unlistedword");
  assert.equal(entry.meaning, "本地补充");
  assert.equal(entry.entryType, "headword");
  assert.equal(entry.addedFromPersonalWrongBook, true);
  assert.equal(entry.personalWrongOnly, undefined);
});

test("appendPersonalWrongRecordsToLexicon only adds records missing from lexicon", () => {
  const records = parsePersonalWrongBookInput("unlistedword | 未收录\nvacancy | 职位空缺");
  const headwords = [
    {
      id: "word_vacancy",
      wordId: "word_vacancy",
      word: "vacancy",
      answer: "vacancy",
      meaning: "空缺"
    }
  ];

  const missing = findPersonalWrongRecordsMissingFromLexicon(records, headwords, []);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].anchor, "unlistedword");

  const merged = appendPersonalWrongRecordsToLexicon(headwords, [], records);
  assert.equal(merged.added, 1);
  assert.equal(merged.headwords.length, 2);
  assert.equal(merged.headwords[1].word, "unlistedword");
});

test("personal wrong candidates link to lexicon after supplemental append", () => {
  const records = parsePersonalWrongBookInput("unlistedword | 本地补充");
  const merged = appendPersonalWrongRecordsToLexicon([], [], records);
  const [candidate] = buildPersonalWrongBookCandidates(records, merged.headwords, { scope: "word" });

  assert.equal(candidate.personalWrong.linkedToLexicon, true);
  assert.equal(candidate.meaning, "本地补充");
});

test("isPersonalWrongRecordInLexicon matches anchor and inflected lookups", () => {
  const [record] = parsePersonalWrongBookInput("vacancies | vacancy");
  const headwords = [{ word: "vacancy", answer: "vacancy" }];

  assert.equal(isPersonalWrongRecordInLexicon(record, headwords, []), true);
});

test("resolveSpellingEntryAiTarget prefers personal wrong anchor for AI tools", () => {
  const records = parsePersonalWrongBookInput("vacancies | vacancy");
  const merged = appendPersonalWrongRecordsToLexicon([], [], records);
  const [candidate] = buildPersonalWrongBookCandidates(records, merged.headwords, { scope: "word" });
  const pluralWrite = candidate.personalWrong.formKind === "plural"
    ? candidate
    : buildPersonalWrongBookCandidates(records, merged.headwords, { scope: "word" }).find((entry) => entry.personalWrong.formKind === "plural");

  assert.equal(resolveSpellingEntryAiTarget(pluralWrite, "word"), "vacancy");
});

test("syncPersonalWrongRecordsToLocalLexicon persists missing word records", async () => {
  const records = parsePersonalWrongBookInput("unlistedword | 本地补充", { scopeHint: "word" });
  let persistedWords = null;

  const result = await syncPersonalWrongRecordsToLocalLexicon(records, {
    scope: "word",
    loadWordsForSync: async () => ({ words: [], meta: { version: "test-words" } }),
    loadPhrasesForSync: async () => ({ phrases: [], meta: { version: "test-phrases" } }),
    persistWords: async (words) => {
      persistedWords = words;
      return { ok: true };
    },
    persistPhrases: async () => {
      throw new Error("phrase cache should not be touched for word scope");
    }
  });

  assert.equal(result.added, 1);
  assert.equal(result.addedHeadwords, 1);
  assert.equal(result.addedPhrases, 0);
  assert.equal(result.wouldAdd, 0);
  assert.equal(result.pendingEntries.length, 0);
  assert.equal(persistedWords.length, 1);
  assert.equal(persistedWords[0].word, "unlistedword");
});

test("syncPersonalWrongRecordsToLocalLexicon persists missing phrase records", async () => {
  const records = parsePersonalWrongBookInput("look forward to | 期待", { scopeHint: "phrase" });
  let persistedPhrases = null;
  let persistedMeta = null;

  const result = await syncPersonalWrongRecordsToLocalLexicon(records, {
    scope: "phrase",
    loadWordsForSync: async () => ({ words: [], meta: { version: "test-words" } }),
    loadPhrasesForSync: async () => ({ phrases: [], meta: { version: "phrase-layer-test" } }),
    persistWords: async () => {
      throw new Error("word cache should not be touched for phrase scope");
    },
    persistPhrases: async (phrases, meta) => {
      persistedPhrases = phrases;
      persistedMeta = meta;
      return true;
    }
  });

  assert.equal(result.added, 1);
  assert.equal(result.addedHeadwords, 0);
  assert.equal(result.addedPhrases, 1);
  assert.equal(persistedPhrases.length, 1);
  assert.equal(persistedPhrases[0].word, "look forward to");
  assert.equal(persistedMeta.count, 1);
});

test("spelling lexicon loader keeps local personal wrong supplements as additive words", () => {
  const official = [{ id: "word_official", word: "official", meaning: "正式词" }];
  const cached = [
    { id: "word_old_cache", word: "oldcache", meaning: "旧缓存" },
    {
      id: "word_personal_wrong",
      word: "unlistedword",
      meaning: "本地补充",
      addedFromPersonalWrongBook: true,
      source: "personal_wrong_book",
      supplemental: true
    }
  ];

  const merged = mergeHeadwordsWithLocalCache(official, cached);

  assert.equal(merged.length, 2);
  assert.equal(merged.some((entry) => entry.word === "official"), true);
  assert.equal(merged.some((entry) => entry.word === "unlistedword"), true);
  assert.equal(merged.some((entry) => entry.word === "oldcache"), false);
});

test("stale personal wrong supplements are pruned after wrong records are removed", () => {
  const records = parsePersonalWrongBookInput("keepword | 保留");
  const entries = [
    { id: "official", word: "official", meaning: "正式词" },
    {
      id: "keep",
      word: "keepword",
      meaning: "保留",
      addedFromPersonalWrongBook: true,
      source: "personal_wrong_book"
    },
    {
      id: "stale",
      word: "staleextra",
      meaning: "旧错词",
      addedFromPersonalWrongBook: true,
      source: "personal_wrong_book"
    }
  ];

  const pruned = pruneStalePersonalWrongLexiconEntries(entries, records, "word");

  assert.equal(pruned.removedCount, 1);
  assert.deepEqual(pruned.removed.map((entry) => entry.word), ["staleextra"]);
  assert.deepEqual(pruned.entries.map((entry) => entry.word), ["official", "keepword"]);
});

test("syncPersonalWrongRecordsToLocalLexicon persists removal of stale personal supplements", async () => {
  let persistedWords = null;

  const result = await syncPersonalWrongRecordsToLocalLexicon([], {
    scope: "word",
    loadWordsForSync: async () => ({
      words: [
        { id: "official", word: "official", meaning: "正式词" },
        {
          id: "stale",
          word: "staleextra",
          meaning: "旧错词",
          addedFromPersonalWrongBook: true,
          source: "personal_wrong_book"
        }
      ],
      meta: { version: "test-words" }
    }),
    loadPhrasesForSync: async () => ({ phrases: [], meta: { version: "test-phrases" } }),
    persistWords: async (words) => {
      persistedWords = words;
      return { ok: true };
    },
    persistPhrases: async () => true
  });

  assert.equal(result.added, 0);
  assert.equal(result.removedHeadwords, 1);
  assert.equal(result.removed, 1);
  assert.deepEqual(persistedWords.map((entry) => entry.word), ["official"]);
});
