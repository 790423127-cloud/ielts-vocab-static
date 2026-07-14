// build-sense-catalog.mjs — Build micro-semantic sense catalog for Meaning Mode.
// Replaces broad-domain classification with fine-grained micro-categories.
// Outputs: app/lib/meaning-mode/sense-catalog.generated.mjs
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const wordsData = JSON.parse(fs.readFileSync(path.join(ROOT,".static-export-cache/words.json"),"utf-8"));
const meaningData = JSON.parse(fs.readFileSync(path.join(ROOT,"public/data/meaning-6000.json"),"utf-8"));
const allById = new Map();
for (const w of wordsData.words) allById.set(w.wordId, w);

function npf(p) {
  if(!p)return"unknown";const s=String(p).trim().toLowerCase();
  if(s.startsWith("noun")||s==="n")return"noun";
  if(s.startsWith("verb")||s==="v")return"verb";
  if(s.startsWith("adj"))return"adjective";
  if(s.startsWith("adv"))return"adverb";
  if(s.includes("noun"))return"noun";if(s.includes("verb"))return"verb";
  if(s.includes("adj"))return"adjective";if(s.includes("adv"))return"adverb";
  return"other";
}

// MICRO-CATEGORY MAPPING — based on Chinese meaning analysis
const MICRO_CATEGORIES = {
  // Importance / ranking
  "首要":["evaluation-importance","importance-ranking"],
  "重要":["evaluation-importance","importance-ranking"],
  "主要":["evaluation-importance","importance-dominance"],
  "关键":["evaluation-importance","importance-critical"],
  "必要":["evaluation-importance","necessity"],
  "主导":["evaluation-importance","importance-dominance"],
  "支配":["evaluation-importance","importance-dominance"],
  "优势":["evaluation-comparison","advantage"],
  "优先":["evaluation-importance","priority"],

  // Cognition / thinking
  "观点":["cognition-opinion","opinion-stance"],
  "看法":["cognition-opinion","opinion-stance"],
  "见解":["cognition-opinion","opinion-insight"],
  "印象":["cognition-opinion","impression-perception"],
  "感知":["cognition-opinion","perception-sensory"],
  "态度":["cognition-opinion","attitude-disposition"],
  "判断":["cognition-opinion","judgment-assessment"],
  "评估":["cognition-opinion","evaluation-assessment"],
  "评价":["cognition-opinion","evaluation-assessment"],
  "推测":["cognition-opinion","speculation-inference"],
  "假设":["cognition-opinion","speculation-assumption"],
  "猜测":["cognition-opinion","speculation-guess"],
  "理解":["cognition-opinion","comprehension"],
  "解释":["cognition-opinion","interpretation-explanation"],
  "说明":["cognition-opinion","interpretation-explanation"],
  "诠释":["cognition-opinion","interpretation-explanation"],
  "思想":["cognition-opinion","thought-concept"],
  "概念":["cognition-opinion","thought-concept"],
  "意识":["cognition-opinion","consciousness-awareness"],

  // Emotion
  "感情":["emotion-affect","emotion-general"],
  "情感":["emotion-affect","emotion-general"],
  "情绪":["emotion-affect","mood-state"],
  "感受":["emotion-affect","feeling-experience"],
  "感觉":["emotion-affect","feeling-experience"],
  "激情":["emotion-affect","emotion-intensity"],
  "焦虑":["emotion-affect","anxiety-stress"],
  "恐惧":["emotion-affect","fear-concern"],
  "愤怒":["emotion-affect","anger-hostility"],
  "悲伤":["emotion-affect","sadness-grief"],
  "快乐":["emotion-affect","happiness-joy"],
  "满足":["emotion-affect","satisfaction"],
  "失望":["emotion-affect","disappointment"],

  // Communication
  "沟通":["communication-language","communication-exchange"],
  "交流":["communication-language","communication-exchange"],
  "讨论":["communication-language","discussion-debate"],
  "辩论":["communication-language","discussion-debate"],
  "争论":["communication-language","discussion-debate"],
  "演讲":["communication-language","speech-presentation"],
  "表达":["communication-language","expression-articulation"],
  "描述":["communication-language","description-narration"],
  "叙述":["communication-language","description-narration"],
  "陈述":["communication-language","statement-declaration"],
  "宣布":["communication-language","statement-declaration"],
  "语言":["communication-language","language-system"],
  "文字":["communication-language","written-form"],
  "词汇":["communication-language","language-system"],
  "报告":["communication-language","report-document"],
  "信件":["communication-language","correspondence"],

  // Action / behavior
  "行为":["action-behavior","behavior-conduct"],
  "行动":["action-behavior","action-execution"],
  "活动":["action-behavior","activity-event"],
  "操作":["action-behavior","operation-manipulation"],
  "执行":["action-behavior","action-execution"],
  "实施":["action-behavior","implementation"],
  "参与":["action-behavior","participation-involvement"],
  "组织":["action-behavior","organization-management"],
  "管理":["action-behavior","organization-management"],
  "控制":["action-behavior","control-regulation"],
  "方法":["action-behavior","method-approach"],
  "方式":["action-behavior","method-approach"],
  "手段":["action-behavior","method-means"],
  "策略":["action-behavior","strategy-planning"],
  "计划":["action-behavior","strategy-planning"],
  "目标":["action-behavior","goal-objective"],
  "目的":["action-behavior","goal-objective"],

  // Change / development
  "变化":["change-process","change-transformation"],
  "改变":["change-process","change-transformation"],
  "转变":["change-process","change-transformation"],
  "发展":["change-process","development-growth"],
  "进步":["change-process","development-progress"],
  "增长":["change-process","growth-increase"],
  "改善":["change-process","improvement-enhancement"],
  "改进":["change-process","improvement-enhancement"],
  "减少":["change-process","decrease-reduction"],
  "扩大":["change-process","expansion-enlargement"],

  // Cause / effect
  "原因":["cause-effect","cause-reason"],
  "理由":["cause-effect","cause-reason"],
  "结果":["cause-effect","effect-result"],
  "后果":["cause-effect","effect-consequence"],
  "影响":["cause-effect","effect-influence"],
  "效果":["cause-effect","effect-outcome"],
  "作用":["cause-effect","effect-function"],

  // Quantity / measurement
  "数量":["quantity-measurement","quantity-amount"],
  "质量":["quality-attribute","quality-grade"],
  "比例":["quantity-measurement","ratio-proportion"],
  "程度":["quantity-measurement","degree-level"],
  "范围":["quantity-measurement","scope-range"],
  "规模":["quantity-measurement","scale-size"],
  "大小":["quantity-measurement","size-dimension"],
  "速度":["quantity-measurement","speed-rate"],
  "测量":["quantity-measurement","measurement-assessment"],
  "计算":["quantity-measurement","calculation-computation"],

  // Relation
  "关系":["relation-possession","relationship-connection"],
  "联系":["relation-possession","relationship-connection"],
  "关联":["relation-possession","relationship-connection"],
  "合作":["relation-possession","cooperation-collaboration"],
  "冲突":["relation-possession","conflict-opposition"],
  "竞争":["relation-possession","competition-rivalry"],
  "支持":["relation-possession","support-assistance"],
  "帮助":["relation-possession","support-assistance"],
  "依赖":["relation-possession","dependence-reliance"],
  "独立":["relation-possession","independence-autonomy"],

  // Society
  "社会":["society-culture","society-community"],
  "文化":["society-culture","culture-tradition"],
  "传统":["society-culture","culture-tradition"],
  "政治":["society-culture","politics-governance"],
  "法律":["society-culture","law-regulation"],
  "政策":["society-culture","policy-governance"],
  "经济":["work-economy","economy-finance"],
  "商业":["work-economy","business-commerce"],
  "贸易":["work-economy","business-commerce"],
  "工作":["work-economy","employment-occupation"],
  "职业":["work-economy","employment-occupation"],

  // Education
  "教育":["education-academic","education-teaching"],
  "学习":["education-academic","learning-study"],
  "学校":["education-academic","education-institution"],
  "学生":["education-academic","education-role"],
  "考试":["education-academic","assessment-testing"],
  "研究":["education-academic","research-investigation"],
  "知识":["education-academic","knowledge-expertise"],
  "技能":["education-academic","skill-ability"],

  // Health
  "健康":["health-body","health-wellness"],
  "疾病":["health-body","disease-illness"],
  "治疗":["health-body","treatment-therapy"],
  "医疗":["health-body","medical-care"],
  "身体":["health-body","body-physical"],
  "心理":["health-body","mental-psychological"],
  "运动":["health-body","exercise-fitness"],
  "营养":["health-body","nutrition-diet"],

  // Environment
  "环境":["environment-nature","environment-ecology"],
  "自然":["environment-nature","nature-wilderness"],
  "气候":["environment-nature","climate-weather"],
  "污染":["environment-nature","pollution-contamination"],
  "资源":["environment-nature","resource-management"],
  "能源":["environment-nature","energy-power"],
  "保护":["environment-nature","conservation-protection"],

  // Technology
  "科技":["technology-science","technology-innovation"],
  "技术":["technology-science","technology-application"],
  "科学":["technology-science","science-research"],
  "计算机":["technology-science","computing-digital"],
  "网络":["technology-science","network-connectivity"],
  "数据":["technology-science","data-information"],
  "信息":["technology-science","data-information"],
  "数字":["technology-science","digital-electronic"],
  "机器":["technology-science","machine-device"],

  // Time
  "时间":["time-sequence","time-temporal"],
  "时期":["time-sequence","time-period"],
  "频率":["time-sequence","frequency-repetition"],
  "顺序":["time-sequence","sequence-order"],
  "速度":["time-sequence","speed-pace"],
  "日程":["time-sequence","schedule-planning"],
  "期限":["time-sequence","deadline-duration"],

  // Quality / attribute
  "特征":["quality-attribute","characteristic-feature"],
  "特点":["quality-attribute","characteristic-feature"],
  "属性":["quality-attribute","property-attribute"],
  "品质":["quality-attribute","quality-grade"],
  "优点":["quality-attribute","advantage-merit"],
  "缺点":["quality-attribute","disadvantage-flaw"],
  "状态":["quality-attribute","state-condition"],
  "条件":["quality-attribute","condition-requirement"],

  // Movement / travel
  "旅行":["movement-travel","travel-journey"],
  "移动":["movement-travel","movement-motion"],
  "交通":["movement-travel","transportation-transit"],
  "运输":["movement-travel","transportation-shipping"],
  "位置":["movement-travel","location-position"],
  "方向":["movement-travel","direction-orientation"],

  // Visual / appearance
  "视觉":["visual-spatial","visual-sight"],
  "颜色":["visual-spatial","color-appearance"],
  "形状":["visual-spatial","shape-form"],
  "外观":["visual-spatial","appearance-look"],
  "显示":["visual-spatial","display-presentation"],
  "美丽":["visual-spatial","aesthetics-beauty"],

  // Abstract / conceptual
  "真理":["abstract-conceptual","truth-reality"],
  "事实":["abstract-conceptual","truth-reality"],
  "现实":["abstract-conceptual","reality-existence"],
  "理想":["abstract-conceptual","ideal-aspiration"],
  "梦想":["abstract-conceptual","dream-aspiration"],
  "价值":["abstract-conceptual","value-worth"],
  "意义":["abstract-conceptual","meaning-significance"],
  "道德":["abstract-conceptual","ethics-morality"],
  "自由":["abstract-conceptual","freedom-liberty"],
  "平等":["abstract-conceptual","equality-fairness"],
  "和平":["abstract-conceptual","peace-harmony"],
  "安全":["abstract-conceptual","safety-security"],
  "危险":["abstract-conceptual","danger-risk"],
  "风险":["abstract-conceptual","danger-risk"],
  "成功":["abstract-conceptual","success-achievement"],
  "失败":["abstract-conceptual","failure-defeat"],
  "挑战":["abstract-conceptual","challenge-difficulty"],
  "机会":["abstract-conceptual","opportunity-chance"],
};

