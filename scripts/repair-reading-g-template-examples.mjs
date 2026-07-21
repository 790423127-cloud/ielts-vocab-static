import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const vocabPath = path.join(root, "public", "data", "reading-g-vocab.json");
const patchPath = path.join(root, "scripts", "data", "reading-g-example-repairs.json");
const cachePath = path.join(root, ".ai-cache", "reading-g-example-repair-cache.json");
const envPath = path.join(root, ".env.local");

const META_EXAMPLE_RE = /^(?:You will often see the expression\b|In the passage,\s*["'].*["']\s+relates to\b|The word\s+["'].*["']\s+appears in many IELTS General Training reading texts\b)/i;
const BANNED_BODY_RE = /\b(?:the expression|this phrase|this word|in IELTS reading passages|appears in many IELTS|relates to the meaning)\b/i;
const MANUAL_REPAIRS = [
  {
    id: "rg_phrase_leave_someone_at_a_place",
    word: "leave someone at a place",
    entryType: "phrase",
    meaningZh: "真题同义替换表达（见关系库）",
    example: "The driver can leave someone at a place that is safe and well lit.",
    exampleCn: "司机可以把乘客送到一个安全且照明良好的地方。",
    source: "human-editorial-v1"
  }
];

function loadEnv() {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function targetTokens(value = "") {
  return normalizeText(value).match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
}

function tokenMatchesTarget(word, target) {
  if (word === target) return true;
  const irregularForms = {
    bring: ["brought"],
    buy: ["bought"],
    choose: ["chose", "chosen"],
    come: ["came"],
    do: ["did", "done"],
    get: ["got", "gotten"],
    give: ["gave", "given"],
    go: ["went", "gone"],
    have: ["had"],
    know: ["knew", "known"],
    leave: ["left"],
    make: ["made"],
    pay: ["paid"],
    run: ["ran"],
    see: ["saw", "seen"],
    take: ["took", "taken"],
    write: ["wrote", "written"]
  };
  if (irregularForms[target]?.includes(word)) return true;
  if (target === "be") {
    return new Set(["am", "is", "are", "was", "were", "been", "being"]).has(word);
  }
  const variants = new Set([
    `${target}s`,
    `${target}es`,
    `${target}ed`,
    `${target}ing`
  ]);
  if (target.endsWith("e")) {
    variants.add(`${target}d`);
    variants.add(`${target.slice(0, -1)}ing`);
  }
  if (target.endsWith("y") && target.length > 2) {
    variants.add(`${target.slice(0, -1)}ies`);
    variants.add(`${target.slice(0, -1)}ied`);
  }
  return variants.has(word);
}

export function exampleUsesTarget(example = "", target = "") {
  const haystack = normalizeText(example);
  const needle = normalizeText(target);
  if (!haystack || !needle) return false;
  if (` ${haystack} `.includes(` ${needle} `)) return true;

  const words = targetTokens(haystack);
  const wanted = targetTokens(needle);
  if (!wanted.length) return false;
  let cursor = 0;
  let firstIndex = -1;
  let lastIndex = -1;
  for (const token of wanted) {
    if (new Set(["a", "an", "the"]).has(token)) continue;
    const isPlaceholder = /^(?:someone|somebody|something|one)(?:'s)?$/.test(token);
    const relativeIndex = words.slice(cursor).findIndex((word) =>
      isPlaceholder ? /^[a-z][a-z']*$/.test(word) : tokenMatchesTarget(word, token)
    );
    const found = relativeIndex < 0 ? -1 : cursor + relativeIndex;
    if (found < 0) return false;
    if (firstIndex < 0) firstIndex = found;
    lastIndex = found;
    cursor = found + 1;
  }
  return lastIndex - firstIndex <= wanted.length + 8;
}

export function validateRepair(row, target, usedExamples = new Set()) {
  const example = String(row?.example || "").trim();
  const exampleCn = String(row?.exampleCn || "").trim();
  const words = example.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  if (words.length < 5 || words.length > 34) return "example_length";
  if (!/[.!?]$/.test(example)) return "missing_punctuation";
  if (META_EXAMPLE_RE.test(example) || BANNED_BODY_RE.test(example)) return "meta_example";
  if (!exampleUsesTarget(example, target)) return "target_missing";
  if (!/[\u3400-\u9fff]/u.test(exampleCn) || exampleCn.length < 5) return "chinese_missing";
  const normalizedExample = normalizeText(example);
  if (usedExamples.has(normalizedExample)) return "duplicate_example";
  return "";
}

function cleanJsonResponse(text = "") {
  return String(text).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

async function callDeepSeek(apiKey, model, rows, attempt) {
  const prompt = `你是 IELTS General Training 阅读词库的资深双语编辑。请为下面每个词或短语编写一组真实学习例句。

硬性要求：
- 英文必须自然展示目标词的实际用法，不能解释、提及或介绍这个词。
- 禁止使用 “You will often see...”, “The expression...”, “This phrase...”, “In IELTS reading passages...” 等元话语。
- 优先使用通知、租房、工作、培训、交通、公共服务、购物或日常行政场景。
- 英文 5-24 个词，必须是完整句子，并包含目标词。对于 between ... and 等可插槽结构，目标词各部分按原顺序出现即可。
- 中文必须准确翻译英文，不得留空，不得写“暂无”。
- 每项句型尽量不同，不要批量套用同一个开头。
- 保留输入 id、word，不要修改释义。
- 只返回合法 JSON：{"items":[{"id":"...","word":"...","example":"...","exampleCn":"..."}]}

这是第 ${attempt} 次生成或纠错。输入：
${JSON.stringify(rows)}`;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你只输出合法 JSON，并严格执行双语词典编辑要求。" },
        { role: "user", content: prompt }
      ]
    })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${raw.slice(0, 300)}`);
  const outer = JSON.parse(raw);
  return JSON.parse(cleanJsonResponse(outer.choices?.[0]?.message?.content || "{}"));
}

function repairKey(item) {
  return String(item?.id || "").trim() || `${item?.entryType || "entry"}:${normalizeText(item?.word || "")}`;
}

function applyRepairs(vocab, repairs) {
  const repairMap = new Map(repairs.map((repair) => [repair.id, repair]));
  let applied = 0;
  for (const item of vocab.items || []) {
    const repair = repairMap.get(repairKey(item));
    if (!repair) continue;
    item.example = repair.example;
    item.exampleCn = repair.exampleCn;
    item.qualityFlags = [...new Set([...(item.qualityFlags || []).filter((flag) => flag !== "synthetic_example"), "example_editorial_repair_v1"])];
    const firstSense = Array.isArray(item.senses) ? item.senses[0] : null;
    if (firstSense && (!firstSense.example || META_EXAMPLE_RE.test(firstSense.example))) {
      firstSense.example = repair.example;
      firstSense.exampleZh = repair.exampleCn;
    }
    applied += 1;
  }
  vocab.exampleEditorialRepair = {
    version: 1,
    repairedCount: applied,
    templateExamplesRemaining: (vocab.items || []).filter((item) => META_EXAMPLE_RE.test(item.example || "")).length
  };
  return applied;
}

async function main() {
  loadEnv();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

  const vocab = readJson(vocabPath);
  if (!vocab?.items) throw new Error("reading-g-vocab.json is invalid");
  const targets = vocab.items.filter((item) => META_EXAMPLE_RE.test(item.example || ""));
  const cache = readJson(cachePath, { version: 1, repairs: [] });
  const accepted = new Map();
  const usedExamples = new Set();

  for (const repair of MANUAL_REPAIRS) {
    const target = targets.find((item) => repairKey(item) === repair.id);
    if (!target) continue;
    const issue = validateRepair(repair, target.word, usedExamples);
    if (issue) throw new Error(`Invalid manual repair ${repair.id}: ${issue}`);
    accepted.set(repair.id, repair);
    usedExamples.add(normalizeText(repair.example));
  }

  for (const repair of cache.repairs || []) {
    const target = targets.find((item) => repairKey(item) === repair.id);
    if (!target) continue;
    const issue = validateRepair(repair, target.word, usedExamples);
    if (issue) continue;
    accepted.set(repair.id, repair);
    usedExamples.add(normalizeText(repair.example));
  }

  const batchSize = 20;
  for (let start = 0; start < targets.length; start += batchSize) {
    const batch = targets.slice(start, start + batchSize);
    let pending = batch.filter((item) => !accepted.has(repairKey(item)));
    for (let attempt = 1; pending.length && attempt <= 4; attempt += 1) {
      const requestRows = pending.map((item) => ({
        id: repairKey(item),
        word: item.word,
        entryType: item.entryType,
        meaningZh: item.primaryMeaningZh || item.meaning || ""
      }));
      let payload;
      try {
        payload = await callDeepSeek(apiKey, model, requestRows, attempt);
      } catch (error) {
        if (attempt === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
        continue;
      }
      const byId = new Map((payload.items || []).map((row) => [String(row.id || ""), row]));
      const nextPending = [];
      for (const item of pending) {
        const id = repairKey(item);
        const row = byId.get(id);
        const issue = validateRepair(row, item.word, usedExamples);
        if (issue) {
          nextPending.push(item);
          continue;
        }
        const repair = {
          id,
          word: item.word,
          entryType: item.entryType,
          meaningZh: item.primaryMeaningZh || item.meaning || "",
          example: String(row.example).trim(),
          exampleCn: String(row.exampleCn).trim(),
          source: "deepseek-editorial-v1"
        };
        accepted.set(id, repair);
        usedExamples.add(normalizeText(repair.example));
      }
      pending = nextPending;
    }
    cache.repairs = [...accepted.values()].sort((a, b) => a.id.localeCompare(b.id));
    atomicWrite(cachePath, cache);
    console.log(`[reading-g examples] ${Math.min(start + batchSize, targets.length)}/${targets.length}, accepted ${accepted.size}`);
    if (pending.length) {
      throw new Error(`Could not generate valid examples for: ${pending.map((item) => item.word).join(", ")}`);
    }
  }

  const repairs = targets.map((item) => accepted.get(repairKey(item))).filter(Boolean);
  if (repairs.length !== targets.length) {
    throw new Error(`Repair count mismatch: ${repairs.length}/${targets.length}`);
  }
  const patch = {
    version: 1,
    datasetVersion: vocab.datasetVersion || vocab.version || "reading-g-core-v3",
    count: repairs.length,
    generatedWith: model,
    repairs
  };
  atomicWrite(patchPath, patch);
  const applied = applyRepairs(vocab, repairs);
  atomicWrite(vocabPath, vocab);
  console.log(JSON.stringify({ targets: targets.length, generated: repairs.length, applied, patchPath, vocabPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
