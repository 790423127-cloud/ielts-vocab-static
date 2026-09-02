import test from "node:test";
import assert from "node:assert/strict";
import { createAiOps } from "../../../hooks/useHomeLexiconAdmin.ai.js";
import { AI_CONTENT_PROFILE_VERSION } from "../admin-ai-content-profile.mjs";

function completeWord(word, overrides = {}) {
  return {
    word,
    phonetic: `/${word}/`,
    pos: "noun",
    meaning: `${word} meaning`,
    meaningDetailZh: "指该词在当前主释义下所表达的对象、动作或状态，并说明常见使用范围。",
    definition: `${word} definition`,
    example: `${word} example`,
    exampleCn: `${word} example cn`,
    collocations: [{ phrase: `${word} collocation`, chinese: "搭配" }],
    phraseCollocations: [{ phrase: `${word} phrase`, chinese: "短语" }],
    ieltsUse: ["writing"],
    topics: ["work"],
    difficulty: "B2",
    aiContentProfile: AI_CONTENT_PROFILE_VERSION,
    status: "learning",
    ...overrides
  };
}

function createContext(initialWords) {
  let currentWords = initialWords.map((word) => ({ ...word }));
  let currentAiRunState = null;
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
    setAiRunState(update) {
      currentAiRunState = typeof update === "function" ? update(currentAiRunState) : update;
    },
    aiRunControlRef: {
      current: { controller: null, running: false }
    },
    resetWordStudySessionState() {}
  };

  return {
    ctx,
    getWords: () => currentWords,
    getAiRunState: () => currentAiRunState,
    setWords(update) {
      ctx.setWords(update);
    },
    batchInfo,
    toasts
  };
}

