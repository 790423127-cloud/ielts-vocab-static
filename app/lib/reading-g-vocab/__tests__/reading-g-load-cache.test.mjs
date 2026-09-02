import test from "node:test";
import assert from "node:assert/strict";

import {
  invalidateReadingGVocabCache,
  loadReadingGVocab,
  normalizeReadingGItem
} from "../load-reading-g.mjs";

function responseHeaders(revision) {
  return {
    get(name) {
      return String(name || "").toLowerCase() === "etag" ? revision : "";
    }
  };
}

test("G-reading reuses its normalized payload only while the source revision is unchanged", async () => {
  const originalFetch = globalThis.fetch;
  let revision = "etag-v1";
  let getRequests = 0;
  let headRequests = 0;

  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === "HEAD") {
      headRequests += 1;
      return { ok: true, status: 200, headers: responseHeaders(revision) };
    }
    getRequests += 1;
    return {
      ok: true,
      status: 200,
      headers: responseHeaders(revision),
      async json() {
        return {
          version: "reading-g-cache-test",
          items: [{ id: `word-${revision}`, word: "proactive", meaning: "积极主动的" }]
        };
      }
    };
  };

  invalidateReadingGVocabCache();
  try {
    const first = await loadReadingGVocab();
    const second = await loadReadingGVocab();

    assert.equal(first, second);
    assert.equal(getRequests, 1);
    assert.equal(headRequests, 1);

    revision = "etag-v2";
    const refreshed = await loadReadingGVocab();
    assert.notEqual(refreshed, first);
    assert.equal(refreshed.revision, "etag-v2");
    assert.equal(getRequests, 2);
    assert.equal(headRequests, 2);
  } finally {
    invalidateReadingGVocabCache();
    globalThis.fetch = originalFetch;
  }
});

test("G-reading normalization keeps complete short words at the end of examples", () => {
  const item = normalizeReadingGItem({
    id: "rather-example",
    word: "rather",
    primaryPos: "adverb",
    primaryMeaningZh: "相当；颇",
    example: "I don't like coffee; rather, I prefer tea.",
    exampleCn: "我不喜欢咖啡；更确切地说，我更喜欢茶。"
  });

  assert.equal(item.example, "I don't like coffee; rather, I prefer tea.");
  assert.equal(item.exampleCn, "我不喜欢咖啡；更确切地说，我更喜欢茶。");
});

test("G-reading normalization keeps article and AI-coach frequency evidence", () => {
  const item = normalizeReadingGItem({
    id: "logic-frequency",
    word: "however",
    layers: ["logic120"],
    part12ArticleFrequency: {
      articleCount: 58,
      occurrenceCount: 71,
      part1ArticleCount: 24,
      part2ArticleCount: 34,
      part3ArticleCount: 2,
      surfaces: ["however"]
    },
    aiCoachQuestionFrequency: {
      occurrenceCount: 3,
      questionCount: 2,
      testCount: 2
    }
  });

  assert.deepEqual(item.part12ArticleFrequency, {
    articleCount: 58,
    occurrenceCount: 71,
    part1ArticleCount: 24,
    part2ArticleCount: 34,
    part3ArticleCount: 2,
    surfaces: ["however"]
  });
  assert.deepEqual(item.aiCoachQuestionFrequency, {
    occurrenceCount: 3,
    questionCount: 2,
    testCount: 2
  });
});
