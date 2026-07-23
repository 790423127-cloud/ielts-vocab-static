import test from "node:test";
import assert from "node:assert/strict";
import { requestDeepseekProfiles } from "../../ai/deepseek-word-profile.server.mjs";
import { buildAiWordProfilePrompt } from "../../ai/vocab-profile-prompt.mjs";

function rawProfile(inputId, word) {
  return {
    input_id: inputId,
    word,
    phonetic: `/${word}/`,
    part_of_speech: "noun",
    chinese_meaning: `${word}主释义`,
    main_meaning_detail_zh: `${word}主释义详解`,
    english_definition: `${word} primary definition`,
    other_meanings: [{
      part_of_speech: "verb",
      meaning_zh: `${word}其他义项`,
      definition_en: `${word} additional definition`,
      example: `They ${word} the service.`,
      example_chinese: `他们使用了${word}服务。`
    }],
    ielts_example: `The ${word} is useful.`,
    example_chinese: `${word}很有用。`,
    forms: [],
    word_family: [],
    common_collocations: Array.from({ length: 4 }, (_, index) => ({
      phrase: `${word} common ${index}`,
      chinese: `常用搭配${index}`
    })),
    phrase_collocations: Array.from({ length: 4 }, (_, index) => ({
      phrase: `${word} phrase ${index}`,
      chinese: `短语搭配${index}`
    })),
    ielts_use: ["Reading"],
    topics: ["工作"],
    difficulty: "中级核心",
    category: "工作"
  };
}

function mockDeepseekResponse(items) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    async text() {
      return JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ items }) } }],
        usage: { total_tokens: 100 }
      });
    }
  };
}

test("batch results are aligned by input_id, never by array position", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  globalThis.fetch = async () => mockDeepseekResponse([
    rawProfile("item-2", "beta"),
    rawProfile("item-1", "alpha")
  ]);

  try {
    const result = await requestDeepseekProfiles([
      { inputId: "item-1", word: "alpha" },
      { inputId: "item-2", word: "beta" }
    ]);
    assert.equal(result.entries.get("item-1").word, "alpha");
    assert.equal(result.entries.get("item-2").word, "beta");
    assert.equal(result.invalid.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});

test("a mismatched returned word is rejected instead of written to another entry", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  globalThis.fetch = async () => mockDeepseekResponse([
    rawProfile("item-1", "wrong-word")
  ]);

  try {
    const result = await requestDeepseekProfiles([{ inputId: "item-1", word: "alpha" }]);
    assert.equal(result.entries.size, 0);
    assert.match(result.invalid[0].reason, /word mismatch/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});

test("the unified prompt requires one main example and detailed additional senses", () => {
  const prompt = buildAiWordProfilePrompt([{ inputId: "item-1", word: "access" }]);
  assert.match(prompt, /exactly one primary English example/i);
  assert.match(prompt, /definition_en/);
  assert.match(prompt, /example_chinese/);
  assert.match(prompt, /Echo input_id exactly/);
});