function jsonResponse(data, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "retry-after"
          ? (init.retryAfter || null)
          : null;
      }
    },
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
    const body = JSON.parse(init.body);
    requests.push({ url, body });
    return jsonResponse({
      items: [
        { id: body.items[0].id, clean: "cat", type: "word" },
        { id: body.items[1].id, clean: "dogs", type: "word" }
      ]
    });
  }, async () => {
    await createAiOps(state.ctx).cleanWordList();
  });

  assert.deepEqual(requests, [{
    url: "/api/clean-words",
    body: {
      items: [
        { id: "word-target:cats", text: "Cats" },
        { id: "word-target:dogs", text: "dogs" }
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
    const body = JSON.parse(init.body);
    requests.push({ url, body });
    return jsonResponse({
      items: [{
        ...completeWord("missing", { status: undefined }),
        inputId: body.items[0].inputId,
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
    body: {
      items: [{
        inputId: "word-target:missing",
        word: "missing",
        existingMeaning: "",
        existingPos: "noun",
        contextSentence: "missing example",
        contextLabel: "主词库例句"
      }],
      force: false
    }
  }]);
  assert.equal(state.getWords()[0].meaning, "missing meaning");
  assert.deepEqual(state.getWords()[0].ieltsUse, ["writing"]);
  assert.equal(state.getWords()[0].status, "learning");
});

test("continuous structure repair processes every bounded round and publishes repair mode", async () => {
  const initialWords = Array.from({ length: 101 }, (_, index) => (
    completeWord(`repair-${index}`, { meaning: "undefined" })
  ));
  const state = createContext(initialWords);
  const requests = [];

  await withMockFetch(async (url, init) => {
    assert.equal(url, "/api/generate-words");
    assert.equal(init.signal instanceof AbortSignal, true);
    const body = JSON.parse(init.body);
    requests.push(body);
    return jsonResponse({
      items: body.items.map((item) => completeWord(item.word, {
        inputId: item.inputId,
        meaning: `${item.word} repaired meaning`
      }))
    });
  }, async () => {
    const result = await createAiOps(state.ctx).startContinuousAiStructureRepair();
    assert.equal(result.reason, "completed");
    assert.equal(result.rounds, 2);
    assert.equal(result.filled, 101);
    assert.equal(result.remaining, 0);
  });

  assert.equal(requests.length, 21);
  assert.equal(requests.every((body) => body.force === true && body.items.length <= 5), true);
  assert.equal(state.getWords().every((word) => word.meaning.endsWith("repaired meaning")), true);
  assert.equal(state.getAiRunState().mode, "repair");
  assert.equal(state.getAiRunState().status, "completed");
});

test("generateHundredByFiveBatch fills data without changing the headword", async () => {
  const state = createContext([completeWord("injury", { meaning: "" })]);

  await withMockFetch(async (url, init) => {
    assert.equal(url, "/api/generate-words");
    const body = JSON.parse(init.body);
    assert.deepEqual(body, {
      items: [{
        inputId: "word-target:injury",
        word: "injury",
        existingMeaning: "",
        existingPos: "noun",
        contextSentence: "injury example",
        contextLabel: "主词库例句"
      }]
    });
    return jsonResponse({
      items: [completeWord("injury", {
        inputId: body.items[0].inputId,
        meaning: "to hurt"
      })]
    });
  }, async () => {
    const result = await createAiOps(state.ctx).generateHundredByFiveBatch();
    assert.equal(result.total, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.filled, 1);
    assert.equal(result.error, "");
  });

  assert.equal(state.getWords()[0].word, "injury");
  assert.equal(state.getWords()[0].meaning, "to hurt");
  assert.equal(state.getWords()[0].status, "learning");
});

test("generateHundredByFiveBatch isolates a failed probe and continues with later chunks", async () => {
  const headwords = [
    "alpha", "bravo", "charlie", "delta", "echo",
    "foxtrot", "golf", "hotel", "india", "juliet",
    "kilo", "lima", "mango", "november", "oscar",
    "papa", "quebec", "romeo", "sierra", "tango"
  ];
  const state = createContext(headwords.map((word) => completeWord(word, { meaning: "" })));
  let requests = 0;

  await withMockFetch(async () => {
    requests += 1;
    return jsonResponse(
      { error: "Server error", detail: "stale production build" },
      { ok: false, status: 500 }
    );
  }, async () => {
    const result = await createAiOps(state.ctx).generateHundredByFiveBatch();
    assert.equal(result.total, 20);
    assert.equal(result.filled, 0);
    assert.equal(result.failed, 20);
    assert.equal(result.error, "stale production build");
  });

  assert.equal(requests, 4);
  assert.match(state.toasts.at(-1), /失败 20/);
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
    const body = JSON.parse(init.body);
    assert.deepEqual(body, {
      words: [{
        inputId: "word-target:classify",
        word: "classify",
        pos: original.pos,
        meaning: original.meaning,
        example: original.example
      }]
    });
    return jsonResponse({
      items: [{
        inputId: body.words[0].inputId,
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

test("generateForIndex writes to the original stable id after reordering", async () => {
  const state = createContext([
    completeWord("alpha", { id: "a", meaning: "" }),
    completeWord("beta", { id: "b", meaning: "" })
  ]);
  let releaseResponse;
  const responseReady = new Promise((resolve) => {
    releaseResponse = resolve;
  });

  await withMockFetch(async (url, init) => {
    assert.equal(url, "/api/generate-word");
    const body = JSON.parse(init.body);
    await responseReady;
    return jsonResponse(completeWord("alpha", {
      inputId: body.inputId,
      aiReplaceExisting: true,
      meaning: "alpha generated"
    }));
  }, async () => {
    const request = createAiOps(state.ctx).generateForIndex(0, { force: true });
    state.setWords((current) => [current[1], current[0]]);
    releaseResponse();
    await request;
  });

  assert.equal(state.getWords()[0].word, "beta");
  assert.notEqual(state.getWords()[0].meaning, "alpha generated");
  assert.equal(state.getWords()[1].id, "a");
  assert.equal(state.getWords()[1].meaning, "alpha generated");
});

test("generateForIndex keeps targeting the same id after unrelated updates", async () => {
  const state = createContext([
    completeWord("alpha", { id: "a", meaning: "" }),
    completeWord("beta", { id: "b", meaning: "" })
  ]);

  await withMockFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    state.setWords((current) => [
      { ...current[0], favorite: true },
      ...current.slice(1)
    ]);
    return jsonResponse(completeWord("alpha", {
      inputId: body.inputId,
      aiReplaceExisting: true,
      meaning: "alpha generated"
    }));
  }, async () => {
    await createAiOps(state.ctx).generateForIndex(0, { force: true });
  });

  assert.equal(state.getWords()[0].favorite, true);
  assert.equal(state.getWords()[0].meaning, "alpha generated");
});

test("generateForIndex refuses to write after the target is deleted", async () => {
  const state = createContext([
    completeWord("alpha", { id: "a", meaning: "" }),
    completeWord("beta", { id: "b", meaning: "" })
  ]);

  await assert.rejects(
    withMockFetch(async (url, init) => {
      const body = JSON.parse(init.body);
      state.setWords((current) => current.filter((word) => word.id !== "a"));
      return jsonResponse(completeWord("alpha", {
        inputId: body.inputId,
        aiReplaceExisting: true,
        meaning: "alpha generated"
      }));
    }, async () => createAiOps(state.ctx).generateForIndex(0, { force: true })),
    { code: "WORD_TARGET_MISSING" }
  );

  assert.deepEqual(state.getWords().map((word) => word.id), ["b"]);
  assert.notEqual(state.getWords()[0].meaning, "alpha generated");
});

test("generateForIndex refuses a mismatched response inputId", async () => {
  const state = createContext([
    completeWord("alpha", { id: "a", meaning: "" })
  ]);

  await assert.rejects(
    withMockFetch(async () => jsonResponse(completeWord("alpha", {
      inputId: "wrong-input",
      aiReplaceExisting: true,
      meaning: "alpha generated"
    })), async () => createAiOps(state.ctx).generateForIndex(0, { force: true })),
    { code: "AI_INPUT_ID_MISMATCH" }
  );
  assert.equal(state.getWords()[0].meaning, "");
});
