/**
 * @deprecated LEGACY — do not use for production G reading bank.
 *
 * Current G-class reading uses reading-core-v3 layered pack:
 *   node scripts/import-reading-core-layers.mjs
 *
 * This script historically built a wide ~12k bank from master words.json + phrases.json.
 * Default run now exits with error. Explicit override only:
 *   node scripts/build-reading-g-vocab.mjs --allow-legacy-rebuild
 *
 * Source (legacy):
 *   - public/data/words.json  (master lexicon)
 *   - public/data/phrases.json (phrase layer)
 *
 * Output:
 *   - public/data/reading-g-vocab.json  (independent lexicon)
 *
 * Does NOT modify master words.json or phrases.json.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

if (!process.argv.includes("--allow-legacy-rebuild")) {
  console.error(
    [
      "DEPRECATED: build-reading-g-vocab.mjs must not overwrite the reading-core-v3 bank.",
      "当前G类阅读使用 reading-core-v3 分层词库。",
      "请运行: node scripts/import-reading-core-layers.mjs",
      "如需强制旧版宽筛重建，请显式传入: --allow-legacy-rebuild"
    ].join("\n")
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const wordsPath = path.join(root, "public", "data", "words.json");
const phrasesPath = path.join(root, "public", "data", "phrases.json");
const outPath = path.join(root, "public", "data", "reading-g-vocab.json");

/**
 * No hard size cap.
 * Include every word/phrase that passes G-class reading eligibility + human audit.
 */
const UNLIMITED = true;

const G_TOPICS = new Set([
  "工作", "住房", "教育", "健康", "交通", "社区", "消费", "旅行",
  "环境", "政府", "社会", "法律", "公共服务", "家庭", "科技"
]);

/** Human blocklist: too basic / calendar / colour / noise for G reading study. */
const WORD_BLOCKLIST = new Set([
  "a", "an", "the", "and", "or", "but", "so", "if", "to", "of", "in", "on", "at", "for", "from", "with", "by", "as",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his", "its", "our", "their",
  "this", "that", "these", "those", "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "have", "has", "had",
  "yes", "no", "ok", "okay", "hi", "hello", "bye", "please", "thanks", "thank", "sorry",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "red", "blue", "green", "yellow", "black", "white", "pink", "orange", "brown", "grey", "gray", "purple",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "first", "second", "third", "fourth", "fifth",
  "dog", "cat", "apple", "banana", "mum", "mom", "dad", "baby",
  "good", "bad", "big", "small", "hot", "cold", "new", "old", "nice", "happy", "sad",
  "go", "come", "get", "make", "take", "see", "look", "want", "like", "love", "know", "think", "say", "tell", "ask", "give", "put",
  "day", "night", "time", "year", "week", "month", "today", "tomorrow", "yesterday",
  "man", "woman", "boy", "girl", "people", "person", "thing", "way", "place", "home", "house", "school", "work", "job",
  "water", "food", "money", "book", "car", "bus", "phone", "computer",
  "very", "really", "just", "also", "too", "only", "still", "even", "much", "many", "some", "any", "all", "both", "each", "every",
  "here", "there", "now", "then", "again", "always", "never", "often", "sometimes",
  "up", "down", "left", "right", "near", "far", "out", "off", "over", "under", "into", "onto",
  // second-pass human audit: low-value short / noisy tokens for G reading study
  "act", "upon", "free", "fake", "post", "curb", "gap", "bulk", "tone", "seek", "tier", "army",
  "lead", "omit", "vat", "whom", "city", "vet", "ceo", "sake", "fall", "grower", "juror", "wartime",
  "file", "builder", "above", "below", "following", "previous", "current", "extra", "further",
  "mar", "haul", "heir", "lord", "urge", "need", "flaw", "tend", "unit", "via", "view", "rely"
]);

/** Human blocklist for low-value phrases in a reading entry. */
const PHRASE_BLOCKLIST = new Set([
  "thank you", "thanks a lot", "how are you", "nice to meet you", "good morning", "good afternoon",
  "good evening", "good night", "see you", "of course", "no problem", "i see", "i don't know",
  "the idea that", "the problem of", "problem of", "the cause of", "the amount of", "support for",
  "result(s) in", "claim that", "to be honest", "a drink and sandwiches", "main point", "linked to",
  "note that", "a couple of days"
]);

