import test from "node:test";
import assert from "node:assert/strict";
import {
  isUsableAiProfile,
  isUsableGMainAiProfile,
  isUsableMeaningCoverageAiProfile,
  isUsableReadingAiProfile,
  isContextProperNounReinterpretation,
  parseAiJson,
  requestDeepseekProfiles
} from "../../ai/deepseek-word-profile.server.mjs";
import {
  hasExplicitAiRelationReview,
  shouldReuseAiProfileCache
} from "../../ai/ai-profile-cache-contract.mjs";
import { buildAiWordProfilePrompt } from "../../ai/vocab-profile-prompt.mjs";
import { normalizeAiGeneratedEntry } from "../admin-ai-content-profile.mjs";
import {
  buildAiProfileCacheKey,
  canReuseAiProfileForRequest
} from "../../../api/generate-words/route.js";

function rawProfile(inputId, word, { collocationCount = 4 } = {}) {
  return {
    input_id: inputId,
    word,
    phonetic: `/${word}/`,
    part_of_speech: "noun",
    chinese_meaning: `${word}主释义`,
    main_meaning_detail_zh: `说明该词在当前主释义下所指的对象、动作或状态，并限定其常见使用范围。`,
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

test("reading context chooses the passage sense first and may replace stale synonyms", async () => {
  const contextSentence = "Youngsters can stroke or feed the sheep and rabbits.";
  const contextual = {
    ...rawProfile("item-1", "stroke"),
    part_of_speech: "verb",
    chinese_meaning: "抚摸；轻抚",
    main_meaning_detail_zh: "用手轻柔地抚摸动物。",
    english_definition: "To move a hand gently over an animal.",
    ielts_example: "A generic example that must not replace the source sentence.",
    example_chinese: "孩子们可以抚摸或喂羊和兔子。",
    synonyms: ["pet", "caress"],
    synonym_details: [
      { word: "pet", part_of_speech: "verb", meaning_zh: "抚摸" },
      { word: "caress", part_of_speech: "verb", meaning_zh: "轻抚；爱抚" }
    ],
    other_meanings: [{
      part_of_speech: "noun",
      meaning_zh: "中风",
      definition_en: "A sudden interruption of blood flow to the brain.",
      example: "He suffered a stroke last year.",
      example_chinese: "他去年中风了。"
    }]
  };

  await withMockedDeepseek(
    async () => mockDeepseekResponse([contextual]),
    async () => {
      const result = await requestDeepseekProfiles([{
        inputId: "item-1",
        word: "stroke",
        requestedSynonyms: ["apoplexy", "seizure"],
        contextSentence,
        contextLabel: "剑雅17 Test 4"
      }], { profileQuality: "reading" });
      const entry = result.entries.get("item-1");
      assert.equal(result.invalid.length, 0);
      assert.equal(entry.meaning, "抚摸；轻抚");
      assert.equal(entry.pos, "verb");
      assert.equal(entry.example, contextSentence);
      assert.deepEqual(entry.synonyms, ["pet", "caress"]);
      assert.equal(entry.otherMeanings[0].meaningZh, "中风");
      assert.equal(isUsableReadingAiProfile(entry), true);
    }
  );
});

test("main context is evidence only and never overwrites the generated common-sense example", async () => {
  const suppliedContext = "The news caused a sensation.";
  const commonProfile = {
    ...rawProfile("item-1", "sensation"),
    chinese_meaning: "感觉；感受",
    main_meaning_detail_zh: "首先指由感官或身心产生的感觉、感受，也可指身体某个部位的知觉。",
    english_definition: "a physical feeling or an experience produced by the senses",
    ielts_example: "She felt a strange sensation in her hand.",
    example_chinese: "她的手有一种奇怪的感觉。",
    other_meanings: [{
      part_of_speech: "noun",
      meaning_zh: "轰动的人或事",
      definition_en: "a person or event that causes widespread excitement",
      example: "The news caused a sensation.",
      example_chinese: "这条新闻引起了轰动。"
    }]
  };

  await withMockedDeepseek(
    async () => mockDeepseekResponse([commonProfile]),
    async () => {
      const result = await requestDeepseekProfiles([{
        inputId: "item-1",
        word: "sensation",
        contextSentence: suppliedContext
      }]);
      const entry = result.entries.get("item-1");
      assert.equal(entry.meaning, "感觉；感受");
      assert.equal(entry.example, "She felt a strange sensation in her hand.");
      assert.equal(entry.aiSensePriority, "common");
      assert.equal(entry.readingContextReviewed, undefined);
    }
  );
});

test("reading cache rejects rich legacy profiles that omit synonym details", () => {
  const legacy = normalizeAiGeneratedEntry({
    ...rawProfile("item-1", "alien"),
    synonyms: ["extraterrestrial", "foreigner"],
    synonym_details: []
  }, "alien");

  assert.equal(isUsableAiProfile(legacy), true);
  assert.equal(isUsableReadingAiProfile(legacy), false);
  assert.equal(canReuseAiProfileForRequest(legacy, {
    word: "alien",
    profileQuality: "reading",
    requestedSynonyms: legacy.synonyms
  }), false);
});

test("cache reuse rejects a profile that does not cover every requested part of speech", () => {
  const complete = normalizeAiGeneratedEntry(rawProfile("item-1", "hope"), "hope");
  const incomplete = { ...complete, otherMeanings: [] };

  assert.equal(canReuseAiProfileForRequest(complete, {
    word: "hope",
    existingPos: "noun / verb"
  }), true);
  assert.equal(canReuseAiProfileForRequest(incomplete, {
    word: "hope",
    existingPos: "noun / verb"
  }), false);
});

test("generated profiles are rejected before caching when declared POS coverage is incomplete", async () => {
  const incomplete = rawProfile("item-1", "forecast");
  incomplete.other_meanings = [];

  await withMockedDeepseek(
    async () => mockDeepseekResponse([incomplete]),
    async () => {
      const result = await requestDeepseekProfiles([{
        inputId: "item-1",
        word: "forecast",
        existingPos: "noun / verb"
      }]);
      assert.equal(result.entries.size, 0);
      assert.match(result.invalid[0].reason, /declared POS not fully covered/);
    }
  );
});

test("reading cache keys isolate different source sentences for the same headword", () => {
  const medical = buildAiProfileCacheKey("stroke", "He suffered a stroke last year.", "context");
  const animal = buildAiProfileCacheKey("stroke", "Visitors can stroke the sheep.", "context");

  assert.notEqual(medical, animal);
  assert.match(medical, /^stroke::reading-context::/);
  assert.equal(buildAiProfileCacheKey("stroke"), "stroke");
  assert.equal(buildAiProfileCacheKey("stroke", "Visitors can stroke the sheep."), "stroke");
});

test("G-main profile keeps full teaching fields but omits bilingual examples for extra senses", async () => {
  const gProfile = rawProfile("item-1", "record");
  delete gProfile.other_meanings[0].example;
  delete gProfile.other_meanings[0].example_chinese;

  await withMockedDeepseek(
    async () => mockDeepseekResponse([gProfile]),
    async () => {
      const result = await requestDeepseekProfiles([{
        inputId: "item-1",
        word: "record"
      }], { profileKind: "g-main" });
      const entry = result.entries.get("item-1");
      assert.equal(result.invalid.length, 0);
      assert.equal(entry.aiProfileKind, "g-main");
      assert.equal(entry.otherMeanings[0].example, "");
      assert.equal(entry.otherMeanings[0].exampleCn, "");
      assert.equal(isUsableGMainAiProfile(entry), true);
      assert.equal(isUsableAiProfile(entry), false);
    }
  );
});

test("meaning-coverage profile accepts definition-only extra senses", async () => {
  const coverage = rawProfile("item-1", "record");
  coverage.main_meaning_detail_zh = "指以书面、电子或音视频形式保存下来的信息，也可指某项活动留下的正式记载。";
  delete coverage.ielts_example;
  delete coverage.example_chinese;
  delete coverage.other_meanings[0].example;
  delete coverage.other_meanings[0].example_chinese;
  delete coverage.forms;
  delete coverage.word_family;
  delete coverage.synonyms;
  delete coverage.synonym_details;
  delete coverage.common_collocations;
  delete coverage.phrase_collocations;
  delete coverage.ielts_use;
  delete coverage.topics;
  delete coverage.difficulty;
  delete coverage.category;

  await withMockedDeepseek(
    async () => mockDeepseekResponse([coverage]),
    async () => {
      const result = await requestDeepseekProfiles([{
        inputId: "item-1",
        word: "record"
      }], { profileKind: "meaning-coverage" });
      const entry = result.entries.get("item-1");
      assert.equal(result.invalid.length, 0);
      assert.equal(entry.example, "");
      assert.equal(entry.exampleCn, "");
      assert.equal(isUsableMeaningCoverageAiProfile(entry), true);
    }
  );
});

test("meaning-coverage cache rejects a short gloss before it is counted as reusable", () => {
  const shallow = rawProfile("item-1", "arrive");
  shallow.main_meaning_detail_zh = "到达某地。";
  assert.equal(isUsableMeaningCoverageAiProfile(shallow), false);
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
  assert.match(prompt, /sense-coverage audit, not a quota/i);
  assert.match(prompt, /semantic scope, typical object\/situation, usage boundary, discourse function, or contextual nuance/i);
  assert.match(prompt, /Do not merely repeat the headword, part of speech, chinese_meaning, context sentence, or its Chinese translation/i);
  assert.match(prompt, /rewritten example alone is not a semantic explanation/i);
  assert.match(prompt, /contemporary everyday English or commonplace IELTS General Training reading/i);
  assert.match(prompt, /Return an empty array when no extra common sense is justified/i);
  assert.match(prompt, /obsolete, literary, dialect-only, speculative, ultra-rare, or niche technical senses/i);
  assert.match(prompt, /Escape all line breaks/i);
  assert.match(prompt, /Echo input_id exactly/);
  assert.match(prompt, /capitalization\/spacing\/hyphen\/apostrophe variants/i);
  assert.match(prompt, /British\/American spelling variants/i);
  assert.match(prompt, /synonym_details/);
  assert.match(prompt, /keep exactly those supplied terms/i);
  assert.match(prompt, /"existing_synonyms":\s*\[\s*"entry"/);
});

test("the reading prompt prioritizes the supplied context and keeps other senses detailed", () => {
  const prompt = buildAiWordProfilePrompt([{
    inputId: "item-1",
    word: "stroke",
    requestedSynonyms: ["apoplexy"],
    existingMeaning: "中风；抚摸；笔画",
    existingPos: "noun / verb",
    contextSentence: "Visitors can stroke the sheep.",
    contextLabel: "Part 1"
  }], { sensePriority: "context" });

  assert.match(prompt, /Reading-notebook context priority/i);
  assert.match(prompt, /Never let a more frequent dictionary sense replace the supplied contextual sense/i);
  assert.match(prompt, /treat existing_synonyms only as candidates/i);
  assert.match(prompt, /"context_sentence":"Visitors can stroke the sheep\."/);
  assert.match(prompt, /"existing_primary_meaning":"中风；抚摸；笔画"/);
  assert.match(prompt, /"existing_part_of_speech":"noun \/ verb"/);
  assert.match(prompt, /Put other genuinely common meanings after it in other_meanings/i);
  assert.match(prompt, /lowercase verb or common noun must not be reinterpreted/i);
});

test("context validation rejects a lowercase verb reinterpreted as a proper title", () => {
  assert.equal(isContextProperNounReinterpretation({
    pos: "noun",
    meaning: "（游戏名）《崩溃大陆》",
    definition: "A video game titled Crashlands."
  }, {
    word: "crashlands",
    contextSentence: "The astronaut crashlands on a distant planet."
  }), true);

  assert.equal(isContextProperNounReinterpretation({
    pos: "verb",
    meaning: "迫降",
    definition: "makes an emergency landing"
  }, {
    word: "crashlands",
    contextSentence: "The astronaut crashlands on a distant planet."
  }), false);
});

test("main and G prompts keep the common sense first even when an example is supplied", () => {
  const prompt = buildAiWordProfilePrompt([{
    inputId: "item-1",
    word: "sensation",
    existingMeaning: "感觉；轰动",
    existingPos: "noun",
    contextSentence: "The news caused a sensation.",
    contextLabel: "主词库例句"
  }]);

  assert.match(prompt, /sense priority: common/i);
  assert.match(prompt, /Common-sense priority/i);
  assert.match(prompt, /most frequent contemporary everyday or IELTS General Training meaning/i);
  assert.match(prompt, /Use context_sentence only as supporting evidence, not as authority/i);
  assert.match(prompt, /do not copy a supplied context sentence when it demonstrates a different, less-common sense/i);
  assert.doesNotMatch(prompt, /Reading-notebook context priority/i);
});

test("G-main and common-sense prompts do not request examples for every extra sense", () => {
  const gPrompt = buildAiWordProfilePrompt(["record"], { profileKind: "g-main" });
  const coveragePrompt = buildAiWordProfilePrompt(["record"], { profileKind: "meaning-coverage" });

  assert.match(gPrompt, /Do not generate example or example_chinese for additional senses/i);
  assert.match(gPrompt, /Return 0-5 verified grammatical forms/i);
  assert.match(gPrompt, /Return 0-4 reliable synonyms/i);
  assert.match(gPrompt, /2-4 genuinely useful common_collocations/i);
  assert.match(coveragePrompt, /Do not generate a primary bilingual example/i);
  assert.match(coveragePrompt, /Do not generate example or example_chinese for additional senses/i);
  assert.match(coveragePrompt, /Common-sense priority/i);
  assert.match(coveragePrompt, /Keep an existing primary meaning only when it is the most common current sense/i);
  assert.doesNotMatch(coveragePrompt, /Return 0-5 verified grammatical forms/i);
});
