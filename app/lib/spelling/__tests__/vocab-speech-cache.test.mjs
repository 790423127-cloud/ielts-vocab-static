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
import { getReadableRealAudioEntry, normalizeAudioKey } from "../../vocab-audio-source.mjs";
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

    if (options.method === "HEAD") {
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

test("resolveSpeechFetchOptions keeps real-first playback for words and warm edge-only preload", () => {
  assert.deepEqual(resolveSpeechFetchOptions("word", "play"), { preferReal: true });
  assert.deepEqual(resolveSpeechFetchOptions("phrase", "play"), { preferReal: true });
  assert.deepEqual(resolveSpeechFetchOptions("sentence", "play"), { preferReal: false });
  assert.deepEqual(resolveSpeechFetchOptions("word", "warm"), SPEECH_WARM_OPTIONS);
});

test("play requests send preferReal for dictionary words", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (options.method === "HEAD") {
      return new Response(null, { status: 404 });
    }
    return new Response(new Blob(["audio"]), {
      status: 200,
      headers: {
        "X-Audio-Source": "real-dictionary",
        "X-Audio-Real": "1",
        "X-Audio-Provider": "dictionaryapi.dev"
      }
    });
  };

  try {
    await fetchSpeechAudioUrl("dictionary-playback", "word");
    const post = requests.find((entry) => entry.url.endsWith("/api/edge-tts"));
    assert.ok(post);
    assert.equal(JSON.parse(post.options.body).preferReal, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("real-first playback ignores cached edge-only HEAD hits", async () => {
  const originalFetch = globalThis.fetch;
  const directUrl = buildAudioFileUrl("edge-only-cache", "word", { preferReal: true });
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "HEAD" && String(url) === directUrl) {
      return new Response(null, {
        status: 200,
        headers: {
          "X-Audio-Source": "edge-cache",
          "X-Audio-Real": "0"
        }
      });
    }

    if (String(url).endsWith("/api/edge-tts")) {
      return new Response(new Blob(["audio"]), {
        status: 200,
        headers: {
          "X-Audio-Source": "real-dictionary",
          "X-Audio-Real": "1"
        }
      });
    }

    throw new Error(`unexpected fetch: ${String(url)} ${options.method || "GET"}`);
  };

  try {
    const result = await fetchSpeechAudioUrl("edge-only-cache", "word");
    assert.match(result, /^\/api\/audio-file\?/);
    assert.match(result, /text=edge-only-cache/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("speech audio urls include cache token to bypass stale browser audio cache", () => {
  const url = withAudioCacheToken("/api/audio-file?text=land&kind=word", "enhance-v2");
  assert.match(url, /[?&]v=enhance-v2/);
});

test("cached speech audio uses direct GET url after HEAD hit", async () => {
  const originalFetch = globalThis.fetch;
  const directUrl = buildAudioFileUrl("cached-audio-hit", "word", SPEECH_WARM_OPTIONS);
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "HEAD" && String(url) === directUrl) {
      return new Response(null, {
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
    assert.equal(url, directUrl);
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

    if (options.method === "HEAD") {
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
