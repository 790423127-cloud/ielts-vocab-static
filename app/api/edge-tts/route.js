export const runtime = "nodejs";

import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";

import { createReadStream, existsSync } from "fs";
import path from "path";
import { REAL_AUDIO_ENHANCE_VERSION } from "../../lib/real-audio-enhance.mjs";
import {
  REAL_AUDIO_CACHE_VERSION,
  audioIndexPath,
  cacheDir,
  contentTypeFromExtension,
  ensureEdgeAudio,
  ensureReadableSpeechCacheEntry,
  ensureRealVoiceAudio,
  normalizeAudioKey,
  readJson,
  safeSpeechText,
  shouldRetryRealAudio,
  writeJson
} from "../../lib/vocab-audio-source.mjs";

function streamAudio(filepath, extraHeaders = {}, contentType = "audio/mpeg") {
  const stream = createReadStream(filepath);

  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ...extraHeaders
    }
  });
}

function resolveIndexedContentType(indexed = {}) {
  if (indexed.contentType) return indexed.contentType;
  const extension = String(indexed.filename || "").split(".").pop() || "mp3";
  return contentTypeFromExtension(extension);
}

function streamIndexed(indexed = {}, source = "") {
  const filepath = path.join(cacheDir(), indexed.filename || "");
  if (!indexed?.filename || !existsSync(filepath)) return null;

  const cacheToken = indexed.audioEnhanceVersion || String(indexed.updatedAt || "") || REAL_AUDIO_CACHE_VERSION;
  return streamAudio(filepath, {
    "X-Audio-Source": source || indexed.source || "cache",
    "X-Audio-Provider": indexed.provider || "",
    "X-Audio-Real": indexed.realAudio ? "1" : "0",
    "X-Audio-Enhanced": indexed.audioEnhanceVersion === REAL_AUDIO_ENHANCE_VERSION ? "1" : "0",
    "X-Audio-Enhance-Version": indexed.audioEnhanceVersion || "",
    "X-Audio-Cache-Token": cacheToken,
    "X-Audio-Updated-At": String(indexed.updatedAt || ""),
    "X-Audio-Cache-Version": indexed.realAudioVersion || REAL_AUDIO_CACHE_VERSION
  }, resolveIndexedContentType(indexed));
}

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    const body = await req.json();
    const kind = body.kind || "word";
    const text = safeSpeechText(body.text, kind === "sentence" ? 500 : 160);

    if (!text) {
      return Response.json({ error: "text is required" }, { status: 400 });
    }

    const key = normalizeAudioKey(text);
    const indexFile = audioIndexPath();
    const index = readJson(indexFile, {});
    let indexed = index[key];

    if (indexed?.hasAudio) {
      const refreshed = await ensureReadableSpeechCacheEntry(text, index, { kind });
      if (refreshed.changed) {
        writeJson(indexFile, index);
      }
      if (refreshed.entry) {
        indexed = refreshed.entry;
      }
    }

    if (indexed?.realAudio && indexed?.hasAudio) {
      const cachedReal = streamIndexed(indexed, indexed.source || "real-cache");
      if (cachedReal) return cachedReal;
    }

    if (body.preferReal !== false && shouldRetryRealAudio(indexed, kind)) {
      try {
        const real = await ensureRealVoiceAudio(text, index, { kind });
        writeJson(indexFile, index);
        if (real.ok) {
          const fresh = index[key];
          const realResponse = streamIndexed(fresh, real.source);
          if (realResponse) return realResponse;
        }
      } catch {
        writeJson(indexFile, index);
      }
    }

    const latest = index[key];
    if (latest?.realAudio && latest?.hasAudio) {
      const cachedReal = streamIndexed(latest, latest.source || "real-cache");
      if (cachedReal) return cachedReal;
    }

    if (
      latest?.hasAudio &&
      latest?.filename &&
      !latest.realAudio &&
      latest.realAudioVersion === REAL_AUDIO_CACHE_VERSION
    ) {
      const cachedEdge = streamIndexed(latest, latest.source || "edge-cache");
      if (cachedEdge) return cachedEdge;
    }

    const edge = await ensureEdgeAudio(text, index, {
      kind,
      voice: body.voice || "en-US-AriaNeural",
      rate: body.rate || (kind === "sentence" ? "-8%" : "-12%")
    });
    writeJson(indexFile, index);

    if (!edge.ok) {
      return Response.json({ error: "Edge TTS did not create audio file" }, { status: 500 });
    }

    const finalEntry = index[key];
    const response = streamIndexed(finalEntry, edge.source);
    if (response) return response;

    return Response.json({ error: "Audio file missing after generation" }, { status: 500 });
  } catch (error) {
    return Response.json(
      {
        error: "Audio generation failed",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
