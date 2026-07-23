export const runtime = "nodejs";

import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";

const DEEPSEEK_TIMEOUT_MS = 45000;

function isDeepSeekTimeout(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}

function cleanJsonText(text) {
  if (!text) return "{}";
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    const { words } = await req.json();

    if (!Array.isArray(words)) {
      return Response.json({ error: "words must be an array" }, { status: 400 });
    }

    const cleanWords = words
      .map((item) => ({
        inputId: String(item?.inputId || "").trim(),
        word: String(item?.word || "").trim(),
        pos: String(item?.pos || "").trim(),
        meaning: String(item?.meaning || "").trim(),
        example: String(item?.example || "").trim()
      }))
      .filter((item) => item.inputId && item.word)
      .slice(0, 100);

    if (!cleanWords.length) {
      return Response.json({ items: [] });
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
请为下面这些 IELTS General Training 词库单词做分类归纳。

只做 3 个分类字段：
1. ielts_use: 从这些里面选 1-3 个：
   Listening, Speaking, Reading, G类书信, Task 2, 生活高频, 工作高频

2. topics: 从这些里面选 1-3 个：
   教育, 工作, 住房, 交通, 健康, 环境, 科技, 政府, 社会, 消费, 旅行, 社区, 法律, 家庭, 公共服务

3. difficulty: 只能选一个：
   基础高频, 中级核心, 高级加分, 低频认识即可

判断标准：
- 基础高频：非常常见，生活和考试基础词。
- 中级核心：雅思常用核心词，写作/口语/听力经常出现。
- 高级加分：写作或阅读中能提升表达质量的词。
- 低频认识即可：不常用，主要认识即可。

不要把所有词都分成高级。要保守、实用。快速判断即可，不要生成解释。
只输出 JSON，不要 markdown，不要解释。

输出格式：
{
  "items": [
    {
      "inputId": "原样返回输入中的inputId",
      "word": "string",
      "ielts_use": ["string"],
      "topics": ["string"],
      "difficulty": "string"
    }
  ]
}

单词列表：
${JSON.stringify(cleanWords, null, 2)}
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
            content: "你是专业 IELTS 词库分类助手。你只返回可解析 JSON。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0,
        max_tokens: 5000,
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

    const payload = JSON.parse(raw);
    const content = payload?.choices?.[0]?.message?.content || "{}";
    const data = JSON.parse(cleanJsonText(content));

    const items = Array.isArray(data.items)
      ? data.items.map((item) => ({
          inputId: String(item.inputId || "").trim(),
          word: item.word || "",
          ieltsUse: normalizeStringArray(item.ielts_use || item.ieltsUse),
          topics: normalizeStringArray(item.topics),
          difficulty: item.difficulty || "中级核心"
        })).filter((item) => item.inputId && item.word)
      : [];

    return Response.json({ items });
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
