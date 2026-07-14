import { buildSpeechRequestHeaders } from "./api/local-admin-guard.mjs";

export function isSimpleDictionaryWord(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z][A-Za-z'-]*$/.test(text);
}

export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;
}

export function pickEnglishVoice(voices = []) {
  const englishVoices = voices.filter((voice) => /^en(-|_)/i.test(voice.lang));
  const british =
    englishVoices.find((voice) => /en-GB/i.test(voice.lang)) ||
    englishVoices.find((voice) => /gb/i.test(voice.name));
  if (british) return british;

  const american =
    englishVoices.find((voice) => /en-US/i.test(voice.lang)) ||
    englishVoices.find((voice) => /us/i.test(voice.name));
  if (american) return american;

  return englishVoices[0] || voices.find((voice) => /english/i.test(voice.name)) || null;
}

/**
 * Single speech policy for the whole product:
 * Edge TTS fallback only — words, phrases, and example sentences all share it.
 * Real-person (Lingua Libre / commons) audio is disabled to avoid mixed rules.
 */
export const SPEECH_EDGE_ONLY_OPTIONS = Object.freeze({ preferReal: false });

/** @deprecated alias — always edge-only */
export const SPEECH_WARM_OPTIONS = SPEECH_EDGE_ONLY_OPTIONS;

/** @deprecated alias — always edge-only */
export const SPEECH_FAST_OPTIONS = SPEECH_EDGE_ONLY_OPTIONS;

/**
 * Unified fetch options. kind/purpose kept for call-site compatibility;
 * always edge-only regardless of word vs sentence.
 */
export function resolveSpeechFetchOptions(_kind = "word", _purpose = "play") {
  return SPEECH_EDGE_ONLY_OPTIONS;
}

const speechAudioCache = new Map();
const speechAudioPromiseCache = new Map();
const MAX_SPEECH_AUDIO_CACHE_ENTRIES = 200;
const MAX_CONCURRENT_SPEECH_PRELOADS = 2;
const speechPreloadQueue = [];
const speechPreloadTasks = new Map();
let activeSpeechPreloads = 0;

function isBlobUrl(url) {
  return typeof url === "string" && url.startsWith("blob:");
}

function speechCacheKey(cleanText, kind, _options = {}) {
  // One cache lane for all playback (edge-only).
  return `${kind}:${cleanText}:edge-only`;
}

export function resolveAudioCacheToken(headers = {}) {
  if (!headers) return "";
  if (typeof headers.get === "function") {
    return (
      headers.get("X-Audio-Cache-Token") ||
      headers.get("X-Audio-Enhance-Version") ||
      headers.get("X-Audio-Updated-At") ||
      ""
    );
  }
  return (
    headers["X-Audio-Cache-Token"] ||
    headers["X-Audio-Enhance-Version"] ||
    headers["X-Audio-Updated-At"] ||
    ""
  );
}

export function buildAudioFileUrl(text, kind = "word", options = {}) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  const params = new URLSearchParams({ text: cleanText, kind });
  if (options.preferReal === false) {
    params.set("preferReal", "0");
  }
  const cacheToken = String(options.cacheToken || options.cacheVersion || "").trim();
  if (cacheToken) {
    params.set("v", cacheToken);
  }
  return `/api/audio-file?${params.toString()}`;
}

export function withAudioCacheToken(url, cacheToken = "") {
  const token = String(cacheToken || "").trim();
  if (!url || !token) return url || "";
  if (isBlobUrl(url)) return url;

  const [pathname, search = ""] = String(url).split("?");
  const params = new URLSearchParams(search);
  params.set("v", token);
  return `${pathname}?${params.toString()}`;
}

function cacheSpeechAudioResult(cacheKey, result) {
  speechAudioCache.set(cacheKey, result);
  if (speechAudioCache.size <= MAX_SPEECH_AUDIO_CACHE_ENTRIES) return;

  const oldestKey = speechAudioCache.keys().next().value;
  const oldestUrl = speechAudioCache.get(oldestKey)?.url || speechAudioCache.get(oldestKey);
  speechAudioCache.delete(oldestKey);
  if (oldestUrl && isBlobUrl(oldestUrl) && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(oldestUrl);
  }
}

function buildSpeechResultFromHeaders(url, headers) {
  const cacheToken = resolveAudioCacheToken(headers);
  return {
    url: withAudioCacheToken(url, cacheToken),
    source: headers.get("X-Audio-Source") || "cache",
    provider: headers.get("X-Audio-Provider") || "",
    realAudio: headers.get("X-Audio-Real") === "1",
    audioEnhanced: headers.get("X-Audio-Enhanced") === "1",
    cacheToken
  };
}

async function responseAudioObjectUrl(response) {
  const blob = await response.blob();
  if (!blob.size) return "";
  return URL.createObjectURL(blob);
}

