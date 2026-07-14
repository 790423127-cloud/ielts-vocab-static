// build-sense-relation-catalog.cjs — Build concept axis / value mapping for Meaning Mode.
// Maps words to meaning dimensions (importance, size, speed, etc.) with specific values.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const wordsData = JSON.parse(fs.readFileSync(path.join(ROOT,".static-export-cache/words.json"),"utf-8"));
const meaningData = JSON.parse(fs.readFileSync(path.join(ROOT,"public/data/meaning-6000.json"),"utf-8"));
const allById = new Map();
for (const w of wordsData.words) allById.set(w.wordId, w);

function npf(p) {
  if(!p)return"unknown";const s=String(p).trim().toLowerCase();
  if(s.startsWith("noun")||s==="n")return"noun";if(s.startsWith("verb")||s==="v")return"verb";
  if(s.startsWith("adj"))return"adjective";if(s.startsWith("adv"))return"adverb";
  if(s.includes("noun"))return"noun";if(s.includes("verb"))return"verb";
  if(s.includes("adj"))return"adjective";if(s.includes("adv"))return"adverb";return"other";
}

// CONCEPT AXES — each axis has a set of possible values (ordered from low to high or category)
const CONCEPT_AXES = {
  // === IMPORTANCE / RANK ===
  "importance-rank": {
    values: ["none","trivial","minor","secondary","moderate","significant","major","primary","prime","paramount","ultimate"],
    map: {
      "首要":"primary","最重要":"prime","主要":"major","重要":"significant","关键":"major",
      "必要":"moderate","次要":"secondary","微小":"minor","无关":"trivial",
      "主导":"primary","支配":"primary",
    },
    relationFamily: "rank-and-priority"
  },
  // === SIZE / SCALE ===
  "size-scale": {
    values: ["tiny","small","moderate","large","huge","enormous","maximum"],
    map: {
      "大":"large","巨大":"huge","庞大":"huge","小":"small","微小":"tiny","极大":"enormous",
      "最大":"maximum","最小":"tiny","中等":"moderate","巨型":"huge",
    },
    relationFamily: "size-and-scale"
  },
  // === SPEED ===
  "speed-rate": {
    values: ["static","slow","moderate","fast","rapid","instant"],
    map: {
      "快":"fast","迅速":"rapid","快速":"rapid","慢":"slow","立即":"instant",
      "缓慢":"slow","高速":"fast","极速":"rapid","迟缓":"slow",
    },
    relationFamily: "speed-and-tempo"
  },
  // === QUANTITY / AMOUNT ===
  "quantity-amount": {
    values: ["none","scarce","limited","adequate","abundant","excessive","infinite"],
    map: {
      "有限":"limited","充足":"adequate","丰富":"abundant","缺乏":"scarce",
      "过量":"excessive","无限":"infinite","足够":"adequate","稀缺":"scarce",
      "多":"abundant","少":"scarce","限制":"limited",
    },
    relationFamily: "quantity-and-amount"
  },
  // === QUALITY / GOODNESS ===
  "quality-grade": {
    values: ["terrible","poor","mediocre","good","excellent","perfect","ideal"],
    map: {
      "好":"good","优秀":"excellent","完美":"perfect","理想":"ideal",
      "差":"poor","糟糕":"terrible","中等":"mediocre","优质":"excellent",
      "最好":"excellent","极好":"excellent","最佳":"perfect",
    },
    relationFamily: "quality-and-grade"
  },
  // === DIFFICULTY ===
  "difficulty-level": {
    values: ["trivial","easy","moderate","challenging","hard","impossible"],
    map: {
      "难":"hard","困难":"challenging","容易":"easy","简单":"easy",
      "复杂":"challenging","艰巨":"hard","轻松":"easy",
    },
    relationFamily: "difficulty-and-effort"
  },
  // === FREQUENCY ===
  "frequency-rate": {
    values: ["never","rare","occasional","frequent","constant","permanent"],
    map: {
      "频繁":"frequent","经常":"frequent","偶尔":"occasional","罕见":"rare",
      "永久":"permanent","持续":"constant","临时":"occasional",
      "日常":"frequent","反复":"frequent",
    },
    relationFamily: "frequency-and-repetition"
  },
  // === CERTAINTY ===
  "certainty-level": {
    values: ["impossible","unlikely","uncertain","likely","certain","inevitable"],
    map: {
      "确定":"certain","肯定":"certain","可能":"likely","也许":"uncertain",
      "必然":"inevitable","不太可能":"unlikely","一定":"certain",
      "大概":"likely","或许":"uncertain",
    },
    relationFamily: "certainty-and-probability"
  },
  // === POWER / CONTROL ===
  "power-level": {
    values: ["powerless","weak","moderate","strong","dominant","absolute"],
    map: {
      "强":"strong","强大":"strong","弱":"weak","无力":"powerless",
      "控制":"dominant","支配":"dominant","统治":"dominant","主导":"dominant",
      "权威":"strong","绝对":"absolute",
    },
    relationFamily: "power-and-control"
  },
  // === EMOTION VALENCE ===
  "emotion-valence": {
    values: ["negative","neutral","positive"],
    map: {
      "快乐":"positive","幸福":"positive","满意":"positive","高兴":"positive",
      "悲伤":"negative","愤怒":"negative","恐惧":"negative","焦虑":"negative",
      "失望":"negative","痛苦":"negative","厌恶":"negative",
    },
    relationFamily: "emotion-and-affect"
  },
  // === FORMALITY ===
  "formality-level": {
    values: ["slang","informal","neutral","formal","academic","archaic"],
    map: {
      "正式":"formal","非正式":"informal","学术":"academic",
    },
    relationFamily: "register-and-formality"
  },
  // === ABSTRACTION ===
  "abstraction-level": {
    values: ["concrete","tangible","abstract","theoretical"],
    map: {
      "具体":"concrete","抽象":"abstract","理论":"theoretical","实际":"tangible",
    },
    relationFamily: "abstraction-and-concreteness"
  },
  // === TEMPORAL ===
  "temporal-position": {
    values: ["past","present","future","eternal"],
    map: {
      "过去":"past","现在":"present","未来":"future","永久":"eternal",
      "当前":"present","以前":"past","以后":"future",
    },
    relationFamily: "time-and-temporality"
  },
  // === CHANGE DIRECTION ===
  "change-direction": {
    values: ["decline","stable","growth","transformation"],
    map: {
      "增加":"growth","上升":"growth","增长":"growth","提高":"growth",
      "减少":"decline","下降":"decline","降低":"decline","恶化":"decline",
      "改善":"growth","改进":"growth","进步":"growth",
      "改变":"transformation","变化":"transformation","转变":"transformation",
      "稳定":"stable","不变":"stable",
    },
    relationFamily: "change-and-development"
  },
  // === TRUTH / ACCURACY ===
  "truth-value": {
    values: ["false","inaccurate","approximate","accurate","true"],
    map: {
      "正确":"true","准确":"accurate","精确":"accurate","真实":"true",
      "错误":"false","假":"false","近似":"approximate",
    },
    relationFamily: "truth-and-accuracy"
  },
  // === DISTANCE / PROXIMITY ===
  " distance-proximity": {
    values: ["remote","distant","near","adjacent","immediate"],
    map: {
      "远":"distant","近":"near","附近":"near","遥远":"remote",
      "相邻":"adjacent","接近":"near","直接":"immediate",
    },
    relationFamily: "spatial-and-distance"
  },
  // === SOCIAL / RELATIONAL ===
  "social-relation": {
    values: ["individual","cooperative","competitive","hierarchical"],
    map: {
      "合作":"cooperative","竞争":"competitive","个人":"individual",
      "独立":"individual","协作":"cooperative","对抗":"competitive",
      "等级":"hierarchical",
    },
    relationFamily: "social-and-relational"
  },
  // === ECONOMIC ===
  "economic-value": {
    values: ["worthless","cheap","moderate","expensive","priceless"],
    map: {
      "贵":"expensive","便宜":"cheap","昂贵":"expensive","珍贵":"priceless",
      "价值":"moderate","财富":"expensive",
    },
    relationFamily: "economic-and-value"
  },
  // === HEALTH ===
  "health-state": {
    values: ["critical","sick","recovering","healthy","fit"],
    map: {
      "健康":"healthy","疾病":"sick","康复":"recovering","生病":"sick",
      "不适":"sick","强壮":"fit",
    },
    relationFamily: "health-and-wellness"
  },
  // === INCLUSION ===
  "inclusion-scope": {
    values: ["excluded","partial","included","comprehensive","universal"],
    map: {
      "包含":"included","包括":"included","排除":"excluded","全面":"comprehensive",
      "全部":"comprehensive","部分":"partial","广泛":"comprehensive",
    },
    relationFamily: "scope-and-inclusion"
  },
  // === SIMILARITY ===
  "similarity-degree": {
    values: ["identical","similar","different","opposite","unique"],
    map: {
      "相同":"identical","相似":"similar","类似":"similar","不同":"different",
      "相反":"opposite","独特":"unique","一致":"identical",
    },
    relationFamily: "comparison-and-similarity"
  },
  // === BENEFIT ===
  "benefit-value": {
    values: ["harmful","neutral","beneficial","essential"],
    map: {
      "有利":"beneficial","有益":"beneficial","有害":"harmful",
      "好处":"beneficial","坏处":"harmful","必要":"essential",
    },
    relationFamily: "benefit-and-harm"
  },
  // === COMPLETENESS ===
  "completeness": {
    values: ["incomplete","partial","complete","exhaustive"],
    map: {
      "完整":"complete","全部":"complete","部分":"partial",
      "完全":"complete","不完整":"incomplete","彻底":"exhaustive",
    },
    relationFamily: "completeness-and-extent"
  },
};

