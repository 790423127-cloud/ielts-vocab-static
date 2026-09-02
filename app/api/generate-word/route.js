export const runtime = "nodejs";

import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";
import {
  AiProfileError,
  buildProfileCacheKey,
  isProfileSensePriorityCompatible,
  isUsableAiProfile,
  mergeProfileCache,
  readProfileCache,
  requestDeepseekProfiles
} from "../../lib/ai/deepseek-word-profile.server.mjs";
import { withAiClientCollocationPayload } from "../../lib/vocab/admin-ai-content-profile.mjs";
import { isAiProfileCompatibleWithDeclaredPos } from "../../lib/vocab/multi-pos-sense-coverage.mjs";

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    const {
      word,
      force = false,
      inputId = "item-1",
      existingMeaning = "",
      existingPos = "",
      contextSentence = "",
      contextLabel = ""
    } = await req.json();
    const cleanWord = String(word || "").trim();
    const cleanInputId = String(inputId || "").trim();
    if (!cleanWord) return Response.json({ error: "word is required" }, { status: 400 });
    if (!cleanInputId) return Response.json({ error: "inputId is required" }, { status: 400 });

    const key = buildProfileCacheKey(cleanWord, contextSentence, "common");
    const cache = readProfileCache();
    if (
      !force
      && isUsableAiProfile(cache[key])
      && isProfileSensePriorityCompatible(cache[key], "common")
      && isAiProfileCompatibleWithDeclaredPos(cache[key], existingPos)
    ) {
      return Response.json({
        ...withAiClientCollocationPayload({ ...cache[key], word: cleanWord }),
        inputId: cleanInputId,
        aiReplaceExisting: false,
        cacheHit: true,
        source: "ai-cache"
      });
    }

    const result = await requestDeepseekProfiles([{
      inputId: cleanInputId,
      word: cleanWord,
      existingMeaning,
      existingPos,
      contextSentence,
      contextLabel
    }], {
      timeoutMs: 60000,
      maxTokens: 4800,
      sensePriority: "common"
    });
    const entry = result.entries.get(cleanInputId);
    if (!entry) {
      return Response.json({
        error: "AI returned an invalid word profile",
        detail: result.invalid[0]?.reason || "No valid result was returned. Nothing was written."
      }, { status: 502 });
    }

    await mergeProfileCache(new Map([[key, entry]]));
    return Response.json({
      ...withAiClientCollocationPayload(entry),
      inputId: cleanInputId,
      aiReplaceExisting: Boolean(force),
      cacheHit: false,
      source: "deepseek",
      usage: result.usage
    });
  } catch (error) {
    const status = error instanceof AiProfileError ? error.status : 500;
    const headers = error?.retryAfter ? { "Retry-After": error.retryAfter } : undefined;
    return Response.json({
      error: error instanceof Error ? error.message : "Server error",
      code: error?.code || "",
      detail: error?.detail || ""
    }, { status, headers });
  }
}
