/**
 * Batch Chinese meaning generation via DeepSeek API.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, "../../.ai-cache/p0-meaning-cache.json");

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

function cleanJson(text) {
  return String(text || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function sanitizeMeaningZh(zh, word) {
  let m = String(zh || "").trim();
  const w = String(word || "").toLowerCase();
  m = m.replace(new RegExp(`\\b${w}\\b`, "gi"), "");
  m = m.replace(/\b[a-zA-Z]{3,}\b/g, "");
  m = m.replace(/[;；,，]\s*[;；,，]+/g, "；");
  m = m.replace(/^[;；,，\s]+|[;；,，\s]+$/g, "").trim();
  return m;
}

export async function fetchMeaningsBatch(items, { batchSize = 40 } = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  if (!apiKey) throw new Error("Missing DEEPSEEK_API_KEY");

  const cache = readCache();
  const results = new Map();
  const pending = [];

  for (const item of items) {
    const key = String(item.word || "").toLowerCase();
    const cached = cache[key]?.meaningZh ? sanitizeMeaningZh(cache[key].meaningZh, key) : "";
    if (cached && /[\u4e00-\u9fff]/.test(cached) && !/[a-zA-Z]{4,}/.test(cached)) {
      results.set(key, cached);
      continue;
    }
    pending.push(item);
  }

  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const wordList = batch.map((b) => ({
      word: b.word,
      pos: b.pos || "unknown",
      hint: b.hint || b.definition || ""
    }));

    const prompt = `为下列 IELTS General Training 英文单词生成简洁中文释义。

严格要求：
1. 每个单词必须返回一个对象，word 字段与输入完全一致。
2. chinese_meaning 必须是具体、可学习的中文释义，解释最常见 G 类词义。
3. 禁止：与日常交流相关的词、实用词、常见词、IELTS词、A practical English word、只重复英文单词、英文句子、编号、占位符。
4. 多义词最多 1-2 个核心义项，用分号分隔。
5. 与词性相符。
6. 只输出 JSON。

格式：{"items":[{"word":"string","chinese_meaning":"string","pos":"string"}]}

单词：
${JSON.stringify(wordList)}`;

    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "你是 IELTS G 类词库编辑。只返回可解析 JSON。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 8000,
        response_format: { type: "json_object" }
      })
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(`DeepSeek failed ${res.status}: ${raw.slice(0, 300)}`);
    const payload = JSON.parse(cleanJson(JSON.parse(raw).choices?.[0]?.message?.content || "{}"));
    for (const row of payload.items || []) {
      const key = String(row.word || "").toLowerCase();
      let zh = sanitizeMeaningZh(String(row.chinese_meaning || row.meaning || "").trim(), key);
      if (key && zh && /[\u4e00-\u9fff]/.test(zh) && !/[a-zA-Z]{4,}/.test(zh)) {
        results.set(key, zh);
        cache[key] = { meaningZh: zh, source: "deepseek-p0", at: new Date().toISOString() };
      }
    }
    writeCache(cache);
    console.log(`[deepseek-meanings] batch ${i / batchSize + 1}/${Math.ceil(pending.length / batchSize)} done`);
  }

  return results;
}