// Build reverse map: Chinese keyword -> (macro, micro, ambiguityKeys)
function extractSenses(entry, forcedPosFamily) {
  const meaning = (entry.meaning || "").trim();
  const qs = entry.quizSenses && entry.quizSenses[0];
  const quizMeaning = qs ? qs.quizMeaningZh : meaning;
  const posFamily = forcedPosFamily || npf(entry.pos);

  const macros = new Set();
  const micros = new Set();
  const ambiguityKeys = new Set();
  const allText = meaning + ";" + quizMeaning;

  for (const [keyword, [macro, micro]] of Object.entries(MICRO_CATEGORIES)) {
    if (allText.includes(keyword)) {
      macros.add(macro);
      micros.add(micro);
    }
  }

  // Extract ambiguity keys: short substrings of the meaning
  const clean = meaning.replace(/[；;，,、\s（）()\/]/g, "");
  for (let i = 0; i <= clean.length - 2; i++) {
    const sub = clean.substring(i, i+2);
    if (sub.length === 2 && !/[a-zA-Z0-9]/.test(sub)) ambiguityKeys.add(sub);
  }

  if (macros.size === 0) macros.add("general");
  if (micros.size === 0) micros.add("general");

  return {
    macros: [...macros],
    micros: [...micros].slice(0, 3),
    ambiguityKeys: [...ambiguityKeys].slice(0, 8),
    posFamily
  };
}