async function tryFetchCachedAudioFile(cleanText, kind, options = {}) {
  const directUrl = buildAudioFileUrl(cleanText, kind, { ...options, preferReal: false });

  try {
    const audioRes = await fetch(directUrl, {
      cache: "force-cache",
      signal: options.signal
    });
    if (audioRes.status === 204 || audioRes.status === 404 || audioRes.headers.get("X-Audio-Cache") === "miss") {
      return null;
    }
    if (!audioRes.ok) return null;

    // Never reuse real-person cache for playback.
    if (audioRes.headers.get("X-Audio-Real") === "1") {
      return null;
    }

    const objectUrl = await responseAudioObjectUrl(audioRes);
    return objectUrl ? buildSpeechResultFromHeaders(objectUrl, audioRes.headers) : null;
  } catch {
    return null;
  }
}

export async function fetchSpeechAudioResult(text, kind = "word", options) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleanText) {
    return { url: "", source: "empty", provider: "", realAudio: false, audioEnhanced: false };
  }

  // Force edge-only even if a caller still passes preferReal:true.
  const resolvedOptions = {
    ...(options ?? resolveSpeechFetchOptions(kind, "play")),
    preferReal: false
  };
  const cacheKey = speechCacheKey(cleanText, kind, resolvedOptions);
  if (speechAudioCache.has(cacheKey)) {
    return speechAudioCache.get(cacheKey);
  }
  const pending = speechAudioPromiseCache.get(cacheKey);
  if (pending && !pending.signal?.aborted) {
    return pending.promise;
  }
  if (pending) {
    speechAudioPromiseCache.delete(cacheKey);
  }

  const request = (async () => {
    const cached = await tryFetchCachedAudioFile(cleanText, kind, resolvedOptions);
    if (cached?.url) {
      cacheSpeechAudioResult(cacheKey, cached);
      return cached;
    }

    const res = await fetch("/api/edge-tts", {
      method: "POST",
      headers: buildSpeechRequestHeaders({ "Content-Type": "application/json" }),
      signal: resolvedOptions.signal,
      body: JSON.stringify({
        text: cleanText,
        kind,
        preferReal: false
      })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || data?.detail || "发音音频生成失败");
    }

    // If server still marks real (legacy), treat as unusable and report edge miss.
    if (res.headers.get("X-Audio-Real") === "1") {
      throw new Error("服务返回了真人发音缓存，已禁用；请重试生成兜底发音");
    }

    const cacheToken = resolveAudioCacheToken(res.headers);
    const objectUrl = await responseAudioObjectUrl(res);
    const result = {
      url: objectUrl || withAudioCacheToken(
          buildAudioFileUrl(cleanText, kind, { preferReal: false }),
          cacheToken
        ),
      source: res.headers.get("X-Audio-Source") || "edge-cache",
      provider: res.headers.get("X-Audio-Provider") || "edge-tts",
      realAudio: false,
      audioEnhanced: res.headers.get("X-Audio-Enhanced") === "1",
      cacheToken
    };
    cacheSpeechAudioResult(cacheKey, result);
    return result;
  })();

  speechAudioPromiseCache.set(cacheKey, {
    promise: request,
    signal: resolvedOptions.signal
  });
  try {
    return await request;
  } finally {
    if (speechAudioPromiseCache.get(cacheKey)?.promise === request) {
      speechAudioPromiseCache.delete(cacheKey);
    }
  }
}

export async function fetchSpeechAudioUrl(text, kind = "word", options) {
  const result = await fetchSpeechAudioResult(text, kind, options);
  return result.url || "";
}

function createAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException("Speech preload was cancelled", "AbortError");
  }
  const error = new Error("Speech preload was cancelled");
  error.name = "AbortError";
  return error;
}

function removeSpeechPreloadSubscriber(task, subscriber) {
  task.subscribers.delete(subscriber);
  if (!task.subscribers.size && !task.settled) {
    task.controller.abort();
  }
}

function settleSpeechPreloadTask(task, method, value) {
  task.settled = true;
  for (const subscriber of task.subscribers) {
    subscriber.cleanup();
    subscriber[method](value);
  }
  task.subscribers.clear();
}

function runSpeechPreloadQueue() {
  while (activeSpeechPreloads < MAX_CONCURRENT_SPEECH_PRELOADS && speechPreloadQueue.length) {
    const task = speechPreloadQueue.shift();
    if (!task || task.controller.signal.aborted || !task.subscribers.size) {
      if (task) speechPreloadTasks.delete(task.key);
      continue;
    }

    activeSpeechPreloads += 1;
    task.started = true;
    void fetchSpeechAudioResult(task.text, task.kind, {
      ...task.options,
      signal: task.controller.signal
    }).then(
      (result) => settleSpeechPreloadTask(task, "resolve", result.url || ""),
      (error) => settleSpeechPreloadTask(task, "reject", error)
    ).finally(() => {
      activeSpeechPreloads -= 1;
      if (speechPreloadTasks.get(task.key) === task) {
        speechPreloadTasks.delete(task.key);
      }
      runSpeechPreloadQueue();
    });
  }
}

