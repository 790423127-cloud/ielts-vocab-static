import crypto from "node:crypto";
import fs from "node:fs";

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Patch anchor not found in ${path}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Patch anchor is not unique in ${path}`);
  }
  fs.writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length), "utf8");
}

// 1) Fix the Reading G -> master difficulty sync root cause.
const masterSyncPath = "app/lib/reading-g-vocab/master-content-sync.mjs";
replaceOnce(
  masterSyncPath,
  `function text(value) {\n  return String(value == null ? "" : value).trim();\n}\n\nfunction list(value) {`,
  `function text(value) {\n  return String(value == null ? "" : value).trim();\n}\n\nconst MASTER_DIFFICULTIES = new Set([\n  "基础高频",\n  "中级核心",\n  "高级加分",\n  "阅读扩展",\n  "低频认识即可"\n]);\n\nfunction normalizeMasterDifficulty(value) {\n  const raw = text(value);\n  if (MASTER_DIFFICULTIES.has(raw)) return raw;\n  if (raw === "阅读逻辑核心") return "阅读扩展";\n  return "";\n}\n\nfunction list(value) {`
);
replaceOnce(
  masterSyncPath,
  `  }\n  fields.push(...mergeExamplePair(next, master, source));\n`,
  `  }\n  if (!text(master?.difficulty)) {\n    const difficulty = normalizeMasterDifficulty(source?.difficulty);\n    if (difficulty) {\n      next.difficulty = difficulty;\n      fields.push("difficulty");\n    }\n  }\n  fields.push(...mergeExamplePair(next, master, source));\n`
);
replaceOnce(
  masterSyncPath,
  `  for (const field of MASTER_FILL_SCALARS) {\n    if (text(source?.[field])) entry[field] = source[field];\n  }\n  const examplePair = validExamplePair(source);\n`,
  `  for (const field of MASTER_FILL_SCALARS) {\n    if (text(source?.[field])) entry[field] = source[field];\n  }\n  const difficulty = normalizeMasterDifficulty(source?.difficulty);\n  if (difficulty) entry.difficulty = difficulty;\n  const examplePair = validExamplePair(source);\n`
);

// 2) Gate only real study cards, not stored reference rows.
const auditPath = "scripts/core-vocab-quality-audit.mjs";
replaceOnce(
  auditPath,
  `} from "../app/lib/vocab/lexicon-guard-shared.mjs";\n`,
  `} from "../app/lib/vocab/lexicon-guard-shared.mjs";\nimport { isBrushableWord } from "../app/lib/vocab/word-study-eligibility.mjs";\n`
);
replaceOnce(
  auditPath,
  `  const state = { issues: [], candidates: new Map() };\n  const wordSet = new Set(words.map((entry) => normalizeHeadword(entry.word)).filter(Boolean));\n  const coreWords = words.filter((entry) => entry.difficulty === "中级核心");\n\n  for (const entry of words) {\n`,
  `  const state = { issues: [], candidates: new Map() };\n  const activeWords = words.filter(isBrushableWord);\n  const wordSet = new Set(words.map((entry) => normalizeHeadword(entry.word)).filter(Boolean));\n  const coreWords = activeWords.filter((entry) => entry.difficulty === "中级核心");\n\n  for (const entry of activeWords) {\n`
);
replaceOnce(
  auditPath,
  `export function runQualityGate(payload, apiPayload = null) {\n  const words = Array.isArray(payload) ? payload : Array.isArray(payload?.words) ? payload.words : [];\n  const errors = [];\n  const invalid = words.filter((entry) => !VALID_DIFFICULTIES.has(entry.difficulty));\n  const empty = words.filter((entry) => !normalizeHeadword(entry.word) || !String(entry.meaning || "").trim() || !String(entry.example || "").trim());\n  const phrases = words.filter(isPhraseEntry);\n  const confirmedNames = words.filter((entry) => CONFIRMED_PERSON_NAME_WORDS.has(normalizeHeadword(entry.word)));\n`,
  `export function runQualityGate(payload, apiPayload = null) {\n  const words = Array.isArray(payload) ? payload : Array.isArray(payload?.words) ? payload.words : [];\n  const activeWords = words.filter(isBrushableWord);\n  const errors = [];\n  const invalid = activeWords.filter((entry) => !VALID_DIFFICULTIES.has(entry.difficulty));\n  const empty = activeWords.filter((entry) => !normalizeHeadword(entry.word) || !String(entry.meaning || "").trim() || !String(entry.example || "").trim());\n  const phrases = activeWords.filter(isPhraseEntry);\n  const confirmedNames = activeWords.filter((entry) => CONFIRMED_PERSON_NAME_WORDS.has(normalizeHeadword(entry.word)));\n`
);

// 3) Do not promote explicit personal-reading phrases into the master word library.
const readingSyncPath = "app/lib/reading-words/main-lexicon-sync.mjs";
replaceOnce(
  readingSyncPath,
  `  if (!word) return true;\n  if (CONFIRMED_PERSON_NAME_WORDS.has(word)) return true;\n  const tokens = word.split(" ").filter(Boolean);\n`,
  `  if (!word) return true;\n  if (CONFIRMED_PERSON_NAME_WORDS.has(word)) return true;\n  if (\n    readingWord?.entryType === "phrase" ||\n    readingWord?.isPhrase === true ||\n    /\\bphrase\\b/i.test(cleanText(readingWord?.pos))\n  ) return true;\n  const tokens = word.split(" ").filter(Boolean);\n`
);

// Regression coverage for the three root causes above.
const syncTestPath = "app/lib/reading-g-vocab/__tests__/master-content-sync.test.mjs";
replaceOnce(
  syncTestPath,
  `    pos: "noun",\n    meaning: "阿尔法；开端",\n`,
  `    pos: "noun",\n    difficulty: "中级核心",\n    meaning: "阿尔法；开端",\n`
);
replaceOnce(
  syncTestPath,
  `  assert.equal(alpha.definition, "the first letter of the Greek alphabet");\n  assert.equal(alpha.forms.length, 1);\n`,
  `  assert.equal(alpha.definition, "the first letter of the Greek alphabet");\n  assert.equal(alpha.difficulty, "中级核心");\n  assert.equal(alpha.forms.length, 1);\n`
);
replaceOnce(
  syncTestPath,
  `  assert.equal(plan.nextWords[2].source, "reading-g-ai");\n});\n\ntest("G AI master sync accepts definition-only additional common senses", () => {\n`,
  `  assert.equal(plan.nextWords[2].source, "reading-g-ai");\n  assert.equal(plan.nextWords[2].difficulty, "中级核心");\n});\n\ntest("G AI master sync normalizes Reading G logic difficulty for the master lexicon", () => {\n  const plan = buildReadingGAiMasterSyncPlan({\n    count: 1,\n    words: [{ id: "word_alpha", wordId: "word_alpha", word: "alpha" }]\n  }, [completedGEntry({\n    id: "rg_word_logic",\n    word: "logicword",\n    sourceWordId: "",\n    difficulty: "阅读逻辑核心"\n  })]);\n\n  assert.equal(plan.nextWords[1].difficulty, "阅读扩展");\n});\n\ntest("G AI master sync accepts definition-only additional common senses", () => {\n`
);

fs.writeFileSync(
  "scripts/core-vocab-quality-audit.test.mjs",
  `import test from "node:test";\nimport assert from "node:assert/strict";\n\nimport { runQualityGate } from "./core-vocab-quality-audit.mjs";\n\nfunction activeWord(overrides = {}) {\n  return {\n    id: "word_active",\n    word: "active",\n    meaning: "活跃的",\n    example: "The account is active.",\n    difficulty: "基础高频",\n    ...overrides\n  };\n}\n\ntest("core gate ignores reference-only rows that are not study cards", () => {\n  const payload = {\n    count: 2,\n    version: "test-v1",\n    savedAt: "2026-09-02T00:00:00.000Z",\n    lexiconHash: "test",\n    words: [\n      activeWord(),\n      {\n        id: "ref_1",\n        word: "broken phrase",\n        entryType: "word-reference",\n        studyMode: "reference",\n        baseWord: "active",\n        baseWordId: "word_active",\n        relationType: "malformed import",\n        difficulty: "不进入学习"\n      }\n    ]\n  };\n\n  assert.deepEqual(runQualityGate(payload), { ok: true, errors: [] });\n});\n\ntest("core gate still rejects invalid active study-card difficulty", () => {\n  const payload = {\n    count: 1,\n    version: "test-v1",\n    savedAt: "2026-09-02T00:00:00.000Z",\n    lexiconHash: "test",\n    words: [activeWord({ difficulty: "" })]\n  };\n  const result = runQualityGate(payload);\n  assert.equal(result.ok, false);\n  assert.match(result.errors.join(" | "), /invalid difficulty: 1/);\n});\n`,
  "utf8"
);

fs.mkdirSync("app/lib/reading-words/__tests__", { recursive: true });
fs.writeFileSync(
  "app/lib/reading-words/__tests__/main-lexicon-sync-local.test.mjs",
  `import test from "node:test";\nimport assert from "node:assert/strict";\n\nimport { shouldKeepReadingWordLocal } from "../main-lexicon-sync.mjs";\n\ntest("personal-reading phrases stay local instead of becoming master word cards", () => {\n  assert.equal(shouldKeepReadingWordLocal({ word: "primarily intended", pos: "phrase" }), true);\n  assert.equal(shouldKeepReadingWordLocal({ word: "nominated beneficiary", pos: "noun phrase" }), true);\n  assert.equal(shouldKeepReadingWordLocal({ word: "ordinary", pos: "adjective" }), false);\n});\n`,
  "utf8"
);

// Import repaired code only after the patches above have been written.
const { computeIntegrityHash, computeLexiconHash } = await import("../../app/lib/vocab/lexicon-guard.mjs");
const { renderMasterLexiconBaseline } = await import("../../app/lib/vocab/master-lexicon-baseline-io.mjs");
const { buildLexiconRetirementPayload } = await import("../../app/lib/vocab/lexicon-delete-intent.mjs");
const { CONFIRMED_PERSON_NAME_WORDS, normalizeHeadword } = await import("../../app/lib/vocab/lexicon-guard-shared.mjs");
const {
  buildEligibilityWordMap,
  isBrushableWord,
  resolveBrushableWord
} = await import("../../app/lib/vocab/word-study-eligibility.mjs");
const {
  getReadingGRetirementKey,
  normalizeReadingGRetirements
} = await import("../../app/lib/reading-g-vocab/retirements.mjs");

// 4) Repair the current data, fail-closed on any unexpected shape.
const publicPath = "public/data/words.json";
const staticPath = ".static-export-cache/words.json";
const baselinePath = "app/lib/vocab/master-lexicon-baseline.mjs";
const retirementPath = "app/lib/vocab/master-lexicon-retirements.json";
const readingPath = "public/data/reading-g-vocab.json";
const readingRetirementPath = "public/data/reading-g-retirements.json";

const publicRaw = fs.readFileSync(publicPath);
const staticRaw = fs.readFileSync(staticPath);
if (!publicRaw.equals(staticRaw)) throw new Error("Formal master sources differ before repair");

const payload = JSON.parse(publicRaw.toString("utf8"));
if (!Array.isArray(payload.words) || payload.words.length !== 14532) {
  throw new Error(`Unexpected master count before repair: ${payload.words?.length}`);
}
const words = payload.words.map((entry) => ({ ...entry }));
const validDifficulty = new Set(["基础高频", "中级核心", "高级加分", "阅读扩展", "低频认识即可"]);
const readingPayload = JSON.parse(fs.readFileSync(readingPath, "utf8"));
if (!Array.isArray(readingPayload.items)) throw new Error("Reading G items missing");
const readingSourceById = new Map(
  readingPayload.items.map((entry) => [String(entry?.id || ""), entry]).filter(([id]) => id)
);

const byId = new Map(words.map((entry) => [String(entry.id || entry.wordId || ""), entry]));
const stuart = byId.get("word_reading_g_00bbdefa");
if (!stuart || normalizeHeadword(stuart.word) !== "stuart") throw new Error("Expected Stuart master row not found");
if (!CONFIRMED_PERSON_NAME_WORDS.has("stuart")) throw new Error("Stuart is no longer in confirmed-person-name guard");
const phraseOnly = byId.get("reading-coach-word-02929f528e1b42769748091c4e286ab0");
if (!phraseOnly || normalizeHeadword(phraseOnly.word) !== "primarily intended") {
  throw new Error("Expected primarily intended row not found");
}

const reviewedCompoundIds = new Set([
  "word_e4c1772c9f60",
  "word_9e679ae50db6",
  "word_8c8ff90cb50c",
  "word_0ef0eaee90bc",
  "word_94f366bc502b",
  "word_9c5767e6817a",
  "word_69a7d5d27a2e",
  "word_fcc8d09c981d",
  "word_0f0bf4f26d9a",
  "word_ab4bc581cef2",
  "word_cc36eba2fd33",
  "word_763221c0967c",
  "reading-coach-word-74590c142663454181306e3f0fd57ea6",
  "reading-coach-word-45c438dd895c4d7e8bbf7ecb5bad483e"
]);
for (const id of reviewedCompoundIds) {
  const entry = byId.get(id);
  if (!entry) throw new Error(`Reviewed compound missing: ${id}`);
  entry.lexicalizedCompound = true;
  entry.isPhrase = false;
}

const malformedIds = [
  "word_reading_g_99d1cb5b",
  "word_reading_g_86d81f2a",
  "word_reading_g_afc42529",
  "word_reading_g_ea78e29a",
  "word_reading_g_30384b4e",
  "word_reading_g_830e3c95",
  "word_reading_g_3027dc3a",
  "word_reading_g_46e1149f"
];
const wordMap = buildEligibilityWordMap(words);
const malformedRepairs = [];
for (const id of malformedIds) {
  const entry = byId.get(id);
  if (!entry || !/^n[a-z]/i.test(String(entry.word || ""))) throw new Error(`Malformed legacy row not found: ${id}`);
  const cleaned = String(entry.word).slice(1);
  const sourceTarget = wordMap.get(normalizeHeadword(cleaned));
  const target = resolveBrushableWord(sourceTarget, wordMap);
  if (!target || target === entry) throw new Error(`No safe target for ${entry.word} -> ${cleaned}`);
  entry.entryType = "word-reference";
  entry.studyMode = "reference";
  entry.baseWord = target.word;
  entry.baseWordId = String(target.id || target.wordId || "");
  entry.redirectToWord = target.word;
  entry.relationType = "malformed import";
  entry.difficulty = "不进入学习";
  entry.category = entry.category || "参考 · 导入修正";
  malformedRepairs.push(`${entry.word}->${target.word}`);
}

let nextWords = words.filter(
  (entry) => ![
    "word_reading_g_00bbdefa",
    "reading-coach-word-02929f528e1b42769748091c4e286ab0"
  ].includes(String(entry.id || entry.wordId || ""))
);

function normalizedDifficulty(entry) {
  const source = readingSourceById.get(String(entry.sourceReadingGId || ""));
  const raw = String(source?.difficulty || "").trim();
  if (validDifficulty.has(raw)) return raw;
  if (raw === "阅读逻辑核心") return "阅读扩展";
  const word = normalizeHeadword(entry.word);
  if (word === "about" || word === "first") return "基础高频";
  return "";
}

let difficultyRepaired = 0;
for (const entry of nextWords) {
  if (!isBrushableWord(entry) || validDifficulty.has(entry.difficulty)) continue;
  if (entry.source !== "reading-g-ai") {
    throw new Error(`Unexpected active invalid difficulty outside Reading G: ${entry.word}`);
  }
  const difficulty = normalizedDifficulty(entry);
  if (!difficulty) throw new Error(`No safe difficulty source for active Reading G word: ${entry.word}`);
  entry.difficulty = difficulty;
  difficultyRepaired += 1;
}

const isPhraseEntry = (entry) => {
  if (!isBrushableWord(entry)) return false;
  const word = normalizeHeadword(entry?.word);
  const reviewed = entry?.entryType === "headword" && entry?.lexicalizedCompound === true;
  return Boolean(
    entry?.isPhrase ||
    entry?.entryType === "phrase" ||
    entry?.pos === "phrase" ||
    (word.includes(" ") && !reviewed)
  );
};
const remainingInvalid = nextWords.filter((entry) => isBrushableWord(entry) && !validDifficulty.has(entry.difficulty));
const remainingPhrases = nextWords.filter(isPhraseEntry);
const remainingNames = nextWords.filter(
  (entry) => isBrushableWord(entry) && CONFIRMED_PERSON_NAME_WORDS.has(normalizeHeadword(entry.word))
);
const remainingEmpty = nextWords.filter(
  (entry) => isBrushableWord(entry) && (
    !normalizeHeadword(entry.word) ||
    !String(entry.meaning || "").trim() ||
    !String(entry.example || "").trim()
  )
);
if (remainingInvalid.length || remainingPhrases.length || remainingNames.length || remainingEmpty.length) {
  throw new Error(
    `Pre-write gate still fails: difficulty=${remainingInvalid.length}, phrases=${remainingPhrases.length}, names=${remainingNames.length}, empty=${remainingEmpty.length}`
  );
}

const now = new Date().toISOString();
const nextPayload = {
  ...payload,
  count: nextWords.length,
  savedAt: now,
  lexiconHash: computeLexiconHash(nextWords),
  integrityHash: computeIntegrityHash(nextWords),
  words: nextWords
};
const masterContent = `${JSON.stringify(nextPayload, null, 2)}\n`;
fs.writeFileSync(publicPath, masterContent, "utf8");
fs.writeFileSync(staticPath, masterContent, "utf8");

const currentRetirements = JSON.parse(fs.readFileSync(retirementPath, "utf8"));
const nextRetirements = buildLexiconRetirementPayload(
  currentRetirements,
  [{ id: stuart.id, word: stuart.word }],
  { version: nextPayload.version, savedAt: now }
);
fs.writeFileSync(retirementPath, `${JSON.stringify(nextRetirements, null, 2)}\n`, "utf8");
const fileHash = crypto.createHash("sha256").update(masterContent).digest("hex");
fs.writeFileSync(
  baselinePath,
  renderMasterLexiconBaseline({ count: nextPayload.count, version: nextPayload.version, fileHash }),
  "utf8"
);

// Mirror the existing Reading G delete route semantics so Stuart is retired at the source as well.
const removedReading = readingPayload.items.filter(
  (entry) => String(entry.id || "") === String(stuart.sourceReadingGId || "") ||
    ((entry.entryType || "word") === "word" && normalizeHeadword(entry.word) === "stuart")
);
if (removedReading.length !== 1) throw new Error(`Expected one Reading G Stuart row, got ${removedReading.length}`);
const removedSource = removedReading[0];
const nextReadingItems = readingPayload.items.filter((entry) => entry !== removedSource);
let wordCount = 0;
let phraseCount = 0;
let activeCount = 0;
let referenceCount = 0;
for (const item of nextReadingItems) {
  if ((item?.entryType || "word") === "phrase") phraseCount += 1;
  else wordCount += 1;
  if (item?.studyMode === "reference") referenceCount += 1;
  else activeCount += 1;
}
const nextReadingPayload = {
  ...readingPayload,
  count: nextReadingItems.length,
  wordCount,
  phraseCount,
  activeCount,
  referenceCount,
  items: nextReadingItems
};
if (readingPayload.questionBankExpansion && typeof readingPayload.questionBankExpansion === "object") {
  const pendingCount = nextReadingItems.filter((item) => item?.primaryLayer === "questionBankPending").length;
  nextReadingPayload.questionBankExpansion = {
    ...readingPayload.questionBankExpansion,
    pendingCount,
    retiredCount: (Number(readingPayload.questionBankExpansion.retiredCount) || 0) + 1,
    referenceCount: pendingCount
  };
}
fs.writeFileSync(readingPath, `${JSON.stringify(nextReadingPayload)}\n`, "utf8");

const readingRetirements = JSON.parse(fs.readFileSync(readingRetirementPath, "utf8"));
const retirementByKey = new Map(
  normalizeReadingGRetirements(readingRetirements).map((entry) => [entry.key, entry])
);
const retiredKey = getReadingGRetirementKey(removedSource);
if (!retiredKey) throw new Error("Unable to build Reading G Stuart retirement key");
retirementByKey.set(retiredKey, {
  key: retiredKey,
  id: removedSource.id,
  word: removedSource.word,
  entryType: removedSource.entryType === "phrase" ? "phrase" : "word",
  deletedAt: now
});
const nextReadingRetirements = {
  version: "reading-g-retirements-v1",
  updatedAt: now,
  count: retirementByKey.size,
  entries: [...retirementByKey.values()]
};
fs.writeFileSync(readingRetirementPath, `${JSON.stringify(nextReadingRetirements, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  masterBefore: payload.words.length,
  masterAfter: nextWords.length,
  difficultyRepaired,
  malformedRepairs,
  reviewedCompounds: reviewedCompoundIds.size,
  removedFromMaster: [stuart.word, phraseOnly.word],
  masterRetirementCount: nextRetirements.count,
  readingGBefore: readingPayload.items.length,
  readingGAfter: nextReadingItems.length,
  readingGRetirementCount: nextReadingRetirements.count,
  lexiconHash: nextPayload.lexiconHash
}, null, 2));
