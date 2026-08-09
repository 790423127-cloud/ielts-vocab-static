import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AiProfileError,
  normalizeProfileKey
} from "./deepseek-word-profile.server.mjs";
import {
  normalizeReadingGSynonymDetails,
  normalizeReadingGSynonyms
} from "../reading-g-vocab/synonym-relations.mjs";

let cacheWriteQueue = Promise.resolve();

function cacheFilePath() {
  const dir = path.join(process.cwd(), ".ai-cache");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return path.join(dir, "reading-g-synonym-cache.json");
}

export function readReadingGSynonymCache() {
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
    throw new AiProfileError("G-reading synonym cache is corrupted", {
      status: 500,
      code: "AI_SYNONYM_CACHE_CORRUPT",
      detail: `The damaged cache was isolated at ${path.basename(corruptFile)}.`
    });
  }
}

export function mergeReadingGSynonymCache(entries) {
  const updates = entries instanceof Map ? entries : new Map(Object.entries(entries || {}));
  cacheWriteQueue = cacheWriteQueue.then(() => {
    const file = cacheFilePath();
    const temporaryFile = `${file}.${process.pid}.tmp`;
    const latest = readReadingGSynonymCache();
    for (const [key, value] of updates) {
      latest[key] = { ...value, cachedAt: Date.now() };
    }
    writeFileSync(temporaryFile, JSON.stringify(latest, null, 2), "utf8");
    renameSync(temporaryFile, file);
  });
  return cacheWriteQueue;
}

function timeoutStatus(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}

function reviewPrompt(items) {
  return [
    "Return JSON only: {\\\"items\\\":[{\\\"input_id\\\":\\\"string\\\",\\\"word\\\":\\\"string\\\",\\\"synonyms\\\":[{\\\"word\\\":\\\"string\\\",\\\"pos\\\":\\\"string\\\",\\\"meaning_zh\\\":\\\"string\\\"}]}]}",
    "For each IELTS reading word or phrase, return 0-4 common direct replacements for its supplied primary sense.",
    "A replacement must be able to replace the input in that sense. Do not include related words, word-family forms, antonyms, the input itself, spelling/case/hyphen variants, British/American variants, or loose contextual associates. For a single-word input, return single-word replacements only. For a phrase or expression input, a direct common replacement may be a word or a phrase.",
    "Every returned synonym must include its English part of speech and concise Chinese meaning for the current sense. Use an empty array if no safe common replacement with reliable Chinese meaning exists. Never add filler to reach four. Echo input_id and word exactly.",
    "Items:",
    JSON.stringify(items.map((item) => ({
      input_id: item.inputId,
      word: item.word,
      entry_type: item.entryType || "word",
      part_of_speech: item.pos || "",
      primary_meaning_zh: item.meaning || ""
    })))
  ].join("\n");
}

export async function requestDeepseekSynonymReviews(inputItems, {
  timeoutMs = 90000,
  maxTokens = 6000
} = {}) {
  const items = inputItems.map((item, index) => ({
    inputId: String(item?.inputId || `item-${index + 1}`).trim(),
    word: String(item?.word || "").trim(),
    entryType: String(item?.entryType || "word").trim(),
    pos: String(item?.pos || "").trim(),
    meaning: String(item?.meaning || item?.primaryMeaningZh || "").trim()
  })).filter((item) => item.inputId && item.word);
  if (!items.length) return { entries: new Map(), invalid: [], usage: null };

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
          { role: "system", content: "You are a precise English lexicographer for IELTS reading." },
          { role: "user", content: reviewPrompt(items) }
        ],
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        stream: false
      })
    });
  } catch (error) {
    if (timeoutStatus(error)) {
      throw new AiProfileError("DeepSeek synonym request timed out", {
        status: 504,
        code: "AI_TIMEOUT",
        detail: `No response within ${Math.round(timeoutMs / 1000)} seconds.`
      });
    }
    throw new AiProfileError("DeepSeek synonym request failed", {
      status: 502,
      code: "AI_NETWORK_ERROR",
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  const raw = await response.text();
  if (!response.ok) {
    const status = Number(response.status) || 502;
    throw new AiProfileError("DeepSeek synonym request failed", {
      status: [429, 502, 503, 504].includes(status) ? status : 502,
      code: "AI_UPSTREAM_ERROR",
      detail: raw,
      retryAfter: response.headers.get("retry-after") || ""
    });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
    const content = String(payload?.choices?.[0]?.message?.content || "").trim();
    payload = JSON.parse(content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim());
  } catch (error) {
    throw new AiProfileError("DeepSeek synonym response is invalid", {
      status: 502,
      code: "AI_JSON_PARSE_FAILED",
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  const returnedItems = Array.isArray(payload?.items) ? payload.items : [];
  const byInputId = new Map();
  for (const item of returnedItems) {
    const inputId = String(item?.input_id || item?.inputId || "").trim();
    if (inputId && !byInputId.has(inputId)) byInputId.set(inputId, item);
  }
  const entries = new Map();
  const invalid = [];
  for (const expected of items) {
    const returned = byInputId.get(expected.inputId);
    if (!returned || normalizeProfileKey(returned.word) !== normalizeProfileKey(expected.word)) {
      invalid.push({
        inputId: expected.inputId,
        word: expected.word,
        reason: returned ? `word mismatch: ${returned.word || "(empty)"}` : "missing input_id"
      });
      continue;
    }
    if (!Array.isArray(returned.synonyms)) {
      invalid.push({
        inputId: expected.inputId,
        word: expected.word,
        reason: "missing synonyms array"
      });
      continue;
    }
    const synonyms = normalizeReadingGSynonyms(returned.synonyms, expected.word);
    const synonymDetails = normalizeReadingGSynonymDetails(
      returned.synonyms.map((detail) => ({
        ...detail,
        meaningZh: detail?.meaning_zh || detail?.meaningZh || detail?.meaning
      })),
      expected.word,
      synonyms
    );
    const incompleteDetails = synonymDetails.filter((detail) => !detail.pos || !detail.meaningZh);
    if (incompleteDetails.length) {
      invalid.push({
        inputId: expected.inputId,
        word: expected.word,
        reason: `synonym Chinese meanings incomplete: ${incompleteDetails.map((detail) => detail.word).join(", ")}`
      });
      continue;
    }
    entries.set(expected.inputId, {
      word: expected.word,
      synonyms,
      synonymDetails
    });
  }
  return { entries, invalid, usage: payload?.usage || null };
}
