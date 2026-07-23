export const runtime = "nodejs";

import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";
import {
  AiProfileError,
  mergeProfileCache,
  normalizeProfileKey,
  readProfileCache,
  requestDeepseekProfiles
} from "../../lib/ai/deepseek-word-profile.server.mjs";
import {
  isAiContentProfileComplete,
  withAiClientCollocationPayload
} from "../../lib/vocab/admin-ai-content-profile.mjs";

const MAX_BATCH_WORDS = 10;

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    const { words, items, force = false } = await req.json();
    if (!Array.isArray(words) && !Array.isArray(items)) {
      return Response.json({ error: "words or items must be an array" }, { status: 400 });
    }

    const sourceItems = Array.isArray(items)
      ? items
      : words.map((word, index) => ({ inputId: `item-${index + 1}`, word }));
    const cleanItems = sourceItems
      .map((item, index) => ({
        inputId: String(item?.inputId || `item-${index + 1}`).trim(),
        word: String(item?.word || "").trim()
      }))
      .filter((item) => item.inputId && item.word)
      .slice(0, MAX_BATCH_WORDS);
    if (!cleanItems.length) {
      return Response.json({ items: [], stats: { cacheHit: 0, deepseek: 0, invalid: 0, requested: 0 } });
    }
    if (new Set(cleanItems.map((item) => item.inputId)).size !== cleanItems.length) {
      return Response.json({ error: "inputId values must be unique" }, { status: 400 });
    }

    const cache = readProfileCache();
    const resolvedByKey = new Map();
    const uniqueToGenerate = new Map();
    let cacheHit = 0;

    for (const { word } of cleanItems) {
      const key = normalizeProfileKey(word);
      const cached = cache[key];
      if (!force && isAiContentProfileComplete(cached)) {
        resolvedByKey.set(key, {
          ...withAiClientCollocationPayload({ ...cached, word }),
          aiReplaceExisting: false,
          cacheHit: true,
          source: "ai-cache"
        });
        cacheHit += 1;
      } else if (!uniqueToGenerate.has(key)) {
        uniqueToGenerate.set(key, word);
      }
    }

    const inputItems = [...uniqueToGenerate.entries()].map(([key, word], index) => ({
      inputId: `item-${index + 1}`,
      key,
      word
    }));
    let usage = null;
    let invalid = [];

    if (inputItems.length) {
      const generated = await requestDeepseekProfiles(inputItems, {
        timeoutMs: 75000,
        maxTokens: 14000
      });
      invalid = generated.invalid;
      usage = generated.usage;
      const cacheUpdates = new Map();

      for (const input of inputItems) {
        const entry = generated.entries.get(input.inputId);
        if (!entry) continue;
        cacheUpdates.set(input.key, entry);
        resolvedByKey.set(input.key, {
          ...withAiClientCollocationPayload(entry),
          aiReplaceExisting: Boolean(force),
          cacheHit: false,
          source: "deepseek"
        });
      }
      if (cacheUpdates.size) await mergeProfileCache(cacheUpdates);
    }

    return Response.json({
      items: cleanItems
        .map(({ inputId, word }) => {
          const resolved = resolvedByKey.get(normalizeProfileKey(word));
          return resolved ? { ...resolved, inputId } : null;
        })
        .filter(Boolean),
      stats: {
        cacheHit,
        deepseek: inputItems.length - invalid.length,
        invalid: invalid.length,
        requested: inputItems.length,
        invalidItems: invalid,
        usage
      }
    });
  } catch (error) {
    const status = error instanceof AiProfileError ? error.status : 500;
    const headers = error?.retryAfter ? { "Retry-After": error.retryAfter } : undefined;
    return Response.json({
      error: error instanceof Error ? error.message : "Server error",
      detail: error?.detail || ""
    }, { status, headers });
  }
}
