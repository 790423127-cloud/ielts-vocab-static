import test from "node:test";
import assert from "node:assert/strict";
import { createAiOps } from "../../../hooks/useHomeLexiconAdmin.ai.js";

function completeWord(word, overrides = {}) {
  return {
    word,
    phonetic: `/${word}/`,
    pos: "noun",
    meaning: `${word} meaning`,
    definition: `${word} definition`,
    example: `${word} example`,
    exampleCn: `${word} example cn`,
    collocations: [{ phrase: `${word} collocation`, chinese: "搭配" }],
    phraseCollocations: [{ phrase: `${word} phrase`, chinese: "短语" }],
    ieltsUse: ["writing"],
    topics: ["work"],
    difficulty: "B2",
    status: "learning",
    ...overrides
  };
}

function createContext(initialWords) {
  let currentWords = initialWords.map((word) => ({ ...word }));
  const batchInfo = [];
  const toasts = [];

  const ctx = {
    words: currentWords,
    setWords(update) {
      currentWords = typeof update === "function" ? update(currentWords) : update;
    },
    setLoading() {},
    setBatchInfo(message) {
      batchInfo.push(message);
    },
    setToast(message) {
      toasts.push(message);
    },
    resetWordStudySessionState() {}
  };

  return {
    ctx,
    getWords: () => currentWords,
    batchInfo,
    toasts
  };
}

function jsonResponse(data, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    async json() {
      return data;
    }
  };
}

async function withMockFetch(handler, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("cleanWordList preserves its request shape and destructive clean merge", async () => {
  const state = createContext([
    completeWord("Cats", { favorite: true }),
    completeWord("dogs")
  ]);
  const requests = [];

  await withMockFetch(async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return jsonResponse({
      items: [
        { id: "0", clean: "cat", type: "word" },
        { id: "1", clean: "dogs", type: "word" }
      ]
    });
  }, async () => {
    await createAiOps(state.ctx).cleanWordList();
  });

  assert.deepEqual(requests, [{
    url: "/api/clean-words",
    body: {
      items: [
        { id: "0", text: "Cats" },
        { id: "1", text: "dogs" }
      ]
    }
  }]);
  assert.equal(state.getWords()[0].word, "cat");
  assert.equal(state.getWords()[0].meaning, "");
  assert.equal(state.getWords()[0].favorite, true);
  assert.match(state.toasts.at(-1), /处理 2 个/);
});

test("generateMissingBatch keeps force policy and normalized merge fields", async () => {
  const state = createContext([completeWord("missing", { meaning: "" })]);
  const requests = [];

  await withMockFetch(async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return jsonResponse({
      items: [{
        ...completeWord("missing", { status: undefined }),
        ielts_use: ["speaking"],
        collocations: [{ phrase: "missing data", chinese: "缺失数据" }]
      }]
    });
  }, async () => {
    const result = await createAiOps(state.ctx).generateMissingBatch({ repairWrong: false });
    assert.deepEqual(result, { total: 1, repaired: 0, completed: 1, failed: 0 });
  });

  assert.deepEqual(requests, [{
    url: "/api/generate-words",
    body: { words: ["missing"], force: false }
  }]);
  assert.equal(state.getWords()[0].meaning, "missing meaning");
  assert.deepEqual(state.getWords()[0].ieltsUse, ["writing"]);
  assert.equal(state.getWords()[0].status, "learning");
});

test("generateHundredByFiveBatch fills data without changing the headword", async () => {
  const state = createContext([completeWord("injur", { meaning: "" })]);

  await withMockFetch(async (url, init) => {
    assert.equal(url, "/api/generate-words");
    assert.deepEqual(JSON.parse(init.body), { words: ["injur"] });
    return jsonResponse({ items: [completeWord("injure", { meaning: "to hurt" })] });
  }, async () => {
    const result = await createAiOps(state.ctx).generateHundredByFiveBatch();
    assert.deepEqual(result, { total: 1, failed: 0, filled: 1 });
  });

  assert.equal(state.getWords()[0].word, "injur");
  assert.equal(state.getWords()[0].meaning, "to hurt");
  assert.equal(state.getWords()[0].status, "learning");
});

test("categorizeWords sends lexical context and merges classification only", async () => {
  const original = completeWord("classify", {
    ieltsUse: [],
    topics: [],
    difficulty: ""
  });
  const state = createContext([original]);

  await withMockFetch(async (url, init) => {
    assert.equal(url, "/api/categorize-words");
    assert.deepEqual(JSON.parse(init.body), {
      words: [{
        word: "classify",
        pos: original.pos,
        meaning: original.meaning,
        example: original.example
      }]
    });
    return jsonResponse({
      items: [{
        word: "classify",
        ieltsUse: ["Writing Task 2"],
        topics: ["education"],
        difficulty: "C1"
      }]
    });
  }, async () => {
    await createAiOps(state.ctx).categorizeWords();
  });

  assert.equal(state.getWords()[0].meaning, original.meaning);
  assert.deepEqual(state.getWords()[0].ieltsUse, ["Writing Task 2"]);
  assert.deepEqual(state.getWords()[0].topics, ["education"]);
  assert.equal(state.getWords()[0].difficulty, "C1");
});
