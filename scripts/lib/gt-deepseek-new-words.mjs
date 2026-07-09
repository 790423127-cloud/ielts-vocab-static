/**
 * Generate complete GT new-word entries via DeepSeek.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPollutedMeaning } from "./gt-meaning-zh.mjs";
import { normMeaningKey, normExampleSkeleton, BANNED_EXAMPLE } from "./gt-quality-gates.mjs";
import { EXTRA_SEEDS } from "./gt-new-word-seeds.mjs";

const CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.ai-cache/p0-new-words-cache.json");

const SEED_WORDS = [
  "maintenance", "plumber", "carpenter", "handyman", "eviction", "inventory", "refurbish", "renovate",
  "employer", "payroll", "payslip", "probation", "resignation", "supervisor", "appraisal", "induction",
  "overdrawn", "transaction", "mortgage", "instalment", "reimburse", "invoice", "penalty", "pension",
  "itinerary", "departure", "baggage", "reschedule", "commute", "pedestrian", "customs", "shuttle",
  "prescription", "symptom", "vaccination", "referral", "enrol", "curriculum", "nursery", "childcare",
  "warranty", "replacement", "reservation", "allergy", "acknowledge", "complaint", "deadline", "feedback",
  "eligible", "mandatory", "compliance", "liability", "provision", "promptly", "gratitude", "inconvenience",
  "firefighter", "paramedic", "janitor", "receptionist", "courier", "dispatcher", "inspector", "surveyor",
  "architect", "contractor", "subcontractor", "warehouse", "logistics", "freight", "shipment", "dispatch",
  "stocktake", "barcode", "checkout", "cashier", "refund", "guarantee", "subscription", "membership",
  "renewal", "cancellation", "booking", "confirmation", "reminder", "notification", "alert", "revision",
  "amendment", "clause", "agreement", "consent", "permission", "authorisation", "restriction", "exemption",
  "waiver", "subsidy", "allowance", "benefit", "pensioner", "retiree", "trainee", "apprentice", "intern",
  "volunteer", "freelancer", "consultant", "adviser", "counsellor", "therapist", "physiotherapist",
  "pharmacist", "dentist", "optician", "midwife", "nurse", "surgeon", "specialist", "diagnosis",
  "treatment", "therapy", "recovery", "rehabilitation", "discharge", "outpatient", "inpatient", "ambulance",
  "emergency", "casualty", "ward", "clinic", "surgery", "checkup", "screening", "immunisation",
  "postcode", "landlord", "tenant", "lease", "tenancy", "rental", "overdraft", "standingorder",
  "directdebit", "policyholder", "claimant", "broker", "premium", "excess", "deductible", "takeaway",
  "catering", "groceries", "deliver", "parcel", "package", "platform", "timetable", "diversion",
  "concession", "ferry", "terminal", "immigration", "visa", "passport", "boarding", "runway",
  "airline", "checkin", "enquiry", "inquiry", "apology", "invitation", "application", "registration",
  "enrolment", "attendance", "absence", "coursework", "assignment", "extension", "scholarship", "tuition",
  "semester", "placement", "graduation", "certificate", "diploma", "qualification", "accreditation",
  "competency", "assessment", "evaluation", "supervision", "mentoring", "coaching", "briefing", "handover",
  "onboarding", "offboarding", "redundancy", "severance", "negotiation", "arbitration", "mediation",
  "tribunal", "ombudsman", "regulator", "inspectorate", "audit", "inspection", "repair", "installation",
  "compensation", "reimbursement", "settlement", "negligence", "breach", "violation", "sanction",
  "suspension", "termination", "clarification", "verification", "authentication", "announcement",
  "caretaker", "groundskeeper", "caretaking", "caretaker", "locksmith", "glazier", "roofer", "decorator",
  "gardener", "cleaner", "housekeeper", "caretaker", "laundrette", "drycleaner", "tailor", "shoemaker",
  "baker", "butcher", "greengrocer", "newsagent", "pharmacy", "optometrist", "audiologist", "radiographer",
  "sonographer", "pathologist", "anaesthetist", "cardiologist", "dermatologist", "orthodontist", "podiatrist",
  "chiropractor", "osteopath", "nutritionist", "dietitian", "caregiver", "babysitter", "au-pair", "nanny",
  "toddler", "preschool", "kindergarten", "playgroup", "afterschool", "homework", "coursebook", "textbook",
  "workbook", "handout", "worksheet", "syllabus", "module", "seminar", "workshop", "tutorial",
  "lecture", "practical", "laboratory", "fieldwork", "dissertation", "thesis", "bibliography", "footnote",
  "appendix", "glossary", "index", "preface", "foreword", "acknowledgement", "copyright", "trademark",
  "patent", "licence", "permit", "certificate", "accreditation", "endorsement", "recommendation", "reference",
  "testimonial", "portfolio", "CV", "resume", "coverletter", "interview", "shortlist", "offerletter",
  "contract", "agreement", "probationary", "noticeperiod", "gardenleave", "overtime", "timesheet", "shiftwork",
  "nightshift", "dayshift", "weekendshift", "flexitime", "remote", "hybrid", "workplace", "headquarters",
  "branch", "outlet", "franchise", "supplier", "vendor", "retailer", "wholesaler", "manufacturer",
  "distributor", "importer", "exporter", "customs", "tariff", "duty", "levy", "surcharge",
  "overcharge", "undercharge", "miscalculation", "discrepancy", "reconciliation", "statement", "balance",
  "creditlimit", "debit", "credit", "transfer", "withdrawal", "deposit", "savings", "currentaccount",
  "jointaccount", "beneficiary", "nominee", "executor", "trustee", "guardian", "ward", "dependant",
  "nextofkin", "emergencycontact", "GP", "surgery", "pharmacy", "repeatprescription", "dosage", "sideeffect",
  "allergic", "intolerance", "dietary", "vegetarian", "vegan", "glutenfree", "halal", "kosher",
  "takeout", "delivery", "collection", "pickup", "dropoff", "courier", "tracking", "dispatch",
  "waybill", "consignment", "manifest", "customsdeclaration", "dutyfree", "handluggage", "checkin", "gate",
  "layover", "stopover", "transit", "connection", "delay", "cancellation", "overbooking", "upgrade",
  "downgrade", "refund", "voucher", "compensation", "claimform", "supportingdocument", "photocopy", "scan",
  "upload", "download", "attachment", "enclosure", "cc", "bcc", "subjectline", "salutation",
  "closing", "signature", "postscript", "memo", "minutes", "agenda", "bulletin", "circular",
  "leaflet", "brochure", "pamphlet", "handbook", "guideline", "regulation", "bylaw", "ordinance",
  "statute", "legislation", "jurisdiction", "entitlement", "obligation", "entitlement", "waiver", "forfeit",
  "penaltyclause", "coolingoff", "coolingperiod", "graceperiod", "extension", "deferral", "postponement",
  "adjournment", "rescheduling", "rebooking", "reallocation", "reassignment", "relocation", "removal", "disposal",
  "recycling", "composting", "landfill", "hazardous", "asbestos", "insulation", "ventilation", "drainage",
  "plumbing", "electrical", "rewiring", "rewiring", "fusebox", "meterreading", "utilitybill", "standingcharge",
  "tariff", "rateable", "council tax", "counciltax", "rates", "servicecharge", "groundrent", "freeholder",
  "leaseholder", "managingagent", "estateagent", "lettingagent", "viewing", "referencecheck", "credit check",
  "guarantor", "co-signer", "roommate", "flatmate", "housemate", "lodger", "sublet", "sublease",
  "breakclause", "notice", "evictionnotice", "section21", "depositprotection", "inventorycheck", "checkout", "checkin"
];

function uniqueSeeds(existing) {
  const seen = new Set(existing);
  const out = [];
  for (const w of [...SEED_WORDS, ...EXTRA_SEEDS]) {
    const k = String(w).toLowerCase().replace(/\s+/g, "");
    if (!k || seen.has(k) || out.includes(k)) continue;
    out.push(k);
    seen.add(k);
  }
  return out;
}

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { return { entries: [] }; }
}
function writeCache(data) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(data, null, 2), "utf8");
}

function cleanJson(text) {
  return String(text || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function passesGates(entry, gates, reserved = null) {
  if (!entry?.word || !entry.meaningZh || !entry.example) return false;
  if (isPollutedMeaning(entry.meaningZh)) return false;
  if (BANNED_EXAMPLE.test(entry.example)) return false;
  if (/[a-zA-Z]{5,}/.test(entry.meaningZh)) return false;
  if (!gates) return true;
  const mk = normMeaningKey(entry.meaningZh);
  const sk = normExampleSkeleton(entry.example);
  const meaningUsed = (gates.meaningCounts.get(mk) || 0) + (reserved?.meaningCounts.get(mk) || 0);
  const skelUsed = (gates.skeletonCounts.get(sk) || 0) + (reserved?.skeletonCounts.get(sk) || 0);
  if (meaningUsed >= 2) return false;
  if (skelUsed >= 3) return false;
  return true;
}

async function callDeepSeek(apiKey, model, prompt) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "你是 IELTS G 类词库编辑。只返回合法 JSON，例句必须多样化。" },
            { role: "user", content: prompt }
          ],
          temperature: 0.25,
          max_tokens: 12000,
          response_format: { type: "json_object" }
        })
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 200)}`);
      const outer = JSON.parse(raw);
      const content = cleanJson(outer.choices?.[0]?.message?.content || "{}");
      return JSON.parse(content);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export function loadCachedNewWordEntries() {
  const cache = readCache();
  return (cache.entries || []).filter(
    (e) => e?.word && e.meaningZh && e.example && !isPollutedMeaning(e.meaningZh) && !BANNED_EXAMPLE.test(e.example)
  );
}

function rowToEntry(row) {
  const word = String(row.word || "").trim();
  const k = word.toLowerCase();
  const meaningZh = String(row.chinese_meaning || "").trim();
  const example = String(row.ielts_example || row.example || "").trim();
  return {
    word,
    normalizedHeadword: k,
    pos: row.pos || "noun",
    meaningZh,
    definition: row.english_definition || meaningZh,
    example,
    exampleCn: row.example_chinese || "",
    topics: Array.isArray(row.topics) ? row.topics.slice(0, 2) : ["公共服务"],
    difficulty: row.difficulty || "中级核心",
    category: `IELTS G类 · ${(row.topics || ["公共服务"])[0]}`,
    targetBand: row.targetBand || "5-6",
    gTUseCase: row.gTUseCase || `${(row.topics || ["公共服务"])[0]}场景`,
    utilityScore: 7,
    candidateSource: "deepseek-p0-new-words",
    sourceType: "internal-editorial",
    duplicateCheckResult: "pass"
  };
}

export async function generateNewWordEntries(existingHeadwords, needCount, gates = null) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  if (!apiKey) throw new Error("Missing DEEPSEEK_API_KEY");

  const cache = readCache();
  const used = new Set([...existingHeadwords].map((w) => String(w).toLowerCase()));
  const results = [];
  const seen = new Set();
  const reserved = { meaningCounts: new Map(), skeletonCounts: new Map() };

  const ingest = (entry) => {
    const k = entry.word.toLowerCase();
    if (!passesGates(entry, gates, reserved)) return false;
    seen.add(k);
    used.add(k);
    results.push(entry);
    const mk = normMeaningKey(entry.meaningZh);
    const sk = normExampleSkeleton(entry.example);
    reserved.meaningCounts.set(mk, (reserved.meaningCounts.get(mk) || 0) + 1);
    reserved.skeletonCounts.set(sk, (reserved.skeletonCounts.get(sk) || 0) + 1);
    cache.entries = cache.entries || [];
    if (!cache.entries.find((x) => x.word?.toLowerCase() === k)) cache.entries.push(entry);
    return true;
  };

  for (const e of cache.entries || []) {
    const k = String(e.word || "").toLowerCase();
    if (!k || seen.has(k) || used.has(k)) continue;
    ingest(e);
    if (results.length >= needCount) return results.slice(0, needCount + 20);
  }

  const seeds = uniqueSeeds(used);
  let seedIdx = 0;
  let batchNo = 0;
  let zeroStreak = 0;

  while (results.length < needCount) {
    let batch = [];
    if (seedIdx < seeds.length) {
      batch = seeds.slice(seedIdx, seedIdx + 20);
      seedIdx += 20;
    } else {
      batchNo += 1;
      const avoid = [...used].slice(-150).join(", ");
      const payload = await callDeepSeek(apiKey, model,
        `自行选择 20 个尚未使用的 IELTS G类高频实用 headword，并生成完整词条（住房/工作/银行/交通/健康/学校/购物/书信场景）。
已占用词（勿重复）：${avoid}

要求：
- chinese_meaning 具体简洁，禁止模板、英文与占位符
- ielts_example 自然原创，句式彼此不同
- 禁止 Understanding X helps / This word is useful / In daily notices
- topics 从：住房,工作,银行,交通,健康,学校,购物,G类书信,规则,保险,餐饮 中选1-2个
- difficulty: 基础高频|中级核心|高级加分
- targetBand: 4-5|5-6|6-7
- 只输出 JSON

格式：{"items":[{"word","pos","chinese_meaning","english_definition","ielts_example","example_chinese","topics":["…"],"difficulty","targetBand","gTUseCase"}]}`
      );
      let added = 0;
      for (const row of payload.items || []) {
        const entry = rowToEntry(row);
        const k = entry.word.toLowerCase();
        if (!entry.word || seen.has(k) || used.has(k)) continue;
        if (ingest(entry)) added += 1;
      }
      writeCache(cache);
      console.log(`[deepseek-new-words] batch ${batchNo} (auto), added ${added}, total ${results.length}/${needCount}`);
      zeroStreak = added ? 0 : zeroStreak + 1;
      if (zeroStreak > 20) throw new Error(`Auto batches stalled at ${results.length}/${needCount}`);
      continue;
    }

    batchNo += 1;
    const payload = await callDeepSeek(apiKey, model,
      `为下列 IELTS G类 headword 生成完整词条。每个词一个对象，句式与释义必须彼此不同。

要求：
- chinese_meaning 具体简洁，禁止模板、英文与占位符
- ielts_example 自然原创，体现 G 类场景（住房/工作/银行/交通/健康/学校/购物/书信）
- 禁止 Understanding X helps / This word is useful / In daily notices / It is important to know
- 禁止所有词共用相同例句句式
- topics 从：住房,工作,银行,交通,健康,学校,购物,G类书信,规则,保险,餐饮 中选1-2个
- difficulty: 基础高频|中级核心|高级加分
- targetBand: 4-5|5-6|6-7
- 只输出 JSON

格式：{"items":[{"word","pos","chinese_meaning","english_definition","ielts_example","example_chinese","topics":["…"],"difficulty","targetBand","gTUseCase"}]}

单词：${JSON.stringify(batch)}`
    );

    let added = 0;
    for (const row of payload.items || []) {
      const entry = rowToEntry(row);
      const k = entry.word.toLowerCase();
      if (!entry.word || seen.has(k) || used.has(k)) continue;
      if (ingest(entry)) added += 1;
    }
    writeCache(cache);
    console.log(`[deepseek-new-words] batch ${batchNo}, added ${added}, total ${results.length}/${needCount}`);
    zeroStreak = added ? 0 : zeroStreak + 1;
    if (zeroStreak > 20) throw new Error(`Seed batches stalled at ${results.length}/${needCount}`);
  }

  if (results.length < needCount) {
    throw new Error(`Only generated ${results.length}/${needCount} new word entries`);
  }
  return results.slice(0, needCount + 20);
}