/**
 * Human priority words: classic IELTS G Reading / workplace / notices / paraphrase anchors.
 * These are forced in first if present in master lexicon (or synthesized if missing).
 */
const PRIORITY_WORDS = [
  // notices / instructions / procedures
  "available", "availability", "required", "requirement", "eligible", "eligibility", "compulsory", "optional",
  "deadline", "registration", "enrol", "enroll", "enrolment", "enrollment", "application", "applicant", "apply",
  "appointment", "booking", "reservation", "confirm", "confirmation", "cancel", "cancellation", "postpone",
  "extend", "extension", "renew", "renewal", "expire", "expiry", "valid", "validity", "invalid",
  "submit", "submission", "attach", "attachment", "document", "form", "fee", "charge", "refund", "deposit",
  "receipt", "invoice", "payment", "installment", "instalment", "discount", "refundable", "non-refundable",
  // workplace G reading
  "vacancy", "position", "candidate", "interview", "reference", "referee", "qualification", "experience",
  "responsibility", "responsible", "duty", "shift", "overtime", "salary", "wage", "benefit", "allowance",
  "colleague", "supervisor", "manager", "staff", "employee", "employer", "personnel", "human resources",
  "absence", "absent", "attendance", "leave", "resign", "resignation", "retire", "retirement", "promote", "promotion",
  "probation", "contract", "permanent", "temporary", "full-time", "part-time", "freelance", "intern", "internship",
  "deadline", "priority", "urgent", "schedule", "timetable", "agenda", "minutes", "meeting", "conference",
  "facility", "equipment", "maintenance", "installation", "procedure", "policy", "regulation", "guideline",
  "compliance", "comply", "violation", "breach", "restriction", "prohibit", "forbidden", "permitted", "permit",
  // housing / community / services
  "tenant", "landlord", "lease", "rent", "rental", "mortgage", "property", "residence", "residential",
  "neighbour", "neighbor", "neighbourhood", "neighborhood", "community", "suburb", "commute", "commuter",
  "utilities", "electricity", "plumbing", "repair", "renovation", "furniture", "appliance", "furnished",
  "notice", "eviction", "deposit", "bond", "inspection", "complaint", "maintenance",
  // education / training
  "course", "module", "syllabus", "assignment", "assessment", "exam", "examination", "certificate", "diploma",
  "degree", "undergraduate", "postgraduate", "tuition", "scholarship", "campus", "faculty", "lecturer", "tutor",
  "enrolment", "enrollment", "orientation", "prerequisite", "credit", "transcript", "deadline",
  // health / safety
  "symptom", "treatment", "prescription", "pharmacy", "clinic", "surgery", "emergency", "ambulance",
  "vaccination", "allergy", "allergic", "injury", "accident", "insurance", "claim", "coverage",
  "hazard", "risk", "precaution", "hygiene", "sanitation", "contamination", "infection",
  // travel / transport / leisure notices
  "itinerary", "destination", "departure", "arrival", "delay", "cancellation", "luggage", "baggage",
  "passport", "visa", "customs", "immigration", "boarding", "platform", "terminal", "transfer",
  "reservation", "occupancy", "accommodation", "hostel", "motel", "facility", "attraction", "admission",
  // paraphrase / reading logic words
  "according", "regarding", "concerning", "whereas", "although", "despite", "however", "therefore",
  "consequently", "furthermore", "moreover", "nevertheless", "otherwise", "unless", "provided",
  "significant", "considerable", "substantial", "minor", "major", "essential", "crucial", "vital",
  "approximately", "roughly", "estimate", "indicate", "suggest", "imply", "demonstrate", "illustrate",
  "compare", "contrast", "differ", "similar", "identical", "opposite", "alternative", "option",
  "advantage", "disadvantage", "benefit", "drawback", "impact", "effect", "cause", "factor", "reason",
  "purpose", "objective", "outcome", "result", "process", "stage", "phase",
  "increase", "decrease", "reduce", "decline", "rise", "fluctuate", "stable", "steady", "sharp",
  "gradual", "rapid", "slight", "moderate", "average", "total", "proportion",
  "majority", "minority", "percentage", "figure", "evidence", "research", "survey",
  "participant", "respondent", "sample", "findings", "conclusion", "summary", "overview", "detail",
  // admin / formal G text
  "authority", "administration", "administrative", "official", "agency", "department", "council", "committee",
  "scheme", "programme", "program", "initiative", "project", "campaign", "proposal", "request", "enquiry", "inquiry",
  "response", "reply", "acknowledge", "appreciation", "grateful", "sincerely", "faithfully",
  "apologise", "apologize", "apology", "inconvenience", "regret", "compensation", "replace", "replacement",
  "ensure", "assure", "guarantee", "undertake", "provide", "supply", "offer", "arrange", "arrangement",
  "inform", "notify", "notification", "announce", "announcement", "publish", "issue", "release",
  "access", "accessible", "entrance", "entry", "venue", "location", "premises",
  "capacity", "maximum", "minimum", "limit", "exceed", "sufficient", "inadequate", "appropriate", "suitable",
  "relevant", "irrelevant", "accurate", "inaccurate", "complete", "incomplete",
  "attached", "enclosed", "additional", "optional",
  "mandatory", "necessary", "unnecessary", "possible", "impossible", "likely", "unlikely", "certain",
  "responsible", "liable", "accountable", "obligation", "entitled", "entitle",
  // extra G reading staples
  "allocate", "allocation", "approve", "approval", "authorise", "authorize", "authorization",
  "clarify", "clarification", "commence", "commencement", "conclude", "conclusion",
  "conduct", "consult", "consultation", "correspondence", "criteria", "criterion",
  "deduct", "deduction", "demonstrate", "designate", "determine", "disclose", "disclosure",
  "distribute", "distribution", "efficient", "efficiency", "eliminate", "emphasis", "emphasise", "emphasize",
  "enable", "enhance", "establish", "establishment", "evaluate", "evaluation", "exclude", "exclusion",
  "expand", "expansion", "facilitate", "flexible", "flexibility", "frequently", "fundamental",
  "generate", "identify", "identity", "implement", "implementation", "impose", "improve", "improvement",
  "include", "inclusion", "indicate", "indication", "individual", "initially", "inspect", "inspection",
  "instruct", "instruction", "intend", "intention", "interpret", "interpretation", "investigate", "investigation",
  "involve", "involvement", "issue", "justify", "justification", "maintain", "maintenance",
  "manage", "management", "measure", "measurement", "monitor", "monitoring", "negotiate", "negotiation",
  "obtain", "occur", "operate", "operation", "organise", "organize", "organisation", "organization",
  "outline", "overall", "participate", "participation", "particular", "particularly", "perform", "performance",
  "permit", "permission", "persuade", "potential", "predict", "prediction", "prefer", "preference",
  "prepare", "preparation", "previous", "primarily", "primary", "principle", "prior", "priority",
  "procedure", "proceed", "process", "produce", "product", "production", "professional", "proficiency",
  "progress", "prohibit", "project", "promote", "promotion", "propose", "proposal", "protect", "protection",
  "provide", "provision", "purchase", "purpose", "qualify", "qualification", "quantity", "range",
  "recommend", "recommendation", "reduce", "reduction", "refer", "reference", "reflect", "refuse", "refusal",
  "regard", "regarding", "region", "regional", "register", "registration", "regulate", "regulation",
  "reject", "rejection", "relate", "relation", "relationship", "relevant", "rely", "remain", "remark",
  "remind", "remove", "require", "requirement", "research", "reserve", "resident", "residential",
  "resolve", "resolution", "resource", "respect", "respond", "response", "responsible", "responsibility",
  "restrict", "restriction", "result", "retain", "reveal", "review", "revise", "revision", "risk",
  "role", "salary", "sample", "schedule", "scheme", "section", "secure", "security", "select", "selection",
  "significant", "similar", "situation", "source", "specific", "specify", "staff", "standard", "statement",
  "status", "strategy", "structure", "submit", "subsequent", "succeed", "success", "sufficient", "suggest",
  "suitable", "summary", "support", "survey", "system", "target", "task", "temporary", "tend", "term",
  "theory", "therefore", "transfer", "transport", "trend", "typical", "undergo", "undertake", "unfortunately",
  "unique", "unit", "unless", "update", "urgent", "usually", "valid", "value", "variation", "various",
  "venue", "version", "via", "view", "visible", "volume", "volunteer", "welfare", "whereas", "whether",
  "whilst", "widespread", "willing", "workshop", "worth", "written"
];

