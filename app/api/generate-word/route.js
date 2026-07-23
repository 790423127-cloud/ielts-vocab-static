export const runtime = "nodejs";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";
import {
  isAiContentProfileComplete,
  normalizeAiGeneratedEntry
} from "../../lib/vocab/admin-ai-content-profile.mjs";

const DEEPSEEK_TIMEOUT_MS = 60000;

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

function buildPrompt(cleanWord) {
  return `
请为英文词条 "${cleanWord}" 生成一个 IELTS General Training 刷词词条。

内容规则：
1. chinese_meaning 只写最常用、最适合 IELTS G 类的主释义，保持简洁，不要把多个义项全塞在这里。
2. main_meaning_detail_zh 只详细解释主释义，用自然中文写 1 句，不解释其他义项。
3. english_definition 只解释主释义，简短自然。
4. other_meanings 列出 0-5 个其他真实义项，只写简短中文。包括常见义，以及对 IELTS 阅读有价值的次常见/生僻义；禁止重复主释义，禁止古义和猜测义。
5. 全词只生成 1 个英文例句和 1 个中文翻译。例句必须体现主释义，短、自然、适合 IELTS General Training。
6. forms 给 0-5 个真实语法变形。只允许 plural、irregular plural、third-person singular、past tense、past participle、past tense / past participle、present participle / gerund、comparative、superlative。若输入本身是变形、短语、专有名词或不适用，返回空数组。禁止二次复数和虚构词形。
7. word_family 给 0-6 个常用直接词族成员。relation 只能是 base-word、noun-form、verb-form、adjective-form、adverb-form、agent-noun、negative-form、related-to。禁止仅因拼写相似而关联。
8. common_collocations 给 3 个真正属于当前词条主用法的常见搭配，每个带中文。
9. phrase_collocations 给 3 个固定结构、介词搭配或常见句型，每个带中文。不要把其他词族成员的搭配错放进来。
10. ielts_use 从 Listening, Speaking, Reading, G类书信, Task 2, 生活高频, 工作高频 中选 1-3 个。
11. topics 从 教育, 工作, 住房, 交通, 健康, 环境, 科技, 政府, 社会, 消费, 旅行, 社区, 法律, 家庭, 公共服务 中选 1-3 个。
12. difficulty 只能是 基础高频、中级核心、高级加分、低频认识即可。
13. 只输出 JSON，不要 markdown，不要解释。

输出格式：
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
  "forms": [
    {"word": "string", "type": "string", "note": "string"}
  ],
  "word_family": [
    {"word": "string", "pos": "string", "meaningZh": "string", "relation": "string"}
  ],
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
`.trim();
}

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    const { word, force = false } = await req.json();
    const cleanWord = String(word || "").trim();
    if (!cleanWord) return Response.json({ error: "word is required" }, { status: 400 });

    const key = normalizeKey(cleanWord);
    const cache = readCache();
    if (!force && isAiContentProfileComplete(cache[key])) {
      return Response.json({ ...cache[key], cacheHit: true, source: "ai-cache" });
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
          { role: "system", content: "你是严谨的 IELTS General Training 英语词库编辑。只返回可解析 JSON，不制造不存在的词义、词形或词族。" },
          { role: "user", content: buildPrompt(cleanWord) }
        ],
        temperature: 0.1,
        max_tokens: 3200,
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

    const entry = normalizeAiGeneratedEntry(data, cleanWord);
    if (!isAiContentProfileComplete(entry)) {
      return Response.json({
        error: "AI returned an incomplete word profile",
        detail: "主释义详解、例句、四类内容或分类字段不完整；结果未写入缓存。"
      }, { status: 502 });
    }

    cache[key] = { ...entry, cachedAt: Date.now() };
    writeCache(cache);

    return Response.json({ ...entry, cacheHit: false, source: "deepseek" });
  } catch (error) {
    if (isDeepSeekTimeout(error)) {
      return Response.json({ error: "DeepSeek API request timed out", detail: "The AI service did not respond within 60 seconds. The request will not be retried automatically." }, { status: 504 });
    }
    return Response.json({ error: "Server error", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
