export const runtime = "nodejs";

import { createReadStream } from "fs";
import path from "path";
import {
  audioIndexPath,
  audioEntryResponseHeaders,
  cacheDir,
  ensureReadableSpeechCacheEntry,
  readJson,
  resolveReadableAudioEntry,
  safeSpeechText,
  writeJson
} from "../../lib/vocab-audio-source.mjs";

async function parseAudioRequest(req) {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") || "word";
  const text = safeSpeechText(searchParams.get("text") || "", kind === "sentence" ? 500 : 160);

  if (!text) {
    return { error: Response.json({ error: "text is required" }, { status: 400 }) };
  }

  const indexFile = audioIndexPath();
  const index = readJson(indexFile, {});
  const refreshed = await ensureReadableSpeechCacheEntry(text, index, { kind });
  if (refreshed.changed) {
    writeJson(indexFile, index);
  }

  const resolved = resolveReadableAudioEntry(text, index, { kind });

  if (!resolved) {
    return { error: new Response(null, { status: 404 }) };
  }

  return {
    entry: resolved.entry,
    filepath: resolved.filepath || path.join(cacheDir(), resolved.entry.filename || ""),
    source: resolved.entry.source || "cache"
  };
}

function audioCacheMissResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "X-Audio-Cache": "miss"
    }
  });
}

export async function GET(req) {
  try {
    const parsed = await parseAudioRequest(req);
    if (parsed.error?.status === 404) return audioCacheMissResponse();
    if (parsed.error) return parsed.error;

    const stream = createReadStream(parsed.filepath);
    return new Response(stream, {
      headers: audioEntryResponseHeaders(parsed.entry, parsed.source)
    });
  } catch (error) {
    return Response.json(
      {
        error: "Audio read failed",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function HEAD(req) {
  try {
    const parsed = await parseAudioRequest(req);
    if (parsed.error?.status === 404) return audioCacheMissResponse();
    if (parsed.error) return parsed.error;

    return new Response(null, {
      status: 200,
      headers: audioEntryResponseHeaders(parsed.entry, parsed.source)
    });
  } catch (error) {
    return Response.json(
      {
        error: "Audio lookup failed",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