/**
 * Human priority phrases: high-yield G reading / paraphrase / notice language.
 */
const PRIORITY_PHRASES = [
  "be due to", "because of", "according to", "in accordance with", "with regard to", "in terms of",
  "on behalf of", "as a result of", "as a result", "in addition to", "in addition", "for example",
  "such as", "rather than", "instead of", "in case of", "in case", "provided that", "as long as",
  "as well as", "in order to", "so as to", "so that", "even if", "even though", "despite the fact that",
  "be responsible for", "be required to", "be supposed to", "be expected to", "be allowed to",
  "be eligible for", "be available", "be available for", "be subject to", "subject to",
  "in advance", "no later than", "at least", "at most", "up to", "more than", "less than",
  "apply for", "fill in", "fill out", "sign up", "sign up for", "register for", "look for",
  "look after", "look into", "look forward to", "get in touch", "get in touch with", "contact details",
  "opening hours", "business hours", "registration fee", "application form", "waiting list",
  "job vacancy", "job opportunity", "work experience", "annual leave", "sick leave", "maternity leave",
  "public transport", "public transportation", "rush hour", "peak hour", "out of order", "under repair",
  "for sale", "for rent", "to let", "no parking", "keep clear", "do not enter", "staff only",
  "terms and conditions", "terms of use", "privacy policy", "code of conduct", "health and safety",
  "make sure", "make sure that", "take place", "take part in", "carry out", "set up", "put off",
  "put up with", "run out of", "deal with", "depend on", "focus on", "rely on", "consist of",
  "lead to", "result in", "contribute to", "relate to", "refer to", "belong to", "respond to",
  "apologise for", "apologize for", "thank you for", "complain about", "enquire about", "inquire about",
  "ask for advice", "provide information", "further information", "for further details", "for more information",
  "as soon as possible", "at your earliest convenience", "in the meantime", "in the long term",
  "in the short term", "on a regular basis", "from time to time", "in particular", "in general",
  "on the other hand", "in other words", "that is to say", "for instance", "to some extent",
  "a large number of", "a large amount of", "a variety of", "a range of", "the majority of",
  "access to education", "access to information", "quality of life", "standard of living",
  "cost of living", "working conditions", "working hours", "flexible working", "work-life balance",
  "full-time job", "part-time job", "job interview", "cover letter", "curriculum vitae",
  "rent increase", "monthly payment", "security deposit", "utility bill", "service charge",
  "public service", "community centre", "community center", "sports centre", "sports center",
  "opening ceremony", "closing date", "due date", "expiry date", "valid until", "subject to change",
  "no refund", "non-refundable deposit", "free of charge", "at no extra cost", "inclusive of",
  "exclusive of", "prior notice", "prior arrangement", "prior booking", "by appointment only",
  "first come first served", "on a first-come first-served basis", "limited availability",
  "highly recommended", "strictly prohibited", "not permitted", "not allowed", "must be worn",
  "in the event of", "in the event that", "in the absence of", "with the exception of",
  "regardless of", "irrespective of", "in comparison with", "in contrast to", "as opposed to",
  "on average", "in total", "in particular", "in detail", "in brief", "in summary",
  "it is essential that", "it is important that", "it is necessary to", "it is recommended that",
  "candidates should", "applicants must", "participants are required", "customers are advised",
  "please note that", "please ensure that", "please be aware that", "for your information",
  "as shown in", "as mentioned above", "as follows", "see below", "see attached",
  "be due to", "be caused by", "be linked to", "be associated with", "be related to",
  "have an impact on", "have an effect on", "play a role in", "take into account",
  "take into consideration", "bear in mind", "keep in mind", "make use of", "take advantage of"
];

