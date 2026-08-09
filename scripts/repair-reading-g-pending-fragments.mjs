/**
 * Replace confirmed malformed G-reading pending tokens with manually reviewed
 * standard words or phrases. Raw tokens merged into a canonical item are kept
 * as repair aliases; they are not silently discarded.
 *
 * Usage:
 *   node scripts/repair-reading-g-pending-fragments.mjs --dry-run
 *   node scripts/repair-reading-g-pending-fragments.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isReadingGContentIncomplete } from "../app/lib/reading-g-vocab/content-completeness.mjs";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";
import {
  READING_G_RETIREMENTS_SOURCE,
  getReadingGRetirementKey,
  normalizeReadingGRetirements
} from "../app/lib/reading-g-vocab/retirements.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VOCAB_PATH = path.join(ROOT, "public/data/reading-g-vocab.json");
const MASTER_PATH = path.join(ROOT, "public/data/words.json");
const RETIREMENTS_PATH = path.join(ROOT, READING_G_RETIREMENTS_SOURCE);
const BACKUP_ROOT = path.join(ROOT, "backups/reading-g-pending-fragment-repairs");
const RECOVERY_BACKUP_ROOT = path.join(ROOT, "backups/reading-g-pending-anomalies");
const REVIEW_SOURCE = "manual_online_pending_repair_20260806";

const manual = (phonetic, pos, meaning, definition, example, exampleZh, options = {}) => ({
  phonetic,
  pos,
  meaning,
  definition,
  example,
  exampleZh,
  ...options
});

const REPAIRS = [
  { from: "aining", to: "training" },
  { from: "onlyfrom", to: "only from", entryType: "phrase", profile: manual("/ˈoʊnli frəm/", "prepositional phrase", "仅从…；只来自…", "used to state that something comes from one source and no others", "The information is available only from the local office.", "这项信息只能从当地办事处获得。") },
  { from: "artlingly", to: "Artlingly", profile: manual("/ˈɑːrtlɪŋli/", "proper noun", "阿特林利（雅思材料中的城镇名）", "a place name used in IELTS General Training material", "The cafe reviews were written for visitors to Artlingly.", "咖啡馆评价是为前往阿特林利的访客撰写的。", { studyMode: "reference" }) },
  { from: "nylso", to: "Nylso", profile: manual("/ˈnɪlsoʊ/", "proper noun", "尼尔索（人名或署名）", "a personal name used as a reference rather than a vocabulary target", "Nylso is treated as a proper name in the source material.", "Nylso 在源材料中按专名处理。", { studyMode: "reference" }) },
  { from: "ifces", to: "office" },
  { from: "poppi", to: "Poppi", profile: manual("/ˈpɒpi/", "proper noun", "波皮（专名）", "a proper name that may refer to a person, place, or brand", "Poppi is recorded as a proper name rather than a general English headword.", "Poppi 记录为专名，而不是通用英语词条。", { studyMode: "reference" }) },
  { from: "imeet", to: "meet" },
  { from: "abusiness", to: "business" },
  { from: "appropriatefor", to: "appropriate for", entryType: "phrase", profile: manual("/əˈproʊpriət fɔːr/", "adjective phrase", "适合…；适用于…", "suitable for a particular person, purpose, or situation", "This course is appropriate for new employees.", "这门课程适合新员工。") },
  { from: "arevery", to: "very", profile: manual("/ˈveri/", "adverb", "非常；很", "used to make an adjective or adverb stronger", "The instructions are very clear.", "说明非常清楚。") },
  { from: "aselection", to: "selection" },
  { from: "atcertain", to: "certain" },
  { from: "beremoved", to: "remove" },
  { from: "co-operatewithin", to: "cooperate within", entryType: "phrase", profile: manual("/koʊˈɑːpəreɪt wɪˈðɪn/", "verb phrase", "在…范围内合作", "to work together inside a stated group, system, or limit", "The teams cooperate within a shared reporting system.", "各团队在共享的报告系统内协作。") },
  { from: "firstterm", to: "first term", entryType: "phrase", profile: manual("/fɜːrst tɜːrm/", "noun phrase", "第一学期；首个任期", "the first period of study or the first period in an official position", "Fees are due at the start of the first term.", "费用在第一学期开始时缴纳。") },
  { from: "fordelivery", to: "delivery" },
  { from: "gobridge", to: "Gobridge", profile: manual("/ˈɡoʊbrɪdʒ/", "proper noun", "戈布里奇（线路或地点名称）", "a proper place or service name used in IELTS General Training material", "Passengers can use the Gobridge Tramlink service.", "乘客可以使用 Gobridge Tramlink 服务。", { studyMode: "reference" }) },
  { from: "inacting", to: "enact", profile: manual("/ɪˈnækt/", "verb", "制定；颁布（法律）", "to make a law or put an official plan into effect", "The council enacted new safety rules.", "市政委员会颁布了新的安全规定。") },
  { from: "intheir", to: "their" },
  { from: "onany", to: "any" },
  { from: "receivetransition", to: "transition" },
  { from: "smpentitlement", to: "SMP entitlement", entryType: "phrase", profile: manual("/ˌes em ˈpiː ɪnˈtaɪtəlmənt/", "noun phrase", "法定产假工资领取资格", "the right to receive Statutory Maternity Pay under the relevant rules", "The employee checked her SMP entitlement before starting leave.", "该员工在开始休假前核实了自己的法定产假工资领取资格。", { studyMode: "reference" }) },
  { from: "takingchildren", to: "child", profile: manual("/tʃaɪld/", "noun", "儿童；孩子", "a young person who is not yet an adult", "Each child must be accompanied by an adult.", "每名儿童都必须由一名成人陪同。") },
  { from: "thanimmigrants", to: "immigrant" },
  { from: "thegiant", to: "giant" },
  { from: "thei", to: "they", profile: manual("/ðeɪ/", "pronoun", "他们；她们；它们", "used to refer to people, animals, or things already mentioned", "They submitted the form before the deadline.", "他们在截止日期前提交了表格。") },
  { from: "theirnew", to: "new", profile: manual("/nuː/", "adjective", "新的；新近的", "recently made, obtained, or introduced", "The office has a new booking system.", "办公室有一个新的预约系统。") },
  { from: "travellingby", to: "travel by", entryType: "phrase", profile: manual("/ˈtrævəl baɪ/", "verb phrase", "乘坐…出行", "to use a particular form of transport", "Many visitors travel by train.", "许多访客乘火车出行。") },
  { from: "vement", to: "movement" },
  { from: "walkor", to: "walk" },
  { from: "climb-and", to: "climb" },
  { from: "j'guide", to: "guide" },
  { from: "yourself-your", to: "yourself", profile: manual("/jɔːrˈself/", "pronoun", "你自己；你本人", "used when the person affected by an action is the same person who performs it", "Please introduce yourself at the start of the meeting.", "请在会议开始时介绍你自己。") },
  { from: "weldown", to: "well" },
  { from: "mychoice", to: "choice" },
  { from: "paps", to: "map", profile: manual("/mæp/", "noun", "地图；图示", "a drawing that shows where places are located", "Use the map to find the nearest station.", "使用地图找到最近的车站。") }
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWriteJson(filePath, payload) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function choosePrimaryPos(value) {
  return text(value).match(/noun|verb|adjective|adverb|preposition|conjunction|pronoun|determiner|article/i)?.[0]?.toLowerCase()
    || "noun";
}

function toMasterProfile(entry) {
  const meaning = text(entry?.meaningZh || entry?.meaning || entry?.primaryMeaningZh);
  const definition = text(entry?.definition || meaning);
  const example = text(entry?.example);
  const exampleZh = text(entry?.exampleCn || entry?.exampleZh);
  const phonetic = text(entry?.phonetic);
  if (!phonetic || !meaning || !definition || !example || !exampleZh) return null;
  return {
    phonetic,
    pos: choosePrimaryPos(entry.pos || entry.primaryPos),
    meaning,
    definition,
    example,
    exampleZh
  };
}

function repairAlias(entry, repair) {
  return {
    id: entry.id,
    word: entry.word,
    repairedTo: repair.to,
    reviewedAt: "2026-08-06",
    source: REVIEW_SOURCE
  };
}

function applyProfile(entry, repair, profile) {
  const isPhrase = repair.entryType === "phrase";
  const normalizedKey = normalizeReadingGKey(repair.to);
  const sourceFiles = unique([...list(entry.sourceFiles), REVIEW_SOURCE]);
  const flags = unique([
    ...list(entry.qualityFlags).filter((flag) => !["missing_master_lexicon", "missing_meaning_filled_placeholder"].includes(flag)),
    "reading_g_manual_pending_repair_v1"
  ]);
  const layers = isPhrase
    ? unique([...list(entry.layers).filter((layer) => layer !== "questionBankPending"), "questionBankActive"])
    : list(entry.layers);
  const studyMode = profile.studyMode || (isPhrase ? "active" : entry.studyMode || "active");
  return {
    ...entry,
    word: repair.to,
    answer: repair.to,
    acceptedAnswers: unique([repair.to, ...list(entry.acceptedAnswers)]),
    entryType: isPhrase ? "phrase" : "word",
    isPhrase,
    normalizedKey,
    phonetic: profile.phonetic,
    primaryPos: profile.pos,
    primaryMeaningZh: profile.meaning,
    pos: profile.pos,
    meaning: profile.meaning,
    meaningZh: profile.meaning,
    definition: profile.definition,
    example: profile.example,
    exampleCn: profile.exampleZh,
    exampleZh: profile.exampleZh,
    senses: [{
      senseId: `${entry.id}_${profile.pos.replace(/[^a-z]+/gi, "_")}_01`,
      pos: profile.pos,
      meaningZh: profile.meaning,
      definition: profile.definition,
      example: profile.example,
      exampleZh: profile.exampleZh,
      sourceFiles: [REVIEW_SOURCE]
    }],
    forms: list(entry.forms),
    wordFamily: list(entry.wordFamily),
    formsReviewed: true,
    wordFamilyReviewed: true,
    difficulty: text(entry.difficulty) || "基础高频",
    sourceFiles,
    qualityFlags: flags,
    layers,
    primaryLayer: isPhrase ? "questionBankActive" : entry.primaryLayer,
    studyMode,
    manualRepair: {
      from: entry.word,
      to: repair.to,
      reviewedAt: "2026-08-06",
      source: REVIEW_SOURCE
    }
  };
}

function mergeRepairedAlias(destination, source, repair) {
  const aliases = [...list(destination.repairedAliases), repairAlias(source, repair)];
  const seen = new Set();
  return {
    ...destination,
    repairedAliases: aliases.filter((alias) => {
      const key = `${alias.id}::${alias.word}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
    qualityFlags: unique([...list(destination.qualityFlags), "reading_g_manual_pending_repair_v1"])
  };
}

function recalculateTotals(vocab) {
  const items = list(vocab.items);
  vocab.count = items.length;
  vocab.wordCount = items.filter((entry) => (entry.entryType || "word") === "word").length;
  vocab.phraseCount = items.length - vocab.wordCount;
  vocab.activeCount = items.filter((entry) => entry.studyMode === "active").length;
  vocab.referenceCount = items.filter((entry) => entry.studyMode === "reference").length;
}

function findBackupEntry(normalizedKey) {
  if (!fs.existsSync(RECOVERY_BACKUP_ROOT)) return null;
  const directories = fs.readdirSync(RECOVERY_BACKUP_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      path: path.join(RECOVERY_BACKUP_ROOT, entry.name),
      modifiedAt: fs.statSync(path.join(RECOVERY_BACKUP_ROOT, entry.name)).mtimeMs
    }))
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  for (const directory of directories) {
    const backupPath = path.join(directory.path, "reading-g-vocab.before.json");
    if (!fs.existsSync(backupPath)) continue;
    const backup = readJson(backupPath);
    const entry = list(backup.items).find((item) => normalizeReadingGKey(item.word) === normalizedKey);
    if (entry) return structuredClone(entry);
  }
  return null;
}

function main() {
  const apply = process.argv.includes("--apply");
  if (REPAIRS.length !== 36) throw new Error(`Expected 36 repairs, found ${REPAIRS.length}`);

  const vocab = readJson(VOCAB_PATH);
  const retirementPayload = readJson(RETIREMENTS_PATH);
  const masterPayload = readJson(MASTER_PATH);
  const masterItems = Array.isArray(masterPayload) ? masterPayload : (masterPayload.items || masterPayload.words || []);
  const masterByKey = new Map(masterItems.map((entry) => [normalizeReadingGKey(entry.word), entry]));
  const originalByKey = new Map(list(vocab.items).map((entry) => [normalizeReadingGKey(entry.word), entry]));
  const repairSources = new Map(REPAIRS.map((repair) => {
    const key = normalizeReadingGKey(repair.from);
    return [key, originalByKey.get(key) || findBackupEntry(key)];
  }));
  const missing = REPAIRS.filter((repair) => !repairSources.get(normalizeReadingGKey(repair.from)));
  if (missing.length) throw new Error(`Repair sources missing: ${missing.map((repair) => repair.from).join(", ")}`);

  const prepared = REPAIRS.map((repair) => {
    const source = repairSources.get(normalizeReadingGKey(repair.from));
    const profile = repair.profile || toMasterProfile(masterByKey.get(normalizeReadingGKey(repair.to)));
    if (!profile) throw new Error(`No reviewed profile is available for ${repair.from} -> ${repair.to}`);
    return { repair, source, profile };
  });
  const preview = {
    apply,
    repairs: prepared.length,
    mergeIntoExisting: prepared.filter(({ repair, source }) => {
      const target = originalByKey.get(normalizeReadingGKey(repair.to));
      return target && target.id !== source.id;
    }).length,
    transformInPlace: prepared.filter(({ repair, source }) => {
      const target = originalByKey.get(normalizeReadingGKey(repair.to));
      return !target || target.id === source.id;
    }).length,
    recoveredFromBackup: prepared.filter(({ repair }) => !originalByKey.has(normalizeReadingGKey(repair.from))).length,
    aiCandidatesBefore: list(vocab.items).filter((entry) => isReadingGContentIncomplete(entry)).length
  };
  if (!apply) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  const repairedAt = new Date().toISOString();
  const backupDir = path.join(BACKUP_ROOT, repairedAt.replace(/[:.]/g, "-"));
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(VOCAB_PATH, path.join(backupDir, "reading-g-vocab.before.json"));
  fs.copyFileSync(RETIREMENTS_PATH, path.join(backupDir, "reading-g-retirements.before.json"));

  const nextItems = [...vocab.items];
  const byKey = new Map(nextItems.map((entry, index) => [normalizeReadingGKey(entry.word), index]));
  const retired = normalizeReadingGRetirements(retirementPayload);
  const retiredKeys = new Set(retired.map((entry) => entry.key));
  const repairedSourceIds = new Set();
  let mergedCount = 0;
  let transformedCount = 0;

  for (const { repair, source, profile } of prepared) {
    let sourceIndex = nextItems.findIndex((entry) => entry.id === source.id);
    const targetIndex = byKey.get(normalizeReadingGKey(repair.to));
    const target = Number.isInteger(targetIndex) ? nextItems[targetIndex] : null;
    if (target && target.id !== source.id) {
      nextItems[targetIndex] = mergeRepairedAlias(target, source, repair);
      repairedSourceIds.add(source.id);
      mergedCount += 1;
    } else {
      if (sourceIndex < 0) {
        sourceIndex = nextItems.length;
        nextItems.push(source);
        byKey.set(normalizeReadingGKey(repair.from), sourceIndex);
      }
      nextItems[sourceIndex] = applyProfile(source, repair, profile);
      byKey.delete(normalizeReadingGKey(repair.from));
      byKey.set(normalizeReadingGKey(repair.to), sourceIndex);
      transformedCount += 1;
    }

    if (normalizeReadingGKey(repair.from) !== normalizeReadingGKey(repair.to)) {
      const retirementKey = getReadingGRetirementKey(source);
      if (retirementKey && !retiredKeys.has(retirementKey)) {
        retiredKeys.add(retirementKey);
        retired.push({
          key: retirementKey,
          id: source.id,
          word: source.word,
          entryType: source.entryType === "phrase" ? "phrase" : "word",
          deletedAt: repairedAt
        });
      }
    }
  }

  vocab.items = nextItems.filter((entry) => !repairedSourceIds.has(entry.id));
  vocab.updatedAt = repairedAt;
  recalculateTotals(vocab);
  atomicWriteJson(VOCAB_PATH, vocab);
  atomicWriteJson(RETIREMENTS_PATH, {
    version: "reading-g-retirements-v1",
    updatedAt: repairedAt,
    count: retired.length,
    entries: retired
  });
  atomicWriteJson(path.join(backupDir, "repair-manifest.json"), {
    version: "reading-g-pending-fragment-repairs-v1",
    repairedAt,
    repairs: prepared.map(({ repair }) => repair)
  });

  const unresolved = vocab.items.filter((entry) => isReadingGContentIncomplete(entry));
  const repairedVisible = REPAIRS.filter(({ to }) => !vocab.items.some((entry) => entry.word === to));
  if (repairedVisible.length) throw new Error(`Repaired targets are not visible: ${repairedVisible.map((repair) => repair.to).join(", ")}`);
  if (unresolved.some((entry) => REPAIRS.some((repair) => entry.word === repair.to))) {
    throw new Error("A repaired target still fails G-reading content validation");
  }
  console.log(JSON.stringify({
    ...preview,
    backupDir,
    mergedCount,
    transformedCount,
    aiCandidatesAfter: unresolved.length,
    repairedVisibleCount: REPAIRS.length - repairedVisible.length
  }, null, 2));
}

main();
