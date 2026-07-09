export const runtime = "nodejs";

import {
  isSimpleDictionaryWord,
  normalizeAudioKey,
  pronunciationCachePath,
  readJson,
  resolveRealVoiceAudioSource,
  safeSpeechText,
  writeJson
} from "../../lib/vocab-audio-source.mjs";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const word = safeSpeechText(searchParams.get("word") || "", 160);
  const key = normalizeAudioKey(word);

  if (!word) {
    return Response.json({ error: "word is required" }, { status: 400 });
  }

  const cacheFile = pronunciationCachePath();
  const cache = readJson(cacheFile, {});
  const cached = cache[key];

  if (!isSimpleDictionaryWord(word)) {
    const result = {
      word,
      phonetic: "",
      audioUrl: "",
      hasAudio: false,
      source: "phrase-skip",
      provider: "",
      checkedAt: Date.now(),
      cacheHit: true
    };

    cache[key] = result;
    writeJson(cacheFile, cache);
    return Response.json(result);
  }

  if (cached) {
    return Response.json({
      ...cached,
      cacheHit: true
    });
  }

  try {
    const source = await resolveRealVoiceAudioSource(word, { kind: "word", timeoutMs: 1600 });
    const result = {
      word,
      phonetic: source?.phonetic || "",
      audioUrl: source?.audioUrl || "",
      hasAudio: Boolean(source?.audioUrl),
      source: source?.source || "none",
      provider: source?.provider || "",
      license: source?.license || "",
      attribution: source?.attribution || "",
      checkedAt: Date.now(),
      cacheHit: false
    };

    cache[key] = result;
    writeJson(cacheFile, cache);
    return Response.json(result);
  } catch (error) {
    const result = {
      word,
      phonetic: "",
      audioUrl: "",
      hasAudio: false,
      source: "timeout-none",
      provider: "",
      checkedAt: Date.now(),
      cacheHit: false,
      detail: error instanceof Error ? error.message : String(error)
    };

    cache[key] = result;
    writeJson(cacheFile, cache);
    return Response.json(result);
  }
}