// Build reverse map: Chinese keyword -> { axis, value }
const keywordToAxis = new Map();
for (const [axis, config] of Object.entries(CONCEPT_AXES)) {
  for (const [keyword, value] of Object.entries(config.map)) {
    keywordToAxis.set(keyword, { axis, value });
  }
}

// CURATED SENSES for mandatory 11 words
const CURATED = {
  "word_b694ce56a114": { // prime
    axis: "importance-rank", value: "prime", relationFamily: "rank-and-priority",
    synonymKeys: ["primary","chief","main","principal"],
    ambiguityKeys: ["重要","主要","首要","最重要","主导"],
    allowedRelations: ["same-axis-different-value","adjacent-contrast"]
  },
  "word_7c8e615a1998": { // dominant
    axis: "power-level", value: "dominant", relationFamily: "power-and-control",
    synonymKeys: ["main","chief","primary","principal"],
    ambiguityKeys: ["主要","主导","首要","重要","支配"],
    allowedRelations: ["same-axis-different-value","adjacent-contrast"]
  },
  "word_5c4c54a4ea02": { // limited
    axis: "quantity-amount", value: "limited", relationFamily: "quantity-and-amount",
    synonymKeys: ["restricted","bounded","finite"],
    ambiguityKeys: ["有限","限制","局限","约束"],
    allowedRelations: ["same-axis-different-value","adjacent-contrast"]
  },
  "word_7167ee5c788b": { // aggressive
    axis: "emotion-valence", value: "negative", relationFamily: "emotion-and-affect",
    synonymKeys: ["hostile","belligerent","combative"],
    ambiguityKeys: ["好斗","攻击","侵犯","激进"],
    allowedRelations: ["sibling-concept"]  // different negative emotions = siblings
  },
  // impression — cognition/perception
  "word_c9ba4ead8f91": { // particularly — just for demo
    axis: "quantity-amount", value: "abundant", relationFamily: "quantity-and-amount",
    synonymKeys: ["especially","notably"],
    ambiguityKeys: ["特别","尤其","格外","非常"],
    allowedRelations: ["same-axis-different-value","adjacent-contrast"]
  }
};

