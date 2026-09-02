import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyReadingGCompaction } from "../app/lib/reading-g-vocab/compaction.mjs";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const COMPACTION_PATH = path.join(ROOT, "public", "data", "reading-g-word-family-compaction.json");
const REPORT_PATH = path.join(ROOT, "public", "data", "reading-g-import-report.json");
const MASTER_PATH = path.join(ROOT, "public", "data", "words.json");
const VERSION = "reading-g-unlinked-plural-lemma-repair-v2-20260810";

// These were verified from the G-reading data: the displayed headword is an
// ordinary plural, while the singular lemma was not a G-reading headword.
const PLURAL_TO_LEMMA = new Map([
  ["bacteria", "bacterium"], ["acres", "acre"], ["adverts", "advert"],
  ["attendees", "attendee"], ["butchers", "butcher"], ["dwellers", "dweller"],
  ["galaxies", "galaxy"], ["hands", "hand"], ["hoses", "hose"],
  ["ornaments", "ornament"], ["ranks", "rank"], ["cakes", "cake"],
  ["canoers", "canoer"], ["cantons", "canton"], ["mongooses", "mongoose"],
  ["scarves", "scarf"], ["sleighs", "sleigh"], ["songbirds", "songbird"],
  ["panellings", "panelling"], ["concert-goers", "concert-goer"],
  ["cycleways", "cycleway"], ["macadamias", "macadamia"], ["chefs", "chef"],
  ["automata", "automaton"], ["cloths", "cloth"], ["desserts", "dessert"],
  ["dormice", "dormouse"], ["fliers", "flier"], ["hovercrafts", "hovercraft"],
  ["ideas", "idea"], ["imitations", "imitation"], ["indians", "indian"],
  ["migrants", "migrant"], ["strands", "strand"], ["workmen", "workman"],
  ["americans", "american"], ["hopes", "hope"], ["sightings", "sighting"],
  ["firemen", "fireman"], ["laces", "lace"], ["marshals", "marshal"],
  ["mugs", "mug"], ["hoodies", "hoodie"]
]);

// These are import formatting faults, rather than real plural headword
// candidates. Retain the stable id so existing G-reading progress follows it.
const PHRASE_NORMALIZATIONS = new Map([
  ["weeklyearnings", "weekly earnings"],
  ["deliciouspancakes", "delicious pancakes"]
]);

// "hold-ups" here means long stockings. It is a plural-only lexical item,
// not the inflection of the independently useful headword "hold-up".
const PLURAL_ONLY = new Set(["hold-ups", "pros"]);

