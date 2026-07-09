/**
 * Chinese meaning generation for polluted old-word entries.
 */
import fs from "node:fs";
import path from "node:path";

const TEMP_NODE_MODULES = process.env.VOCAB_TEMP_NODE_MODULES || path.join(process.env.TEMP || process.env.TMP || "", "ielts-vocab-wordnet", "node_modules");

export const TEMPLATE_MEANING = /^IELTS G类实用词\s*[：:]/i;
export const PLACEHOLDER_MEANING = /^A practical English word included for I/i;
export const BATCH_MEANING = /^【\w+】/;

export function isPollutedMeaning(meaning = "") {
  const m = String(meaning || "").trim();
  if (!m) return true;
  if (TEMPLATE_MEANING.test(m)) return true;
  if (PLACEHOLDER_MEANING.test(m)) return true;
  if (BATCH_MEANING.test(m)) return true;
  if (/^A practical English word/i.test(m)) return true;
  if (/^A practical word for GT/i.test(m)) return true;
  if (/^与日常交流相关的词\s*[：:]/i.test(m)) return true;
  if (/^与.{0,8}相关的词\s*[：:]/i.test(m)) return true;
  if (/^Please learn/i.test(m)) return true;
  if (/…的行为\s+[a-zA-Z]{3,}/.test(m)) return true;
  if (/^以…为特征的\s+[a-zA-Z]{3,}/.test(m)) return true;
  if (/^…的人\s+[a-zA-Z]{3,}/.test(m)) return true;
  if (/^[A-Za-z\s.,;:'"-]{20,}$/.test(m) && !/[\u4e00-\u9fff]/.test(m)) return true;
  if (/[a-zA-Z]{6,}/.test(m) && /[\u4e00-\u9fff]/.test(m) && !/（[^）]*(过去式|分词|复数|缩写)[^）]*）/.test(m)) return true;
  return false;
}

const GLOSS_PATTERNS = [
  [/to make (.+?) worse/i, "使$1恶化；加重"],
  [/make worse/i, "使恶化；加重"],
  [/to correct/i, "纠正；改正"],
  [/to cause/i, "引起；导致"],
  [/a person who/i, "…的人"],
  [/the act of/i, "…的行为"],
  [/freedom from war/i, "和平；无战争状态"],
  [/state of being/i, "…的状态"],
  [/lack of/i, "缺乏…"],
  [/full of/i, "充满…的"],
  [/relating to/i, "与…有关的"],
  [/characterized by/i, "以…为特征的"]
];

const MANUAL_ZH = new Map([
  ["aggravate", "使恶化；加重（问题或病情）"],
  ["agitate", "使焦虑；鼓动"],
  ["aggrieve", "使委屈；使愤愤不平"],
  ["afterlife", "来世；死后生活"],
  ["peace", "和平；安宁"],
  ["analyse", "分析"],
  ["analyze", "分析"],
  ["aepyornis", "象鸟（已灭绝的大型鸟类）"],
  ["zaftig", "丰满的；体态丰盈的"],
  ["pulpwood", "造纸用木材"],
  ["underly", "位于…之下（疑似 underlie 误写，保留原词条）"],
  ["unprecedent", "无先例的（疑似 unprecedented 截断）"],
  ["watersh", "分水岭相关（疑似 watershed 截断）"],
  ["anything", "任何事物；任何东西"], ["ashamed", "感到羞愧的；惭愧的"],
  ["criteria", "标准；准则（criterion 的复数）"], ["evening", "傍晚；晚上"],
  ["everything", "一切；所有事物"], ["goods", "商品；货物"], ["jeans", "牛仔裤"],
  ["left", "左边的；左侧"], ["media", "媒体；媒介"], ["people", "人们；民众"],
  ["paid", "付费的；已支付的"], ["made", "制造的；made 的过去式/分词"],
  ["came", "来；come 的过去式"], ["eyes", "眼睛"], ["days", "天数；日子"],
  ["seen", "看见；see 的过去分词"], ["gave", "给；give 的过去式"],
  ["cried", "哭；cry 的过去式"]
]);

let wordNetCache = null;

export function loadWordNetGlosses() {
  if (wordNetCache) return wordNetCache;
  const map = new Map();
  const dictDir = path.join(TEMP_NODE_MODULES, "wordnet-db", "dict");
  const files = ["data.noun", "data.verb", "data.adj", "data.adv"];
  for (const file of files) {
    const full = path.join(dictDir, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      if (!/^\d{8}\s/.test(line)) continue;
      const [, gloss = ""] = line.split(" | ");
      const tokens = line.trim().split(/\s+/);
      const count = parseInt(tokens[3], 16);
      const definition = gloss.split(";")[0]?.trim() || "";
      for (let i = 0; i < count; i += 1) {
        const lemma = tokens[4 + i * 2]?.replace(/_/g, " ").toLowerCase();
        if (lemma && !lemma.includes(" ") && definition && !map.has(lemma)) {
          map.set(lemma, definition);
        }
      }
    }
  }
  wordNetCache = map;
  return map;
}

function glossToZh(word, gloss) {
  if (MANUAL_ZH.has(word)) return MANUAL_ZH.get(word);
  const g = String(gloss || "").trim();
  if (!g) return null;
  for (const [re, zh] of GLOSS_PATTERNS) {
    if (re.test(g)) return g.replace(re, zh).slice(0, 48);
  }
  const first = g.split(/[;,]/)[0].trim().slice(0, 60);
  const posHints = [
    [/^(a|an) (.*)$/i, "$2"],
    [/^(to) (.*)$/i, "$2"]
  ];
  let core = first;
  for (const [re, rep] of posHints) core = core.replace(re, rep);
  if (/[\u4e00-\u9fff]/.test(core)) return core.slice(0, 40);
  return null;
}

export function resolveChineseMeaning(word, entry = {}, backupEntry = null) {
  const w = String(word || "").trim().toLowerCase();
  const backupMeaning = String(backupEntry?.meaning || "").trim();
  if (backupMeaning && !isPollutedMeaning(backupMeaning)) {
    return { meaningZh: backupMeaning, source: "backup-restore", confident: true };
  }

  if (MANUAL_ZH.has(w)) {
    return { meaningZh: MANUAL_ZH.get(w), source: "manual-curated", confident: true };
  }

  const wordnet = loadWordNetGlosses();
  const gloss = wordnet.get(w) || "";
  if (gloss) {
    const zh = glossToZh(w, gloss);
    if (zh && /[\u4e00-\u9fff]/.test(zh)) {
      return { meaningZh: zh, source: "wordnet-gloss", confident: gloss.length < 80 };
    }
  }

  const def = String(entry.definition || "").trim();
  if (def && !/^A practical/i.test(def) && !/^Please learn/i.test(def)) {
    const zh = glossToZh(w, def);
    if (zh && /[\u4e00-\u9fff]/.test(zh)) {
      return { meaningZh: zh, source: "definition-gloss", confident: false };
    }
  }

  return { meaningZh: null, source: "unresolved", confident: false };
}