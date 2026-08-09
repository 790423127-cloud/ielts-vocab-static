import test from "node:test";
import assert from "node:assert/strict";
import {
  isUsableAiProfile,
  parseAiJson,
  requestDeepseekProfiles
} from "../../ai/deepseek-word-profile.server.mjs";
import {
  hasExplicitAiRelationReview,
  shouldReuseAiProfileCache
} from "../../ai/ai-profile-cache-contract.mjs";
import { buildAiWordProfilePrompt } from "../../ai/vocab-profile-prompt.mjs";
import { normalizeAiGeneratedEntry } from "../admin-ai-content-profile.mjs";

function rawProfile(inputId, word, { collocationCount = 4 } = {}) {
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
    synonyms: [],
    synonym_details: [],
    common_collocations: Array.from({ length: collocationCount }, (_, index) => ({
      phrase: `${word} common ${index}`,
      chinese: `常用搭配${index}`
    })),
    phrase_collocations: Array.from({ length: collocationCount }, (_, index) => ({
      phrase: `${word} phrase ${index}`,
      chinese: `短语搭配${index}`
    })),
    ielts_use: ["Reading"],
    topics: ["工作"],
    difficulty: "中级核心",
    category: "工作"
  };
}

function mockDeepseekResponse(items, options = {}) {
  const content = options.content ?? JSON.stringify({ items });
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    async text() {
      return JSON.stringify({
        choices: [{ message: { content }, finish_reason: options.finishReason || "stop" }],
        usage: { total_tokens: options.tokens || 100 }
      });
    }
  };
}

async function withMockedDeepseek(fetchImpl, callback) {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  globalThis.fetch = fetchImpl;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
}

test("batch results are aligned by input_id, never by array position", async () => {
  await withMockedDeepseek(
    async () => mockDeepseekResponse([
      rawProfile("item-2", "beta"),
      rawProfile("item-1", "alpha")
    ]),
    async () => {
      const result = await requestDeepseekProfiles([
        { inputId: "item-1", word: "alpha" },
        { inputId: "item-2", word: "beta" }
      ]);
      assert.equal(result.entries.get("item-1").word, "alpha");
      assert.equal(result.entries.get("item-2").word, "beta");
      assert.equal(result.invalid.length, 0);
    }
  );
});

test("a mismatched returned word is rejected instead of written to another entry", async () => {
  await withMockedDeepseek(
    async () => mockDeepseekResponse([rawProfile("item-1", "wrong-word")]),
    async () => {
      const result = await requestDeepseekProfiles([{ inputId: "item-1", word: "alpha" }]);
      assert.equal(result.entries.size, 0);
      assert.match(result.invalid[0].reason, /word mismatch/);
    }
  );
});

test("control characters inside JSON strings are escaped without deleting content", () => {
  const parsed = parseAiJson('{"example":"line one\nline two\tend"}');
  assert.equal(parsed.example, "line one\nline two\tend");
});

test("a malformed multi-word response is split so later words are still processed", async () => {
  let calls = 0;
  await withMockedDeepseek(
    async () => {
      calls += 1;
      if (calls === 1) return mockDeepseekResponse([], { content: '{"items":[{"broken":"line\n' });
      if (calls === 2) return mockDeepseekResponse([rawProfile("item-1", "alpha")]);
      return mockDeepseekResponse([rawProfile("item-2", "beta")]);
    },
    async () => {
      const result = await requestDeepseekProfiles([
        { inputId: "item-1", word: "alpha" },
        { inputId: "item-2", word: "beta" }
      ]);
      assert.equal(calls, 3);
      assert.equal(result.entries.size, 2);
      assert.equal(result.invalid.length, 0);
    }
  );
});

test("maxSplitDepth zero performs exactly one request and never retries a malformed batch", async () => {
  let calls = 0;
  await withMockedDeepseek(
    async () => {
      calls += 1;
      return mockDeepseekResponse([], { content: '{"items":[{"broken":"line\n' });
    },
    async () => {
      await assert.rejects(
        requestDeepseekProfiles([
          { inputId: "item-1", word: "alpha" },
          { inputId: "item-2", word: "beta" }
        ], { maxSplitDepth: 0 }),
        /JSON|parse|解析|截断/i
      );
      assert.equal(calls, 1);
    }
  );
});

