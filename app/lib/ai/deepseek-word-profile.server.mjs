import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import {
  AI_CONTENT_PROFILE_VERSION,
  hasCompleteAiSynonymDetails,
  isAiCoreContentComplete,
  isAiGMainContentComplete,
  isDetailedOtherMeaning,
  normalizeAiGeneratedEntry,
  normalizeAiSynonyms
} from "../vocab/admin-ai-content-profile.mjs";
import { synonymEquivalenceKey } from "../vocab/synonym-equivalence.mjs";
import {
  AI_PROFILE_KIND,
  AI_SENSE_PRIORITY,
  AI_VOCAB_SYSTEM_PROMPT,
  buildAiWordProfilePrompt,
  normalizeSensePriority
} from "./vocab-profile-prompt.mjs";
import { isMeaningDetailInformative } from "../vocab/meaning-display.mjs";
import {
  describeMeaningCoverageProfileIssue,
  isMeaningCoverageProfileUsable
} from "../vocab/meaning-coverage-audit.mjs";
import { isAiProfileCompatibleWithDeclaredPos } from "../vocab/multi-pos-sense-coverage.mjs";

let cacheWriteQueue = Promise.resolve();

export class AiProfileError extends Error {
  constructor(message, { status = 502, detail = "", retryAfter = "", code = "AI_PROFILE_ERROR" } = {}) {
    super(message);
    this.name = "AiProfileError";
    this.status = status;
    this.detail = detail;
    this.retryAfter = retryAfter;
    this.code = code;
  }
}

