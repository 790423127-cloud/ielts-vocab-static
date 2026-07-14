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
  normalizeAudioKey,
  readJson,
  safeSpeechText,
  writeJson
} from "../../lib/vocab-audio-source.mjs";

/** Single Edge TTS policy for words / phrases / example sentences. */
const EDGE_VOICE = "en-US-AriaNeural";
const EDGE_RATE = "-10%";

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
  // Never stream real-person entries from this route.
  if (indexed.realAudio) return null;

  const cacheToken = indexed.audioEnhanceVersion || String(indexed.updatedAt || "") || REAL_AUDIO_CACHE_VERSION;
  return streamAudio(filepath, {
    "X-Audio-Source": source || indexed.source || "edge-cache",
    "X-Audio-Provider": indexed.provider || "edge-tts",
    "X-Audio-Real": "0",
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

    // Only refresh / serve existing *edge* cache.
    if (indexed?.hasAudio && !indexed?.realAudio) {
      const refreshed = await ensureReadableSpeechCacheEntry(text, index, { kind });
      if (refreshed.changed) {
        writeJson(indexFile, index);
      }
      if (refreshed.entry && !refreshed.entry.realAudio) {
        indexed = refreshed.entry;
      }

      const cachedEdge = streamIndexed(indexed, indexed.source || "edge-cache");
      if (cachedEdge) return cachedEdge;
    }

    // Always generate Edge TTS (ignore preferReal / real cache).
    const edge = await ensureEdgeAudio(text, index, {
      kind,
      voice: body.voice || EDGE_VOICE,
      rate: body.rate || EDGE_RATE
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
      {
        status: 500
      }
    );
  }
}
