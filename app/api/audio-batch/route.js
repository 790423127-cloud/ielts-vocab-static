export const runtime = "nodejs";

import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";

import { existsSync } from "fs";
import path from "path";
import {
  REAL_AUDIO_CACHE_VERSION,
  audioIndexPath,
  cacheDir,
  ensureEdgeAudio,
  ensureRealVoiceAudio,
  normalizeAudioKey,
  pronunciationCachePath,
  readJson,
  safeSpeechText,
  shouldRetryRealAudio,
  writeJson
} from "../../lib/vocab-audio-source.mjs";

function hasCachedAudio(indexed = {}) {
  return Boolean(indexed?.hasAudio && indexed?.filename && existsSync(path.join(cacheDir(), indexed.filename)));
}

async function ensureRealFirstAudio(text, audioIndex, options = {}) {
  const kind = options.kind || "word";
  const key = normalizeAudioKey(text);
  const indexed = audioIndex[key];

  if (indexed?.realAudio && hasCachedAudio(indexed)) {
    return { ok: true, source: indexed.source || "real-cache", realAudio: true, cacheHit: true };
  }

  if (shouldRetryRealAudio(indexed, kind)) {
    const real = await ensureRealVoiceAudio(text, audioIndex, { kind });
    if (real.ok) {
      return { ok: true, source: real.source, realAudio: true, cacheHit: false };
    }
  }

  const latest = audioIndex[key];
  if (latest?.realAudio && hasCachedAudio(latest)) {
    return { ok: true, source: latest.source || "real-cache", realAudio: true, cacheHit: true };
  }

  if (
    latest?.hasAudio &&
    !latest.realAudio &&
    latest.realAudioVersion === REAL_AUDIO_CACHE_VERSION &&
    hasCachedAudio(latest)
  ) {
    return { ok: true, source: latest.source || "edge-cache", realAudio: false, cacheHit: true };
  }

  const edge = await ensureEdgeAudio(text, audioIndex, { kind });
  return {
    ok: edge.ok,
    source: edge.source,
    realAudio: false,
    cacheHit: false
  };
}

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    const body = await req.json();
    const rawItems = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.words)
        ? body.words
        : [];
    const itemsToGenerate = rawItems
      .map((item) => {
        if (typeof item === "string") {
          return {
            word: safeSpeechText(item, 160),
            kind: "word"
          };
        }

        const kind = String(item?.kind || "word");
        return {
          word: safeSpeechText(item?.word || item?.text || item?.phrase || "", kind === "sentence" ? 500 : 160),
          kind
        };
      })
      .filter((item) => item.word)
      .slice(0, 100);
    const generate = body.generate !== false;

    if (!itemsToGenerate.length) {
      return Response.json({ items: [] });
    }

    const audioIndexFile = audioIndexPath();
    const pronunciationFile = pronunciationCachePath();
    const audioIndex = readJson(audioIndexFile, {});
    const pronunciationCache = readJson(pronunciationFile, {});
    const items = [];

    for (const target of itemsToGenerate) {
      const word = target.word;
      const kind = target.kind || "word";
      const key = normalizeAudioKey(word);
      const indexed = audioIndex[key];

      if (indexed?.realAudio && hasCachedAudio(indexed)) {
        items.push({
          word,
          hasAudio: true,
          audioUrl: "",
          phonetic: indexed.phonetic || pronunciationCache[key]?.phonetic || "",
          source: indexed.source || "real-cache",
          provider: indexed.provider || "",
          realAudio: true,
          kind,
          cacheHit: true
        });
        continue;
      }

      if (!generate) {
        const cachedPronunciation = pronunciationCache[key];
        items.push({
          word,
          hasAudio: hasCachedAudio(indexed) || Boolean(cachedPronunciation?.audioUrl),
          audioUrl: cachedPronunciation?.audioUrl || "",
          phonetic: indexed?.phonetic || cachedPronunciation?.phonetic || "",
          source: indexed?.source || cachedPronunciation?.source || "not-generated",
          provider: indexed?.provider || "",
          realAudio: Boolean(indexed?.realAudio),
          kind,
          cacheHit: Boolean(indexed || cachedPronunciation)
        });
        continue;
      }

      try {
        const result = await ensureRealFirstAudio(word, audioIndex, { kind });
        const latest = audioIndex[key] || {};

        items.push({
          word,
          hasAudio: result.ok,
          audioUrl: "",
          phonetic: latest.phonetic || pronunciationCache[key]?.phonetic || "",
          source: result.source,
          provider: latest.provider || "",
          realAudio: Boolean(result.realAudio),
          realAudioVersion: latest.realAudioVersion || REAL_AUDIO_CACHE_VERSION,
          kind,
          cacheHit: Boolean(result.cacheHit)
        });
      } catch (error) {
        items.push({
          word,
          hasAudio: false,
          audioUrl: "",
          phonetic: pronunciationCache[key]?.phonetic || "",
          source: "failed",
          realAudio: false,
          kind,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    writeJson(audioIndexFile, audioIndex);
    writeJson(pronunciationFile, pronunciationCache);

    return Response.json({ items });
  } catch (error) {
    return Response.json(
      {
        error: "Audio batch failed",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