function normalizeKey(word) {
  return String(word || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function hasSpace(word) {
  return /\s/.test(String(word || ""));
}

function isLikelyPersonName(entry) {
  const word = String(entry.word || "").trim();
  if (!/^[A-Z][a-z]+$/.test(word)) return false;
  const meaning = String(entry.meaning || "");
  if (/人名|姓氏|名字|男子名|女子名|地名/.test(meaning)) return true;
  if (!entry.phonetic && !entry.pos && meaning.length < 4) return true;
  return false;
}

function isAcademicNoise(entry) {
  const blob = `${entry.meaning || ""} ${entry.definition || ""} ${entry.example || ""}`;
  return /量子|染色体|线粒体|有机化学|无机化学|地质构造|天体物理|微分|积分|酶|核糖|化石燃料分子|古生物学/.test(blob);
}

function wordAuditRejectReason(entry) {
  const word = String(entry.word || "").trim();
  const key = normalizeKey(word);
  if (!key) return "empty";
  if (WORD_BLOCKLIST.has(key)) return "blocklist-basic";
  if (key.length <= 2) return "too-short";
  if (/\d/.test(word)) return "has-digit";
  if (/[^a-zA-Z'\-\s]/.test(word)) return "bad-char";
  if (!entry.meaning || String(entry.meaning).trim().length < 2) return "no-meaning";
  if (isLikelyPersonName(entry)) return "person-name";
  if (isAcademicNoise(entry)) return "academic-noise";
  // pure single-letter abbreviations
  if (/^[A-Z]{1,2}$/.test(word) && word === word.toUpperCase()) return "abbrev";
  return null;
}

function phraseAuditRejectReason(entry) {
  const word = String(entry.word || "").trim();
  const key = normalizeKey(word);
  if (!key) return "empty";
  if (PHRASE_BLOCKLIST.has(key)) return "blocklist-chat";
  if (key.length < 4) return "too-short";
  if (!entry.meaning || String(entry.meaning).trim().length < 2) return "no-meaning";
  // prefer multi-word; allow a few hyphen compounds
  if (!hasSpace(word) && !word.includes("-")) return "not-phrase-shape";
  // pure spoken chat / food-chat / pure listening map phrases
  if (/^(hi |hey |wow |oh |yeah )/i.test(word)) return "chatty";
  if (/to be honest|i would like|a drink|sandwiches|minutes' drive|next to the|near the supermarket|opposite the/i.test(key)) {
    return "listening-chat";
  }
  if (/as far as i can see|i think that|in my opinion/i.test(key) && !(entry.ieltsUse || []).includes("Reading")) {
    return "spoken-opinion";
  }
  return null;
}

/**
 * Whether a master-lexicon word belongs in the G-class reading study bank.
 * Inclusive by design: all Reading / G-letter / G-domain practical words that pass audit.
 */
function isGReadingWordEligible(entry) {
  if (wordAuditRejectReason(entry)) return false;
  const uses = new Set(entry.ieltsUse || []);
  const d = entry.difficulty || "";
  const topics = entry.topics || [];

  if (uses.has("Reading")) return true;
  if (uses.has("G类书信")) return true;
  if (d === "阅读扩展") return true;

  // workplace / life notices common in G Section 1–2
  if (uses.has("工作高频") && (d === "中级核心" || d === "高级加分" || d === "低频认识即可")) return true;
  if (uses.has("生活高频") && (d === "中级核心" || d === "高级加分") && topics.some((t) => G_TOPICS.has(t))) return true;

  // G practical domains even if Reading tag missing (classification lag)
  if (
    (d === "中级核心" || d === "高级加分") &&
    topics.some((t) => ["工作", "住房", "教育", "健康", "交通", "法律", "公共服务", "社区"].includes(t)) &&
    (uses.has("Listening") || uses.has("Task 2") || uses.has("Writing"))
  ) {
    return true;
  }

  return false;
}

function scoreWord(entry) {
  if (wordAuditRejectReason(entry)) return -999;
  const uses = new Set(entry.ieltsUse || []);

  let s = 2;
  if (uses.has("Reading")) s += 4;
  if (uses.has("G类书信")) s += 3.5;
  if (uses.has("工作高频")) s += 2.2;
  if (uses.has("生活高频")) s += 1.2;
  if (uses.has("Task 2")) s += 1.0;
  if (uses.has("Listening")) s += 0.4;
  if (uses.has("Speaking")) s += 0.2;

  const d = entry.difficulty || "";
  if (d === "中级核心") s += 3.2;
  if (d === "高级加分") s += 2.6;
  if (d === "阅读扩展") s += 3.5;
  if (d === "低频认识即可") s += 1.2;
  if (d === "基础高频") s += 0.15;

  for (const t of entry.topics || []) {
    if (G_TOPICS.has(t)) s += 0.75;
  }

  if (entry.example && String(entry.example).length > 12) s += 0.5;
  if (entry.phonetic) s += 0.2;
  if (entry.definition && String(entry.definition).length > 8) s += 0.2;

  const meaning = String(entry.meaning || "");
  if (/申请|登记|预约|取消|费用|退款|资格|规定|责任|设施|通知|投诉|租金|合同|职位|空缺|保险|交通|社区|服务/.test(meaning)) {
    s += 1.4;
  }
  if (/生态|细胞|分子|地质|天文学|考古学|哲学流派/.test(meaning)) s -= 1.2;
  if (/ly$/i.test(entry.word) && d === "基础高频") s -= 0.8;

  return s;
}

function isGReadingPhraseEligible(entry) {
  if (phraseAuditRejectReason(entry)) return false;
  const key = normalizeKey(entry.word);
  if (/^[a-z]+\([s]\)$/i.test(key) || /\(s\)/.test(key)) return false;
  if (/^(the|a|an) (idea|problem|cause|amount|level|way|manner) (of|that|in which)$/i.test(key)) return false;
  if (/^(artists and|agricultural |a lot of skill|a lot of hard work|almost as important)/i.test(key)) return false;
  if (/^all participants$|^any time of year$|^a whole range of$|^a valuable element/i.test(key)) return false;

  const uses = new Set(entry.ieltsUse || []);
  if (uses.has("Reading") || uses.has("G类书信")) return true;

  // functional paraphrase / notice patterns still useful even without tags
  if (/due to|according to|in accordance|with regard|in terms of|on behalf|as a result|in addition|rather than|instead of|in case|provided that|responsible for|required to|eligible for|subject to|in advance|no later than|apply for|fill in|fill out|waiting list|job vacancy|work experience|public transport|terms and conditions|make sure|take place|carry out|look forward|get in touch|opening hours|registration fee|in the event|regardless of|take into account|access to|quality of life|working conditions|part-time|full-time|free of charge|prior notice|by appointment/i.test(key)) {
    return true;
  }

  // workplace / life multiword with solid mid difficulty
  if (
    (uses.has("工作高频") || uses.has("生活高频") || uses.has("Task 2")) &&
    (entry.difficulty === "中级核心" || entry.difficulty === "高级加分")
  ) {
    return true;
  }

  return false;
}

function scorePhrase(entry) {
  if (phraseAuditRejectReason(entry)) return -999;
  const keyNorm = normalizeKey(entry.word);
  // reject skeleton / meta-looking phrase shapes
  if (/^[a-z]+\([s]\)$/i.test(keyNorm) || /\(s\)/.test(keyNorm)) return -999;
  if (/^(the|a|an) (idea|problem|cause|amount|level|way|manner) (of|that|in which)$/i.test(keyNorm)) return -999;

  const uses = new Set(entry.ieltsUse || []);
  let s = 1.5;

  if (uses.has("Reading")) s += 3.2;
  if (uses.has("G类书信")) s += 2.6;
  if (uses.has("工作高频")) s += 1.5;
  if (uses.has("生活高频")) s += 1.0;
  if (uses.has("Task 2")) s += 1.0;
  if (uses.has("Listening")) s += 0.6;

  const d = entry.difficulty || "";
  if (d === "中级核心" || d === "高级加分") s += 1.8;
  if (d === "基础高频") s += 0.4;

  for (const t of entry.topics || []) {
    if (G_TOPICS.has(t)) s += 0.55;
  }

  const key = normalizeKey(entry.word);
  if (/due to|according to|in accordance|with regard|in terms of|on behalf|as a result|in addition|rather than|instead of|in case|provided that|responsible for|required to|eligible for|subject to|in advance|no later than|apply for|fill in|fill out|waiting list|job vacancy|work experience|public transport|terms and conditions|for further|please note|make sure|take place|carry out|look forward|get in touch|opening hours|registration fee|in the event|regardless of|in comparison|have an impact|take into account|access to|quality of life|working conditions|part-time|full-time|rent increase|security deposit|free of charge|prior notice|by appointment/i.test(key)) {
    s += 3.5;
  }

  if (entry.example && String(entry.example).length > 10) s += 0.4;
  // prefer 2-5 word functional phrases over very long spoken ones
  const tokens = key.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && tokens.length <= 6) s += 0.8;
  if (tokens.length > 8) s -= 1.2;

  // need some G/reading signal OR functional pattern
  if (!uses.has("Reading") && !uses.has("G类书信") && s < 5.5) s -= 1.5;

  return s;
}

function pickDomain(entry) {
  const topics = entry.topics || [];
  for (const t of ["工作", "住房", "教育", "健康", "交通", "社区", "旅行", "法律", "公共服务", "消费", "环境", "社会", "科技", "家庭"]) {
    if (topics.includes(t)) return t;
  }
  const uses = entry.ieltsUse || [];
  if (uses.includes("工作高频")) return "工作";
  if (uses.includes("生活高频")) return "生活";
  if (uses.includes("G类书信")) return "书信通知";
  if (uses.includes("Reading")) return "阅读通用";
  return "综合";
}

function toItem(entry, entryType, score, audit) {
  return {
    id: entry.id || entry.wordId || `${entryType}_${normalizeKey(entry.word).replace(/[^a-z0-9]+/g, "_")}`,
    entryType,
    word: String(entry.word || "").trim(),
    phonetic: String(entry.phonetic || "").trim(),
    pos: String(entry.pos || (entryType === "phrase" ? "phrase" : "")).trim(),
    meaning: String(entry.meaning || "").trim(),
    definition: String(entry.definition || "").trim(),
    example: String(entry.example || "").trim(),
    exampleCn: String(entry.exampleCn || "").trim(),
    collocations: Array.isArray(entry.collocations) ? entry.collocations.slice(0, 4) : [],
    phraseCollocations: Array.isArray(entry.phraseCollocations) ? entry.phraseCollocations.slice(0, 3) : [],
    ieltsUse: Array.isArray(entry.ieltsUse) ? entry.ieltsUse : [],
    topics: Array.isArray(entry.topics) ? entry.topics : [],
    difficulty: String(entry.difficulty || "").trim() || (entryType === "phrase" ? "中级核心" : "中级核心"),
    category: "IELTS G类 · Reading",
    domain: pickDomain(entry),
    auditScore: Number(score.toFixed(2)),
    auditTags: audit
  };
}

function build() {
  const master = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
  const phrasePack = JSON.parse(fs.readFileSync(phrasesPath, "utf8"));
  const allWords = Array.isArray(master.words) ? master.words : [];
  const allPhrases = Array.isArray(phrasePack.phrases) ? phrasePack.phrases : [];

  const wordByKey = new Map();
  for (const w of allWords) {
    const key = normalizeKey(w.word);
    if (key && !wordByKey.has(key)) wordByKey.set(key, w);
  }
  const phraseByKey = new Map();
  for (const p of allPhrases) {
    const key = normalizeKey(p.word);
    if (key && !phraseByKey.has(key)) phraseByKey.set(key, p);
  }

  const selectedWords = [];
  const selectedPhrases = [];
  const seenWord = new Set();
  const seenPhrase = new Set();
  const rejectStats = { words: {}, phrases: {} };

  function noteReject(kind, reason) {
    rejectStats[kind][reason] = (rejectStats[kind][reason] || 0) + 1;
  }

  // 1) Force human priority words
  for (const raw of PRIORITY_WORDS) {
    const key = normalizeKey(raw);
    if (!key || seenWord.has(key)) continue;
    const hit = wordByKey.get(key);
    if (!hit) continue;
    const reason = wordAuditRejectReason(hit);
    if (reason) {
      noteReject("words", reason);
      continue;
    }
    // priority words can enter even without Reading tag if they are G-core
    const uses = new Set(hit.ieltsUse || []);
    if (!uses.has("Reading") && !uses.has("G类书信") && !uses.has("工作高频") && !uses.has("生活高频")) {
      // still allow if in priority list (human seed)
    }
    selectedWords.push(toItem(hit, "word", Math.max(scoreWord(hit), 20), ["priority-seed", "human-list"]));
    seenWord.add(key);
  }

  // 2) Force human priority phrases
  for (const raw of PRIORITY_PHRASES) {
    const key = normalizeKey(raw);
    if (!key || seenPhrase.has(key)) continue;
    const hit = phraseByKey.get(key);
    if (!hit) continue;
    const reason = phraseAuditRejectReason(hit);
    if (reason) {
      noteReject("phrases", reason);
      continue;
    }
    selectedPhrases.push(toItem(hit, "phrase", Math.max(scorePhrase(hit), 20), ["priority-seed", "human-list"]));
    seenPhrase.add(key);
  }

  // 3) Include ALL remaining eligible G-reading words (no size cap)
  for (const w of allWords) {
    const key = normalizeKey(w.word);
    if (!key || seenWord.has(key)) continue;

    const reason = wordAuditRejectReason(w);
    if (reason) {
      noteReject("words", reason);
      continue;
    }
    if (!isGReadingWordEligible(w)) {
      noteReject("words", "not-g-reading-eligible");
      continue;
    }

    const s = scoreWord(w);
    const tags = ["eligible-pass"];
    if ((w.ieltsUse || []).includes("Reading")) tags.push("reading-tagged");
    if ((w.ieltsUse || []).includes("G类书信")) tags.push("g-letter");
    if ((w.ieltsUse || []).includes("工作高频")) tags.push("work-freq");
    selectedWords.push(toItem(w, "word", s, tags));
    seenWord.add(key);
  }

  // 4) Include ALL remaining eligible G-reading phrases (no size cap)
  for (const p of allPhrases) {
    const key = normalizeKey(p.word);
    if (!key || seenPhrase.has(key)) continue;

    const reason = phraseAuditRejectReason(p);
    if (reason) {
      noteReject("phrases", reason);
      continue;
    }
    if (!isGReadingPhraseEligible(p)) {
      noteReject("phrases", "not-g-reading-eligible");
      continue;
    }

    const s = scorePhrase(p);
    const tags = ["eligible-pass"];
    if ((p.ieltsUse || []).includes("Reading")) tags.push("reading-tagged");
    if ((p.ieltsUse || []).includes("G类书信")) tags.push("g-letter");
    selectedPhrases.push(toItem(p, "phrase", s, tags));
    seenPhrase.add(key);
  }

  // Final assembly: words first by score, then phrases
  selectedWords.sort((a, b) => b.auditScore - a.auditScore || a.word.localeCompare(b.word));
  selectedPhrases.sort((a, b) => b.auditScore - a.auditScore || a.word.localeCompare(b.word));

  const items = [...selectedWords, ...selectedPhrases];
  const hash = crypto.createHash("sha256").update(JSON.stringify(items.map((x) => x.word))).digest("hex").slice(0, 16);

  const domainStats = {};
  const typeStats = { word: 0, phrase: 0 };
  const difficultyStats = {};
  for (const item of items) {
    typeStats[item.entryType] = (typeStats[item.entryType] || 0) + 1;
    domainStats[item.domain] = (domainStats[item.domain] || 0) + 1;
    difficultyStats[item.difficulty || "?"] = (difficultyStats[item.difficulty || "?"] || 0) + 1;
  }

  const payload = {
    version: "reading-g-vocab-v2-full",
    generatedAt: new Date().toISOString(),
    source: {
      words: "public/data/words.json",
      phrases: "public/data/phrases.json"
    },
    count: items.length,
    wordCount: selectedWords.length,
    phraseCount: selectedPhrases.length,
    unlimited: UNLIMITED,
    lexiconHash: hash,
    note: "雅思 G 类阅读全量词库（单词+词组）。无数量上限：凡通过人工审核且可归入 G 类阅读的条目全部收录。去基础噪音/人名/聊天语/过偏学术词。与主词库、零基础词库隔离。",
    audit: {
      method: "human-priority-seed + eligibility-pass-all + blocklists",
      policy: "include every eligible G-reading word/phrase (no 1500 cap)",
      rejectStats,
      priorityWordSeeds: PRIORITY_WORDS.length,
      priorityPhraseSeeds: PRIORITY_PHRASES.length
    },
    domainStats,
    typeStats,
    difficultyStats,
    items
  };

  fs.writeFileSync(outPath, JSON.stringify(payload), "utf8");

  console.log(`Wrote ${items.length} items -> ${outPath}`);
  console.log(`  words: ${selectedWords.length} (unlimited eligible)`);
  console.log(`  phrases: ${selectedPhrases.length} (unlimited eligible)`);
  console.log("  domains:", Object.entries(domainStats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(", "));
  console.log("  difficulty:", Object.entries(difficultyStats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(", "));
  console.log("  sample words:", selectedWords.slice(0, 12).map((x) => x.word).join(", "));
  console.log("  sample phrases:", selectedPhrases.slice(0, 12).map((x) => x.word).join(", "));
  console.log("  reject words top:", Object.entries(rejectStats.words).sort((a, b) => b[1] - a[1]).slice(0, 8));
  console.log("  reject phrases top:", Object.entries(rejectStats.phrases).sort((a, b) => b[1] - a[1]).slice(0, 8));
}

build();
