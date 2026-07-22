export const runtime = "nodejs";

import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";
import { preserveHeadwordSlashAlternatives } from "../../lib/vocab/headword-format.mjs";

const DEEPSEEK_TIMEOUT_MS = 45000;

function isDeepSeekTimeout(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}

function cleanJsonText(text) {
  if (!text) return "{}";
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    const { word } = await req.json();
    const rawWord = String(word || "").trim();

    if (!rawWord) {
      return Response.json({ error: "word is required" }, { status: 400 });
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
你是 IELTS General Training 词库编辑。请只修复下面这个词条的“英文词条/短语本身”格式，不要生成完整词条。

原词条：
${rawWord}

任务：
1. 如果原词条里的 / 表示二选一或可替换表达，必须保留斜杠，不得改写成 or，也不得删除任一侧内容；只统一斜杠两侧空格，让显示更清楚。
   例：in/within the context of → in / within the context of
   例：the/an effect(s) on → the / an effect on
2. 如果括号只是词性/用法标签，可以删除。
   例：secure (adj.) → secure
3. 如果括号表示可选复数或形式，请改成自然常用形式。
   例：effect(s) → effect
4. 不要截断词条，不要只保留 slash 前面的部分。
5. 不要改成中文。
6. 不要扩写成多个无关词。
7. 如果原词条本来就合理，除了斜杠两侧可增加空格外，repairedWord 保持原样。
8. 只返回 JSON，不要 markdown，不要解释。

输出格式：
{
  "repairedWord": "string",
  "reason": "中文说明，简短"
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
            content: "你只返回可解析 JSON。你只修复英文词条本身，不生成释义、例句或搭配。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0,
        max_tokens: 500,
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
    const repairedWord = preserveHeadwordSlashAlternatives(rawWord, data.repairedWord || rawWord);

    if (!repairedWord) {
      return Response.json(
        { error: "AI returned empty repairedWord" },
        { status: 500 }
      );
    }

    return Response.json({
      originalWord: rawWord,
      repairedWord,
      reason: String(data.reason || "").trim(),
      source: "deepseek"
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
