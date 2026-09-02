export const runtime = "nodejs";

import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";
import { shouldReuseAiProfileCache } from "../../lib/ai/ai-profile-cache-contract.mjs";
import {
  AiProfileError,
  buildProfileCacheKey,
  isUsableAiProfile,
  isUsableMeaningCoverageAiProfile,
  isUsableReadingAiProfile,
  isProfileSensePriorityCompatible,
  mergeProfileCache,
  readProfileCache,
  requestDeepseekProfiles
} from "../../lib/ai/deepseek-word-profile.server.mjs";
import {
  normalizeAiSynonyms,
  withAiClientCollocationPayload
} from "../../lib/vocab/admin-ai-content-profile.mjs";
import { synonymEquivalenceKey } from "../../lib/vocab/synonym-equivalence.mjs";
import { isAiProfileCompatibleWithDeclaredPos } from "../../lib/vocab/multi-pos-sense-coverage.mjs";

const MAX_BATCH_WORDS = 10;
const MAX_CONTEXT_LENGTH = 4000;

function cleanContext(value, max = MAX_CONTEXT_LENGTH) {
  return String(value || "").normalize("NFC").trim().replace(/\s+/g, " ").slice(0, max);
}

export function buildAiProfileCacheKey(word, contextSentence = "", sensePriority = "common") {
  return buildProfileCacheKey(word, cleanContext(contextSentence), sensePriority);
}

function hasMatchingRequestedSynonyms(profile, requestedSynonyms, headword) {
  const requested = normalizeAiSynonyms(requestedSynonyms, headword);
  if (!requested.length) return true;
  const cached = normalizeAiSynonyms(profile?.synonyms, headword);
  if (cached.length !== requested.length) return false;
  const cachedKeys = new Set(cached.map(synonymEquivalenceKey));
  return requested.every((word) => cachedKeys.has(synonymEquivalenceKey(word)));
}

export function canReuseAiProfileForRequest(profile, {
  force = false,
  profileKind = "full",
  profileQuality = "full",
  requestedSynonyms = [],
  word = "",
  existingPos = "",
  contextSentence = ""
} = {}) {
  const requestedSensePriority = profileQuality === "reading" ? "context" : "common";
  const usable = profileKind === "meaning-coverage"
    ? isUsableMeaningCoverageAiProfile(profile)
    : profileQuality === "reading"
      ? isUsableReadingAiProfile(profile)
      : isUsableAiProfile(profile);
  const synonymContractMatches = cleanContext(contextSentence)
    ? true
    : hasMatchingRequestedSynonyms(profile, requestedSynonyms, word);
  return shouldReuseAiProfileCache(profile, {
    force,
    usable: usable
      && synonymContractMatches
      && isProfileSensePriorityCompatible(profile, requestedSensePriority)
      && isAiProfileCompatibleWithDeclaredPos(profile, existingPos)
  });
}

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    const {
      words,
      items,
      force = false,
      maxSplitDepth = 3,
      profileQuality = "full",
      profileKind = "full"
    } = await req.json();
    if (!Array.isArray(words) && !Array.isArray(items)) {
      return Response.json({ error: "words or items must be an array" }, { status: 400 });
    }

    const requestedProfileKind = profileKind === "meaning-coverage" ? "meaning-coverage" : "full";
    const requestedProfileQuality = profileQuality === "reading" ? "reading" : "full";
    const requestedSensePriority = requestedProfileQuality === "reading" ? "context" : "common";
    const sourceItems = Array.isArray(items)
      ? items
      : words.map((word, index) => ({ inputId: `item-${index + 1}`, word }));
    const cleanItems = sourceItems
      .map((item, index) => ({
        inputId: String(item?.inputId || `item-${index + 1}`).trim(),
        word: String(item?.word || "").trim(),
        requestedSynonyms: (Array.isArray(item?.requestedSynonyms) ? item.requestedSynonyms : [])
          .map((value) => String(typeof value === "string" ? value : value?.word || value?.replacement || "").trim())
          .filter(Boolean)
          .slice(0, 4),
        existingMeaning: cleanContext(item?.existingMeaning || item?.existing_primary_meaning, 500),
        existingPos: cleanContext(item?.existingPos || item?.existing_part_of_speech, 200),
        contextSentence: cleanContext(item?.contextSentence || item?.context_sentence),
        contextLabel: cleanContext(item?.contextLabel || item?.context_label, 500)
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

    for (const { word, requestedSynonyms, existingMeaning, existingPos, contextSentence, contextLabel } of cleanItems) {
      const key = buildAiProfileCacheKey(word, contextSentence, requestedSensePriority);
      const cached = cache[key];
      if (canReuseAiProfileForRequest(cached, {
        force,
        profileKind: requestedProfileKind,
        profileQuality: requestedProfileQuality,
        requestedSynonyms,
        word,
        existingPos,
        contextSentence
      })) {
        resolvedByKey.set(key, {
          ...withAiClientCollocationPayload({ ...cached, word }),
          aiReplaceExisting: false,
          cacheHit: true,
          source: "ai-cache"
        });
        cacheHit += 1;
      } else if (!uniqueToGenerate.has(key)) {
        uniqueToGenerate.set(key, {
          word,
          requestedSynonyms,
          existingMeaning,
          existingPos,
          contextSentence,
          contextLabel
        });
      }
    }

    const inputItems = [...uniqueToGenerate.entries()].map(([key, value], index) => ({
      inputId: `item-${index + 1}`,
      key,
      word: value.word,
      requestedSynonyms: value.requestedSynonyms,
      existingMeaning: value.existingMeaning,
      existingPos: value.existingPos,
      contextSentence: value.contextSentence,
      contextLabel: value.contextLabel
    }));
    let usage = null;
    let invalid = [];

    if (inputItems.length) {
      const requestedSplitDepth = Number(maxSplitDepth);
      const boundedSplitDepth = Number.isFinite(requestedSplitDepth)
        ? Math.max(0, Math.min(3, Math.trunc(requestedSplitDepth)))
        : 3;
      const generated = await requestDeepseekProfiles(inputItems, {
        timeoutMs: 75000,
        maxTokens: 14000,
        maxSplitDepth: boundedSplitDepth,
        profileQuality: requestedProfileQuality,
        profileKind: requestedProfileKind,
        sensePriority: requestedSensePriority
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
        .map(({ inputId, word, contextSentence }) => {
          const resolved = resolvedByKey.get(buildAiProfileCacheKey(
            word,
            contextSentence,
            requestedSensePriority
          ));
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
      code: error?.code || "",
      detail: error?.detail || ""
    }, { status, headers });
  }
}
