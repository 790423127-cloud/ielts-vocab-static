/**
 * Corpus audit for G-reading logic120 against Cambridge GT 5–21
 * Part1+2 (224) + Part3 (56). Untag non-logic content from the layer
 * (keep the entries) and add real discourse markers found in the 280
 * articles. Does not delete IDs.
 *
 *   node scripts/audit-reading-g-logic-corpus.mjs
 *   node scripts/audit-reading-g-logic-corpus.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeReadingGKey,
  stableReadingGId
} from "../app/lib/reading-g-vocab/normalize.mjs";
import { atomicReplaceFileSync } from "../app/lib/reading-g-vocab/atomic-write.server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const BACKUP_DIR = path.join(ROOT, "backups", "reading-g-logic-corpus-audit-20260824");
const apply = process.argv.includes("--apply");
const AUDIT_AT = "2026-08-24";
const QUALITY_ADDED = "logic120_corpus_added_v1";
const QUALITY_UNTAGGED = "logic120_corpus_untagged_v1";

const LAYER_RANK = {
  part12ArticleHighFrequency: 0,
  priority1500: 1,
  answerCore250: 2,
  logic120: 3,
  phrases400: 4,
  gtPart12Phrases150: 4,
  tierB1200: 5,
  paraCore600: 6,
  tierC800: 7,
  paraExt500: 8,
  reference701: 9,
  questionBankActive: 10,
  questionBankAiCompleted: 11,
  grokExcelPart12Supplement: 12,
  formsFamilyStandalone: 13,
  wordFamilyStandalone: 13,
  questionBankPending: 20
};

const REMOVE_FROM_LAYER = Object.freeze([
  "owe to",
  "negative point",
  "have confidence in",
  "have faith in",
  "overcome the hurdle",
  "in days",
  "old days",
  "years to come",
  "believe in",
  "teacher",
  "money",
  "company",
  "organization",
  "business",
  "commercial",
  "tax",
  "fee",
  "cost",
  "price",
  "pricing",
  "payment",
  "income",
  "profit",
  "funding",
  "investment",
  "invest",
  "saving",
  "subsidies",
  "allowance",
  "expense",
  "expenditures",
  "financial",
  "charge",
  "welfare",
  "medieval",
  "ancient",
  "location",
  "region",
  "area",
  "site",
  "place",
  "revolution",
  "contemporary",
  "modern",
  "unique",
  "unusual",
  "peculiar",
  "extraordinary",
  "special",
  "trust",
  "trustworthy",
  "help",
  "merit",
  "risk",
  "dilemma",
  "hurdle",
  "obstacle",
  "barrier",
  "challenge",
  "problem",
  "issue",
  "difficulty",
  "difficult",
  "demanding",
  "tough",
  "hard",
  "fault",
  "danger",
  "threat",
  "strength",
  "support",
  "assist",
  "aid",
  "advantage",
  "positive",
  "better",
  "superior",
  "factor",
  "reason",
  "comparison",
  "development",
  "established",
  "existing",
  "fund",
  "boom",
  "recession",
  "account",
  "like",
  "over",
  "down",
  "any",
  "every",
  "most",
  "now",
  "today",
  "past",
  "future"
]);

const TAG_EXISTING = Object.freeze([
  "in order to",
  "as soon as",
  "in addition to",
  "based on",
  "instead of",
  "currently",
  "whilst",
  "alongside",
  "as well",
  "previously",
  "originally",
  "if possible",
  "as a result of",
  "in accordance with",
  "concerning",
  "simultaneously",
  "on the basis of",
  "at present",
  "so far",
  "indeed",
  "hence",
  "thereby",
  "secondly",
  "at first"
]);

const NEW_PHRASES = Object.freeze([
  {
    word: "if necessary",
    phonetic: "/ɪf ˈnesəsəri/",
    primaryMeaningZh: "如有必要",
    definition: "if it is needed",
    meaningDetailZh: "表示只有在确实需要时才采取后文行动，常放在句末或条件从句里。它把安排写成可选项，而不是一律必须执行。",
    example: "Leave a contact number if necessary.",
    exampleCn: "如有必要，请留下联系电话。"
  },
  {
    word: "where possible",
    phonetic: "/weə ˈpɒsəbl/",
    primaryMeaningZh: "在可能的情况下",
    definition: "if or when it can be done",
    meaningDetailZh: "用于建议或规定中，表示能做到就做，做不到也不构成违规。它限制执行范围，不等于绝对命令。",
    example: "Please recycle paper where possible.",
    exampleCn: "在可能的情况下请回收纸张。"
  },
  {
    word: "first of all",
    phonetic: "/ˌfɜːst əv ˈɔːl/",
    primaryMeaningZh: "首先",
    definition: "before anything else; as the first point",
    meaningDetailZh: "用于列举步骤或论点时标出第一项，常置于句首并加逗号。它只标记顺序，不一定表示时间上最早发生。",
    example: "First of all, check that the door is locked.",
    exampleCn: "首先，检查门是否已锁好。"
  },
  {
    word: "together with",
    phonetic: "/təˈɡeðə wɪð/",
    primaryMeaningZh: "连同；和……一起",
    definition: "along with; in addition to",
    meaningDetailZh: "把后接内容作为伴随项一并带上，后接名词或名词短语。连接主语时，谓语通常仍与前面的主语保持一致。",
    example: "Please return the form together with two photographs.",
    exampleCn: "请把表格连同两张照片一起交回。"
  },
  {
    word: "so as to",
    phonetic: "/səʊ æz tə/",
    primaryMeaningZh: "为了；以便",
    definition: "in order to",
    meaningDetailZh: "引出目的，后接动词原形，功能接近 in order to。否定目的常用 so as not to，阅读时后项是意图而不是已经发生的结果。",
    example: "Labels must be clear so as to avoid confusion.",
    exampleCn: "标签必须清楚，以免造成混淆。"
  },
  {
    word: "with the exception of",
    phonetic: "/wɪð ði ɪkˈsepʃn əv/",
    primaryMeaningZh: "除……以外",
    definition: "except for",
    meaningDetailZh: "从总体判断中排除某一个或一类对象，后接名词或名词短语。它把结论改成“除这一点外都成立”。",
    example: "All passengers, with the exception of children under 12, must complete the form.",
    exampleCn: "除12岁以下儿童外，所有乘客都必须填写表格。"
  },
  {
    word: "from the outset",
    phonetic: "/frəm ði ˈaʊtset/",
    primaryMeaningZh: "从一开始",
    definition: "from the beginning",
    meaningDetailZh: "强调某安排、态度或条件在过程开始时就已经确定，而不是后来才补上。常见于通知、合同和领导安排。",
    example: "Staff receive five weeks' holiday from the outset.",
    exampleCn: "员工从一开始就享有五周假期。"
  },
  {
    word: "since then",
    phonetic: "/sɪns ðen/",
    primaryMeaningZh: "从那以后",
    definition: "from that time until now",
    meaningDetailZh: "回指前文已经给出的时间点，并说明其后持续发生的变化。then 必须有清楚的前文所指，否则时间链会断开。",
    example: "The festival started last year. Since then, thousands of people have attended.",
    exampleCn: "这个节日去年开始。从那以后，已有数千人参加。"
  },
  {
    word: "after all",
    phonetic: "/ˈɑːftər ɔːl/",
    primaryMeaningZh: "毕竟；终究",
    definition: "used to add a reason that makes a situation unsurprising",
    meaningDetailZh: "用来补上一个足以解释前文的理由，语气是“说到底/毕竟如此”。它不是时间短语 after all the...，阅读时不要和“在所有……之后”混淆。",
    example: "This may seem strange, because after all you have just started the job.",
    exampleCn: "这也许显得奇怪，因为毕竟你才刚开始这份工作。"
  },
  {
    word: "whether or not",
    phonetic: "/ˈweðə ɔː nɒt/",
    primaryMeaningZh: "无论是否",
    definition: "regardless of whether something is true",
    meaningDetailZh: "引出两种可能都要考虑的情况，表示结果不取决于该条件是否成立。它比单独的 whether 更明确地标出让步或开放选择。",
    example: "The debate will continue whether or not the house is repaired.",
    exampleCn: "无论房子修不修，这场争论都会继续。"
  },
  {
    word: "in relation to",
    phonetic: "/ɪn rɪˈleɪʃn tuː/",
    primaryMeaningZh: "关于；就……而言",
    definition: "concerning; with reference to",
    meaningDetailZh: "把讨论限制在某个对象或问题上，后接名词或名词短语。它标明话题范围，不表示因果关系。",
    example: "Please deal with insurance in relation to tax and accounts.",
    exampleCn: "请处理与税务和账目有关的保险事宜。"
  },
  {
    word: "other than",
    phonetic: "/ˈʌðə ðæn/",
    primaryMeaningZh: "除了；不同于",
    definition: "except; apart from",
    meaningDetailZh: "用于排除某对象，或表示与某类事物不同。否定句中常相当于 except；阅读时要看它是在缩小范围还是在对比。",
    example: "Staff may not park any vehicle other than a motorcycle in these bays.",
    exampleCn: "除摩托车外，员工不得在这些车位停放其他车辆。"
  },
  {
    word: "ever since",
    phonetic: "/ˌevə ˈsɪns/",
    primaryMeaningZh: "从那以后一直",
    definition: "continuously from that time until now",
    meaningDetailZh: "强调从过去某一时刻起直到现在都持续如此，后可接名词或从句。它比 since 更突出“一直没有中断”。",
    example: "Ever since last year's festival, the committee has been planning the next one.",
    exampleCn: "自从去年的节日以来，委员会一直在筹划下一届。"
  },
  {
    word: "combined with",
    phonetic: "/kəmˈbaɪnd wɪð/",
    primaryMeaningZh: "再加上；与……结合",
    definition: "together with; when added to",
    meaningDetailZh: "把后接因素与前文因素叠加，常用来解释共同造成的结果。阅读因果句时，它提示不是单一原因。",
    example: "The island's size, combined with its nearness to two major cities, makes it popular.",
    exampleCn: "这座岛面积大，再加上靠近两座大城市，因而很受欢迎。"
  },
  {
    word: "as a whole",
    phonetic: "/æz ə həʊl/",
    primaryMeaningZh: "总体上；作为整体",
    definition: "considering everything together",
    meaningDetailZh: "要求按全部而不是按局部来判断。它常用来纠正只看一个细节的结论，和 overall 接近。",
    example: "You need to understand how your role fits into the company as a whole.",
    exampleCn: "你需要理解自己的职责如何融入公司整体。"
  },
  {
    word: "most importantly",
    phonetic: "/məʊst ɪmˈpɔːtntli/",
    primaryMeaningZh: "最重要的是",
    definition: "used to highlight the most important point",
    meaningDetailZh: "从前述几点中突出最关键的一项，常置于句首并加逗号。它是强调标记，不改变因果方向。",
    example: "Most importantly, communicate your goals to your employees.",
    exampleCn: "最重要的是，要把目标传达给员工。"
  }
]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function keyOf(value) {
  return normalizeReadingGKey(value);
}

function remainingPrimary(layers) {
  const rest = layers.filter((layer) => layer !== "logic120");
  if (!rest.length) return { primaryLayer: "", layerRank: 99 };
  const sorted = [...rest].sort((a, b) => (LAYER_RANK[a] ?? 50) - (LAYER_RANK[b] ?? 50));
  const primaryLayer = sorted[0];
  return { primaryLayer, layerRank: LAYER_RANK[primaryLayer] ?? 50 };
}

function addFlag(item, flag) {
  item.qualityFlags = unique([...(item.qualityFlags || []), flag]);
}

function makePhraseEntry(spec) {
  const normalizedKey = keyOf(spec.word);
  return {
    id: stableReadingGId("phrase", normalizedKey),
    word: spec.word,
    normalizedKey,
    entryType: "phrase",
    isPhrase: true,
    phonetic: spec.phonetic,
    pos: "phrase",
    primaryPos: "phrase",
    primaryMeaningZh: spec.primaryMeaningZh,
    meaning: spec.primaryMeaningZh,
    meaningZh: spec.primaryMeaningZh,
    definition: spec.definition,
    meaningDetailZh: spec.meaningDetailZh,
    example: spec.example,
    exampleCn: spec.exampleCn,
    exampleZh: spec.exampleCn,
    forms: [],
    wordFamily: [],
    synonyms: [],
    difficulty: "阅读逻辑核心",
    category: "IELTS G类 · 阅读逻辑转换",
    domain: "阅读逻辑",
    topics: ["阅读逻辑转换", "剑雅5-21语料增补"],
    ieltsUse: ["阅读逻辑转换"],
    layers: ["logic120"],
    primaryLayer: "logic120",
    layerRank: 3,
    studyMode: "active",
    sourceFiles: [
      "剑雅5-21_G类阅读_Part1_Part2_224篇短文_最终拆分版.docx",
      "G类阅读5-21_Part3纯英文文章"
    ],
    qualityFlags: [QUALITY_ADDED],
    sourceType: "gt-corpus-logic-audit",
    source: "剑雅5-21 G类阅读 280篇语料增补",
    sourceOrProvenance: "Cambridge GT 5–21 Part1+2+Part3 logic-layer audit 2026-08-24",
    acceptedAnswers: [spec.word]
  };
}

function snapshotIdentities(vocab) {
  return (vocab.items || []).map((item) => `${item.id}::${item.word}`);
}

const vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, "utf8"));
const beforeIdentities = snapshotIdentities(vocab);
const beforeCount = (vocab.items || []).length;
const byKey = new Map((vocab.items || []).map((item) => [keyOf(item.word), item]));
const byId = new Map((vocab.items || []).map((item) => [item.id, item]));
const removeKeys = new Set(REMOVE_FROM_LAYER.map(keyOf));
const tagKeys = new Set(TAG_EXISTING.map(keyOf));

const untagged = [];
const alreadyUntagged = [];
const missingRemove = [];
for (const word of REMOVE_FROM_LAYER) {
  const item = byKey.get(keyOf(word));
  if (!item) {
    missingRemove.push(word);
    continue;
  }
  const layers = list(item.layers);
  if (!layers.includes("logic120")) {
    alreadyUntagged.push(word);
    continue;
  }
  const nextLayers = layers.filter((layer) => layer !== "logic120");
  item.layers = nextLayers;
  if (item.primaryLayer === "logic120" || !nextLayers.includes(item.primaryLayer)) {
    const next = remainingPrimary(nextLayers);
    item.primaryLayer = next.primaryLayer;
    item.layerRank = next.layerRank;
  }
  addFlag(item, QUALITY_UNTAGGED);
  untagged.push({ id: item.id, word: item.word, remainingLayers: nextLayers });
}

const taggedExisting = [];
const alreadyTagged = [];
const missingTag = [];
for (const word of TAG_EXISTING) {
  const item = byKey.get(keyOf(word));
  if (!item) {
    missingTag.push(word);
    continue;
  }
  const layers = list(item.layers);
  if (layers.includes("logic120")) {
    alreadyTagged.push(word);
    continue;
  }
  item.layers = [...layers, "logic120"];
  if (item.studyMode === "reference") {
    item.studyMode = "active";
  }
  addFlag(item, QUALITY_ADDED);
  taggedExisting.push({ id: item.id, word: item.word });
}

const added = [];
const blockedNew = [];
const promotedReference = [];
for (const item of vocab.items || []) {
  if (!list(item.layers).includes("logic120")) continue;
  if (item.studyMode === "reference") {
    item.studyMode = "active";
    addFlag(item, QUALITY_ADDED);
    promotedReference.push({ id: item.id, word: item.word });
  }
}
for (const spec of NEW_PHRASES) {
  const normalizedKey = keyOf(spec.word);
  const existing = byKey.get(normalizedKey);
  if (existing) {
    if (!list(existing.layers).includes("logic120")) {
      existing.layers = [...list(existing.layers), "logic120"];
      addFlag(existing, QUALITY_ADDED);
      taggedExisting.push({ id: existing.id, word: existing.word });
    } else {
      alreadyTagged.push(spec.word);
    }
    continue;
  }
  const entry = makePhraseEntry(spec);
  if (byId.has(entry.id)) {
    blockedNew.push({ word: spec.word, id: entry.id });
    continue;
  }
  vocab.items.push(entry);
  byKey.set(normalizedKey, entry);
  byId.set(entry.id, entry);
  added.push({ id: entry.id, word: entry.word });
}

if (missingTag.length) {
  throw new Error(`要加入逻辑层的词在 G 类词库中不存在：${missingTag.join(", ")}`);
}
if (blockedNew.length) {
  throw new Error(`新建短语 ID 冲突：${blockedNew.map((row) => row.id).join(", ")}`);
}

const logicRows = (vocab.items || []).filter((item) => list(item.layers).includes("logic120"));
const afterCount = (vocab.items || []).length;
vocab.count = afterCount;
vocab.wordCount = (vocab.items || []).filter((item) => (item.entryType || "word") !== "phrase" && !/\s/.test(item.word || "")).length;
vocab.phraseCount = afterCount - vocab.wordCount;
vocab.activeCount = (vocab.items || []).filter((item) => item.studyMode === "active").length;
vocab.referenceCount = afterCount - vocab.activeCount;
if (vocab.layerStats?.logic120) {
  vocab.layerStats.logic120.filterCount = logicRows.length;
  vocab.layerStats.logic120.uniqueKeysInLayer = logicRows.length;
}
vocab.logicLayerCorpusAudit = {
  version: 1,
  auditedAt: AUDIT_AT,
  articleCount: 280,
  part12ArticleCount: 224,
  part3ArticleCount: 56,
  sourceDocuments: [
    "剑雅5-21_G类阅读_Part1_Part2_224篇短文_最终拆分版.docx",
    "G类阅读5-21_Part3纯英文文章"
  ],
  untaggedCount: untagged.length,
  untaggedWords: untagged.map((row) => row.word),
  taggedExistingCount: taggedExisting.length,
  taggedExistingWords: taggedExisting.map((row) => row.word),
  promotedReferenceCount: promotedReference.length,
  promotedReferenceWords: promotedReference.map((row) => row.word),
  addedCount: added.length,
  addedWords: added.map((row) => row.word),
  missingRemove,
  alreadyUntagged,
  alreadyTagged,
  finalLogicLayerCount: logicRows.length,
  policy: "不删除词条或稳定 ID；只从 logic120 层拿掉非逻辑内容词和假短语，并补入 280 篇中真实出现的衔接表达。"
};
if (vocab.logicWorkbookImport) {
  vocab.logicWorkbookImport = {
    ...vocab.logicWorkbookImport,
    finalLogicLayerCount: logicRows.length
  };
}

const afterIdentitiesExisting = snapshotIdentities({
  items: (vocab.items || []).slice(0, beforeCount)
});
if (JSON.stringify(beforeIdentities) !== JSON.stringify(afterIdentitiesExisting)) {
  throw new Error("既有词条的稳定 ID 或词头发生了变化，已停止。");
}

const report = {
  mode: apply ? "apply" : "dry-run",
  beforeCount,
  afterCount,
  beforeLogic: beforeIdentities.length && (JSON.parse(fs.readFileSync(VOCAB_PATH, "utf8")).items.filter((item) => list(item.layers).includes("logic120")).length),
  afterLogic: logicRows.length,
  untagged: untagged.length,
  taggedExisting: taggedExisting.length,
  promotedReference: promotedReference.length,
  added: added.length,
  missingRemove,
  untaggedWords: untagged.map((row) => row.word),
  taggedExistingWords: taggedExisting.map((row) => row.word),
  addedWords: added.map((row) => row.word)
};

if (apply) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `reading-g-vocab.before.json`);
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(VOCAB_PATH, backupPath);
  }
  atomicReplaceFileSync(VOCAB_PATH, `${JSON.stringify(vocab, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
