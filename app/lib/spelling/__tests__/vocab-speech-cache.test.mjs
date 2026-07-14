import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAudioFileUrl,
  fetchSpeechAudioUrl,
  preloadSpellingEntryAudio,
  preloadSpellingSpeechTexts,
  resolveSpeechFetchOptions,
  resolveSpellingSpeechText,
  SPEECH_WARM_OPTIONS,
  withAudioCacheToken
} from "../../vocab-speech.mjs";
import {
  cacheDir,
  getReadableRealAudioEntry,
  lookupCachedAudioEntry,
  normalizeAudioKey
} from "../../vocab-audio-source.mjs";
import { resolveRealVoiceAudioSource } from "../../vocab-audio-source.mjs";
import {
  buildPersonalWrongBookCandidates,
  mergePersonalWrongBookRecords,
  parsePersonalWrongBookInput
} from "../personal-wrong-book.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function mockSpeechFetch() {
  let fetchCount = 0;
  const fetchImpl = async (url, options = {}) => {
    fetchCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));

    if (String(url).includes("/api/audio-file")) {
      return new Response(null, { status: 404 });
    }

    return new Response(new Blob(["audio"]), {
      status: 200,
      headers: {
        "X-Audio-Source": "edge-generated",
        "X-Audio-Real": "0"
      }
    });
  };

  return {
    fetchImpl,
    getCount: () => fetchCount
  };
}

test("normalizeAudioKey normalizes curly quotation marks", () => {
  assert.equal(normalizeAudioKey("  DON’T  “STOP”  "), "don't \"stop\"");
});