export function normalizeProfileKey(value) {
  return String(value || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function cacheFilePath() {
  const dir = path.join(process.cwd(), ".ai-cache");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return path.join(dir, "deepseek-word-cache.json");
}

export function readProfileCache() {
  const file = cacheFilePath();
  if (!existsSync(file)) return {};

  try {
    const parsed = JSON.parse(readFileSync(file, "utf8") || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    const corruptFile = `${file}.corrupt-${Date.now()}`;
    try {
      renameSync(file, corruptFile);
    } catch {}
    throw new AiProfileError("AI profile cache is corrupted", {
      status: 500,
      code: "AI_CACHE_CORRUPT",
      detail: `The damaged cache was isolated at ${path.basename(corruptFile)}. Paid AI calls were stopped to avoid regenerating the full cache.`
    });
  }
}

export function mergeProfileCache(entries) {
  const updates = entries instanceof Map ? entries : new Map(Object.entries(entries || {}));
  cacheWriteQueue = cacheWriteQueue.then(() => {
    const file = cacheFilePath();
    const tempFile = `${file}.${process.pid}.tmp`;
    const latest = readProfileCache();
    for (const [key, value] of updates) {
      latest[key] = { ...value, cachedAt: Date.now() };
    }
    writeFileSync(tempFile, JSON.stringify(latest, null, 2), "utf8");
    renameSync(tempFile, file);
  });
  return cacheWriteQueue;
}

function cleanJsonText(value) {
  const text = String(value || "").trim();
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function escapeControlCharactersInsideJsonStrings(value) {
  const text = String(value || "");
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const code = char.charCodeAt(0);

    if (!inString) {
      output += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      output += char;
      inString = false;
      continue;
    }

    if (code < 0x20) {
      if (char === "\n") output += "\\n";
      else if (char === "\r") output += "\\r";
      else if (char === "\t") output += "\\t";
      else if (char === "\b") output += "\\b";
      else if (char === "\f") output += "\\f";
      else output += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }

    output += char;
  }

  return output;
}

export function parseAiJson(value) {
  const cleaned = cleanJsonText(value);
  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    try {
      return JSON.parse(escapeControlCharactersInsideJsonStrings(cleaned));
    } catch (secondError) {
      throw new AiProfileError("AI JSON parse failed", {
        status: 502,
        code: "AI_JSON_PARSE_FAILED",
        detail: secondError instanceof Error ? secondError.message : String(secondError)
      });
    }
  }
}

function timeoutStatus(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}

export function isUsableAiProfile(word) {
  return Boolean(
    isAiCoreContentComplete(word) &&
    Array.isArray(word?.ieltsUse) && word.ieltsUse.length &&
    Array.isArray(word?.topics) && word.topics.length &&
    word?.difficulty &&
    word?.aiContentProfile === AI_CONTENT_PROFILE_VERSION
  );
}

/** Looser gate for reading-notebook completion (does not require collocation packs). */
export function isUsableReadingAiProfile(word) {
  return Boolean(
    word?.word &&
    word?.pos &&
    word?.meaning &&
    isMeaningDetailInformative(word) &&
    word?.definition &&
    Array.isArray(word?.otherMeanings) && word.otherMeanings.every((meaning) => (
      meaning?.pos && isDetailedOtherMeaning(meaning)
    )) &&
    word?.example &&
    word?.exampleCn &&
    Array.isArray(word?.forms) &&
    Array.isArray(word?.wordFamily) &&
    Array.isArray(word?.synonyms) &&
    Array.isArray(word?.synonymDetails) &&
    hasCompleteAiSynonymDetails(word) &&
    Array.isArray(word?.ieltsUse) && word.ieltsUse.length &&
    Array.isArray(word?.topics) && word.topics.length &&
    word?.difficulty
  );
}

const CONTEXT_PROPER_NOUN_REINTERPRETATION_RE = /(?:游戏名|品牌名|人名|姓氏|地名|作品名|专有名词|video\s+game|game\s+titled|brand(?:\s+name)?|surname|given\s+name|place\s+name|work\s+title|proper\s+noun)/iu;

export function isContextProperNounReinterpretation(entry = {}, expected = {}) {
  const word = String(expected?.word || "").normalize("NFC").trim();
  const contextSentence = String(expected?.contextSentence || "").normalize("NFC");
  if (!word || !contextSentence || word !== word.toLowerCase()) return false;
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = contextSentence.match(new RegExp(`(?<![A-Za-z])${escapedWord}(?![A-Za-z])`, "giu")) || [];
  if (!matches.some((match) => match === match.toLowerCase())) return false;
  const profileText = [
    entry?.pos,
    entry?.meaning,
    entry?.meaningDetailZh,
    entry?.definition,
    entry?.category
  ].map((value) => String(value || "")).join(" ");
  return CONTEXT_PROPER_NOUN_REINTERPRETATION_RE.test(profileText);
}

export function buildProfileCacheKey(
  word,
  contextSentence = "",
  sensePriority = AI_SENSE_PRIORITY.COMMON
) {
  const wordKey = normalizeProfileKey(word);
  const priority = normalizeSensePriority(sensePriority);
  if (priority === AI_SENSE_PRIORITY.COMMON) return wordKey;
  const context = String(contextSentence || "").normalize("NFC").trim().replace(/\s+/g, " ");
  if (!context) return `${wordKey}::reading-context::no-context`;
  const contextHash = createHash("sha256").update(context, "utf8").digest("hex").slice(0, 24);
  return `${wordKey}::reading-context::${contextHash}`;
}

export function isProfileSensePriorityCompatible(profile, sensePriority = AI_SENSE_PRIORITY.COMMON) {
  const expected = normalizeSensePriority(sensePriority);
  const actual = String(profile?.aiSensePriority || "").trim();
  if (actual) return actual === expected;
  return expected === AI_SENSE_PRIORITY.COMMON
    && !profile?.readingContextReviewed
    && !String(profile?.readingContextSentence || "").trim();
}

/** Accept legacy rich cache entries as well as the new G-main profile. */
export function isUsableGMainAiProfile(word) {
  return Boolean(
    isUsableAiProfile(word) ||
    (
      word?.aiProfileKind === AI_PROFILE_KIND.G_MAIN &&
      isAiGMainContentComplete(word)
    )
  );
}

/** Common-sense review has no per-sense or primary example requirement. */
export function isUsableMeaningCoverageAiProfile(word) {
  // Use the same strict definition for cache selection and final write-back.
  // A merely non-empty gloss must be regenerated instead of creating an
  // endless cache-hit → validation-failed loop.
  return isMeaningCoverageProfileUsable(word, word?.word);
}

export function describeUnusableAiProfile(word) {
  const reasons = [];
  if (!word?.word) reasons.push("missing word");
  if (!word?.pos) reasons.push("missing pos");
  if (!word?.meaning) reasons.push("missing meaning");
  if (!word?.meaningDetailZh) reasons.push("missing meaningDetailZh");
  if (!word?.definition) reasons.push("missing definition");
  if (!word?.example) reasons.push("missing example");
  if (!word?.exampleCn) reasons.push("missing exampleCn");
  if (!Array.isArray(word?.otherMeanings)) reasons.push("missing otherMeanings");
  if (!Array.isArray(word?.forms)) reasons.push("missing forms");
  if (!Array.isArray(word?.wordFamily)) reasons.push("missing wordFamily");
  if (!Array.isArray(word?.synonyms)) reasons.push("missing synonyms");
  if (!Array.isArray(word?.synonymDetails) || !hasCompleteAiSynonymDetails(word)) {
    reasons.push("missing synonymDetails");
  }
  if (!Array.isArray(word?.ieltsUse) || !word.ieltsUse.length) reasons.push("missing ieltsUse");
  if (!Array.isArray(word?.topics) || !word.topics.length) reasons.push("missing topics");
  if (!word?.difficulty) reasons.push("missing difficulty");
  if (word?.aiContentProfile !== AI_CONTENT_PROFILE_VERSION) {
    reasons.push(`profile version ${word?.aiContentProfile || "(none)"}`);
  }
  if (!isAiCoreContentComplete(word)) reasons.push("core/collocation incomplete");
  return reasons;
}

/**
 * Accept AI-corrected headwords for common OCR/import typos, e.g. "ncestors" → "ancestors".
 */
export function isNearMissHeadword(expected, returned) {
  const a = normalizeProfileKey(expected);
  const b = normalizeProfileKey(returned);
  if (!a || !b || a === b) return a === b;
  if (a.length < 4 || b.length < 4) return false;
  // Missing/extra first letter: ncestors / ancestors
  if (a.slice(1) === b || b.slice(1) === a) return true;
  if (a.slice(0, -1) === b || b.slice(0, -1) === a) return true;
  // Small edit distance for similar length
  if (Math.abs(a.length - b.length) > 2) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 2) return false;
    if (a.length === b.length) {
      i += 1;
      j += 1;
    } else if (a.length > b.length) {
      i += 1;
    } else {
      j += 1;
    }
  }
  edits += (a.length - i) + (b.length - j);
  return edits <= 2;
}

