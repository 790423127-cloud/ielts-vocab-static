import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  USER_PROGRESS_FIELDS,
  auditSemanticVocabulary,
  exampleTargetStatus,
  isGenericMeaningDetail,
  normalizeLoose,
  normalizeText,
  sha256
} from "./lib/vocab-semantic-quality-v1.mjs";
import { getWordNetDefinition } from "./lib/wordnet-definition-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC = path.join(ROOT, "public", "data", "words.json");
const LEGACY = path.join(ROOT, "data", "words.json");
const BASIC = path.join(ROOT, "public", "data", "basic-words.json");
const BASELINE = path.join(ROOT, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const REPORT_DIR = path.join(ROOT, "reports", "vocab-semantic-quality-v2");
const FIXED_TIME = "2026-07-15T12:00:00.000Z";
export const SEMANTIC_QUALITY_V2 = "vocab-semantic-quality-v2-20260715";

const ENGLISH_RE = /[A-Za-z]{3}/;
const CHINESE_RE = /[\u3400-\u9fff]/u;
const MULTI_MEANING_RE = /[；;|]|(?:^|\s)\d+[.、]/u;
const ENGLISH_DEFINITION_OVERRIDES = new Map(Object.entries({
  mitigation: "the act of making something less harmful, serious, or painful"
}));
const ACTIVE_PROPER_NAME_EXCEPTIONS = new Set(["surname", "tesla", "greenfield"]);
const ENTRY_OVERRIDES = new Map(Object.entries({
  tesla: { meaning: "特斯拉（磁感应强度单位）；特斯拉（人名或品牌）", meaningZh: "特斯拉（磁感应强度单位）；特斯拉（人名或品牌）", allowProperNameStudy: true },
  greenfield: { meaning: "未开发地区的；在未开发土地上新建的", meaningZh: "未开发地区的；在未开发土地上新建的", pos: "adjective", allowProperNameStudy: true },
  surname: { allowProperNameStudy: true }
}));
const REFERENCE_ALIASES = new Map(Object.entries({
  leed: { canonical: "lead", example: "‘Leed’ is a nonstandard spelling of ‘lead’ and should not be used in formal writing." },
  explosife: { canonical: "explosive", example: "‘Explosife’ is a misspelling of ‘explosive’." },
  lable: { canonical: "label", example: "‘Lable’ is a common misspelling of ‘label’." },
  mahy: { canonical: "may", example: "‘Mahy’ is a source spelling error and is not a standard English word." }
}));
const EXAMPLE_REPAIRS = new Map(Object.entries({
  yet: "The report is not ready yet.",
  complicate: "Additional rules can complicate a simple process.",
  offer: "The company offered me a full-time position.",
  sew: "My grandmother taught me how to sew.",
  woe: "The economic crisis brought misery and woe to many families.",
  ore: "The miners dug deep to find iron ore.",
  s: "This shirt is available in size S.",
  n: "Nitrogen is a gas, and its chemical symbol is N.",
  "forty-two": "The answer to life, the universe, and everything is forty-two."
}));
const SPECIAL_EXAMPLE_FORMS = new Map(Object.entries({
  aug: ["August"], mister: ["Mr"], dead: ["died"], mislead: ["misled"], overpay: ["overpaid"],
  hydration: ["hydrated"], coexistence: ["coexist"], dim: ["dimly"], advertizing: ["advertising"],
  mis: ["misunderstanding"], wax: ["beeswax"], low: ["lower"], overcome: ["overcame"],
  alter: ["altered"], murmur: ["murmured"], offer: ["offered"], happen: ["happened"],
  supportingdocument: ["supporting documents"], tailor: ["tailored"], rocket: ["rocketed"],
  weaken: ["weakened"], hover: ["hovered"], widen: ["widened"], awaken: ["awakened"],
  summon: ["summoned"], linger: ["lingered"], ponder: ["pondered"], elicit: ["elicited"],
  emergencycontact: ["emergency contact"], hinder: ["hindered"], savor: ["savored"],
  muster: ["mustered"], darken: ["darkened"], beckon: ["beckoned"], natter: ["nattered"],
  nextofkin: ["next of kin"], ation: ["creation"],
  steal: ["stole"], stick: ["stuck"], swing: ["swung"], shoot: ["shot"], shrink: ["shrank"],
  cling: ["clung"], spit: ["spat"], kneel: ["knelt"], creep: ["crept"], uphold: ["upheld"],
  fling: ["flung"], withhold: ["withheld"], sting: ["stung"], vie: ["vying"], misspend: ["misspent"]
}));

function readWords(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(payload) ? payload : payload.words || [];
}

function englishDefinition(value) {
  const text = String(value || "").trim();
  return ENGLISH_RE.test(text) && !CHINESE_RE.test(text) ? text : "";
}

function sourceDefinitionMaps() {
  const makeMap = (filePath) => new Map(readWords(filePath)
    .map((entry) => [normalizeText(entry.word), englishDefinition(entry.definition)])
    .filter(([, definition]) => definition));
  return { legacy: makeMap(LEGACY), basic: makeMap(BASIC) };
}

function posFamily(pos = "") {
  const text = String(pos).toLowerCase();
  if (/noun|(^|[\s/.,])n([\s/.,]|$)/.test(text)) return "noun";
  if (/verb|(^|[\s/.,])v([\s/.,]|$)/.test(text)) return "verb";
  if (/adjective|(^|[\s/.,])adj([\s/.,]|$)/.test(text)) return "adjective";
  if (/adverb|(^|[\s/.,])adv([\s/.,]|$)/.test(text)) return "adverb";
  return "unknown";
}

export function splitExistingMeaning(value = "") {
  const text = String(value).trim();
  if (!text) return [];
  const parts = MULTI_MEANING_RE.test(text)
    ? text.split(/\s*(?:[；;|]|(?:^|\s)\d+[.、])\s*/u)
    : [text];
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].slice(0, 6);
}