test("two genuine translated collocations are usable and do not discard the whole profile", async () => {
  await withMockedDeepseek(
    async () => mockDeepseekResponse([rawProfile("item-1", "alpha", { collocationCount: 2 })]),
    async () => {
      const result = await requestDeepseekProfiles([{ inputId: "item-1", word: "alpha" }]);
      const entry = result.entries.get("item-1");
      assert.equal(isUsableAiProfile(entry), true);
      assert.equal(entry.collocations.length, 2);
      assert.equal(entry.phraseCollocations.length, 2);
    }
  );
});

test("reading profiles keep requested synonyms and require a Chinese meaning for each", async () => {
  const completed = {
    ...rawProfile("item-1", "extensive"),
    synonyms: ["broad"],
    synonym_details: [{ word: "broad", part_of_speech: "adjective", meaning_zh: "广泛的" }]
  };
  await withMockedDeepseek(
    async () => mockDeepseekResponse([completed]),
    async () => {
      const result = await requestDeepseekProfiles([{
        inputId: "item-1",
        word: "extensive",
        requestedSynonyms: ["broad"]
      }], { profileQuality: "reading" });
      assert.deepEqual(result.entries.get("item-1").synonymDetails, [
        { word: "broad", pos: "adjective", meaningZh: "广泛的" }
      ]);
      assert.equal(result.invalid.length, 0);
    }
  );

  await withMockedDeepseek(
    async () => mockDeepseekResponse([{ ...completed, synonym_details: [] }]),
    async () => {
      const result = await requestDeepseekProfiles([{
        inputId: "item-1",
        word: "extensive",
        requestedSynonyms: ["broad"]
      }], { profileQuality: "reading" });
      assert.equal(result.entries.size, 0);
      assert.match(result.invalid[0].reason, /synonymDetails/);
    }
  );
});

test("AI profiles remove self-equivalent synonym spellings before cache or client delivery", () => {
  const airmail = normalizeAiGeneratedEntry({
    ...rawProfile("item-1", "Airmail"),
    synonyms: ["air mail", "air-mail", "airpost"]
  }, "Airmail");
  const encyclopaedia = normalizeAiGeneratedEntry({
    ...rawProfile("item-2", "Encyclopaedia"),
    synonyms: ["encyclopedia", "compendium"]
  }, "Encyclopaedia");
  assert.deepEqual(airmail.synonyms, ["airpost"]);
  assert.deepEqual(encyclopaedia.synonyms, ["compendium"]);
});

test("legacy cache without an explicit synonyms array is not reused as a completed review", () => {
  const legacyCache = {
    forms: [],
    wordFamily: [],
    aiContentProfile: "main-meaning-detailed-senses-v3"
  };

  assert.equal(hasExplicitAiRelationReview(legacyCache), false);
  assert.equal(shouldReuseAiProfileCache(legacyCache, { usable: true }), false);
});

test("explicit empty relation arrays are reusable and preserve reviewed-empty meaning", () => {
  const reviewedCache = { forms: [], wordFamily: [], synonyms: [] };

  assert.equal(hasExplicitAiRelationReview(reviewedCache), true);
  assert.equal(shouldReuseAiProfileCache(reviewedCache, { usable: true }), true);
  assert.equal(shouldReuseAiProfileCache(reviewedCache, { usable: true, force: true }), false);
});

test("the unified prompt requests useful ranges and forbids filler", () => {
  const prompt = buildAiWordProfilePrompt([{
    inputId: "item-1",
    word: "access",
    requestedSynonyms: ["entry"]
  }]);
  assert.match(prompt, /exactly one primary English example/i);
  assert.match(prompt, /2-4 genuinely useful common_collocations/i);
  assert.match(prompt, /Never invent filler/i);
  assert.match(prompt, /Escape all line breaks/i);
  assert.match(prompt, /Echo input_id exactly/);
  assert.match(prompt, /capitalization\/spacing\/hyphen\/apostrophe variants/i);
  assert.match(prompt, /British\/American spelling variants/i);
  assert.match(prompt, /synonym_details/);
  assert.match(prompt, /keep exactly those supplied terms/i);
  assert.match(prompt, /"existing_synonyms":\s*\[\s*"entry"/);
});
