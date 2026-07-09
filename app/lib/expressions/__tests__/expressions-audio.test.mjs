// Expressions Mode — audio tests.
// Tests audio.mjs, phrase data, example fields, isolation.
import { describe, it, before } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "..", "..", "public", "data", "speaking-writing-phrases-700.json");
const WORDS_PATH = join(__dirname, "..", "..", "..", "..", ".static-export-cache", "words.json");

// Import audio module
import { speakPhrase, speakExample, stopAudio, isSpeaking } from "../audio.mjs";
import { MASTER_LEXICON_EXPECTED_COUNT } from "../../vocab/master-lexicon-baseline.mjs";

let phraseBank;

before(() => {
  phraseBank = JSON.parse(readFileSync(DATA_PATH, "utf-8")).items;
});

// ═══════════════════════════════════════
// Audio Module
// ═══════════════════════════════════════

describe("audio module", () => {
  it("1. speakPhrase guarded for Node.js", () => {
    assert.equal(typeof speakPhrase, "function");
    assert.doesNotThrow(() => speakPhrase("test phrase"));
  });

  it("2. speakExample guarded for Node.js", () => {
    assert.equal(typeof speakExample, "function");
    assert.doesNotThrow(() => speakExample("test example"));
  });

  it("3. stopAudio exists and is callable", () => {
    assert.equal(typeof stopAudio, "function");
    stopAudio(); // Should not throw in Node
  });

  it("4. isSpeaking exists", () => {
    assert.equal(typeof isSpeaking, "function");
  });

  it("5. speakPhrase with empty string does not throw", () => {
    assert.doesNotThrow(() => speakPhrase(""));
  });

  it("6. speakExample with empty string does not throw", () => {
    assert.doesNotThrow(() => speakExample(""));
  });

  it("7. speakPhrase with null/undefined does not throw", () => {
    assert.doesNotThrow(() => speakPhrase(null));
    assert.doesNotThrow(() => speakPhrase(undefined));
  });

  it("8. speakExample with null/undefined does not throw", () => {
    assert.doesNotThrow(() => speakExample(null));
    assert.doesNotThrow(() => speakExample(undefined));
  });

  it("9. stopAudio before any speak does not throw", () => {
    stopAudio();
    stopAudio(); // Double stop — should not throw
  });
});

// ═══════════════════════════════════════
// Phrase Data — Example Coverage
// ═══════════════════════════════════════

describe("phrase example data", () => {
  it("1. all 700 phrases have example field", () => {
    const missing = phraseBank.filter(p => !p.example || p.example.trim().length === 0);
    assert.equal(missing.length, 0, missing.length + " phrases missing example");
  });

  it("2. examples are real English sentences", () => {
    for (const p of phraseBank.slice(0, 100)) {
      const ex = p.example;
      assert.ok(/[a-zA-Z]/.test(ex), "No English letters in: " + ex);
      assert.ok(ex.length >= 10, "Example too short: " + ex);
    }
  });

  it("3. phrase field is non-empty for all items", () => {
    for (const p of phraseBank) {
      assert.ok(p.phrase && p.phrase.trim().length > 0, "Empty phrase for id " + p.id);
    }
  });

  it("4. meaningZh field is non-empty for all items", () => {
    for (const p of phraseBank) {
      assert.ok(p.meaningZh && p.meaningZh.trim().length > 0, "Empty meaningZh for id " + p.id);
    }
  });
});

// ═══════════════════════════════════════
// Builder — Example Throughput
// ═══════════════════════════════════════

