const BASIC_A1_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "i", "you", "he", "she", "it", "we", "they",
  "am", "is", "are", "was", "were", "be", "been", "being", "do", "does", "did",
  "go", "come", "get", "make", "have", "has", "had", "good", "bad", "big", "small",
  "new", "old", "hot", "cold", "yes", "no", "one", "two", "three"
]);

const HUMAN_NAME_HINTS = new Set([
  "john", "mary", "peter", "david", "sarah", "michael", "linda", "james", "robert", "anna"
]);

export const IELTS_GT_10K_CATEGORIES = [
  { key: "daily_life", name: "日常生活", targetCount: 950, topics: ["生活", "住房", "家庭"], examples: ["appliance", "balcony", "basement", "blanket", "cabinet", "chores", "corridor", "curtain", "drawer", "fixture", "fridge", "laundry", "maintenance", "neighbourhood", "outlet", "property", "routine", "storage", "tenant", "utility"] },
  { key: "workplace", name: "工作职场", targetCount: 850, topics: ["工作", "职场"], examples: ["applicant", "appointment", "colleague", "deadline", "department", "employee", "employer", "feedback", "internship", "interview", "manager", "overtime", "position", "promotion", "recruit", "reference", "resign", "schedule", "supervisor", "workload"] },
  { key: "shopping_services", name: "购物服务", targetCount: 700, topics: ["消费", "服务"], examples: ["aisle", "barcode", "brand", "cashier", "checkout", "complaint", "coupon", "discount", "exchange", "guarantee", "invoice", "membership", "purchase", "receipt", "refund", "retail", "service", "stock", "warranty", "wholesale"] },
  { key: "healthcare", name: "医疗健康", targetCount: 700, topics: ["健康", "医疗"], examples: ["allergy", "ambulance", "appointment", "clinic", "cough", "diagnosis", "diet", "emergency", "exercise", "fatigue", "fever", "insurance", "medicine", "nurse", "patient", "prescription", "recovery", "symptom", "treatment", "vaccine"] },
  { key: "transport_travel", name: "交通旅行", targetCount: 850, topics: ["交通", "旅行"], examples: ["accommodation", "arrival", "baggage", "boarding", "booking", "commute", "delay", "departure", "destination", "fare", "ferry", "itinerary", "journey", "luggage", "platform", "reservation", "route", "terminal", "traffic", "transfer"] },
  { key: "education_training", name: "教育培训", targetCount: 800, topics: ["教育", "培训"], examples: ["assignment", "attendance", "certificate", "coursework", "curriculum", "degree", "diploma", "enrol", "feedback", "lecture", "library", "module", "qualification", "seminar", "skill", "subject", "tutorial", "tuition", "workshop", "assessment"] },
  { key: "social_communication", name: "社交沟通", targetCount: 650, topics: ["社会", "沟通"], examples: ["apologise", "arrange", "attitude", "behaviour", "community", "conversation", "cooperate", "culture", "discuss", "explain", "friendship", "gesture", "greeting", "invite", "message", "neighbour", "opinion", "request", "respond", "trust"] },
  { key: "public_services", name: "政府公共服务", targetCount: 700, topics: ["政府", "公共服务"], examples: ["authority", "benefit", "council", "document", "election", "facility", "identity", "licence", "official", "permit", "policy", "procedure", "public", "register", "regulation", "resident", "service", "tax", "welfare", "application"] },
  { key: "finance_contracts", name: "金融合同", targetCount: 650, topics: ["金融", "合同"], examples: ["account", "agreement", "balance", "bankrupt", "budget", "charge", "contract", "deposit", "expense", "fee", "income", "interest", "loan", "mortgage", "payment", "receipt", "refund", "rent", "savings", "statement"] },
  { key: "environment_news_tech", name: "环境新闻科技", targetCount: 800, topics: ["环境", "科技", "新闻"], examples: ["battery", "broadcast", "climate", "device", "digital", "emission", "energy", "equipment", "forecast", "innovation", "internet", "media", "pollution", "recycle", "resource", "software", "technology", "update", "waste", "wildlife"] },
  { key: "gt_letters", name: "G类书信表达", targetCount: 650, topics: ["G类书信", "写作"], examples: ["apologise", "appreciate", "arrange", "available", "concern", "confirm", "enquire", "grateful", "inform", "inconvenience", "kindly", "mention", "notice", "regarding", "request", "resolve", "response", "sincerely", "suitable", "unfortunately"] },
  { key: "high_frequency_parts", name: "高频动词/形容词/副词", targetCount: 900, topics: ["高频", "表达"], examples: ["achieve", "adjust", "affect", "allow", "avoid", "beneficial", "careful", "clearly", "compare", "consider", "efficient", "essential", "frequently", "improve", "likely", "maintain", "necessary", "provide", "reduce", "significant"] },
  { key: "abstract_practical", name: "抽象实用词", targetCount: 800, topics: ["抽象", "实用"], examples: ["access", "advantage", "approach", "aspect", "benefit", "challenge", "condition", "consequence", "factor", "feature", "impact", "issue", "method", "option", "priority", "process", "purpose", "requirement", "solution", "value"] }
];