// Build catalog for all 6000 words
const catalog = [];
let total = 0, withMicro = 0, withAmbiguity = 0;

for (const item of meaningData.items) {
  const w = allById.get(item.wordId);
  if (!w) continue;
  total++;
  const senses = extractSenses(w, item.posFamily);

  if (senses.micros.length > 0 && senses.micros[0] !== "general") withMicro++;
  if (senses.ambiguityKeys.length > 0) withAmbiguity++;

  catalog.push({
    wordId: w.wordId,
    word: w.word,
    posFamily: senses.posFamily,
    quizMeaningZh: (w.quizSenses && w.quizSenses[0]) ? w.quizSenses[0].quizMeaningZh : (w.meaning||"").trim(),
    meaningDetailedZh: w.meaningDetailedZh || (w.meaning||"").trim(),
    semanticMacro: senses.macros[0],
    semanticMicro: senses.micros[0],
    allMicros: senses.micros,
    ambiguityKeys: senses.ambiguityKeys,
    contrastClass: senses.micros[1] || senses.micros[0],
    sourceType: "master-lexicon"
  });
}

// Output
const outPath = path.join(ROOT,"app/lib/meaning-mode/sense-catalog.generated.mjs");
const outLines = [
  "// Auto-generated sense catalog for Meaning Mode — micro-semantic categories.",
  "// Generated: " + new Date().toISOString(),
  "// Replaces broad-domain classification with fine-grained micro-categories.",
  "// DO NOT EDIT — regenerate: node app/lib/meaning-mode/build-sense-catalog.cjs",
  "",
  "export const SENSE_CATALOG = " + JSON.stringify(catalog, null, 2) + ";",
  "",
  "export function getSenseEntry(wordId) {",
  "  for (const entry of SENSE_CATALOG) {",
  "    if (entry.wordId === wordId) return entry;",
  "  }",
  "  return null;",
  "}",
  "",
  "export function getMicroCategory(wordId) {",
  "  const entry = getSenseEntry(wordId);",
  "  return entry ? entry.semanticMicro : null;",
  "}",
  "",
  "export function getAmbiguityKeys(wordId) {",
  "  const entry = getSenseEntry(wordId);",
  "  return entry ? entry.ambiguityKeys : [];",
  "}",
  "",
  "export const MICRO_CATEGORIES = " + JSON.stringify([...new Set(catalog.map(c=>c.semanticMicro))].sort()) + ";",
  ""
];
fs.writeFileSync(outPath, outLines.join("\n"), "utf-8");

console.log("Sense catalog written:", outPath);
console.log("Total entries:", total);
console.log("With micro-category:", withMicro, "(" + (withMicro/total*100).toFixed(1) + "%)");
console.log("With ambiguity keys:", withAmbiguity);
console.log("Unique micro-categories:", new Set(catalog.map(c=>c.semanticMicro)).size);
console.log("Done.");