function addUsage(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (Number.isFinite(Number(value)) && Number.isFinite(Number(merged[key]))) {
      merged[key] = Number(merged[key]) + Number(value);
    } else if (merged[key] === undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

async function requestProfileBatch(items, {
  timeoutMs,
  maxTokens,
  profileQuality = "full",
  profileKind = AI_PROFILE_KIND.FULL,
  sensePriority = AI_SENSE_PRIORITY.COMMON
}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  if (!apiKey) {
    throw new AiProfileError("Missing DEEPSEEK_API_KEY", {
      status: 500,
      code: "AI_API_KEY_MISSING",
      detail: "Configure the server-side DeepSeek API key before running paid AI tools."
    });
  }

  let response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: AI_VOCAB_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildAiWordProfilePrompt(items, { profileKind, sensePriority })
          }
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        stream: false
      })
    });
  } catch (error) {
    if (timeoutStatus(error)) {
      throw new AiProfileError("DeepSeek API request timed out", {
        status: 504,
        code: "AI_TIMEOUT",
        detail: `No response within ${Math.round(timeoutMs / 1000)} seconds.`
      });
    }
    throw new AiProfileError("DeepSeek API request failed", {
      status: 502,
      code: "AI_NETWORK_ERROR",
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  const raw = await response.text();
  if (!response.ok) {
    const upstreamStatus = Number(response.status) || 502;
    throw new AiProfileError("DeepSeek API request failed", {
      status: [429, 502, 503, 504].includes(upstreamStatus) ? upstreamStatus : 502,
      code: "AI_UPSTREAM_ERROR",
      detail: raw,
      retryAfter: response.headers.get("retry-after") || ""
    });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new AiProfileError("DeepSeek response envelope is invalid", {
      status: 502,
      code: "AI_ENVELOPE_PARSE_FAILED",
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  if (!String(content || "").trim()) {
    throw new AiProfileError("DeepSeek returned empty content", {
      status: 502,
      code: "AI_EMPTY_CONTENT"
    });
  }
  if (choice?.finish_reason === "length") {
    throw new AiProfileError("DeepSeek output was truncated", {
      status: 502,
      code: "AI_OUTPUT_TRUNCATED",
      detail: "finish_reason=length"
    });
  }

  const data = parseAiJson(content);
  const rawItems = items.length === 1
    ? [Array.isArray(data?.items) ? data.items[0] : data]
    : (Array.isArray(data?.items) ? data.items : []);
  const rawByInputId = new Map();

  for (const rawItem of rawItems) {
    const inputId = String(rawItem?.input_id || rawItem?.inputId || "").trim();
    if (inputId && !rawByInputId.has(inputId)) rawByInputId.set(inputId, rawItem);
  }

  const quality = profileQuality === "reading" ? "reading" : "full";
  const resolved = new Map();
  const invalid = [];
  for (const expected of items) {
    const rawItem = items.length === 1 ? rawItems[0] : rawByInputId.get(expected.inputId);
    const returnedWord = String(rawItem?.word || "").trim();
    const expectedKey = normalizeProfileKey(expected.word);
    const returnedKey = normalizeProfileKey(returnedWord);
    const exactMatch = Boolean(rawItem && returnedKey && returnedKey === expectedKey);
    const nearMiss = Boolean(rawItem && returnedKey && isNearMissHeadword(expected.word, returnedWord));

    if (!rawItem || (!exactMatch && !nearMiss)) {
      invalid.push({
        inputId: expected.inputId,
        word: expected.word,
        reason: rawItem ? `word mismatch: ${returnedWord || "(empty)"}` : "missing input_id"
      });
      continue;
    }

    // Prefer AI-corrected spelling for near-miss OCR/import typos.
    const canonicalWord = nearMiss && !exactMatch ? returnedWord : expected.word;
    const entry = normalizeAiGeneratedEntry(rawItem, canonicalWord);
    entry.aiProfileKind = profileKind;
    entry.aiSensePriority = sensePriority;
    const contextSentence = String(expected.contextSentence || "").trim();
    if (contextSentence && sensePriority === AI_SENSE_PRIORITY.CONTEXT) {
      // The reading source is authoritative for the example.  Keeping it
      // verbatim also prevents a cached/global sense from replacing the sense
      // the learner actually met in the passage.
      entry.example = contextSentence;
      entry.readingContextSentence = contextSentence;
      entry.readingContextLabel = String(expected.contextLabel || "").trim();
      entry.readingContextReviewed = true;
    }
    if (nearMiss && !exactMatch) {
      entry.word = canonicalWord;
      entry.correctedFrom = expected.word;
    }

    if (
      sensePriority === AI_SENSE_PRIORITY.CONTEXT
      && isContextProperNounReinterpretation(entry, expected)
    ) {
      invalid.push({
        inputId: expected.inputId,
        word: expected.word,
        reason: "contextual lowercase token was incorrectly reinterpreted as a proper noun"
      });
      continue;
    }

    const usable = profileKind === AI_PROFILE_KIND.G_MAIN
      ? isUsableGMainAiProfile(entry)
      : profileKind === AI_PROFILE_KIND.MEANING_COVERAGE
        ? isUsableMeaningCoverageAiProfile(entry)
        : quality === "reading"
          ? isUsableReadingAiProfile(entry)
          : isUsableAiProfile(entry);
    const requestedSynonyms = normalizeAiSynonyms(expected.requestedSynonyms, canonicalWord);
    const returnedSynonymKeys = new Set(
      normalizeAiSynonyms(entry.synonyms, canonicalWord).map(synonymEquivalenceKey)
    );
    const keptRequestedSynonyms = requestedSynonyms.every(
      (word) => returnedSynonymKeys.has(synonymEquivalenceKey(word))
    ) && returnedSynonymKeys.size === requestedSynonyms.length;
    const mustKeepRequestedSynonyms = requestedSynonyms.length > 0
      && !contextSentence
      && sensePriority === AI_SENSE_PRIORITY.CONTEXT;
    const coversDeclaredPos = isAiProfileCompatibleWithDeclaredPos(entry, expected.existingPos);
    if (!usable || !coversDeclaredPos || (mustKeepRequestedSynonyms && !keptRequestedSynonyms)) {
      const reasons = profileKind === AI_PROFILE_KIND.MEANING_COVERAGE
        ? [describeMeaningCoverageProfileIssue(entry, canonicalWord)]
        : describeUnusableAiProfile(entry);
      invalid.push({
        inputId: expected.inputId,
        word: expected.word,
        reason: `incomplete or invalid profile (${!coversDeclaredPos
          ? `declared POS not fully covered: ${expected.existingPos || "(empty)"}`
          : mustKeepRequestedSynonyms && !keptRequestedSynonyms
            ? "requested synonyms changed"
            : reasons.slice(0, 4).join(", ") || "unknown"})`
      });
      continue;
    }
    resolved.set(expected.inputId, entry);
  }

  return { entries: resolved, invalid, usage: payload?.usage || null };
}

function isSplittableContentError(error) {
  return [
    "AI_JSON_PARSE_FAILED",
    "AI_OUTPUT_TRUNCATED",
    "AI_EMPTY_CONTENT"
  ].includes(error?.code);
}

async function resolveProfiles(items, options, depth = 0) {
  const requestedDepth = Number(options.maxSplitDepth);
  const maxDepth = Number.isFinite(requestedDepth)
    ? Math.max(0, Math.trunc(requestedDepth))
    : 6;
  let batchResult;

  try {
    batchResult = await requestProfileBatch(items, options);
  } catch (error) {
    if (items.length > 1 && depth < maxDepth && isSplittableContentError(error)) {
      const midpoint = Math.ceil(items.length / 2);
      const left = await resolveProfiles(items.slice(0, midpoint), options, depth + 1);
      const right = await resolveProfiles(items.slice(midpoint), options, depth + 1);
      return {
        entries: new Map([...left.entries, ...right.entries]),
        invalid: [...left.invalid, ...right.invalid],
        usage: addUsage(left.usage, right.usage)
      };
    }
    if (items.length === 1 && isSplittableContentError(error)) {
      return {
        entries: new Map(),
        invalid: [{
          inputId: items[0].inputId,
          word: items[0].word,
          reason: `${error.code}: ${error.detail || error.message}`
        }],
        usage: null
      };
    }
    throw error;
  }

  if (!batchResult.invalid.length || items.length === 1 || depth >= maxDepth) {
    return batchResult;
  }

  const invalidIds = new Set(batchResult.invalid.map((item) => item.inputId));
  const unresolvedItems = items.filter((item) => invalidIds.has(item.inputId));
  if (!unresolvedItems.length) return batchResult;

  const recovered = await resolveProfiles(unresolvedItems, options, depth + 1);
  const recoveredIds = new Set(recovered.entries.keys());
  return {
    entries: new Map([...batchResult.entries, ...recovered.entries]),
    invalid: recovered.invalid.filter((item) => !recoveredIds.has(item.inputId)),
    usage: addUsage(batchResult.usage, recovered.usage)
  };
}

export async function requestDeepseekProfiles(inputItems, {
  timeoutMs = 75000,
  maxTokens = 14000,
  maxSplitDepth = 6,
  profileQuality = "full",
  profileKind = AI_PROFILE_KIND.FULL,
  sensePriority
} = {}) {
  const items = inputItems.map((item, index) => ({
    inputId: String(item.inputId || `item-${index + 1}`),
    word: String(item.word || "").trim(),
    requestedSynonyms: normalizeAiSynonyms(item.requestedSynonyms, item.word),
    existingMeaning: String(item.existingMeaning || item.existing_primary_meaning || "").trim(),
    existingPos: String(item.existingPos || item.existing_part_of_speech || "").trim(),
    contextSentence: String(item.contextSentence || "").trim(),
    contextLabel: String(item.contextLabel || "").trim()
  }));

  const kind = Object.values(AI_PROFILE_KIND).includes(profileKind)
    ? profileKind
    : AI_PROFILE_KIND.FULL;
  const priority = normalizeSensePriority(
    sensePriority || (profileQuality === "reading"
      ? AI_SENSE_PRIORITY.CONTEXT
      : AI_SENSE_PRIORITY.COMMON)
  );
  return resolveProfiles(items, {
    timeoutMs,
    maxTokens,
    maxSplitDepth,
    profileQuality,
    profileKind: kind,
    sensePriority: priority
  });
}