function enqueueSpeechPreload(text, kind, options = SPEECH_WARM_OPTIONS) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleanText) return Promise.resolve("");
  if (options.signal?.aborted) return Promise.reject(createAbortError());

  const key = speechCacheKey(cleanText, kind, options);
  let task = speechPreloadTasks.get(key);
  if (!task || task.controller.signal.aborted || task.settled) {
    task = {
      key,
      text: cleanText,
      kind,
      options: { ...options, signal: undefined },
      controller: new AbortController(),
      subscribers: new Set(),
      started: false,
      settled: false
    };
    speechPreloadTasks.set(key, task);
    speechPreloadQueue.push(task);
  }

  return new Promise((resolve, reject) => {
    const subscriber = {
      resolve,
      reject,
      cleanup: () => options.signal?.removeEventListener("abort", onAbort)
    };
    const onAbort = () => {
      removeSpeechPreloadSubscriber(task, subscriber);
      subscriber.cleanup();
      reject(createAbortError());
      if (!task.started) runSpeechPreloadQueue();
    };

    task.subscribers.add(subscriber);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    runSpeechPreloadQueue();
  });
}

export async function preloadSpeechAudioUrl(text, kind = "word", options = SPEECH_WARM_OPTIONS) {
  try {
    return await enqueueSpeechPreload(text, kind, options);
  } catch {
    return "";
  }
}

function readSpeechCandidate(entry = {}) {
  if (!entry || typeof entry !== "object") return entry;
  if (entry.sourceWord && typeof entry.sourceWord === "object") {
    return entry.sourceWord;
  }
  return entry;
}

export function resolveSpellingSpeechText(entry = {}) {
  const candidates = [
    entry,
    entry?.sourceWord,
    entry?.personalWrong
  ].filter((item) => item && typeof item === "object");

  for (const item of candidates) {
    const text = String(
      item.expectedAnswer ||
      item.displayText ||
      item.targetAnswer ||
      item.word ||
      item.answer ||
      item.phrase ||
      ""
    ).trim();
    if (text) return text;
  }

  return "";
}

export function resolveSpellingExampleSpeechText(entry = {}) {
  const source = readSpeechCandidate(entry);
  return String(entry?.example || source?.example || "").trim();
}

export function preloadSpellingEntryAudio(entry = {}, options = {}) {
  const word = resolveSpellingSpeechText(entry);
  const example = resolveSpellingExampleSpeechText(entry);
  const tasks = [];
  const speechOptions = {
    ...SPEECH_WARM_OPTIONS,
    ...(options.speechOptions || {}),
    signal: options.signal
  };

  if (word) tasks.push(preloadSpeechAudioUrl(word, resolveSpeechAudioKind(word, "word"), speechOptions));
  if (example) tasks.push(preloadSpeechAudioUrl(example, "sentence", speechOptions));
  return Promise.allSettled(tasks);
}

export function preloadSpellingSpeechTexts(entries = [], options = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const seen = new Set();
  const tasks = [];
  const speechOptions = {
    ...SPEECH_WARM_OPTIONS,
    ...(options.speechOptions || {}),
    signal: options.signal
  };

  for (const entry of list) {
    const word = resolveSpellingSpeechText(entry);
    if (!word || seen.has(word)) continue;
    seen.add(word);
    tasks.push(preloadSpeechAudioUrl(word, resolveSpeechAudioKind(word, options.target || "word"), speechOptions));
  }

  return Promise.allSettled(tasks);
}

export function browserSpeak(text, options = {}) {
  const value = String(text || "").trim();
  if (!value || !isSpeechSynthesisSupported()) {
    return false;
  }

  const voices = window.speechSynthesis.getVoices();
  const voice = pickEnglishVoice(voices);
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = voice?.lang || "en-GB";
  if (voice) utterance.voice = voice;
  utterance.rate = options.rate ?? 0.95;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function isAudioInterruptedError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    error?.name === "AbortError" ||
    message.includes("play() request was interrupted") ||
    message.includes("the play request was interrupted") ||
    message.includes("interrupted by a call to pause")
  );
}

export function resolveSpeechAudioKind(text, target = "word") {
  const cleanText = String(text || "").trim();
  if (target === "example") return "sentence";
  return isSimpleDictionaryWord(cleanText) ? "word" : "phrase";
}

/** Staggered warmup delays (ms): current word, example, next word, next example. */
export const SPEECH_WARM_DELAYS_MS = [0, 120, 350, 600];
