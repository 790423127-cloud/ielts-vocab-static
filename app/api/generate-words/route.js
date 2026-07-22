export const runtime = "nodejs";

import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";

const DEEPSEEK_TIMEOUT_MS = 45000;

function isDeepSeekTimeout(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

function ensureCacheDir() {
  const dir = path.join(process.cwd(), ".ai-cache");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function cachePath() {
  return path.join(ensureCacheDir(), "deepseek-word-cache.json");
}

function readCache() {
  try {
    const file = cachePath();
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, "utf-8") || "{}");
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    writeFileSync(cachePath(), JSON.stringify(cache, null, 2), "utf-8");
  } catch {}
}

function cleanJsonText(text) {
  if (!text) return "{}";
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhraseList(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return { phrase: item, chinese: "" };

      return {
        phrase: item?.phrase || item?.collocation || item?.text || "",
        chinese: item?.chinese || item?.meaning || item?.translation || ""
      };
    })
    .filter((item) => item.phrase)
    .slice(0, 3);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3);
}

function normalizeEntry(entry, fallbackWord) {
  return {
    word: entry.word || fallbackWord || "",
    phonetic: entry.phonetic || "",
    pos: entry.part_of_speech || entry.pos || "",
    meaning: entry.chinese_meaning || entry.meaning || "",
    definition: entry.english_definition || entry.definition || "",
    example: entry.ielts_example || entry.example || "",
    exampleCn: entry.example_chinese || entry.exampleCn || "",
    collocations: normalizePhraseList(entry.common_collocations || entry.collocations || entry.commonCollocations),
    phraseCollocations: normalizePhraseList(entry.phrase_collocations || entry.phraseCollocations || entry.prepositional_phrases),
    ieltsUse: normalizeStringArray(entry.ielts_use || entry.ieltsUse),
    topics: normalizeStringArray(entry.topics || entry.topic),
    difficulty: entry.difficulty || "中级核心",
    category: entry.category ? `IELTS G类 · ${entry.category}` : "IELTS G类",
    aiGenerated: true,
    generatedAt: new Date().toISOString()
  };
}

function isCompleteEntry(entry) {
  return Boolean(
    entry?.pos &&
    entry?.meaning &&
    entry?.definition &&
    entry?.example &&
    entry?.exampleCn &&
    Array.isArray(entry?.collocations) &&
    entry.collocations.length &&
    Array.isArray(entry?.phraseCollocations) &&
    entry.phraseCollocations.length &&
    Array.isArray(entry?.ieltsUse) &&
    entry.ieltsUse.length &&
    Array.isArray(entry?.topics) &&
    entry.topics.length &&
    entry?.difficulty
  );
}

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    const { words, force = false } = await req.json();

    if (!Array.isArray(words)) {
      return Response.json({ error: "words must be an array" }, { status: 400 });
    }

    const cleanWords = words
      .map((word) => String(word || "").trim())
      .filter(Boolean)
      .slice(0, 100);

    if (!cleanWords.length) {
      return Response.json({ items: [], stats: { cacheHit: 0, deepseek: 0 } });
    }

    const cache = readCache();
    const cachedItems = [];
    const toGenerate = [];
    let cacheHit = 0;

    for (const word of cleanWords) {
      const key = normalizeKey(word);
      const cached = cache[key];

      if (!force && isCompleteEntry(cached)) {
        cachedItems.push({
          ...cached,
          word: cached.word || word,
          cacheHit: true,
          source: "ai-cache"
        });
        cacheHit += 1;
      } else {
        toGenerate.push(word);
      }
    }

    if (!toGenerate.length) {
      return Response.json({
        items: cachedItems,
        stats: {
          cacheHit,
          deepseek: 0
        }
      });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

    if (!apiKey) {
      return Response.json(
        { error: "Missing DEEPSEEK_API_KEY. Please configure your DeepSeek API key first." },
        { status: 500 }
      );
    }

    const prompt = `
请为下面这些英文单词批量生成 IELTS General Training 刷词词条。

要求：
1. 每个输入单词都必须返回一个对象。
2. 输出顺序尽量和输入顺序一致。
3. 中文释义简洁。
4. 英文释义简短。
5. 例句必须短，适合 IELTS General Training 场景。
6. common_collocations 给 2-3 个常见搭配，每个带中文。
7. phrase_collocations 给 2-3 个短语/介词搭配，每个带中文。
8. ielts_use 从这些选 1-3 个：Listening, Speaking, Reading, G类书信, Task 2, 生活高频, 工作高频。
9. topics 从这些选 1-3 个：教育, 工作, 住房, 交通, 健康, 环境, 科技, 政府, 社会, 消费, 旅行, 社区, 法律, 家庭, 公共服务。
10. difficulty 只能选一个：基础高频, 中级核心, 高级加分, 低频认识即可。
11. 为了速度，内容要简洁，不要长解释。
12. 只输出 JSON，不要 markdown，不要解释。

输出格式：
{
  "items": [
    {
      "word": "string",
      "phonetic": "string",
      "part_of_speech": "string",
      "chinese_meaning": "string",
      "english_definition": "string",
      "ielts_example": "string",
      "example_chinese": "string",
      "common_collocations": [
        {"phrase": "string", "chinese": "string"}
      ],
      "phrase_collocations": [
        {"phrase": "string", "chinese": "string"}
      ],
      "ielts_use": ["string"],
      "topics": ["string"],
      "difficulty": "string",
      "category": "string"
    }
  ]
}

单词列表：
${JSON.stringify(toGenerate)}
`.trim();

    const deepseekRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS),
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "你是专业 IELTS General Training 英语词库编辑。你只返回可解析 JSON。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.15,
        max_tokens: 24000,
        response_format: { type: "json_object" },
        stream: false
      })
    });

    const raw = await deepseekRes.text();

    if (!deepseekRes.ok) {
      return Response.json(
        {
          error: "DeepSeek API request failed",
          status: deepseekRes.status,
          detail: raw
        },
        { status: 500 }
      );
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return Response.json(
        {
          error: "DeepSeek returned non-JSON response",
          detail: raw.slice(0, 1000)
        },
        { status: 500 }
      );
    }

    const content = payload?.choices?.[0]?.message?.content || "{}";

    let data;
    try {
      data = JSON.parse(cleanJsonText(content));
    } catch {
      return Response.json(
        {
          error: "AI JSON parse failed",
          detail: content.slice(0, 1200)
        },
        { status: 500 }
      );
    }

    const generatedItems = Array.isArray(data.items)
      ? data.items.map((entry, index) => normalizeEntry(entry, toGenerate[index])).filter((entry) => entry.word)
      : [];

    for (const entry of generatedItems) {
      const key = normalizeKey(entry.word);
      cache[key] = {
        ...entry,
        cachedAt: Date.now()
      };
    }

    writeCache(cache);

    return Response.json({
      items: [
        ...cachedItems,
        ...generatedItems.map((entry) => ({
          ...entry,
          cacheHit: false,
          source: "deepseek"
        }))
      ],
      stats: {
        cacheHit,
        deepseek: generatedItems.length
      }
    });
  } catch (error) {
    if (isDeepSeekTimeout(error)) {
      return Response.json(
        { error: "DeepSeek API request timed out", detail: "The AI service did not respond within 45 seconds." },
        { status: 504 }
      );
    }
    return Response.json(
      {
        error: "Server error",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
