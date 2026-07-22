import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildVocabDataPayload, validateVocabDataPayload } from "../vocab-data-meta.mjs";
import {
  buildWordCacheMeta,
  formatOfflineVocabNotice,
  formatVocabCountLabel,
  isWordCacheCurrent,
  mergeWordContentWithUserState
} from "../word-cache-meta.mjs";
import { mergeVocabForSpelling } from "../browser-vocab-store.mjs";
import {
  auditCoreVocab,
  runQualityGate
} from "../../../../scripts/core-vocab-quality-audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const wordsPath = path.join(root, ".static-export-cache/words.json");
const phrasesPath = path.join(root, "public/data/phrases.json");
const pagePath = path.join(root, "app/page.jsx");

function fileHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("vocab API payload exposes complete metadata matching active words", () => {
  const raw = fs.readFileSync(wordsPath, "utf8");
  const source = JSON.parse(raw);
  const payload = buildVocabDataPayload(raw);
  const validation = validateVocabDataPayload(payload, {
    count: source.words.length,
    version: source.version,
    lexiconHash: source.lexiconHash,
    fileHash: fileHash(wordsPath)
  });

  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.equal(payload.savedAt, source.savedAt);
  assert.equal(payload.wordsHash, crypto.createHash("sha256").update(JSON.stringify(source.words)).digest("hex"));
});

test("home count formatter displays the computed brushable count without fixed totals", () => {
  assert.equal(formatVocabCountLabel("loading", null), "加载中");
  assert.equal(formatVocabCountLabel("online", 9917), "9,917 词");
  assert.equal(formatVocabCountLabel("online", 10000), "10,000 词");
  assert.equal(formatVocabCountLabel("online", 9800), "9,800 词");
  assert.equal(formatVocabCountLabel("error", null), "词库不可用");

  const source = fs.readFileSync(pagePath, "utf8");
  const bootstrap = fs.readFileSync(path.join(root, "app/hooks/useHomeVocabBootstrap.js"), "utf8");
  assert.match(source, /formatVocabCountLabel\(vocabRuntime\.status, wordLibraryStats\.total\)/);
  assert.match(bootstrap, /hydratedWordsRef\.current === words/);
  assert.doesNotMatch(source, /"9,909"/);
  assert.doesNotMatch(source, /words\.length\s*>=\s*9900\s*\?\s*"9,909"/);
});

test("word cache metadata invalidates on version or hash changes", () => {
  const words = [{ id: "w1", word: "work" }];
  const meta = buildWordCacheMeta(words, {
    version: "v1",
    lexiconHash: "hash-a",
    savedAt: "2026-06-22T00:00:00.000Z",
    fileHash: "file-a",
    wordsHash: "words-a"
  });

  assert.deepEqual(
    { count: meta.count, version: meta.version, lexiconHash: meta.lexiconHash, savedAt: meta.savedAt },
    { count: 1, version: "v1", lexiconHash: "hash-a", savedAt: "2026-06-22T00:00:00.000Z" }
  );
  assert.equal(isWordCacheCurrent(meta, { count: 1, version: "v1", lexiconHash: "hash-a" }), true);
  assert.equal(isWordCacheCurrent(meta, { count: 1, version: "v2", lexiconHash: "hash-a" }), false);
  assert.equal(isWordCacheCurrent(meta, { count: 1, version: "v1", lexiconHash: "hash-b" }), false);
});

test("fresh word content preserves cached user progress fields", () => {
  const cached = [{
    id: "word_1",
    word: "work",
    meaning: "旧释义",
    status: "熟悉",
    favorite: true,
    reviewCount: 7
  }];
  const fresh = [{
    id: "word_1",
    word: "work",
    meaning: "工作",
    status: "",
    favorite: false
  }];
  const merged = mergeWordContentWithUserState(fresh, cached);

  assert.equal(merged[0].meaning, "工作");
  assert.equal(merged[0].status, "熟悉");
  assert.equal(merged[0].favorite, true);
  assert.equal(merged[0].reviewCount, 7);
  assert.equal(formatOfflineVocabNotice({ version: "v1" }), "当前使用离线词库缓存，版本：v1");
});