function wordListFrom(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.words)) return input.words;
  return [];
}

function normalizeHeadword(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^[^a-z]+|[^a-z]+$/g, "")
    .replace(/\s+/g, " ");
}

function isStrictHeadword(word) {
  const text = normalizeHeadword(word);
  if (!text) return false;
  if (text.includes(" ")) return false;
  if (!/^[a-z][a-z'-]*$/.test(text)) return false;
  if (BASIC_A1_WORDS.has(text)) return false;
  if (HUMAN_NAME_HINTS.has(text)) return false;
  return true;
}

function categoryForWord(word) {
  const haystack = [
    word.category,
    word.meaning,
    word.definition,
    ...(Array.isArray(word.topics) ? word.topics : []),
    ...(Array.isArray(word.ieltsUse) ? word.ieltsUse : [])
  ].join(" ").toLowerCase();

  return IELTS_GT_10K_CATEGORIES.find((category) =>
    category.topics.some((topic) => haystack.includes(String(topic).toLowerCase()))
  ) || IELTS_GT_10K_CATEGORIES.find((category) => category.key === "abstract_practical");
}

export function buildIeltsGt10kPlan() {
  return {
    targetName: "IELTS General Training 4-6",
    targetHeadwordCount: 10_000,
    strictRules: [
      "只统计 wordId 唯一词头",
      "不包含人名",
      "不包含基础A1词",
      "不包含短语",
      "不包含重复词",
      "不使用大小写变体凑数"
    ],
    cleaningRules: [
      "删除人名",
      "排除简单基础词",
      "按规范化词头去重",
      "标记疑似拼写错误词",
      "检查音标/释义/例句一致性",
      "剔除无效条目"
    ],
    supplementRules: [
      "IELTS GT 4-6 level",
      "生活/工作/服务高实用性",
      "可用于写作/口语/阅读",
      "不GRE化",
      "不堆砌专业术语",
      "必须有例句、释义、分类"
    ],
    categories: IELTS_GT_10K_CATEGORIES.map((category) => ({
      ...category,
      currentCount: 0,
      gap: category.targetCount,
      supplementStandard: "优先补充 IELTS GT 4-6 常见生活、工作、公共服务语境下可自然使用的词头"
    }))
  };
}

export function analyzeIeltsGt10kVocabulary(input) {
  const words = wordListFrom(input);
  const plan = buildIeltsGt10kPlan();
  const unique = new Map();
  const invalid = [];

  for (const word of words) {
    const headword = normalizeHeadword(word.word || word.answer || word.text);
    if (!headword || !isStrictHeadword(headword)) {
      invalid.push({ word: word.word || "", reason: "not_strict_headword" });
      continue;
    }
    if (!unique.has(headword)) unique.set(headword, word);
  }

  const categoryCounts = new Map(plan.categories.map((category) => [category.key, 0]));

  for (const word of unique.values()) {
    const category = categoryForWord(word);
    categoryCounts.set(category.key, (categoryCounts.get(category.key) || 0) + 1);
  }

  const categories = plan.categories.map((category) => {
    const currentCount = categoryCounts.get(category.key) || 0;
    return {
      ...category,
      currentCount,
      gap: Math.max(0, category.targetCount - currentCount)
    };
  });

  return {
    targetHeadwordCount: plan.targetHeadwordCount,
    rawCount: words.length,
    uniqueHeadwordCount: unique.size,
    validHeadwordCount: unique.size,
    invalidCount: invalid.length,
    gapToTarget: Math.max(0, plan.targetHeadwordCount - unique.size),
    invalidSamples: invalid.slice(0, 30),
    categories
  };
}