test("concurrent speech preload requests share one generated audio response", async () => {
  const originalFetch = globalThis.fetch;
  const mock = mockSpeechFetch();
  globalThis.fetch = mock.fetchImpl;

  try {
    const [first, second] = await Promise.all([
      fetchSpeechAudioUrl("audit-coalesced-audio", "word"),
      fetchSpeechAudioUrl("audit-coalesced-audio", "word")
    ]);
    assert.equal(first, second);
    assert.equal(mock.getCount(), 2);

    await preloadSpellingEntryAudio({
      expectedAnswer: "audit-next-question",
      example: "This sentence is preloaded for the next question."
    });
    assert.equal(mock.getCount(), 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveSpeechFetchOptions is edge-only for word phrase sentence and warm", () => {
  assert.deepEqual(resolveSpeechFetchOptions("word", "play"), { preferReal: false });
  assert.deepEqual(resolveSpeechFetchOptions("phrase", "play"), { preferReal: false });
  assert.deepEqual(resolveSpeechFetchOptions("sentence", "play"), { preferReal: false });
  assert.deepEqual(resolveSpeechFetchOptions("word", "warm"), SPEECH_WARM_OPTIONS);
  assert.equal(SPEECH_WARM_OPTIONS.preferReal, false);
});

test("play requests always send preferReal false for words and sentences", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/api/audio-file")) {
      return new Response(null, { status: 404 });
    }
    return new Response(new Blob(["audio"]), {
      status: 200,
      headers: {
        "X-Audio-Source": "edge-generated",
        "X-Audio-Real": "0",
        "X-Audio-Provider": "edge-tts"
      }
    });
  };

  try {
    await fetchSpeechAudioUrl("dictionary-playback", "word");
    await fetchSpeechAudioUrl("sentence playback example.", "sentence");
    const posts = requests.filter((entry) => entry.url.endsWith("/api/edge-tts"));
    assert.equal(posts.length, 2);
    for (const post of posts) {
      assert.equal(JSON.parse(post.options.body).preferReal, false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("edge-only playback reuses the body from a cached edge GET", async () => {
  const originalFetch = globalThis.fetch;
  const directUrl = buildAudioFileUrl("edge-only-cache", "word", { preferReal: false });
  globalThis.fetch = async (url, options = {}) => {
    if ((options.method || "GET") === "GET" && String(url) === directUrl) {
      return new Response(new Blob(["audio"]), {
        status: 200,
        headers: {
          "X-Audio-Source": "edge-cache",
          "X-Audio-Real": "0"
        }
      });
    }

    throw new Error(`unexpected fetch: ${String(url)} ${options.method || "GET"}`);
  };

  try {
    const result = await fetchSpeechAudioUrl("edge-only-cache", "word");
    assert.match(result, /^blob:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("edge-only playback rejects cached real-person GET hits", async () => {
  const originalFetch = globalThis.fetch;
  const directUrl = buildAudioFileUrl("real-cached-word", "word", { preferReal: false });
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || "GET" });
    if ((options.method || "GET") === "GET" && String(url) === directUrl) {
      return new Response(new Blob(["real-audio"]), {
        status: 200,
        headers: {
          "X-Audio-Source": "real-commons",
          "X-Audio-Real": "1"
        }
      });
    }
    if (String(url).endsWith("/api/edge-tts")) {
      return new Response(new Blob(["audio"]), {
        status: 200,
        headers: {
          "X-Audio-Source": "edge-generated",
          "X-Audio-Real": "0"
        }
      });
    }
    throw new Error(`unexpected fetch: ${String(url)} ${options.method || "GET"}`);
  };

  try {
    const result = await fetchSpeechAudioUrl("real-cached-word", "word");
    assert.match(result, /^blob:/);
    assert.ok(requests.some((entry) => entry.url.endsWith("/api/edge-tts")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("speech audio urls include cache token to bypass stale browser audio cache", () => {
  const url = withAudioCacheToken("/api/audio-file?text=land&kind=word", "enhance-v2");
  assert.match(url, /[?&]v=enhance-v2/);
  assert.equal(withAudioCacheToken("blob:http://localhost/audio-id", "enhance-v2"), "blob:http://localhost/audio-id");
});

test("cached speech audio is materialized once as an object URL", async () => {
  const originalFetch = globalThis.fetch;
  const directUrl = buildAudioFileUrl("cached-audio-hit", "word", SPEECH_WARM_OPTIONS);
  globalThis.fetch = async (url, options = {}) => {
    if ((options.method || "GET") === "GET" && String(url) === directUrl) {
      return new Response(new Blob(["cached-audio"]), {
        status: 200,
        headers: {
          "X-Audio-Source": "edge-cache",
          "X-Audio-Real": "0"
        }
      });
    }

    throw new Error(`unexpected fetch: ${String(url)} ${options.method || "GET"}`);
  };

  try {
    const url = await fetchSpeechAudioUrl("cached-audio-hit", "word", SPEECH_WARM_OPTIONS);
    assert.match(url, /^blob:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("real voice resolver returns null when no Lingua Libre wav exists", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    const target = String(url);

    if (target.includes("dictionaryapi.dev")) {
      throw new Error("dictionary source should not be requested");
    }

    if (target.includes("wiktionary.org")) {
      return Response.json({ query: { pages: { 1: { missing: true } } } });
    }

    if (target.includes("commons.wikimedia.org")) {
      return Response.json({ query: { pages: {} } });
    }

    return new Response(null, { status: 404 });
  };

  try {
    const source = await resolveRealVoiceAudioSource("test", { kind: "word" });
    assert.equal(source, null);
    assert.equal(requests.some((url) => url.includes("dictionaryapi.dev")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("frontend speech playback uses the shared speech audio module only", () => {
  const files = [
    "app/page.jsx",
    "app/components/PhraseFlashcardPanel.jsx",
    "app/hooks/useVocabSpeech.js",
    "app/hooks/useHomeWordSpeech.js",
    "app/lib/vocab-speech.mjs"
  ];
  const forbidden = [
    "getEdgeTTSUrl",
    "playEdgeTTS",
    "warmEdgeTTS",
    "fetchEdgeTtsUrl",
    "preloadEdgeTtsUrl",
    "resolveEdgeTtsKind",
    "audioUrlCacheRef",
    "edgeUrlCache",
    "cacheEdgeTtsUrl",
    "播放 Edge"
  ];

  const speechModule = fs.readFileSync(path.join(root, "app/lib/vocab-speech.mjs"), "utf8");
  assert.match(speechModule, /resolveSpeechFetchOptions/);
  assert.match(speechModule, /SPEECH_WARM_OPTIONS/);

  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    // Home page delegates speech to useHomeWordSpeech; other files keep direct module usage.
    if (file === "app/page.jsx") {
      assert.match(source, /useHomeWordSpeech|fetchSpeechAudioResult|fetchSpeechAudioUrl|resolveSpeechAudioKind/);
    } else {
      assert.match(source, /fetchSpeechAudioResult|fetchSpeechAudioUrl|resolveSpeechAudioKind/);
    }
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `${file} contains old audio token: ${token}`);
    }
  }

  const homeSpeech = fs.readFileSync(path.join(root, "app/hooks/useHomeWordSpeech.js"), "utf8");
  assert.match(homeSpeech, /fetchSpeechAudioResult\(cleanText, kind\)/);
  assert.match(homeSpeech, /fetchSpeechAudioResult\(cleanText, kind, SPEECH_WARM_OPTIONS\)/);
});

test("resolveSpellingSpeechText reads personal wrong supplemental entries", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("unlistedword | 本地补充"));
  const [candidate] = buildPersonalWrongBookCandidates(records, [], { scope: "word" });

  assert.equal(resolveSpellingSpeechText(candidate), "unlistedword");
  assert.equal(candidate.expectedAnswer, "unlistedword");
  assert.equal(candidate.personalWrong.linkedToLexicon, false);
});

test("getReadableRealAudioEntry requires indexed real audio with an existing file", () => {
  const key = normalizeAudioKey("missing-real-file");
  const audioIndex = {
    [key]: {
      filename: "real-missing-on-disk.mp3",
      hasAudio: true,
      realAudio: true,
      source: "real-dictionary"
    }
  };

  assert.equal(getReadableRealAudioEntry(key, audioIndex), null);
  assert.equal(getReadableRealAudioEntry(normalizeAudioKey("absent"), audioIndex), null);
});

test("lookupCachedAudioEntry reuses legacy Edge cache versions", () => {
  const text = "legacy edge cache test";
  const key = normalizeAudioKey(text);
  const filename = `test-legacy-edge-cache-${process.pid}.mp3`;
  const filepath = path.join(cacheDir(), filename);
  const entry = {
    text,
    filename,
    hasAudio: true,
    realAudio: false,
    realAudioVersion: "real-first-v1",
    source: "edge-generated"
  };

  fs.writeFileSync(filepath, "test-audio");
  try {
    assert.equal(lookupCachedAudioEntry(text, { [key]: entry }, { kind: "sentence" }), entry);
  } finally {
    fs.rmSync(filepath, { force: true });
  }
});

test("preloadSpellingSpeechTexts deduplicates personal wrong write targets", async () => {
  const originalFetch = globalThis.fetch;
  const mock = mockSpeechFetch();
  globalThis.fetch = mock.fetchImpl;

  try {
    const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("vacancies | vacancy"));
    const candidates = buildPersonalWrongBookCandidates(records, [], { scope: "word" });
    await preloadSpellingSpeechTexts(candidates);
    assert.equal(mock.getCount(), 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("speech preload queue limits concurrent network work to two tasks", async () => {
  const originalFetch = globalThis.fetch;
  let active = 0;
  let maxActive = 0;

  globalThis.fetch = async (url, options = {}) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;

    if (String(url).includes("/api/audio-file")) {
      return new Response(null, { status: 404 });
    }
    return new Response(new Blob(["audio"]), { status: 200 });
  };

  try {
    await preloadSpellingSpeechTexts([
      { expectedAnswer: "preload-limit-one" },
      { expectedAnswer: "preload-limit-two" },
      { expectedAnswer: "preload-limit-three" },
      { expectedAnswer: "preload-limit-four" },
      { expectedAnswer: "preload-limit-five" }
    ]);
    assert.equal(maxActive, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cancelling a stale entry preload aborts its underlying request", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let observedAbort = false;

  globalThis.fetch = async (_url, options = {}) => new Promise((resolve, reject) => {
    const onAbort = () => {
      observedAbort = true;
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    setTimeout(() => resolve(new Response(null, { status: 404 })), 100);
  });

  try {
    const preload = preloadSpellingEntryAudio(
      { expectedAnswer: "cancel-stale-preload" },
      { signal: controller.signal }
    );
    controller.abort();
    await preload;
    assert.equal(observedAbort, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
