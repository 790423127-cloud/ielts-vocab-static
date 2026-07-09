import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLexiconFingerprint } from "../lexicon-meta.mjs";

test("spelling AI tools persist verified phonetics for personal wrong entries", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingAiToolsPanel.jsx"), "utf8");

  assert.match(source, /loadSpellingLexicon\(\{ force: true, scope \}\)/);
  assert.match(source, /normalizeAiWordPatch/);
  assert.match(source, /phoneticStatus = cleanText\(data\.phoneticStatus\) \|\| "deepseek_verified"/);
  assert.match(source, /pronunciationSourceTier = cleanText\(data\.pronunciationSourceTier\) \|\| "D"/);
  assert.match(source, /pronunciationVerified = true/);
  assert.match(source, /buildGeneratedLocalEntry\(targetWord, patch, currentEntry, scope\)/);
  assert.match(source, /persistWordsToLocalLexicon\(nextWords, meta\)/);
  assert.doesNotMatch(source, /if \(existingIndex < 0\) \{\s*notify\(/);
});

test("spelling AI tools prefer local library repair before paid AI", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingAiToolsPanel.jsx"), "utf8");

  assert.match(source, /function buildLibraryWordPatch/);
  assert.match(source, /function findOfficialLibraryWord/);
  assert.match(source, /async function repairCurrentFromLibrary/);
  assert.match(source, /从总词库修复当前词/);
  assert.match(source, /AI 补全当前词（会扣费）/);
  assert.match(source, /AI 修复英文词条（会扣费）/);
  assert.match(source, /libraryRepairSource: "local_lexicon"/);
  assert.match(source, /phoneticStatus: "library_verified"/);
  assert.match(source, /pronunciationSourceTier: "library"/);
});

test("spelling AI tools time out requests and use the single-word update path", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingAiToolsPanel.jsx"), "utf8");

  assert.match(source, /const AI_REQUEST_TIMEOUT_MS = 45000/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /AI 请求超时/);
  assert.match(source, /const data = await fetchAiJson\("\/api\/generate-word"/);
  assert.match(source, /const updateResult = await updateWordInLocalLexicon\(targetWord/);

  const requestIndex = source.indexOf('fetchAiJson("/api/generate-word"');
  const loadIndex = source.indexOf("loadActiveWordsForSync()", requestIndex);
  assert.ok(requestIndex >= 0 && loadIndex > requestIndex);
});

test("spelling lexicon hash changes when entry content changes", () => {
  const base = buildLexiconFingerprint(
    [{ id: "w1", word: "configure", phonetic: "", phoneticStatus: "pending_review", meaning: "配置" }],
    [],
    { headwordVersion: "v1", phraseVersion: "p1" }
  );
  const repaired = buildLexiconFingerprint(
    [{ id: "w1", word: "configure", phonetic: "/kənˈfɪɡjər/", phoneticStatus: "library_verified", meaning: "配置" }],
    [],
    { headwordVersion: "v1", phraseVersion: "p1" }
  );

  assert.notEqual(base.lexiconHash, repaired.lexiconHash);
  assert.notEqual(base.lexiconVersion, repaired.lexiconVersion);
  assert.notEqual(base.contentHash, repaired.contentHash);
});
