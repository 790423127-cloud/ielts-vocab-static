export const runtime = "nodejs";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";
import {
  isAiContentProfileComplete,
  normalizeAiGeneratedEntry,
  withAiClientCollocationPayload
} from "../../lib/vocab/admin-ai-content-profile.mjs";

const DEEPSEEK_TIMEOUT_MS = 75000;
const MAX_BATCH_WORDS = 10;

function isDeepSeekTimeout(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}

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
  writeFileSync(cachePath(), JSON.stringify(cache, null, 2), "utf-8");
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

function buildPrompt(words) {
  return `
请为下面这些英文词条批量生成 IELTS General Training 刷词资料。每个输入词必须返回一个对象，顺序必须与输入顺序一致。

每个词条规则：
1. chinese_meaning：只写最常用、最适合 IELTS G 类的主释义，不要堆叠多个义项。
2. main_meaning_detail_zh：只详细解释主释义，用自然中文写 1 句。
3. english_definition：只解释主释义，简短自然。
4. other_meanings：0-5 个其他真实义项，只写简短中文；可包括有 IELTS 阅读价值的次常见/生僻义，但禁止古义、重复义和猜测义。
5. 每个单词只生成 1 个英文例句和 1 个中文翻译，例句体现主释义。
6. forms：0-5 个真实语法变形。type 只允许 plural、irregular plural、third-person singular、past tense、past participle、past tense / past participle、present participle / gerund、comparative、superlative。若输入本身是变形、短语、专有名词或不适用，返回空数组。禁止二次复数和虚构词形。
7. word_family：0-6 个常用直接词族。relation 只允许 base-word、noun-form、verb-form、adjective-form、adverb-form、agent-noun、negative-form、related-to。禁止拼写相似但无词族关系的词。
8. common_collocations：必须给恰好 4 个真正属于当前词条主用法、对 IELTS Listening、Reading、Speaking、G类书信或 Task 2 有学习价值的常见搭配，每个都带简洁中文。
9. phrase_collocations：必须给恰好 4 个包含当前词条或其真实语法变形的固定结构、介词搭配或常见句型，每个都带简洁中文。
10. 两类搭配都必须至少包含 2 个英文单词，彼此不重复；禁止只返回当前单词，禁止 huh?、oh、wow、yeah、um、uh 等语气词，禁止问句、占位符、乱码、纯符号和其他词族成员的无关搭配。
11. ielts_use 从 Listening, Speaking, Reading, G类书信, Task 2, 生活高频, 工作高频 中选 1-3 个。
12. topics 从 教育, 工作, 住房, 交通, 健康, 环境, 科技, 政府, 社会, 消费, 旅行, 社区, 法律, 家庭, 公共服务 中选 1-3 个。
13. difficulty 只能是 基础高频、中级核心、高级加分、低频认识即可。
14. 只输出 JSON，不要 markdown，不要解释。

输出格式：
{
  "items": [
    {
      "word": "string",
      "phonetic": "string",
      "part_of_speech": "string",
      "chinese_meaning": "string",
      "main_meaning_detail_zh": "string",
      "english_definition": "string",
      "other_meanings": ["string"],
      "ielts_example": "string",
      "example_chinese": "string",
      "forms": [{"word": "string", "type": "string", "note": "string"}],
      "word_family": [{"word": "string", "pos": "string", "meaningZh": "string", "relation": "string"}],
      "common_collocations": [{"phrase": "string", "chinese": "string"}],
      "phrase_collocations": [{"phrase": "string", "chinese": "string"}],
      "ielts_use": ["string"],
      "topics": ["string"],
      "difficulty": "string",
      "category": "string"
    }
  ]
}

单词列表：
${JSON.stringify(words)}
`.trim();
}

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    const { words, force = false } = await req.json();
    if (!Array.isArray(words)) return Response.json({ error: "words must be an array" }, { status: 400 });

    const cleanWords = words.map((word) => String(word || "").trim()).filter(Boolean).slice(0, MAX_BATCH_WORDS);
    if (!cleanWords.length) return Response.json({ items: [], stats: { cacheHit: 0, deepseek: 0, invalid: 0 } });

    const cache = readCache();
    const resolvedByInputKey = new Map();
    const toGenerate = [];
    let cacheHit = 0;

    for (const word of cleanWords) {
      const inputKey = normalizeKey(word);
      const cached = cache[inputKey];
      if (!force && isAiContentProfileComplete(cached)) {
        resolvedByInputKey.set(inputKey, {
          ...withAiClientCollocationPayload({ ...cached, word: cached.word || word }),
          aiReplaceExisting: false,
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
        items: cleanWords.map((word) => resolvedByInputKey.get(normalizeKey(word))).filter(Boolean),
        stats: { cacheHit, deepseek: 0, invalid: 0 }
      });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
    if (!apiKey) {
      return Response.json({ error: "Missing DEEPSEEK_API_KEY. Please configure your DeepSeek API key first." }, { status: 500 });
    }

    const deepseekRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "你是严谨的 IELTS General Training 英语词库编辑。只返回可解析 JSON，不制造不存在的词义、词形、词族或搭配。" },
          { role: "user", content: buildPrompt(toGenerate) }
        ],
        temperature: 0.1,
        max_tokens: 14000,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        stream: false
      })
    });

    const raw = await deepseekRes.text();
    if (!deepseekRes.ok) {
      return Response.json({ error: "DeepSeek API request failed", status: deepseekRes.status, detail: raw }, { status: 502 });
    }

    let payload;
    let data;
    try {
      payload = JSON.parse(raw);
      const content = payload?.choices?.[0]?.message?.content || "";
      if (!content.trim()) throw new Error("DeepSeek returned empty content");
      data = JSON.parse(cleanJsonText(content));
    } catch (error) {
      return Response.json({ error: "AI JSON parse failed", detail: error.message }, { status: 502 });
    }

    const rawItems = Array.isArray(data.items) ? data.items : [];
    let generatedCount = 0;
    let invalid = 0;

    toGenerate.forEach((fallbackWord, index) => {
      const inputKey = normalizeKey(fallbackWord);
      const entry = normalizeAiGeneratedEntry(rawItems[index] || {}, fallbackWord);
      if (!isAiContentProfileComplete(entry)) {
        invalid += 1;
        return;
      }
      generatedCount += 1;
      const resolved = {
        ...withAiClientCollocationPayload(entry),
        aiReplaceExisting: Boolean(force),
        cacheHit: false,
        source: "deepseek"
      };
      resolvedByInputKey.set(inputKey, resolved);
      cache[inputKey] = { ...entry, cachedAt: Date.now() };
    });

    if (generatedCount) writeCache(cache);

    return Response.json({
      items: cleanWords.map((word) => resolvedByInputKey.get(normalizeKey(word))).filter(Boolean),
      stats: {
        cacheHit,
        deepseek: generatedCount,
        invalid,
        requested: toGenerate.length,
        usage: payload?.usage || null
      }
    });
  } catch (error) {
    if (isDeepSeekTimeout(error)) {
      return Response.json({ error: "DeepSeek API request timed out", detail: "The AI service did not respond within 75 seconds. The request will not be retried automatically." }, { status: 504 });
    }
    return Response.json({ error: "Server error", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
