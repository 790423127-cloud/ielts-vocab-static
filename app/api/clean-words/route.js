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

function normalizeText(value) {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export async function POST(req) {
  const guard = requireLocalAdmin(req);
  if (guard) return guard;

  try {
    const { items } = await req.json();

    if (!Array.isArray(items)) {
      return Response.json({ error: "items must be an array" }, { status: 400 });
    }

    const cleanItems = items
      .map((item, index) => ({
        id: String(item?.id ?? index),
        text: normalizeText(item?.text)
      }))
      .filter((item) => item.text)
      .slice(0, 100);

    if (!cleanItems.length) {
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
你是英语词表清洗助手。请快速把用户导入的英文词条整理成适合刷词网站的标准格式。

任务：
1. 每个输入项返回一个整理后的 clean。
2. clean 可以是单词，也可以是非常常用的固定短语。
3. 删除编号、中文、解释、括号、奇怪符号。
4. 如果是变形句式，要改成标准词典形式。
5. 如果出现 a/the、his/her、is/are 这种选择形式，要整理成一个最自然的标准表达。
6. 如果是完整句子，不要保留整句，提取最适合学习的核心单词或固定短语。
7. 如果是无效内容，clean 返回空字符串。
8. type 只能是 word 或 phrase。
9. 只输出 JSON，不要 markdown，不要解释。
10. 快速处理即可，不需要解释理由。

例子：
"is a/the result of" -> "be a result of", type "phrase"
"are responsible for" -> "be responsible for", type "phrase"
"has an effect on" -> "have an effect on", type "phrase"
"running" -> "run", type "word"
"children" -> "child", type "word"
"more important" -> "important", type "word"
"1. customer 顾客" -> "customer", type "word"
"take part in" -> "take part in", type "phrase"
"as a result of" -> "as a result of", type "phrase"

输入：
${JSON.stringify(cleanItems, null, 2)}

输出格式：
{
  "items": [
    {
      "id": "string",
      "original": "string",
      "clean": "string",
      "type": "word"
    }
  ]
}
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
            content: "你是严格的英文词表清洗器。你只返回可解析 JSON。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0,
        max_tokens: 7000,
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

    const resultItems = Array.isArray(data.items)
      ? data.items.map((entry) => ({
          id: String(entry.id ?? ""),
          original: normalizeText(entry.original),
          clean: normalizeText(entry.clean),
          type: entry.type === "phrase" ? "phrase" : "word"
        })).filter((entry) => entry.id)
      : [];

    return Response.json({ items: resultItems });
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