// Build catalog
const catalog = [];
const stats = { total: 0, withAxis: 0, curated: 0 };

for (const item of meaningData.items) {
  const w = allById.get(item.wordId);
  if (!w) continue;
  stats.total++;
  const m = (w.meaning || "").trim();
  const pos = item.posFamily || npf(w.pos);
  const qs = w.quizSenses && w.quizSenses[0];
  const quizMeaning = qs ? qs.quizMeaningZh : m;

  // Check curated first
  let entry;
  if (CURATED[w.wordId]) {
    const c = CURATED[w.wordId];
    entry = {
      wordId: w.wordId, word: w.word, senseId: w.wordId + "-sense-1",
      posFamily: pos,
      quizMeaningZh: quizMeaning,
      meaningDetailedZh: w.meaningDetailedZh || m,
      conceptAxis: c.axis,
      conceptValue: c.value,
      relationFamily: c.relationFamily,
      synonymKeys: c.synonymKeys,
      ambiguityKeys: c.ambiguityKeys,
      allowedDistractorRelations: c.allowedRelations,
      sourceEvidence: ["curated"],
      confidence: "high"
    };
    stats.curated++;
  } else {
    // Auto-map from Chinese keywords
    let bestAxis = null, bestValue = null, bestRelation = null;
    for (const [keyword, av] of keywordToAxis) {
      if (m.includes(keyword) || quizMeaning.includes(keyword)) {
        bestAxis = av.axis;
        bestValue = av.value;
        bestRelation = CONCEPT_AXES[av.axis].relationFamily;
        break; // first match
      }
    }

    // Derive synonym keys from meaning substrings
    const clean = m.replace(/[；;，,、\s（）()\/]/g, "");
    const ambigKeys = [];
    for (let i = 0; i <= clean.length - 2; i++) {
      ambigKeys.push(clean.substring(i, i+2));
    }

    entry = {
      wordId: w.wordId, word: w.word, senseId: w.wordId + "-sense-1",
      posFamily: pos,
      quizMeaningZh: quizMeaning,
      meaningDetailedZh: w.meaningDetailedZh || m,
      conceptAxis: bestAxis || "general",
      conceptValue: bestValue || "unknown",
      relationFamily: bestRelation || "general",
      synonymKeys: [],
      ambiguityKeys: [...new Set(ambigKeys)].slice(0, 6),
      allowedDistractorRelations: bestAxis ? ["same-axis-different-value","adjacent-contrast"] : ["adjacent-contrast"],
      sourceEvidence: bestAxis ? ["keyword-mapped"] : ["auto-derived"],
      confidence: bestAxis ? "medium" : "low"
    };
    if (bestAxis) stats.withAxis++;
  }
  catalog.push(entry);
}