function mergeBy(items, additions, keyFn) {
  const map = new Map((Array.isArray(items) ? items : []).map((item) => [keyFn(item), item]));
  for (const item of additions) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function exampleTokens(example = "") {
  return String(example).match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || [];
}

function discoverCompoundForm(entry) {
  const headword = normalizeLoose(entry.word);
  if (headword.length < 5) return "";
  const tokens = exampleTokens(entry.example);
  for (let size = 1; size <= Math.min(5, tokens.length); size += 1) {
    for (let start = 0; start + size <= tokens.length; start += 1) {
      const candidate = tokens.slice(start, start + size).join(" ");
      if (normalizeLoose(candidate) === headword && normalizeText(candidate) !== normalizeText(entry.word)) return candidate;
    }
  }
  return "";
}

function applyRelationRepairs(entry, report) {
  const word = normalizeText(entry.word);
  const manageField = (field) => {
    entry.semanticQualityV2ManagedFields = [...new Set([...(entry.semanticQualityV2ManagedFields || []), field])];
  };
  const semanticOverride = ENTRY_OVERRIDES.get(word);
  if (semanticOverride) Object.assign(entry, semanticOverride);
  const repairedExample = EXAMPLE_REPAIRS.get(word);
  if (repairedExample) manageField("example");
  if (repairedExample && entry.example !== repairedExample) {
    entry.example = repairedExample;
    report.exampleRepairs.push(word);
  }
  if (/^He is [A-Za-z-]+ years\.$/i.test(entry.example)) {
    entry.example = entry.example.replace(/ years\.$/i, " years old.");
    report.exampleRepairs.push(word);
  }

  const reference = REFERENCE_ALIASES.get(word);
  if (reference) {
    manageField("example");
    const beforeReference = JSON.stringify({
      example: entry.example, studyMode: entry.studyMode, entryStatus: entry.entryStatus,
      category: entry.category, difficulty: entry.difficulty, readingPriority: entry.readingPriority,
      redirectToWord: entry.redirectToWord, acceptedAnswers: entry.acceptedAnswers
    });
    entry.example = reference.example;
    entry.studyMode = "reference";
    entry.entryStatus = "reference-nonstandard-alias-20260715";
    entry.category = "非标准拼写 · 仅查阅";
    entry.difficulty = "低频认识即可";
    entry.readingPriority = false;
    entry.redirectToWord = reference.canonical;
    entry.acceptedAnswers = [...new Set([...(entry.acceptedAnswers || []), word, reference.canonical])];
    const afterReference = JSON.stringify({
      example: entry.example, studyMode: entry.studyMode, entryStatus: entry.entryStatus,
      category: entry.category, difficulty: entry.difficulty, readingPriority: entry.readingPriority,
      redirectToWord: entry.redirectToWord, acceptedAnswers: entry.acceptedAnswers
    });
    if (beforeReference !== afterReference) report.referenceAliases.push({ word, canonical: reference.canonical });
  }

  if (exampleTargetStatus(entry).morphologyMatch) return;
  const additions = [];
  const compound = discoverCompoundForm(entry);
  if (compound) additions.push(compound);
  for (const form of SPECIAL_EXAMPLE_FORMS.get(word) || []) {
    if (new RegExp(`(^|[^a-z])${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(entry.example)) additions.push(form);
  }
  if (!additions.length) return;
  entry.forms = mergeBy(entry.forms, additions.map((form) => ({
    word: form,
    type: "attested example form",
    note: "例句中使用的合法词形、词族形式或空格/连字符写法",
    source: "semantic-quality-v2-example"
  })), (item) => normalizeText(item?.word ?? item));
  report.relationForms.push({ word, forms: additions });
}

function applyMeaningEnrichment(entry, definitions, report) {
  const currentEnglish = englishDefinition(entry.definition);
  const key = normalizeText(entry.word);
  let definition = ENGLISH_DEFINITION_OVERRIDES.get(key) || currentEnglish;
  let source = ENGLISH_DEFINITION_OVERRIDES.has(key) ? "manual-semantic-review-v2" : currentEnglish ? String(entry.definitionSource || "existing-english") : "";
  if (!definition && definitions.legacy.has(key)) { definition = definitions.legacy.get(key); source = "legacy-master"; }
  if (!definition && definitions.basic.has(key)) { definition = definitions.basic.get(key); source = "basic-zero"; }
  if (!definition) {
    definition = getWordNetDefinition(entry.word, entry.pos);
    if (definition) source = "princeton-wordnet-3.1";
  }
  if (definition) {
    if (entry.definition !== definition) report.definitionRepairs.push({ word: entry.word, source });
    entry.definition = definition;
    entry.definitionSource = source;
  } else {
    entry.definitionSource = "legacy-chinese-fallback";
    report.definitionFallbacks.push(entry.word);
  }

  const senses = splitExistingMeaning(entry.meaning);
  const shouldStructure = senses.length > 1 || !definition;
  if (shouldStructure) {
    const family = posFamily(entry.pos);
    const additions = senses.map((gloss, index) => ({
      gloss,
      posFamily: family,
      label: senses.length > 1 ? `义项 ${index + 1}` : "核心义",
      confidence: "high",
      evidence: ["existing-curated-meaning"],
      source: "semantic-quality-v2"
    }));
    const before = entry.meaningsZh?.length || 0;
    entry.meaningsZh = mergeBy(entry.meaningsZh, additions, (item) => `${normalizeText(item?.gloss)}::${normalizeText(item?.posFamily)}`);
    if ((entry.meaningsZh?.length || 0) > before) report.structuredMeaningEntries.push(entry.word);

    const isCore = ["基础高频", "中级核心"].includes(entry.difficulty);
    if (senses.length > 1 && isCore) {
      const quizzes = additions.slice(0, 4).map((sense, index) => ({
        senseId: `${entry.id || entry.wordId}-v2-${index + 1}-${sha256(sense.gloss).slice(0, 8)}`,
        quizMeaningZh: sense.gloss,
        meaningDetailedZh: sense.gloss,
        posFamily: sense.posFamily,
        confidence: "high",
        generatedAt: FIXED_TIME,
        source: "semantic-quality-v2"
      }));
      const beforeQuiz = entry.quizSenses?.length || 0;
      entry.quizSenses = mergeBy(entry.quizSenses, quizzes, (item) => String(item?.senseId || ""));
      if ((entry.quizSenses?.length || 0) > beforeQuiz) report.quizSenseEntries.push(entry.word);
    }
  }

  if (entry.meaningDetailZh && isGenericMeaningDetail({ ...entry, meaningDetailedZh: "" })) {
    delete entry.meaningDetailZh;
    report.removedGenericDetails.push(entry.word);
  }
  if (entry.meaningDetailedZh && isGenericMeaningDetail({ ...entry, meaningDetailZh: "" })) {
    delete entry.meaningDetailedZh;
    report.removedGenericDetails.push(entry.word);
  }
  if (normalizeText(entry.meaningDetailedZh) === normalizeText(entry.meaning)) {
    delete entry.meaningDetailedZh;
    report.removedCopiedDetails.push(entry.word);
  }
  const identityBlob = `${entry.pos || ""} ${entry.meaning || ""}`;
  if (!ACTIVE_PROPER_NAME_EXCEPTIONS.has(key) && /proper noun|人名|姓氏|来源残留/i.test(identityBlob)) {
    entry.studyMode = "reference";
    entry.entryStatus = "reference-proper-name-20260715";
    entry.category = "专名/来源词 · 仅查阅";
    entry.difficulty = "低频认识即可";
    entry.readingPriority = false;
  }
  entry.semanticQualityV2 = SEMANTIC_QUALITY_V2;
}

function snapshotProgress(words) {
  return new Map(words.map((entry) => [String(entry.id || entry.wordId || ""), Object.fromEntries(
    [...USER_PROGRESS_FIELDS].filter((field) => field in entry).map((field) => [field, structuredClone(entry[field])])
  )]));
}

function writeWithRetry(filePath, content, attempts = 6) {
  let error;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { fs.writeFileSync(filePath, content); return; } catch (caught) {
      error = caught;
      if (!['EBUSY', 'EPERM', 'EACCES', 'UNKNOWN'].includes(caught?.code) || attempt === attempts - 1) throw caught;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
    }
  }
  throw error;
}

function baselineSource(count, version, fileHash) {
  return `// Baseline metadata for the bundled master lexicon.\n// Keep this in sync with public/data/words.json and .static-export-cache/words.json.\nexport const MASTER_LEXICON_EXPECTED_COUNT = ${count};\nexport const MASTER_LEXICON_VERSION = ${JSON.stringify(version)};\nexport const MASTER_LEXICON_SHA256 = ${JSON.stringify(fileHash)};\n`;
}

export function applySemanticQualityV2({ sourcePath = CACHE, apply = false } = {}) {
  const sourcePayload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const words = structuredClone(Array.isArray(sourcePayload) ? sourcePayload : sourcePayload.words || []);
  const beforeProgress = snapshotProgress(words);
  const definitions = sourceDefinitionMaps();
  const report = {
    version: SEMANTIC_QUALITY_V2, mode: apply ? "apply" : "dry-run", totalWords: words.length,
    definitionRepairs: [], definitionFallbacks: [], structuredMeaningEntries: [], quizSenseEntries: [],
    removedGenericDetails: [], removedCopiedDetails: [], exampleRepairs: [], relationForms: [], referenceAliases: [],
    targetAbsentAfterMorphology: 0, unresolvedExampleRelations: [], progressChanges: 0, idChanges: 0, errors: [], paidApiCalls: 0, externalPerWordLookups: 0
  };

  for (const entry of words) {
    applyRelationRepairs(entry, report);
    applyMeaningEnrichment(entry, definitions, report);
  }

  const ids = new Set();
  for (const entry of words) {
    const id = String(entry.id || entry.wordId || "");
    if (!id || ids.has(id)) report.errors.push(`invalid or duplicate stable id: ${id}`);
    ids.add(id);
    const before = beforeProgress.get(id) || {};
    const after = Object.fromEntries([...USER_PROGRESS_FIELDS].filter((field) => field in entry).map((field) => [field, entry[field]]));
    if (JSON.stringify(before) !== JSON.stringify(after)) report.progressChanges += 1;
  }
  report.idChanges = [...ids].filter((id) => !beforeProgress.has(id)).length;
  const audit = auditSemanticVocabulary({ words });
  report.targetAbsentAfterMorphology = audit.summary.targetAbsentAfterMorphology;
  const wordsById = new Map(words.map((entry) => [String(entry.id || entry.wordId || ""), entry]));
  report.unresolvedExampleRelations = audit.issues
    .filter((issue) => issue.category === "target_absent_after_morphology")
    .map((issue) => {
      const entry = wordsById.get(issue.id);
      return { id: issue.id, word: issue.word, example: entry?.example || "" };
    });
  if (report.targetAbsentAfterMorphology) report.errors.push(`unresolved example relations: ${report.targetAbsentAfterMorphology}`);
  if (report.progressChanges) report.errors.push(`progress fields changed: ${report.progressChanges}`);

  const version = `v9-${words.length}-semantic-quality-v2`;
  const payload = Array.isArray(sourcePayload) ? words : {
    ...sourcePayload, version, count: words.length, savedAt: FIXED_TIME,
    lexiconHash: sha256(JSON.stringify(words)), semanticQualityPatch: SEMANTIC_QUALITY_V2, words
  };
  const raw = `${JSON.stringify(payload, null, 2)}\n`;
  const fileHash = sha256(raw);
  report.fileHash = fileHash;
  report.outputBytes = Buffer.byteLength(raw);

  if (apply && !report.errors.length) {
    writeWithRetry(CACHE, raw);
    writeWithRetry(PUBLIC, raw);
    writeWithRetry(BASELINE, baselineSource(words.length, version, fileHash));
  }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, `apply-${apply ? "apply" : "dry-run"}.json`), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const report = applySemanticQualityV2({ apply: process.argv.includes("--apply") });
  console.log(JSON.stringify({
    version: report.version, mode: report.mode, totalWords: report.totalWords,
    definitionRepairs: report.definitionRepairs.length, definitionFallbacks: report.definitionFallbacks.length,
    structuredMeaningEntries: report.structuredMeaningEntries.length, quizSenseEntries: report.quizSenseEntries.length,
    removedGenericDetails: report.removedGenericDetails.length, removedCopiedDetails: report.removedCopiedDetails.length,
    exampleRepairs: report.exampleRepairs.length, relationForms: report.relationForms.length,
    referenceAliases: report.referenceAliases.length, targetAbsentAfterMorphology: report.targetAbsentAfterMorphology,
    progressChanges: report.progressChanges, errors: report.errors, paidApiCalls: 0, externalPerWordLookups: 0
  }, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
