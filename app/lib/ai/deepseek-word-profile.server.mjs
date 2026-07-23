import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import {
  AI_CONTENT_PROFILE_VERSION,
  isAiCoreContentComplete,
  normalizeAiGeneratedEntry
} from "../vocab/admin-ai-content-profile.mjs";
import {
  AI_VOCAB_SYSTEM_PROMPT,
  buildAiWordProfilePrompt
} from "./vocab-profile-prompt.mjs";

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

async function requestProfileBatch(items, { timeoutMs, maxTokens }) {
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
          { role: "user", content: buildAiWordProfilePrompt(items) }
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

  const resolved = new Map();
  const invalid = [];
  for (const expected of items) {
    const rawItem = items.length === 1 ? rawItems[0] : rawByInputId.get(expected.inputId);
    const returnedWord = String(rawItem?.word || "").trim();
    if (!rawItem || normalizeProfileKey(returnedWord) !== normalizeProfileKey(expected.word)) {
      invalid.push({
        inputId: expected.inputId,
        word: expected.word,
        reason: rawItem ? `word mismatch: ${returnedWord || "(empty)"}` : "missing input_id"
      });
      continue;
    }

    const entry = normalizeAiGeneratedEntry(rawItem, expected.word);
    if (!isUsableAiProfile(entry)) {
      invalid.push({
        inputId: expected.inputId,
        word: expected.word,
        reason: "incomplete or invalid profile"
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
  const maxDepth = Math.max(1, Number(options.maxSplitDepth) || 6);
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
  maxSplitDepth = 6
} = {}) {
  const items = inputItems.map((item, index) => ({
    inputId: String(item.inputId || `item-${index + 1}`),
    word: String(item.word || "").trim()
  }));

  return resolveProfiles(items, { timeoutMs, maxTokens, maxSplitDepth });
}