describe("builder example passthrough", () => {
  let buildQuestion, buildQuestionWithValidation;

  before(async () => {
    const mod = await import("../builder.mjs");
    buildQuestion = mod.buildQuestion;
    buildQuestionWithValidation = mod.buildQuestionWithValidation;
  });

  it("1. example is passed through to question output", () => {
    const entry = phraseBank[0];
    const q = buildQuestion(entry, phraseBank, "test", 0);
    assert.ok(q.example, "Example missing from question");
    assert.equal(q.example, entry.example);
  });

  it("2. example is preserved after buildQuestionWithValidation", () => {
    const entry = phraseBank[0];
    const q = buildQuestionWithValidation(entry, phraseBank, "test", 0);
    assert.ok(q.example, "Example missing after validation");
    assert.equal(q.example, entry.example);
  });

  it("3. 4-choice logic still works", () => {
    for (let i = 0; i < 30; i++) {
      const entry = phraseBank[i * 23 % 700];
      const q = buildQuestionWithValidation(entry, phraseBank, "choice-" + i, i);
      assert.equal(q.options.length, 4);
      const meanings = q.options.map(o => o.meaningZh);
      assert.equal(new Set(meanings).size, 4);
      assert.ok(meanings.includes(q.correctMeaning));
    }
  });

  it("4. optionHash still works", () => {
    const entry = phraseBank[0];
    const q = buildQuestion(entry, phraseBank, "hash", 0);
    // Expressions hashOptionSet uses sourcePhraseId, not meaningZh
    const sorted = [...q.options].map(o => o.sourcePhraseId || "").sort();
    const expectedHash = sorted.join("||");
    assert.equal(q.optionHash, expectedHash);
  });
});

// ═══════════════════════════════════════
// System Isolation
// ═══════════════════════════════════════

describe("system isolation — audio", () => {
  it("1. audio.mjs does not import meaning-mode", () => {
    const src = readFileSync(join(__dirname, "..", "audio.mjs"), "utf-8");
    const imports = src.split("\n").filter(l => l.trim().startsWith("import"));
    const badImport = imports.some(l => l.includes("meaning-mode") || l.includes("meaning"));
    assert.ok(!badImport, "Audio imports meaning-mode");
  });

  it("2. audio.mjs does not import spelling", () => {
    const src = readFileSync(join(__dirname, "..", "audio.mjs"), "utf-8");
    const imports = src.split("\n").filter(l => l.trim().startsWith("import"));
    const badImport = imports.some(l => l.includes("spelling"));
    assert.ok(!badImport);
  });

  it("3. builder.mjs passes example but does NOT import audio", () => {
    const src = readFileSync(join(__dirname, "..", "builder.mjs"), "utf-8");
    assert.ok(!src.includes("speakPhrase"));
    assert.ok(!src.includes("speakExample"));
    assert.ok(!src.includes("audio.mjs"));
  });

  it("4. engine.mjs does not import audio", () => {
    const src = readFileSync(join(__dirname, "..", "engine.mjs"), "utf-8");
    assert.ok(!src.includes("audio"));
  });

  it("5. words.json unchanged", () => {
    const wordsData = JSON.parse(readFileSync(WORDS_PATH, "utf-8"));
    assert.equal(wordsData.words.length, MASTER_LEXICON_EXPECTED_COUNT);
    assert.equal(Number(wordsData.count), MASTER_LEXICON_EXPECTED_COUNT);
  });

  it("6. phrase bank unchanged (700 items)", () => {
    const data = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
    assert.equal(data.items.length, 700);
  });

  it("7. audio.mjs uses only SpeechSynthesis — no external APIs", () => {
    const src = readFileSync(join(__dirname, "..", "audio.mjs"), "utf-8");
    assert.ok(src.includes("SpeechSynthesisUtterance"));
    assert.ok(src.includes("speechSynthesis"));
    assert.ok(!src.includes("fetch("));
    assert.ok(!src.includes("XMLHttpRequest"));
    assert.ok(!src.includes("axios"));
  });

  it("8. no spelling/SRS/flash keys referenced in expressions", () => {
    const files = ["audio.mjs", "builder.mjs", "engine.mjs", "options.mjs", "storage.mjs", "session-state.mjs"];
    const forbiddenKeys = ["spellingProgress", "spelling_progress", "flashProgress", "ielts_meaning", "srs_"];
    for (const file of files) {
      const src = readFileSync(join(__dirname, "..", file), "utf-8");
      for (const key of forbiddenKeys) {
        assert.ok(!src.includes(key), file + " references forbidden key: " + key);
      }
    }
  });
});