const MANUAL_EXAMPLES = {
  cake: ["The café sells a cake every morning.", "这家咖啡馆每天早晨出售一块蛋糕。"],
  canoer: ["Each canoer wore a life jacket.", "每位划独木舟的人都穿着救生衣。"],
  canton: ["Each canton has its own local government.", "每个州都有自己的地方政府。"],
  mongoose: ["A mongoose can move quickly.", "一只猫鼬可以快速移动。"],
  scarf: ["She wore a warm scarf.", "她戴着一条暖和的围巾。"],
  sleigh: ["The horse pulled a sleigh through the snow.", "马拉着雪橇穿过雪地。"],
  songbird: ["A songbird sang in the tree.", "一只鸣禽在树上歌唱。"],
  panelling: ["The room has wooden panelling.", "这个房间有木质镶板。"],
  "concert-goer": ["Every concert-goer showed a ticket.", "每位音乐会观众都出示了门票。"],
  cycleway: ["The new cycleway links the town centre to the station.", "新自行车道连接市中心和车站。"],
  macadamia: ["A macadamia has a rich, buttery flavour.", "一颗夏威夷果有浓郁的黄油风味。"],
  chef: ["The chef prepared the meal.", "厨师准备了这顿饭。"],
  dormouse: ["A dormouse sleeps for long periods in winter.", "睡鼠在冬天会长时间睡眠。"],
  flier: ["The event flier gave the date and venue.", "活动传单写明了日期和地点。"],
  indian: ["An Indian artist presented the exhibition.", "一位印度艺术家展示了这场展览。"],
  american: ["An American visitor joined the tour.", "一位美国访客参加了这次参观。"],
  sighting: ["The sighting was reported to the local paper.", "这次目击被报道给了当地报纸。"],
  fireman: ["A fireman checked the safety equipment.", "一名消防员检查了安全设备。"],
  hoodie: ["He wore a hoodie in the cold weather.", "他在寒冷天气里穿了一件连帽衫。"]
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, text, "utf8");
  fs.renameSync(temporary, filePath);
  return text;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function slug(value) {
  return normalizeReadingGKey(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function cleanPluralMeaning(value, lemma) {
  return String(value || "")
    .replace(new RegExp(`；?[“\"]${lemma}[”\"]的复数；?`, "gi"), "")
    .replace(/[；;]?（复数(?:形式)?）/g, "")
    .replace(/[；;]?复数形式/g, "")
    .replace(/[；;]?的复数/g, "")
    .replace(/[；;]{2,}/g, "；")
    .trim();
}

function lemmaPos(value) {
  return String(value || "noun")
    .replace(/\s*\(\s*plural\s*\)/gi, "")
    .replace(/\bplural\b/gi, "")
    .trim() || "noun";
}

function buildSenses(entry, lemma, example, exampleZh) {
  const source = Array.isArray(entry.senses) && entry.senses.length ? entry.senses : [{}];
  return source.map((sense, index) => ({
    ...sense,
    senseId: `rg_word_${slug(lemma)}_${String(sense.pos || entry.primaryPos || entry.pos || "noun").replace(/[^a-z]/gi, "").toLowerCase() || "noun"}_${String(index + 1).padStart(2, "0")}`,
    meaningZh: cleanPluralMeaning(sense.meaningZh || sense.meaning || entry.primaryMeaningZh || entry.meaning, lemma),
    example: index === 0 ? example : String(sense.example || ""),
    exampleZh: index === 0 ? exampleZh : String(sense.exampleZh || sense.exampleCn || "")
  }));
}

function asGCanonical(pluralEntry, lemma, masterEntry) {
  const manualExample = MANUAL_EXAMPLES[lemma];
  const example = masterEntry?.example || manualExample?.[0] || "";
  const exampleCn = masterEntry?.exampleCn || manualExample?.[1] || "";
  const meaning = masterEntry?.meaning || cleanPluralMeaning(pluralEntry.primaryMeaningZh || pluralEntry.meaning, lemma);
  const primaryPos = lemmaPos(masterEntry?.pos || pluralEntry.primaryPos || pluralEntry.pos || "noun");
  const canonical = {
    ...pluralEntry,
    id: `rg_word_${slug(lemma)}`,
    entryType: "word",
    word: lemma,
    normalizedKey: normalizeReadingGKey(lemma),
    phonetic: masterEntry?.phonetic || pluralEntry.phonetic || "",
    primaryPos,
    pos: primaryPos,
    primaryMeaningZh: meaning,
    meaning,
    meaningZh: meaning,
    definition: masterEntry?.definition || meaning,
    example,
    exampleCn,
    collocations: masterEntry?.collocations || pluralEntry.collocations || [],
    phraseCollocations: masterEntry?.phraseCollocations || pluralEntry.phraseCollocations || [],
    wordFamily: masterEntry?.wordFamily || pluralEntry.wordFamily || [],
    topics: unique([...(pluralEntry.topics || []), ...(masterEntry?.topics || [])]),
    ieltsUse: unique([...(pluralEntry.ieltsUse || []), ...(masterEntry?.ieltsUse || [])]),
    difficulty: masterEntry?.difficulty || pluralEntry.difficulty || "",
    forms: [],
    mergedAliases: [],
    mergedEntries: [],
    qualityFlags: unique([...(pluralEntry.qualityFlags || []), "reading_g_plural_lemma_repaired"]),
    sourceFiles: unique([...(pluralEntry.sourceFiles || []), "reading-g-unlinked-plural-lemma-repair-v1"]),
    senses: buildSenses(pluralEntry, lemma, example, exampleCn),
    updatedAt: new Date().toISOString()
  };
  return canonical;
}

function appendCompactionRule(compaction, canonical, pluralEntry) {
  const canonicalKey = normalizeReadingGKey(canonical.word);
  const aliasKey = normalizeReadingGKey(pluralEntry.word);
  let rule = compaction.rules.find((item) => item.canonicalKey === canonicalKey);
  if (!rule) {
    rule = {
      canonicalKey,
      canonicalId: canonical.id,
      canonicalWord: canonical.word,
      aliases: []
    };
    compaction.rules.push(rule);
  }
  if (!(rule.aliases || []).some((alias) => normalizeReadingGKey(alias.key || alias.word) === aliasKey)) {
    rule.aliases.push({
      key: aliasKey,
      id: pluralEntry.id,
      word: pluralEntry.word,
      relationType: "form"
    });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildRepair({ vocab, compaction, master }) {
  const items = structuredClone(vocab.items);
  const nextCompaction = structuredClone(compaction);
  const masterByKey = new Map((master.words || []).map((entry) => [normalizeReadingGKey(entry.word), entry]));
  const byKey = new Map(items.map((entry) => [normalizeReadingGKey(entry.normalizedKey || entry.word), entry]));
  const created = [];

  for (const [plural, lemma] of PLURAL_TO_LEMMA) {
    const pluralEntry = byKey.get(plural);
    let canonical = byKey.get(lemma);
    if (!pluralEntry) {
      assert(canonical, `Missing both plural and repaired lemma: ${plural} -> ${lemma}`);
      canonical.primaryPos = lemmaPos(canonical.primaryPos || canonical.pos);
      canonical.pos = canonical.primaryPos;
      continue;
    }
    if (!canonical) {
      canonical = asGCanonical(pluralEntry, lemma, masterByKey.get(lemma));
      items.push(canonical);
      byKey.set(lemma, canonical);
      created.push(lemma);
    }
    canonical.primaryPos = lemmaPos(canonical.primaryPos || canonical.pos);
    canonical.pos = canonical.primaryPos;
    appendCompactionRule(nextCompaction, canonical, pluralEntry);
  }

  for (const [broken, phrase] of PHRASE_NORMALIZATIONS) {
    const entry = byKey.get(broken) || byKey.get(normalizeReadingGKey(phrase));
    assert(entry, `Missing expected malformed phrase: ${broken}`);
    entry.word = phrase;
    entry.normalizedKey = normalizeReadingGKey(phrase);
    entry.entryType = "phrase";
    entry.isPhrase = true;
    entry.qualityFlags = unique([...(entry.qualityFlags || []), "reading_g_import_spacing_repaired"]);
    entry.sourceFiles = unique([...(entry.sourceFiles || []), "reading-g-unlinked-plural-lemma-repair-v1"]);
    entry.updatedAt = new Date().toISOString();
  }

  for (const word of PLURAL_ONLY) {
    const entry = byKey.get(word);
    assert(entry, `Missing plural-only entry: ${word}`);
    entry.pluralOnly = true;
    entry.pluralOnlyReason = "lexicalised_plural_noun";
    entry.qualityFlags = unique([...(entry.qualityFlags || []), "reading_g_plural_only_retained"]);
    entry.updatedAt = new Date().toISOString();
  }

  nextCompaction.rules.sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey));
  const compacted = applyReadingGCompaction(items, nextCompaction);
  const nextVocab = structuredClone(vocab);
  nextVocab.items = compacted.items;
  nextVocab.count = nextVocab.items.length;
  nextVocab.wordCount = nextVocab.items.filter((entry) => (entry.entryType || "word") === "word").length;
  nextVocab.phraseCount = nextVocab.items.filter((entry) => entry.entryType === "phrase").length;
  nextVocab.activeCount = nextVocab.items.filter((entry) => entry.studyMode !== "reference").length;
  nextVocab.referenceCount = nextVocab.items.filter((entry) => entry.studyMode === "reference").length;
  nextVocab.updatedAt = new Date().toISOString();
  nextVocab.unlinkedPluralLemmaRepair = {
    version: VERSION,
    updatedAt: nextVocab.updatedAt,
    mergedPluralCount: PLURAL_TO_LEMMA.size,
    repairedPhraseCount: PHRASE_NORMALIZATIONS.size,
    retainedPluralOnlyCount: PLURAL_ONLY.size,
    createdLemmaCount: created.length,
    mappings: [...PLURAL_TO_LEMMA].map(([plural, lemma]) => ({ plural, lemma }))
  };
  const activeAliasCount = nextCompaction.rules
    .filter((rule) => !rule.suppressionOnly)
    .flatMap((rule) => rule.aliases || []).length;
  if (nextVocab.wordOnlyInflectionReview) {
    nextVocab.wordOnlyInflectionReview = {
      ...nextVocab.wordOnlyInflectionReview,
      keptMergedInflectionCount: activeAliasCount,
      repairedUnlinkedPluralAliasCount: PLURAL_TO_LEMMA.size,
      updatedAt: nextVocab.updatedAt
    };
  }
  nextCompaction.version = VERSION;
  nextCompaction.updatedAt = nextVocab.updatedAt;
  // Keep the established scope contract: these aliases are direct plural
  // inflections, so this repair does not broaden compaction into word-family
  // grouping.
  nextCompaction.stats = {
    ...(nextCompaction.stats || {}),
    repairedUnlinkedPluralAliasCount: PLURAL_TO_LEMMA.size
  };

  const index = new Map(nextVocab.items.map((entry) => [normalizeReadingGKey(entry.normalizedKey || entry.word), entry]));
  for (const [plural, lemma] of PLURAL_TO_LEMMA) {
    assert(!index.has(plural), `Plural ${plural} remains an independent main card.`);
    const base = index.get(lemma);
    assert(base, `Missing repaired lemma ${lemma}.`);
    assert((base.mergedAliases || []).some((alias) => normalizeReadingGKey(alias.key || alias.word) === plural), `Missing progress alias ${plural} -> ${lemma}.`);
    assert((base.forms || []).some((form) => normalizeReadingGKey(form.word || form.form) === plural), `Missing displayed form ${plural} for ${lemma}.`);
  }
  for (const phrase of PHRASE_NORMALIZATIONS.values()) {
    const entry = index.get(normalizeReadingGKey(phrase));
    assert(entry?.entryType === "phrase", `Phrase repair failed: ${phrase}.`);
  }
  assert(index.get("hold-ups")?.pluralOnly === true, "Plural-only word was not retained explicitly.");

  return { nextVocab, nextCompaction, created, compacted };
}

function main() {
  const write = process.argv.includes("--write");
  const vocab = readJson(VOCAB_PATH);
  const compaction = readJson(COMPACTION_PATH);
  const report = readJson(REPORT_PATH);
  const master = readJson(MASTER_PATH);
  const { nextVocab, nextCompaction, created, compacted } = buildRepair({ vocab, compaction, master });
  const output = {
    mode: write ? "write" : "dry-run",
    version: VERSION,
    mergedPluralCount: PLURAL_TO_LEMMA.size,
    createdLemmaCount: created.length,
    createdLemmas: created,
    repairedPhraseCount: PHRASE_NORMALIZATIONS.size,
    retainedPluralOnlyCount: PLURAL_ONLY.size,
    resultingCount: nextVocab.count,
    resultingWordCount: nextVocab.wordCount,
    resultingPhraseCount: nextVocab.phraseCount,
    compaction: compacted.stats
  };
  if (!write) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(ROOT, "backups", `reading-g-unlinked-plural-lemma-repair-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const filePath of [VOCAB_PATH, COMPACTION_PATH, REPORT_PATH]) {
    fs.copyFileSync(filePath, path.join(backupDir, path.basename(filePath)));
  }
  const nextReport = structuredClone(report);
  nextReport.unlinkedPluralLemmaRepair = {
    version: VERSION,
    completedAt: nextVocab.updatedAt,
    backupDir,
    ...output
  };
  try {
    writeJsonAtomic(VOCAB_PATH, nextVocab);
    writeJsonAtomic(COMPACTION_PATH, nextCompaction);
    writeJsonAtomic(REPORT_PATH, nextReport);
  } catch (error) {
    for (const filePath of [VOCAB_PATH, COMPACTION_PATH, REPORT_PATH]) {
      fs.copyFileSync(path.join(backupDir, path.basename(filePath)), filePath);
    }
    throw error;
  }
  console.log(JSON.stringify({ ...output, backupDir }, null, 2));
}

main();