// Write catalog
const outPath = path.join(ROOT,"app/lib/meaning-mode/sense-relation-catalog.generated.mjs");
const outLines = [
  "// Auto-generated sense relation catalog for Meaning Mode — Phase 5.",
  "// Maps words to concept axes and values for semantic relationship classification.",
  "// Generated: " + new Date().toISOString(),
  "// DO NOT EDIT — regenerate: node app/lib/meaning-mode/build-sense-relation-catalog.cjs",
  "",
  "export const SENSE_RELATION_CATALOG = " + JSON.stringify(catalog, null, 2) + ";",
  "",
  "export function getRelationEntry(wordId) {",
  "  for (const entry of SENSE_RELATION_CATALOG) {",
  "    if (entry.wordId === wordId) return entry;",
  "  }",
  "  return null;",
  "}",
  "",
  "export const CONCEPT_AXES = " + JSON.stringify(Object.keys(CONCEPT_AXES)) + ";",
  "",
  "export const KNOWN_VALUES = " + JSON.stringify(
    Object.fromEntries(Object.entries(CONCEPT_AXES).map(([k,v]) => [k, v.values]))
  ) + ";",
  ""
];
fs.writeFileSync(outPath, outLines.join("\n"), "utf-8");

console.log("Catalog written:", outPath);
console.log("Total:", stats.total);
console.log("With axis:", stats.withAxis, "(" + (stats.withAxis/stats.total*100).toFixed(1) + "%)");
console.log("Curated:", stats.curated);
console.log("Unique axes:", Object.keys(CONCEPT_AXES).length);
console.log("Done.");
