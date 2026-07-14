/**
 * meaningDetailZh generation — local semantic builder + DeepSeek batch fallback.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPollutedMeaning } from "./gt-meaning-zh.mjs";
import { isMeaningPollutedV2, resolveMeaningV2 } from "./gt-zh-resolve-v2.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DETAIL_CACHE_PATH = path.join(__dirname, "../../.ai-cache/grok-detail-meaning-cache.json");

export const TEMPLATE_MEANING_PATTERNS = [
  /与日常交流相关的词/i,
  /常用词\s*[:：]/i,
  /实用词\s*[:：]/i,
  /IELTS\s*G类实用词/i,
  /IELTS\s*G类词汇/i,
  /This is a useful word/i,
  /A practical English word/i,
  /：常用含义/,
  /：相关事物/,
  /^【\w+】/
];

export function isTemplateMeaning(meaning = "") {
  const m = String(meaning || "").trim();
  if (!m) return true;
  return TEMPLATE_MEANING_PATTERNS.some((pat) => pat.test(m));
}

export const BANNED_DETAIL_PATTERNS = [
  /与日常交流相关的词/i,
  /常用词\s*[:：]/i,
  /实用词\s*[:：]/i,
  /IELTS\s*G类词汇/i,
  /This is a useful word/i,
  /A practical English word/i,
  /：常用含义/,
  /：相关事物/,
  /：进行$/,
  /请学习/i,
  /编号\s*\d+/,
  /占位/,
  /待补全/
];

const TOPIC_SCENES = new Map([
  ["工作", "招聘通知、职场沟通和日常工作安排"],
  ["住房", "租房合同、住房维修和邻里事务"],
  ["银行", "开户、转账、账单和金融服务"],
  ["交通", "出行预订、路线变更和交通通知"],
  ["G类书信", "投诉信、申请信和正式询问"],
  ["保险", "投保、理赔和保单条款"],
  ["餐饮", "订餐、外卖和餐厅服务"],
  ["公共服务", "政府办事、社区服务和公共设施"],
  ["医疗", "就诊预约、健康咨询和医疗通知"],
  ["教育", "课程报名、学业通知和校园事务"],
  ["购物", "退换货、订单和商品服务"],
  ["法律", "合同条款、权利义务和正式文书"],
  ["阅读", "公告、说明文和信息类文本"],
  ["听力", "日常对话、服务咨询和通知播报"]
]);

function readDetailCache() {
  try {
    return JSON.parse(fs.readFileSync(DETAIL_CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeDetailCache(cache) {
  fs.mkdirSync(path.dirname(DETAIL_CACHE_PATH), { recursive: true });
  fs.writeFileSync(DETAIL_CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

function cleanJson(text) {
  return String(text || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

export function splitSenses(meaning = "") {
  return String(meaning || "")
    .split(/[；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizePosLabel(pos = "") {
  const p = String(pos || "").toLowerCase();
  if (p.includes("verb") || p === "v") return "verb";
  if (p.includes("noun") || p === "n") return "noun";
  if (p.includes("adj")) return "adjective";
  if (p.includes("adv")) return "adverb";
  if (p.includes("prep")) return "preposition";
  if (p.includes("conj")) return "conjunction";
  if (p.includes("pron")) return "pronoun";
  if (p.includes("interj")) return "interjection";
  if (p.includes("abbrev")) return "abbreviation";
  if (p.includes("phrase")) return "phrase";
  return "word";
}

function isPlaceholderDefinition(def = "") {
  const d = String(def || "").trim();
  return !d || /^A practical English word/i.test(d) || /^Please learn/i.test(d) || /^likely a typo/i.test(d);
}

function buildPosIntro(posLabel, senses) {
  if (!senses.length) return "";
  const a = senses[0];
  const b = senses[1];
  switch (posLabel) {
    case "verb":
      if (b) return `作动词时，可表示「${a}」，也可表示「${b}」。`;
      return `作动词时，表示${a}。`;
    case "noun":
      if (b) return `作名词时，指${a}，也可指${b}。`;
      return `作名词时，指${a}。`;
    case "adjective":
      if (b) return `作形容词时，形容${a}或${b}的状态或性质。`;
      return `作形容词时，形容${a}的状态或性质。`;
    case "adverb":
      return `作副词时，表示${senses.join("或")}。`;
    case "preposition":
      return `作介词时，表示${senses.join("或")}。`;
    case "conjunction":
      return `作连词时，用于连接或引出${senses.join("或")}的语义关系。`;
    case "pronoun":
      return `作代词时，指代${senses.join("或")}。`;
    case "abbreviation":
      return `作缩写形式，表示${senses.join("或")}。`;
    default:
      return senses.length > 1 ? `核心义项包括${senses.join("和")}。` : `${a}。`;
  }
}

function buildGtContext(entry) {
  const gt = String(entry.gTUseCase || "").trim();
  if (gt && gt !== "日常场景" && gt.length >= 3) {
    return `在雅思G类中，常见于${gt}。`;
  }
  for (const topic of entry.topics || []) {
    const scene = TOPIC_SCENES.get(topic);
    if (scene) return `在雅思G类中，常见于${scene}。`;
  }
  for (const use of entry.ieltsUse || []) {
    const scene = TOPIC_SCENES.get(use);
    if (scene) return `在雅思G类中，常见于${scene}。`;
  }
  return "";
}

function buildExampleContext(entry) {
  const cn = String(entry.exampleCn || "").trim();
  if (!cn || cn.includes("场景中的实用例句") || cn.length < 8) return "";
  const clean = cn.replace(/[。.!！?？]$/, "");
  return `例如：${clean}。`;
}

function buildDefinitionHint(entry) {
  const def = String(entry.definition || "").trim();
  if (isPlaceholderDefinition(def)) return "";
  if (/[\u4e00-\u9fff]/.test(def)) return "";
  const lower = def.toLowerCase();
  if (/^past tense of (\w+)/i.test(lower)) {
    const base = lower.match(/^past tense of (\w+)/i)[1];
    return `该词为 ${base} 的过去式形式。`;
  }
  if (/^plural of (\w+)/i.test(lower)) {
    const base = lower.match(/^plural of (\w+)/i)[1];
    return `该词为 ${base} 的复数形式。`;
  }
  if (/^short for (\w+)/i.test(lower)) {
    const base = lower.match(/^short for (\w+)/i)[1];
    return `通常作 ${base} 的缩写。`;
  }
  if (/incorporated/i.test(lower)) return "常用于公司名称后缀，表示注册成立的公司。";
  if (/nothing \(informal/i.test(lower)) return "为非正式拼写或口语缩略，语义接近 nothing。";
  if (/typo for/i.test(lower)) {
    const m = lower.match(/typo for ['"]?(\w+)['"]?/i);
    if (m) return `词形疑似 ${m[1]} 的截断或误写，学习时应结合语境辨认。`;
  }
  return "";
}

export function buildLocalDetailMeaning(entry) {
  const meaning = String(entry.meaning || "").trim();
  if (!meaning || isTemplateMeaning(meaning) || isPollutedMeaning(meaning)) return "";
  const senses = splitSenses(meaning);
  const parts = [buildPosIntro(normalizePosLabel(entry.pos), senses)];
  const defHint = buildDefinitionHint(entry);
  if (defHint) parts.push(defHint);
  const gt = buildGtContext(entry);
  if (gt) parts.push(gt);
  const ex = buildExampleContext(entry);
  if (ex) parts.push(ex);
  return parts.filter(Boolean).join("").replace(/\s+/g, "");
}

export function isDetailMeaningValid(detail, entry) {
  const d = String(detail || "").trim();
  if (!d) return false;
  if (d.length < 18 || d.length > 360) return false;
  if (!/[\u4e00-\u9fff]{6,}/.test(d)) return false;
  const withoutParen = d.replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "");
  if (/[a-zA-Z]{6,}/.test(withoutParen)) return false;
  for (const pat of BANNED_DETAIL_PATTERNS) {
    if (pat.test(d)) return false;
  }
  const meaning = String(entry?.meaning || "").trim();
  if (d === meaning) return false;
  if (normDetailKey(d) === normDetailKey(meaning)) return false;
  return /(作|指|表示|用于|可|常见于|例如|通常|形容|连接|指代|义项|形式)/.test(d);
}

export function normDetailKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

export function resolveShortMeaning(entry) {
  const current = String(entry.meaning || "").trim();
  if (current && !isTemplateMeaning(current) && !isPollutedMeaning(current)) {
    return { meaningZh: current, source: "existing", changed: false };
  }
  const resolved = resolveMeaningV2(entry.word, entry);
  if (resolved.confident && resolved.meaningZh && !isTemplateMeaning(resolved.meaningZh)) {
    return { meaningZh: resolved.meaningZh, source: resolved.source, changed: true };
  }
  return { meaningZh: current, source: "needs-api", changed: false, needApi: true };
}

export async function fetchDetailMeaningsBatch(items, { batchSize = 35 } = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  if (!apiKey) throw new Error("Missing DEEPSEEK_API_KEY");

  const cache = readDetailCache();
  const results = new Map();

  const pending = [];
  for (const item of items) {
    const key = String(item.word || "").toLowerCase();
    const cached = cache[key];
    if (cached?.meaningDetailZh && isDetailMeaningValid(cached.meaningDetailZh, item)) {
      if (!item.needMeaning || (cached.meaningZh && !isMeaningPollutedV2(cached.meaningZh))) {
        results.set(key, cached);
        continue;
      }
    }
    pending.push(item);
  }

  async function requestBatch(batch, attempt = 1) {
    const payload = batch.map((b) => ({
      word: b.word,
      pos: b.pos || "unknown",
      meaningZh: b.meaning || "",
      definition: b.definition || "",
      example: b.example || "",
      exampleCn: b.exampleCn || "",
      topics: (b.topics || []).slice(0, 2),
      gTUseCase: b.gTUseCase || ""
    }));

    const prompt = `为下列 IELTS General Training 词条生成中文学习释义。

严格要求：
1. 返回 JSON：{"items":[{"word":"...","meaningZh":"...","meaningDetailZh":"..."}]}
2. meaningZh：简短核心中文释义，适合刷词页快速记忆，多义用分号分隔。
3. meaningDetailZh：更详细的中文解释（40-180字），须包含：
   - 最常用核心义项
   - 与词性相符的准确解释
   - 适合 IELTS GT 的常见使用语境
   - 多义词可列 1-3 个高价值义项
   - 必要时提示易混义或正式/非正式用法
4. 禁止：与日常交流相关的词、常用词、实用词、IELTS G类词汇、This is a useful word、A practical English word、编号、占位符、截断文本、英文句子。
5. 不得复制词典原文，不得标注 Cambridge/Oxford/Longman 等来源。
6. word 字段必须与输入完全一致。
7. JSON 字符串内不得出现未转义换行或引号。

词条：
${JSON.stringify(payload)}`;

    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "你是 IELTS G 类词库中文编辑。只返回可解析 JSON。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 12000,
        response_format: { type: "json_object" }
      })
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(`DeepSeek detail failed ${res.status}: ${raw.slice(0, 400)}`);

    const body = JSON.parse(raw);
    const content = cleanJson(body.choices?.[0]?.message?.content || "{}");
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        return requestBatch(batch, attempt + 1);
      }
      throw new Error(`DeepSeek JSON parse failed: ${error.message}; content=${content.slice(0, 200)}`);
    }

    for (const row of parsed.items || []) {
      const key = String(row.word || "").toLowerCase();
      const meaningZh = String(row.meaningZh || "").trim();
      const meaningDetailZh = String(row.meaningDetailZh || "").trim();
      if (!key) continue;
      const item = batch.find((b) => String(b.word).toLowerCase() === key) || { word: key };
      if (meaningDetailZh && isDetailMeaningValid(meaningDetailZh, { ...item, meaning: meaningZh || item.meaning })) {
        const record = {
          meaningZh: meaningZh && !isTemplateMeaning(meaningZh) ? meaningZh : "",
          meaningDetailZh,
          source: "deepseek-detail-v1",
          at: new Date().toISOString()
        };
        results.set(key, record);
        cache[key] = record;
      }
    }
  }

  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    try {
      await requestBatch(batch);
    } catch (error) {
      console.warn(`[detail-meaning] batch ${Math.floor(i / batchSize) + 1} failed, retry singles: ${error.message}`);
      for (const item of batch) {
        try {
          await requestBatch([item]);
        } catch (singleError) {
          console.warn(`[detail-meaning] single failed ${item.word}: ${singleError.message}`);
        }
      }
    }
    writeDetailCache(cache);
    console.log(`[detail-meaning] batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pending.length / batchSize)} done`);
  }

  return results;
}
