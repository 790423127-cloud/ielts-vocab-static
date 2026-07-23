import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import {
  isAiContentProfileComplete,
  normalizeAiGeneratedEntry
} from "../vocab/admin-ai-content-profile.mjs";
import {
  AI_VOCAB_SYSTEM_PROMPT,
  buildAiWordProfilePrompt
} from "./vocab-profile-prompt.mjs";

let cacheWriteQueue = Promise.resolve();

export class AiProfileError extends Error {
  constructor(message, { status = 502, detail = "", retryAfter = "" } = {}) {
    super(message);
    this.name = "AiProfileError";
    this.status = status;
    this.detail = detail;
    this.retryAfter = retryAfter;
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
  try {
    const file = cacheFilePath();
    if (!existsSync(file)) return {};
    const parsed = JSON.parse(readFileSync(file, "utf8") || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
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

function timeoutStatus(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}

export async function requestDeepseekProfiles(inputItems, {
  timeoutMs = 75000,
  maxTokens = 14000
} = {}) {
  const items = inputItems.map((item, index) => ({
    inputId: String(item.inputId || `item-${index + 1}`),
    word: String(item.word || "").trim()
  }));
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  if (!apiKey) {
    throw new AiProfileError("Missing DEEPSEEK_API_KEY", {
      status: 500,
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
        detail: `No response within ${Math.round(timeoutMs / 1000)} seconds. This request was not retried automatically.`
      });
    }
    throw new AiProfileError("DeepSeek API request failed", {
      status: 502,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new AiProfileError("DeepSeek API request failed", {
      status: response.status === 429 ? 429 : 502,
      detail: raw,
      retryAfter: response.headers.get("retry-after") || ""
    });
  }

  let payload;
  let data;
  try {
    payload = JSON.parse(raw);
    const content = payload?.choices?.[0]?.message?.content;
    if (!String(content || "").trim()) throw new Error("DeepSeek returned empty content");
    data = JSON.parse(cleanJsonText(content));
  } catch (error) {
    throw new AiProfileError("AI JSON parse failed", {
      status: 502,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

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
    if (!isAiContentProfileComplete(entry)) {
      invalid.push({
        inputId: expected.inputId,
        word: expected.word,
        reason: "incomplete or invalid profile"
      });
      continue;
    }
    resolved.set(expected.inputId, entry);
  }

  return {
    entries: resolved,
    invalid,
    usage: payload?.usage || null
  };
}
