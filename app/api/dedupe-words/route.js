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

function normalizeWordText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function simpleStem(value) {
  let text = normalizeWordText(value);

  text = text
    .replace(/^to\s+/, "")
    .replace(/^(a|an|the)\s+/, "")
    .replace(/\s+(a|an|the)\s+/g, " ");

  if (text.endsWith("ies") && text.length > 4) return text.slice(0, -3) + "y";
  if (text.endsWith("es") && text.length > 4) return text.slice(0, -2);
  if (text.endsWith("s") && text.length > 4 && !text.endsWith("ss")) return text.slice(0, -1);
  if (text.endsWith("ing") && text.length > 5) return text.slice(0, -3);
  if (text.endsWith("ed") && text.length > 4) return text.slice(0, -2);

  return text;
}

function candidateKey(value) {
  return simpleStem(value)
    .replace(/^(be|is|are|was|were)\s+/, "be ")
    .replace(/^(has|have|had)\s+/, "have ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeCandidateGroups(words) {
  const exactMap = new Map();
  const stemMap = new Map();

  words.forEach((word) => {
    const exact = normalizeWordText(word);
    const stem = candidateKey(word);

    if (!exact || !stem) return;

    if (!exactMap.has(exact)) exactMap.set(exact, []);
    exactMap.get(exact).push(word);

    if (!stemMap.has(stem)) stemMap.set(stem, []);
    stemMap.get(stem).push(word);
  });

  const groups = [];
  const seen = new Set();

  [...exactMap.values(), ...stemMap.values()].forEach((items) => {
    const unique = Array.from(new Set(items));
    if (unique.length < 2) return;

    const key = unique.map((x) => normalizeWordText(x)).sort().join("|");
    if (seen.has(key)) return;

    seen.add(key);
    groups.push(unique.slice(0, 12));
  });

  return groups.slice(0, 600);
}

function localGroupResult(group) {
  const canonical = group[0];
  const duplicates = group.slice(1);

  return {
    canonical,
    duplicates,
    reason: "local candidate duplicate"
  };
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
      .map((word) => String(word || "").trim())
      .filter(Boolean);

    if (!cleanWords.length) {
      return Response.json({ groups: [] });
    }

    const candidateGroups = makeCandidateGroups(cleanWords);

    if (!candidateGroups.length) {
      return Response.json({ groups: [] });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

    if (!apiKey) {
      return Response.json({
        groups: candidateGroups.map(localGroupResult),
        note: "Missing DEEPSEEK_API_KEY; returned local candidate groups only."
      });
    }

    const groupsToCheck = candidateGroups.slice(0, 300);

    const prompt = `
你是英文词库去重助手。请从疑似重复组中判断哪些确实应该合并。

规则：
1. 同一个单词大小写不同、单复数、轻微变形，可以合并。
2. 明显同一个固定短语的不同写法，可以合并。
3. 词义不同、用法不同、派生词不同，不要合并。
4. canonical 保留最标准、最适合词库显示的形式。
5. duplicates 填需要删除的重复项。
6. 只输出 JSON，不要解释。

输入疑似重复组：
${JSON.stringify(groupsToCheck)}

输出：
{
  "groups": [
    {
      "canonical": "string",
      "duplicates": ["string"],
      "reason": "string"
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
            content: "你是严格的英文词库去重助手。你只返回 JSON。"
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

    const groups = Array.isArray(data.groups)
      ? data.groups
          .map((group) => ({
            canonical: String(group.canonical || "").trim(),
            duplicates: Array.isArray(group.duplicates)
              ? group.duplicates.map((word) => String(word || "").trim()).filter(Boolean)
              : [],
            reason: String(group.reason || "").trim()
          }))
          .filter((group) => group.canonical && group.duplicates.length)
      : [];

    return Response.json({ groups });
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
