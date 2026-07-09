/**
 * Generate additional GT headwords from word-list + wordnet when curated pool is insufficient.
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeHeadword } from "../../app/lib/vocab/lexicon-guard-shared.mjs";
import { loadWordNetGlosses } from "./gt-meaning-zh.mjs";
import { resolveMeaningV2 } from "./gt-zh-resolve-v2.mjs";
import { isPollutedMeaning } from "./gt-meaning-zh.mjs";
import { loadCmuDictionary, arpabetToIpa, isInvalidIpa } from "./gt-ipa-validate.mjs";
import { FORCE_REPLACE } from "./gt-new-words-pool.mjs";

const TEMP_NODE_MODULES = process.env.VOCAB_TEMP_NODE_MODULES || path.join(process.env.TEMP || process.env.TMP || "", "ielts-vocab-wordnet", "node_modules");

const GT_KEYWORDS = [
  "rent", "tenant", "landlord", "lease", "repair", "house", "flat", "bill", "bank", "account",
  "pay", "refund", "insur", "complain", "request", "apolog", "invite", "schedule", "shift",
  "employ", "job", "work", "salary", "train", "health", "clinic", "travel", "ticket", "delay",
  "cancel", "notice", "permit", "eligible", "rule", "policy", "service", "customer", "contract",
  "fee", "charge", "letter", "form", "apply", "school", "child", "shop", "food", "bus"
];

const DOMAIN_BY_KEYWORD = [
  [/rent|tenant|landlord|lease|house|flat|repair/i, "住房"],
  [/employ|job|work|salary|shift|train/i, "工作"],
  [/bank|account|pay|bill|fee|charge|refund/i, "银行"],
  [/insur/i, "保险"],
  [/travel|ticket|delay|cancel|bus/i, "交通"],
  [/health|clinic/i, "健康"],
  [/school|child/i, "学校"],
  [/shop|food/i, "购物"],
  [/letter|complain|request|apolog/i, "G类书信"],
  [/rule|policy|permit|eligible/i, "规则"]
];

const EXAMPLE_PATTERNS = [
  (w, d) => `The ${d} office published guidance that mentions ${w}.`,
  (w, d) => `Staff at the ${d} centre explained how ${w} affects residents.`,
  (w, d) => `In the ${d} notice, ${w} was listed as a key requirement.`,
  (w, d) => `During the ${d} review, managers discussed ${w} with the team.`,
  (w, d) => `The ${d} leaflet defines ${w} in plain language.`,
  (w, d) => `Customers asked whether ${w} applied to their ${d} case.`,
  (w, d) => `The updated ${d} policy refers to ${w} in section two.`,
  (w, d) => `Applicants must confirm ${w} before the ${d} deadline.`
];

const patternUse = new Map();

function pickExample(word, domain) {
  const d = domain === "G类书信" ? "housing" : domain === "规则" ? "council" : domain.toLowerCase();
  for (const fn of EXAMPLE_PATTERNS) {
    const key = fn.toString();
    const used = patternUse.get(key) || 0;
    if (used >= 3) continue;
    patternUse.set(key, used + 1);
    return fn(word, d);
  }
  return `The service team clarified the term ${word} during the briefing.`;
}

function inferDomain(word, gloss) {
  const text = `${word} ${gloss}`.toLowerCase();
  for (const [re, domain] of DOMAIN_BY_KEYWORD) {
    if (re.test(text)) return domain;
  }
  return "公共服务";
}

function scoreWord(word, gloss) {
  const text = `${word} ${gloss}`.toLowerCase();
  let score = 0;
  for (const kw of GT_KEYWORDS) if (text.includes(kw)) score += 2;
  if (word.length >= 5 && word.length <= 12) score += 1;
  if (/(saurus|ornith|aceae|ology|itis|ectomy|graphy|iasis|ware)$/i.test(word)) score -= 5;
  return score;
}

export async function generateWordBank(existingHeadwords, needCount) {
  const wordnet = loadWordNetGlosses();
  const cmu = await loadCmuDictionary();
  const wordListPath = path.join(TEMP_NODE_MODULES, "word-list", "words.txt");
  const out = [];
  const seen = new Set(existingHeadwords);

  if (fs.existsSync(wordListPath)) {
    const lines = fs.readFileSync(wordListPath, "utf8").split(/\r?\n/);
    const scored = [];
    for (const raw of lines) {
      const w = normalizeHeadword(raw);
      if (!w || w.includes(" ") || seen.has(w) || FORCE_REPLACE.has(w) || w.length < 4 || w.length > 14) continue;
      if (/(saurus|platypus|ornith|monotreme|booby|duckbill|agiotage)$/i.test(w)) continue;
      const arpabet = cmu[w] || "";
      const ipa = arpabet ? arpabetToIpa(arpabet) : "";
      if (!ipa || isInvalidIpa(ipa)) continue;
      const gloss = wordnet.get(w) || `A practical word used in everyday English communication.`;
      const s = scoreWord(w, gloss);
      if (s < 1) continue;
      scored.push({ word: w, gloss, score: s, ipa });
    }
    scored.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));

    for (const item of scored) {
      if (out.length >= needCount) break;
      const zh = resolveMeaningV2(item.word, { definition: item.gloss });
      if (!zh.meaningZh || isPollutedMeaning(zh.meaningZh)) continue;
      const domain = inferDomain(item.word, item.gloss);
      const pos = /^(to|make|be)\b/i.test(item.gloss) ? "verb" : "noun";
      out.push({
        word: item.word,
        normalizedHeadword: item.word,
        pos,
        meaningZh: zh.meaningZh,
        definition: item.gloss.slice(0, 100),
        example: pickExample(item.word, domain),
        exampleCn: `与${domain}场景相关的说明。`,
        difficulty: item.score >= 4 ? "中级核心" : "基础高频",
        category: `IELTS G类 · ${domain}`,
        topics: [domain],
        targetBand: item.score >= 4 ? "5-6" : "4-5",
        gTUseCase: `${domain}场景`,
        utilityScore: Math.min(10, item.score + 4),
        candidateSource: "word-list-gt-recovery-v1",
        sourceType: "wordnet-derived",
        duplicateCheckResult: "pass"
      });
      seen.add(item.word);
    }
  }
  return out;
}