test("fresh word merge keeps personal wrong supplemental entries only", () => {
  const fresh = [{ id: "word_1", word: "work", meaning: "工作" }];
  const cached = [
    { id: "word_1", word: "work", status: "熟悉" },
    { id: "word_old", word: "stale-cache-only", meaning: "旧缓存" },
    {
      id: "word_personal_wrong",
      word: "unlistedword",
      meaning: "本地补充",
      addedFromPersonalWrongBook: true,
      source: "personal_wrong_book",
      supplemental: true
    }
  ];

  const merged = mergeWordContentWithUserState(fresh, cached);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].status, "熟悉");
  assert.equal(merged.some((entry) => entry.word === "stale-cache-only"), false);
  assert.equal(merged.some((entry) => entry.word === "unlistedword"), true);
});

test("main lexicon merge excludes redundant personal-wrong cache supplements", () => {
  const fresh = [{ id: "word_1", word: "work", meaning: "工作" }];
  const cached = [
    { id: "word_1", word: "work", status: "熟悉" },
    {
      id: "word_personal_wrong",
      word: "unlistedword",
      meaning: "本地补充",
      addedFromPersonalWrongBook: true,
      supplemental: true
    }
  ];

  const merged = mergeWordContentWithUserState(fresh, cached, {
    includePersonalSupplements: false
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "熟悉");
});

test("spelling vocab merge treats personal wrong words as additive local vocabulary", () => {
  const official = [{ id: "word_official", word: "official", meaning: "正式词" }];
  const cached = [
    { id: "word_stale", word: "stale", meaning: "旧缓存" },
    {
      id: "word_added",
      word: "studentadded",
      meaning: "学生新增",
      addedFromPersonalWrongBook: true
    }
  ];

  const merged = mergeVocabForSpelling(official, cached);
  assert.equal(merged.length, 2);
  assert.equal(merged.some((entry) => entry.word === "official"), true);
  assert.equal(merged.some((entry) => entry.word === "studentadded"), true);
  assert.equal(merged.some((entry) => entry.word === "stale"), false);
});

test("quality gate rejects structural violations and API metadata drift", () => {
  const validWord = { id: "w1", word: "work", meaning: "工作", example: "I work here.", difficulty: "基础高频" };
  const payload = { count: 1, version: "v1", savedAt: "now", lexiconHash: "hash", words: [validWord] };
  assert.equal(runQualityGate(payload).ok, true);
  assert.equal(runQualityGate({ ...payload, words: [{ ...validWord, difficulty: "低级高频" }] }).ok, false);
  assert.equal(runQualityGate({ ...payload, words: [{ ...validWord, meaning: "" }] }).ok, false);
  assert.equal(runQualityGate({ ...payload, words: [{ ...validWord, word: "work load" }] }).ok, false);
  assert.equal(runQualityGate({ ...payload, words: [{ ...validWord, word: "adam" }] }).ok, false);
  assert.equal(runQualityGate(payload, {
    count: 2,
    version: "old",
    lexiconHash: "old",
    wordsHash: "old"
  }).ok, false);
});

test("current audit excludes retired repair suspects after curated import", () => {
  const payload = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
  const audit = auditCoreVocab(payload);
  const byWord = new Map(audit.candidates.map((item) => [item.word.toLowerCase(), item]));
  const activeWords = new Set(payload.words.map((item) => item.word.toLowerCase()));

  for (const word of ["aepyornis", "proce", "zoftig", "inclin", "storytel", "underly", "alleg", "pulpwood", "zaftig"]) {
    assert.equal(activeWords.has(word), false, `${word} must be removed from active words`);
    assert.equal(byWord.has(word), false, `${word} must not remain in repair candidates`);
  }
  assert.equal(audit.summary.invalidDifficultyCount, 0, "illegal difficulty should be fully repaired");
  assert.equal(audit.summary.automaticFixCandidateCount, 0);
  const polluted = audit.issues.filter((item) =>
    ["template_meaning", "placeholder_meaning", "invalid_ipa"].includes(item.issueType)
  );
  assert.equal(polluted.length, 0, `polluted template/IPA issues remain: ${polluted.length}`);
});

test("audit execution does not mutate words or phrases source files", () => {
  const beforeWords = fileHash(wordsPath);
  const beforePhrases = fileHash(phrasesPath);
  const payload = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
  auditCoreVocab(payload);
  assert.equal(fileHash(wordsPath), beforeWords);
  assert.equal(fileHash(phrasesPath), beforePhrases);
});
