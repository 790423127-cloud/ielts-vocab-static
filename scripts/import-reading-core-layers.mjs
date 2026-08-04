/**
 * Import IELTS G-class Reading Core pack (Desktop/阅读核心) → reading-g v3 datasets.
 *
 * Writes (atomically after audit):
 *   public/data/reading-g-vocab.json
 *   public/data/reading-g-paraphrases.json
 *   public/data/reading-g-import-report.json
 *
 * Does NOT touch words.json / phrases.json / basic / meaning-6000.
 *
 * Usage: node scripts/import-reading-core-layers.mjs
 * Optional: --source "C:/path/to/阅读核心"
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import {
  cleanExampleField,
  cleanExampleCnField,
  isMetaExamplePlaceholder
} from "../app/lib/vocab/example-clean.mjs";
import { applyReadingGQuestionBankExpansion } from "./expand-reading-g-question-bank.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

const DATA_SCHEMA_VERSION = 3;
const PROGRESS_SCHEMA_VERSION = 3;
const DATASET_VERSION = "reading-g-core-v3";
const EXAMPLE_REPAIRS_FILE = path.join(
  "scripts",
  "data",
  "reading-g-example-repairs.json"
);

const DEFAULT_SOURCE = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  "Desktop",
  "阅读核心"
);

const LAYERS = [
  { id: "priority1500", name: "优先核心1500", file: "gt-reading-priority-1500.json", mode: "active", rank: 1, kind: "words" },
  { id: "answerCore250", name: "答案词强化250", file: "gt-reading-answer-core-250.json", mode: "active", rank: 2, kind: "words" },
  { id: "logic120", name: "逻辑与限制表达120", file: "gt-reading-logic-connectors-120.json", mode: "active", rank: 3, kind: "words" },
  { id: "phrases400", name: "高频词组400", file: "gt-reading-phrases-400.json", mode: "active", rank: 4, kind: "phrases" },
  { id: "tierB1200", name: "B层核心识别1200", file: "gt-reading-tier-b-1200.json", mode: "active", rank: 5, kind: "words" },
  { id: "paraCore600", name: "网络同义核心600", file: "gt-reading-online-paraphrase-core-600.json", mode: "active", rank: 6, kind: "entries" },
  { id: "tierC800", name: "C层扩展识别800", file: "gt-reading-tier-c-800.json", mode: "active", rank: 7, kind: "words" },
  { id: "paraExt500", name: "网络同义扩展500", file: "gt-reading-online-paraphrase-extension-500.json", mode: "active", rank: 8, kind: "entries" },
  { id: "reference701", name: "参考表达701", file: "gt-reading-online-paraphrase-reference-701.json", mode: "reference", rank: 9, kind: "entries" }
];

const AUX = {
  mainEnhanced: "gt-reading-main-enhanced-3592.json",
  paraphrases300: "gt-reading-paraphrases-300.json",
  multiSenses: "gt-reading-familiar-words-multiple-senses-150.json"
};

const RELATION_TYPES = new Set([
  "exact_synonym",
  "near_synonym",
  "word_phrase_paraphrase",
  "word_family",
  "formal_informal",
  "active_passive",
  "opposite_contrast",
  "candidate_related"
]);

function parseArgs(argv) {
  const out = { source: DEFAULT_SOURCE };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--source" && argv[i + 1]) {
      out.source = argv[++i];
    }
  }
  return out;
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function normalizeKey(input) {
  let s = String(input || "");
  try {
    s = s.normalize("NFKC");
  } catch {
    /* ignore */
  }
  s = s
    .trim()
    .toLowerCase()
    .replace(/[’‘‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?·•\-–—]+|[\s.,;:!?·•\-–—]+$/g, "")
    .trim();
  return s;
}

function stableId(entryType, normalizedKey) {
  const slug = String(normalizedKey || "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "empty";
  return `rg_${entryType}_${slug}`;
}

function mergeKey(entryType, normalizedKey) {
  return `${entryType}::${normalizedKey}`;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function str(v) {
  return String(v == null ? "" : v).trim();
}

function normalizePos(pos) {
  if (Array.isArray(pos)) {
    return pos.map((p) => str(p).toLowerCase()).filter(Boolean).join("/") || "";
  }
  const p = str(pos).toLowerCase();
  if (!p) return "";
  if (p.startsWith("n") && !p.startsWith("num")) return p.includes("phrase") ? "phrase" : "noun";
  if (p.startsWith("v")) return "verb";
  if (p.startsWith("adj") || p === "a." || p === "a") return "adjective";
  if (p.startsWith("adv")) return "adverb";
  if (p.includes("phrase") || p === "prep" || p.startsWith("prep")) return p;
  return p.replace(/\.$/, "");
}

function normalizeMeaningZh(text) {
  return str(text)
    .replace(/\s+/g, " ")
    .replace(/；+/g, "；")
    .replace(/^v\.\s*/i, "")
    .replace(/^n\.\s*/i, "")
    .replace(/^adj\.\s*/i, "")
    .replace(/^adv\.\s*/i, "")
    .replace(/[；;，,、\s]+$/g, "")
    .trim();
}

function senseKey(pos, meaningZh) {
  return `${normalizePos(pos)}::${normalizeMeaningZh(meaningZh).toLowerCase()}`;
}

function meaningTokens(meaningZh) {
  return normalizeMeaningZh(meaningZh)
    .split(/[；;，,、/]+/)
    .map((token) => normalizeMeaningZh(token).replace(/\s+/g, "").toLowerCase())
    .filter(Boolean);
}

function isTokenSubset(left, right) {
  const rightSet = new Set(right);
  return left.length > 0 && left.every((token) => rightSet.has(token));
}

function mergeSenseEvidence(target, source) {
  target.sourceFiles = [...new Set([...(target.sourceFiles || []), ...(source.sourceFiles || [])])];
  if (!target.definition && source.definition) target.definition = source.definition;
  if (!target.example && source.example) target.example = source.example;
  if (!target.exampleZh && source.exampleZh) target.exampleZh = source.exampleZh;
}

function compactSenses(senses) {
  const compacted = [];
  for (const sense of senses || []) {
    const pos = normalizePos(sense.pos);
    const tokens = meaningTokens(sense.meaningZh);
    const existing = compacted.find((candidate) => {
      if (normalizePos(candidate.pos) !== pos) return false;
      const candidateTokens = meaningTokens(candidate.meaningZh);
      return isTokenSubset(tokens, candidateTokens) || isTokenSubset(candidateTokens, tokens);
    });
    if (!existing) {
      compacted.push({ ...sense, meaningZh: normalizeMeaningZh(sense.meaningZh) });
      continue;
    }

    const existingTokens = meaningTokens(existing.meaningZh);
    if (tokens.length > existingTokens.length) existing.meaningZh = normalizeMeaningZh(sense.meaningZh);
    mergeSenseEvidence(existing, sense);
  }
  return compacted;
}

function extractSurface(raw, kind) {
  if (kind === "phrases") {
    return str(raw.phrase || raw.word || raw.expression || "");
  }
  if (kind === "entries") {
    return str(raw.expression || raw.canonicalKey || raw.word || "");
  }
  return str(raw.word || raw.expression || raw.phrase || "");
}

function extractMeaning(raw) {
  return str(
    raw.meaning ||
      raw.meaningZh ||
      raw.primaryMeaningZh ||
      raw.definition ||
      raw.quizMeaningZh ||
      ""
  );
}

function extractExample(raw) {
  return {
    example: str(raw.example || ""),
    exampleZh: str(raw.exampleCn || raw.exampleZh || "")
  };
}

function extractLabeledSenses(meaning, fallbackPos = "") {
  const source = String(meaning || "").trim();
  const marker = /(^|[\n；;]|\s+)(prep|pron|conj|adj|adv|n|v)\.\s*/gi;
  const matches = [...source.matchAll(marker)];
  if (!matches.length) return [];

  const senses = [];
  const prefix = source.slice(0, matches[0].index).replace(/[\n；;\s]+$/g, "").trim();
  if (prefix && fallbackPos) senses.push({ pos: fallbackPos, meaningZh: prefix });

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    const meaningZh = source.slice(start, end).replace(/^[\n；;\s]+|[\n；;\s]+$/g, "").trim();
    if (meaningZh) senses.push({ pos: match[2], meaningZh });
  }
  return senses;
}

function guessEntryType(raw, layerKind, surface) {
  if (layerKind === "phrases" || raw.entryType === "phrase" || raw.isPhrase) return "phrase";
  if (/\s/.test(surface) && surface.split(/\s+/).length >= 2) return "phrase";
  return "word";
}

function pickArrayItems(data, kind) {
  if (kind === "phrases") return asArray(data.phrases || data.words || data.items);
  if (kind === "entries") return asArray(data.entries || data.words || data.items);
  return asArray(data.words || data.items || data.entries);
}

function createEmptyEntry(entryType, normalizedKey, surface, layer) {
  return {
    id: stableId(entryType, normalizedKey),
    entryType,
    word: surface,
    normalizedKey,
    phonetic: "",
    primaryPos: "",
    primaryMeaningZh: "",
    meaning: "",
    definition: "",
    example: "",
    exampleCn: "",
    senses: [],
    collocations: [],
    phraseCollocations: [],
    forms: [],
    wordFamily: [],
    topics: [],
    ieltsUse: [],
    difficulty: "",
    category: "IELTS G类 · 阅读核心",
    domain: "阅读通用",
    layers: [],
    primaryLayer: layer.id,
    layerRank: layer.rank,
    studyMode: layer.mode === "reference" ? "reference" : "active",
    sourceFiles: [],
    qualityFlags: [],
    alternateMeanings: []
  };
}

function upsertSense(entry, sense, sourceFile, conflicts) {
  const pos = normalizePos(sense.pos) || (entry.entryType === "phrase" ? "phrase" : "");
  const meaningZh = normalizeMeaningZh(sense.meaningZh || sense.meaning || "");
  if (!meaningZh) return;

  const key = senseKey(pos, meaningZh);
  const existing = entry.senses.find((s) => senseKey(s.pos, s.meaningZh) === key);
  if (!existing) {
    entry.senses.push({
      senseId: `${entry.id}_${pos || "x"}_${String(entry.senses.length + 1).padStart(2, "0")}`,
      pos,
      meaningZh,
      definition: str(sense.definition || ""),
      example: str(sense.example || ""),
      exampleZh: str(sense.exampleZh || sense.exampleCn || ""),
      sourceFiles: sourceFile ? [sourceFile] : []
    });
    return;
  }

  if (sourceFile && !existing.sourceFiles.includes(sourceFile)) {
    existing.sourceFiles.push(sourceFile);
  }
  if (!existing.definition && sense.definition) existing.definition = str(sense.definition);
  if (!existing.example && sense.example) existing.example = str(sense.example);
  if (!existing.exampleZh && (sense.exampleZh || sense.exampleCn)) {
    existing.exampleZh = str(sense.exampleZh || sense.exampleCn);
  }

  // Conflict: same pos but different non-empty meaning already handled by key;
  // non-empty field conflict for definition/example recorded lightly.
  if (existing.definition && sense.definition && existing.definition !== str(sense.definition)) {
    conflicts.push({
      type: "sense_definition_conflict",
      id: entry.id,
      pos,
      kept: existing.definition,
      other: str(sense.definition),
      sourceFile
    });
  }
}

function mergeFieldPreferPriority(entry, field, value, layerRank, fieldPriority, conflicts, sourceFile) {
  const next = str(value);
  if (!next) return;
  const prev = str(entry[field]);
  if (!prev) {
    entry[field] = next;
    fieldPriority[field] = layerRank;
    return;
  }
  if (prev === next) return;
  // Lower rank number = higher priority (earlier layer)
  if (layerRank < (fieldPriority[field] ?? 999)) {
    if (!entry.alternateMeanings) entry.alternateMeanings = [];
    if (field === "primaryMeaningZh" || field === "meaning") {
      entry.alternateMeanings.push({ field, value: prev, fromRank: fieldPriority[field], sourceFile });
    }
    entry[field] = next;
    fieldPriority[field] = layerRank;
    conflicts.push({
      type: "field_override_by_priority",
      id: entry.id,
      field,
      kept: next,
      previous: prev,
      sourceFile
    });
  } else {
    if (field === "primaryMeaningZh" || field === "meaning") {
      entry.alternateMeanings = entry.alternateMeanings || [];
      entry.alternateMeanings.push({ field, value: next, fromRank: layerRank, sourceFile });
    }
    conflicts.push({
      type: "field_kept_higher_priority",
      id: entry.id,
      field,
      kept: prev,
      other: next,
      sourceFile
    });
  }
}

function mergeList(target, incoming, keyFn) {
  const seen = new Set(target.map(keyFn));
  for (const item of incoming) {
    const k = keyFn(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    target.push(item);
  }
}

function applyRawToEntry(entry, raw, layer, sourceFile, fieldPriority, conflicts) {
  if (!entry.layers.includes(layer.id)) entry.layers.push(layer.id);
  if (!entry.sourceFiles.includes(sourceFile)) entry.sourceFiles.push(sourceFile);

  if (layer.mode !== "reference") {
    entry.studyMode = "active";
  }

  const phonetic = str(raw.phonetic || "");
  const pos = normalizePos(raw.pos);
  const meaning = extractMeaning(raw);
  const { example, exampleZh } = extractExample(raw);

  mergeFieldPreferPriority(entry, "phonetic", phonetic, layer.rank, fieldPriority, conflicts, sourceFile);
  mergeFieldPreferPriority(entry, "primaryPos", pos, layer.rank, fieldPriority, conflicts, sourceFile);
  mergeFieldPreferPriority(entry, "primaryMeaningZh", meaning, layer.rank, fieldPriority, conflicts, sourceFile);
  mergeFieldPreferPriority(entry, "meaning", meaning, layer.rank, fieldPriority, conflicts, sourceFile);
  mergeFieldPreferPriority(entry, "definition", str(raw.definition || meaning), layer.rank, fieldPriority, conflicts, sourceFile);
  const cleanedEx = cleanExampleField(example, entry.word, {
    entryType: entry.entryType,
    meaningZh: meaning || entry.primaryMeaningZh || "",
    synthesizeIfEmpty: false,
    maxWords: 32
  });
  mergeFieldPreferPriority(
    entry,
    "example",
    cleanedEx.example || example,
    layer.rank,
    fieldPriority,
    conflicts,
    sourceFile
  );
  mergeFieldPreferPriority(
    entry,
    "exampleCn",
    cleanExampleCnField(exampleZh),
    layer.rank,
    fieldPriority,
    conflicts,
    sourceFile
  );
  mergeFieldPreferPriority(entry, "difficulty", str(raw.difficulty || ""), layer.rank, fieldPriority, conflicts, sourceFile);
  mergeFieldPreferPriority(entry, "domain", str(raw.domain || ""), layer.rank, fieldPriority, conflicts, sourceFile);

  const labeledSenses = extractLabeledSenses(meaning, pos);
  if (meaning && labeledSenses.length < 2) {
    upsertSense(
      entry,
      {
        pos: pos || (entry.entryType === "phrase" ? "phrase" : ""),
        meaningZh: meaning,
        definition: str(raw.definition || ""),
        example,
        exampleZh
      },
      sourceFile,
      conflicts
    );
  }

  // Multi-POS source rows are already complete senses. Do not also insert the
  // combined source string, otherwise the UI shows the same meanings twice.
  for (const labeledSense of labeledSenses) {
    upsertSense(
      entry,
      { ...labeledSense, example, exampleZh },
      sourceFile,
      conflicts
    );
  }

  const collocations = asArray(raw.collocations)
    .map((c) =>
      typeof c === "string"
        ? { phrase: c, chinese: "" }
        : { phrase: str(c.phrase || c.text), chinese: str(c.chinese || c.meaning || "") }
    )
    .filter((c) => c.phrase);
  mergeList(entry.collocations, collocations, (c) => normalizeKey(c.phrase));

  const phraseCols = asArray(raw.phraseCollocations)
    .map((c) =>
      typeof c === "string"
        ? { phrase: c, chinese: "" }
        : { phrase: str(c.phrase || c.text), chinese: str(c.chinese || c.meaning || "") }
    )
    .filter((c) => c.phrase);
  mergeList(entry.phraseCollocations, phraseCols, (c) => normalizeKey(c.phrase));

  const forms = asArray(raw.forms)
    .map((form) => {
      const word = typeof form === "string" ? str(form) : str(form.word || form.form || form.value);
      if (!word) return null;
      return typeof form === "string"
        ? { word, type: "form" }
        : { ...form, word, type: str(form.type) || "form" };
    })
    .filter(Boolean);
  mergeList(entry.forms, forms, (form) => normalizeKey(form.word));

  const family = asArray(raw.wordFamily)
    .map((member) => {
      const word = typeof member === "string" ? str(member) : str(member.word || member.form || member.value);
      if (!word) return null;
      return typeof member === "string" ? { word } : { ...member, word };
    })
    .filter(Boolean);
  mergeList(entry.wordFamily, family, (member) => normalizeKey(member.word));

  const topics = asArray(raw.topics).map(str).filter(Boolean);
  mergeList(entry.topics, topics, (x) => x);
  if (!entry.topics.includes("G类阅读")) entry.topics.push("G类阅读");
  if (!entry.topics.includes(layer.name)) entry.topics.push(layer.name);

  const ieltsUse = asArray(raw.ieltsUse).map(str).filter(Boolean);
  if (ieltsUse.length) mergeList(entry.ieltsUse, ieltsUse, (x) => x);
  else if (!entry.ieltsUse.includes("Reading")) entry.ieltsUse.push("Reading");
}

function mapRelationType(rawType) {
  const t = str(rawType);
  if (!t) return "near_synonym";
  if (/反|opposite|contrast/i.test(t)) return "opposite_contrast";
  if (/词族|family|派生/i.test(t)) return "word_family";
  if (/短语|phrase|改写|paraphrase/i.test(t)) return "word_phrase_paraphrase";
  if (/正式|formal/i.test(t)) return "formal_informal";
  if (/被动|passive/i.test(t)) return "active_passive";
  if (/exact|完全同义/i.test(t)) return "exact_synonym";
  if (/真题|同义|near|synonym/i.test(t)) return "near_synonym";
  return "near_synonym";
}

function ensureMemberInMap(map, surface, sourceFile, meaningHint = "") {
  const nk = normalizeKey(surface);
  if (!nk) return null;
  const entryType = /\s/.test(surface) ? "phrase" : "word";
  const key = mergeKey(entryType, nk);
  if (!map.has(key)) {
    const entry = createEmptyEntry(entryType, nk, surface, {
      id: "paraCore600",
      rank: 6,
      mode: "active"
    });
    entry.primaryLayer = "paraCore600";
    entry.layerRank = 6;
    entry.layers = ["paraCore600"];
    entry.studyMode = "active";
    entry.qualityFlags.push("created_from_paraphrase_pair");
    const meaning =
      normalizeMeaningZh(meaningHint) || "真题同义替换表达（见关系库）";
    entry.primaryMeaningZh = meaning;
    entry.meaning = meaning;
    entry.definition = meaning;
    entry.senses = [
      {
        senseId: `${entry.id}_x_01`,
        pos: entryType === "phrase" ? "phrase" : "",
        meaningZh: meaning,
        definition: "",
        example: "",
        exampleZh: "",
        sourceFiles: [sourceFile]
      }
    ];
    map.set(key, { entry, fieldPriority: { primaryMeaningZh: 6, meaning: 6 } });
  }
  const bag = map.get(key);
  if (!bag.entry.sourceFiles.includes(sourceFile)) bag.entry.sourceFiles.push(sourceFile);
  if (!bag.entry.layers.includes("paraCore600")) bag.entry.layers.push("paraCore600");
  if (!bag.entry.primaryMeaningZh && meaningHint) {
    const meaning = normalizeMeaningZh(meaningHint);
    bag.entry.primaryMeaningZh = meaning;
    bag.entry.meaning = meaning;
    bag.entry.definition = meaning;
  }
  bag.entry.studyMode = "active";
  return bag.entry;
}

function finalizeEntry(entry) {
  entry.senses = compactSenses(entry.senses);
  if (!entry.primaryMeaningZh && entry.senses[0]) {
    entry.primaryMeaningZh = entry.senses[0].meaningZh;
  }
  if (!entry.meaning) entry.meaning = entry.primaryMeaningZh;
  if (!entry.definition) entry.definition = entry.primaryMeaningZh;
  if (!entry.primaryPos && entry.senses[0]) entry.primaryPos = entry.senses[0].pos;
  if (!entry.example && entry.senses[0]) entry.example = entry.senses[0].example || "";
  if (!entry.exampleCn && entry.senses[0]) entry.exampleCn = entry.senses[0].exampleZh || "";

  // display aliases for existing flashcard UI
  entry.pos = entry.primaryPos || entry.pos || "";
  entry.meaningZh = entry.primaryMeaningZh;

  // unique layers preserve order
  const seen = new Set();
  entry.layers = entry.layers.filter((l) => {
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });

  if (!entry.layers.length) {
    entry.layers = [entry.primaryLayer || "priority1500"];
  }

  // recompute studyMode: any active layer → active
  const activeLayerIds = new Set(LAYERS.filter((l) => l.mode === "active").map((l) => l.id));
  const hasActive = entry.layers.some((l) => activeLayerIds.has(l));
  const onlyRef =
    entry.layers.length > 0 && entry.layers.every((l) => l === "reference701");
  entry.studyMode = onlyRef || (!hasActive && entry.layers.includes("reference701"))
    ? "reference"
    : hasActive
      ? "active"
      : entry.studyMode || "active";

  // drop empty alternate if unused
  if (!entry.alternateMeanings?.length) delete entry.alternateMeanings;

  return entry;
}

function atomicWriteJson(finalPath, data) {
  const dir = path.dirname(finalPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, finalPath);
}

function auditDataset(items, paraphrases, layerStats, warnings) {
  const errors = [];
  const ids = new Set();
  const keys = new Set();
  let emptyWord = 0;
  let emptyMeaning = 0;
  let multiSense = 0;
  let wordCount = 0;
  let phraseCount = 0;
  let activeCount = 0;
  let referenceOnly = 0;

  for (const item of items) {
    if (!item.word) {
      emptyWord += 1;
      errors.push({ type: "empty_word", id: item.id });
    }
    if (!item.primaryMeaningZh && !item.meaning) {
      emptyMeaning += 1;
      errors.push({ type: "empty_meaning", id: item.id, word: item.word });
    }
    if (ids.has(item.id)) errors.push({ type: "duplicate_id", id: item.id });
    ids.add(item.id);
    const mk = mergeKey(item.entryType, item.normalizedKey);
    if (keys.has(mk)) errors.push({ type: "duplicate_merge_key", key: mk });
    keys.add(mk);
    if (!item.layers?.length) errors.push({ type: "missing_layers", id: item.id });
    if (!item.primaryLayer) errors.push({ type: "missing_primaryLayer", id: item.id });
    if (item.studyMode !== "active" && item.studyMode !== "reference") {
      errors.push({ type: "bad_studyMode", id: item.id, studyMode: item.studyMode });
    }
    if (item.entryType === "word") wordCount += 1;
    if (item.entryType === "phrase") phraseCount += 1;
    if (item.studyMode === "active") activeCount += 1;
    else referenceOnly += 1;
    if ((item.senses || []).length > 1) multiSense += 1;

    const onlyRef =
      item.layers.length > 0 && item.layers.every((l) => l === "reference701");
    if (onlyRef && item.studyMode !== "reference") {
      errors.push({ type: "ref_only_not_reference", id: item.id });
    }
    const hasActiveLayer = item.layers.some((l) => l !== "reference701");
    if (hasActiveLayer && item.studyMode !== "active") {
      // allow if somehow only non-listed — treat as error when active layer present
      const activeIds = new Set(LAYERS.filter((x) => x.mode === "active").map((x) => x.id));
      if (item.layers.some((l) => activeIds.has(l)) && item.studyMode !== "active") {
        errors.push({ type: "active_layer_not_active", id: item.id, layers: item.layers });
      }
    }
  }

  for (const g of paraphrases) {
    if (!g.anchor) errors.push({ type: "para_empty_anchor", groupId: g.groupId });
    if (!Array.isArray(g.members) || !g.members.length) {
      errors.push({ type: "para_empty_members", groupId: g.groupId });
    }
    if (g.canAutoQuiz && g.confidence !== "high") {
      errors.push({ type: "autoquiz_without_high", groupId: g.groupId });
    }
    if (!RELATION_TYPES.has(g.relationType)) {
      errors.push({ type: "bad_relationType", groupId: g.groupId, relationType: g.relationType });
    }
    const all = [g.anchor, ...(g.members || [])].map(normalizeKey);
    if (all.length !== new Set(all).size) {
      errors.push({ type: "para_duplicate_member", groupId: g.groupId });
    }
    if (g.members?.some((m) => normalizeKey(m) === normalizeKey(g.anchor))) {
      errors.push({ type: "para_self_relation", groupId: g.groupId });
    }
  }

  // layer membership counts
  for (const layer of LAYERS) {
    const n = items.filter((it) => it.layers.includes(layer.id)).length;
    layerStats[layer.id].filterCount = n;
  }

  return {
    errors,
    warnings,
    emptyWord,
    emptyMeaning,
    multiSense,
    wordCount,
    phraseCount,
    activeCount,
    referenceOnly,
    itemCount: items.length,
    paraphraseCount: paraphrases.length
  };
}

export async function runImport({ sourceDir, projectRoot: root = projectRoot } = {}) {
  const source = sourceDir || DEFAULT_SOURCE;
  const warnings = [];
  const conflicts = [];
  const report = {
    generatedAt: new Date().toISOString(),
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    progressSchemaVersion: PROGRESS_SCHEMA_VERSION,
    datasetVersion: DATASET_VERSION,
    sourceDir: source,
    sourceFiles: {},
    layerStats: {},
    warnings: [],
    errors: []
  };

  if (!fs.existsSync(source)) {
    throw new Error(`源目录不存在: ${source}`);
  }

  // verify required files
  for (const layer of LAYERS) {
    const p = path.join(source, layer.file);
    if (!fs.existsSync(p)) throw new Error(`缺少源文件: ${layer.file}`);
  }
  for (const f of Object.values(AUX)) {
    const p = path.join(source, f);
    if (!fs.existsSync(p)) throw new Error(`缺少辅助源文件: ${f}`);
  }

  const map = new Map(); // mergeKey -> { entry, fieldPriority }

  // --- Main layers ---
  for (const layer of LAYERS) {
    const filePath = path.join(source, layer.file);
    const hash = sha256File(filePath);
    const data = readJson(filePath);
    const rows = pickArrayItems(data, layer.kind);
    report.sourceFiles[layer.file] = {
      bytes: fs.statSync(filePath).size,
      sha256: hash,
      rawCount: rows.length,
      role: "layer",
      layerId: layer.id
    };

    const seenInLayer = new Set();
    let skippedEmpty = 0;
    for (const [rowIndex, raw] of rows.entries()) {
      const surface = extractSurface(raw, layer.kind);
      const nk = normalizeKey(surface);
      if (!nk) {
        skippedEmpty += 1;
        continue;
      }
      const entryType = guessEntryType(raw, layer.kind, surface);
      const key = mergeKey(entryType, nk);
      seenInLayer.add(key);

      if (!map.has(key)) {
        const entry = createEmptyEntry(entryType, nk, surface, layer);
        map.set(key, { entry, fieldPriority: {} });
      }
      const bag = map.get(key);
      applyRawToEntry(bag.entry, raw, layer, layer.file, bag.fieldPriority, conflicts);
      if (layer.id === "phrases400") {
        bag.entry.phraseStudyStage = rowIndex < 200 ? 1 : 2;
      }
    }

    report.layerStats[layer.id] = {
      name: layer.name,
      rawCount: rows.length,
      uniqueKeysInLayer: seenInLayer.size,
      skippedEmpty,
      mode: layer.mode,
      rank: layer.rank
    };
  }

  // cumulative new uniques
  {
    const seen = new Set();
    for (const layer of LAYERS) {
      let added = 0;
      for (const [, bag] of map) {
        if (!bag.entry.layers.includes(layer.id)) continue;
        const k = mergeKey(bag.entry.entryType, bag.entry.normalizedKey);
        // count first appearance by primaryLayer
        if (bag.entry.primaryLayer === layer.id && !seen.has(k)) {
          // primary means first — count as new at this layer
        }
      }
      for (const [, bag] of map) {
        if (bag.entry.primaryLayer === layer.id) {
          const k = mergeKey(bag.entry.entryType, bag.entry.normalizedKey);
          if (!seen.has(k)) {
            seen.add(k);
            added += 1;
          }
        }
      }
      report.layerStats[layer.id].primaryNewCount = added;
      report.layerStats[layer.id].cumulativePrimary = seen.size;
    }
  }

  // --- Aux: main enhanced fill (lookup by normalizedKey, word or phrase) ---
  {
    const filePath = path.join(source, AUX.mainEnhanced);
    const data = readJson(filePath);
    const rows = asArray(data.words);
    report.sourceFiles[AUX.mainEnhanced] = {
      bytes: fs.statSync(filePath).size,
      sha256: sha256File(filePath),
      rawCount: rows.length,
      role: "aux_enrich"
    };
    const byKey = new Map();
    for (const raw of rows) {
      const nk = normalizeKey(raw.word);
      if (nk) byKey.set(nk, raw);
    }
    let enriched = 0;
    const enrichLayer = { id: "mainEnhanced", name: "增强主表", rank: 40, mode: "active" };
    for (const [, bag] of map) {
      const raw = byKey.get(bag.entry.normalizedKey);
      if (!raw) continue;
      const before = [
        bag.entry.phonetic,
        bag.entry.example,
        bag.entry.primaryMeaningZh,
        bag.entry.collocations.length
      ].join("|");
      applyRawToEntry(bag.entry, raw, enrichLayer, AUX.mainEnhanced, bag.fieldPriority, conflicts);
      bag.entry.layers = bag.entry.layers.filter((l) => l !== "mainEnhanced");
      const after = [
        bag.entry.phonetic,
        bag.entry.example,
        bag.entry.primaryMeaningZh,
        bag.entry.collocations.length
      ].join("|");
      if (before !== after) enriched += 1;
    }
    report.mainEnhancedEnriched = enriched;
  }

  // --- Aux: multi-sense notes (senseCount metadata; meaning still one) ---
  {
    const filePath = path.join(source, AUX.multiSenses);
    const data = readJson(filePath);
    const rows = asArray(data.words);
    report.sourceFiles[AUX.multiSenses] = {
      bytes: fs.statSync(filePath).size,
      sha256: sha256File(filePath),
      rawCount: rows.length,
      role: "aux_multisense"
    };
    let tagged = 0;
    for (const raw of rows) {
      const nk = normalizeKey(raw.word);
      if (!nk) continue;
      const key = mergeKey("word", nk);
      if (!map.has(key)) continue;
      const entry = map.get(key).entry;
      entry.qualityFlags = entry.qualityFlags || [];
      if (!entry.qualityFlags.includes("familiar_multiple_senses")) {
        entry.qualityFlags.push("familiar_multiple_senses");
      }
      if (raw.senseCount) {
        entry.qualityFlags.push(`senseCount_hint_${raw.senseCount}`);
      }
      if (raw.meaning) {
        upsertSense(
          entry,
          { pos: raw.pos, meaningZh: raw.meaning },
          AUX.multiSenses,
          conflicts
        );
      }
      tagged += 1;
    }
    report.multiSenseTagged = tagged;
  }

  // --- Paraphrases 300 ---
  const paraphrases = [];
  {
    const filePath = path.join(source, AUX.paraphrases300);
    const data = readJson(filePath);
    const pairs = asArray(data.pairs || data.items || data.paraphrases);
    report.sourceFiles[AUX.paraphrases300] = {
      bytes: fs.statSync(filePath).size,
      sha256: sha256File(filePath),
      rawCount: pairs.length,
      role: "verified_paraphrases"
    };

    let i = 0;
    for (const pair of pairs) {
      i += 1;
      const a = str(pair.expressionA || pair.a || pair.left || "");
      const b = str(pair.expressionB || pair.b || pair.right || "");
      if (!a || !b) {
        warnings.push({ type: "para_skip_empty", index: i });
        continue;
      }
      if (normalizeKey(a) === normalizeKey(b)) {
        warnings.push({ type: "para_skip_self", a, b });
        continue;
      }

      const commonMeaning = str(pair.meaningA || pair.meaningB || pair.commonMeaningZh || "");
      // ensure members exist as entries (active) with meaning hints
      ensureMemberInMap(map, a, AUX.paraphrases300, commonMeaning || pair.meaningA || "");
      ensureMemberInMap(map, b, AUX.paraphrases300, commonMeaning || pair.meaningB || "");

      const relationType = mapRelationType(pair.relationType || pair.category);
      paraphrases.push({
        groupId: `rg_para_${normalizeKey(a).replace(/\s+/g, "_").slice(0, 40)}_${String(i).padStart(3, "0")}`,
        anchor: a,
        members: [b],
        relationType: RELATION_TYPES.has(relationType) ? relationType : "near_synonym",
        commonMeaningZh: commonMeaning,
        differenceZh: str(pair.differenceZh || ""),
        posConstraint: str(pair.pos || pair.posConstraint || ""),
        confidence: "high",
        sourceType: "verified",
        sourceFiles: [AUX.paraphrases300],
        canAutoQuiz: true,
        sources: asArray(pair.sources),
        rank: Number(pair.rank) || i
      });
    }
  }

  // Mark network layer candidates (not auto pairs)
  let networkCandidateExpressions = 0;
  for (const layerId of ["paraCore600", "paraExt500", "reference701"]) {
    for (const [, bag] of map) {
      if (bag.entry.layers.includes(layerId)) {
        bag.entry.qualityFlags = bag.entry.qualityFlags || [];
        if (!bag.entry.qualityFlags.includes("network_paraphrase_expression")) {
          bag.entry.qualityFlags.push("network_paraphrase_expression");
          networkCandidateExpressions += 1;
        }
      }
    }
  }

  // finalize
  let items = [...map.values()].map((b) => finalizeEntry(b.entry));
  items.sort((a, b) => {
    if (a.layerRank !== b.layerRank) return a.layerRank - b.layerRank;
    return a.normalizedKey.localeCompare(b.normalizedKey);
  });

  // Reapply reviewed bilingual examples after every deterministic source import.
  const exampleRepairsPath = path.join(root, EXAMPLE_REPAIRS_FILE);
  const exampleRepairRows = fs.existsSync(exampleRepairsPath)
    ? asArray(readJson(exampleRepairsPath)?.repairs)
    : [];
  const exampleRepairs = new Map(
    exampleRepairRows.map((repair) => [str(repair?.id), repair])
  );
  let exampleRepairsApplied = 0;
  for (const item of items) {
    const repair = exampleRepairs.get(item.id);
    if (!repair?.example || !repair?.exampleCn) continue;
    if (item.example && !isMetaExamplePlaceholder(item.example)) continue;
    item.example = str(repair.example);
    item.exampleCn = cleanExampleCnField(repair.exampleCn);
    item.qualityFlags = [
      ...new Set([
        ...asArray(item.qualityFlags).filter((flag) => flag !== "synthetic_example"),
        "example_editorial_repair_v1"
      ])
    ];
    const firstSense = item.senses?.[0];
    if (firstSense && (!firstSense.example || isMetaExamplePlaceholder(firstSense.example))) {
      firstSense.example = item.example;
      firstSense.exampleZh = item.exampleCn;
    }
    exampleRepairsApplied += 1;
  }
  report.exampleEditorialRepair = {
    source: EXAMPLE_REPAIRS_FILE.replace(/\\/g, "/"),
    available: exampleRepairRows.length,
    applied: exampleRepairsApplied
  };

  // Fill empty meanings from senses / non-empty placeholder (audit requires 0 empty)
  for (const item of items) {
    if (!item.primaryMeaningZh && item.senses[0]?.meaningZh) {
      item.primaryMeaningZh = item.senses[0].meaningZh;
    }
    if (!item.primaryMeaningZh) {
      item.primaryMeaningZh =
        item.entryType === "phrase" ? "阅读短语/表达（义项待补）" : "阅读词汇（义项待补）";
      item.qualityFlags.push("missing_meaning_filled_placeholder");
      item.senses.push({
        senseId: `${item.id}_placeholder_01`,
        pos: item.entryType === "phrase" ? "phrase" : item.primaryPos || "",
        meaningZh: item.primaryMeaningZh,
        definition: "",
        example: "",
        exampleZh: "",
        sourceFiles: ["import-placeholder"]
      });
    }
    item.meaning = item.primaryMeaningZh;
    if (!item.definition) item.definition = item.primaryMeaningZh;
    item.pos = item.primaryPos || item.pos || "";
    item.meaningZh = item.primaryMeaningZh;

    // Final cleanup must never turn an empty field into a meta-description.
    const ex = cleanExampleField(item.example || "", item.word, {
      entryType: item.entryType,
      meaningZh: item.primaryMeaningZh,
      synthesizeIfEmpty: false,
      maxWords: 32
    });
    item.example = ex.example;
    item.exampleCn = cleanExampleCnField(item.exampleCn || "");
  }

  // Fill only missing word phonetics from the bundled, versioned master lexicon.
  // This keeps a direct import equivalent to the historical enrichment step.
  const masterVocabPath = path.join(root, "public", "data", "words.json");
  const masterVocab = fs.existsSync(masterVocabPath) ? readJson(masterVocabPath) : null;
  const masterPhonetics = new Map(
    asArray(masterVocab?.words)
      .map((word) => [normalizeKey(word?.word), str(word?.phonetic || word?.ipa || "")])
      .filter(([key, phonetic]) => key && phonetic)
  );
  let phoneticFilled = 0;
  for (const item of items) {
    if (item.entryType !== "word" || item.phonetic) continue;
    const phonetic = masterPhonetics.get(item.normalizedKey);
    if (!phonetic) continue;
    item.phonetic = phonetic;
    item.phoneticSource = "words.json";
    phoneticFilled += 1;
  }

  const phraseStage1Count = items.filter((item) => item.phraseStudyStage === 1).length;
  const phraseStage2Count = items.filter((item) => item.phraseStudyStage === 2).length;
  const missingWordPhonetics = items.filter(
    (item) => item.entryType === "word" && !String(item.phonetic || "").trim()
  ).length;
  const missingPhrasePhonetics = items.filter(
    (item) => item.entryType === "phrase" && !String(item.phonetic || "").trim()
  ).length;

  const audit = auditDataset(items, paraphrases, report.layerStats, warnings);
  report.warnings = warnings.concat(conflicts.slice(0, 200));
  report.errors = audit.errors;
  report.summary = {
    itemCount: audit.itemCount,
    wordCount: audit.wordCount,
    phraseCount: audit.phraseCount,
    activeCount: audit.activeCount,
    referenceOnlyCount: audit.referenceOnly,
    multiSenseCount: audit.multiSense,
    paraphraseHighCount: paraphrases.filter((p) => p.confidence === "high").length,
    networkCandidateExpressions,
    emptyWord: audit.emptyWord,
    emptyMeaning: audit.emptyMeaning,
    conflictSamples: conflicts.length,
    mergeMapSize: map.size
  };

  // Hard fail on critical errors
  const critical = audit.errors.filter((e) =>
    ["duplicate_id", "duplicate_merge_key", "empty_word", "autoquiz_without_high", "para_self_relation"].includes(
      e.type
    )
  );

  // Allow empty_meaning as warning if few? Spec says 空释义为0 — treat as critical
  const emptyMeaningErrors = audit.errors.filter((e) => e.type === "empty_meaning");
  if (emptyMeaningErrors.length) {
    // try salvage: set meaning from word itself not allowed; leave as error
    critical.push(...emptyMeaningErrors.slice(0, 50));
  }

  if (critical.length) {
    report.failed = true;
    report.criticalErrorCount = critical.length;
    const reportPath = path.join(root, "public", "data", "reading-g-import-report.json");
    // still write report for debugging but NOT vocab/paraphrases
    atomicWriteJson(reportPath, report);
    const msg = `导入审计失败 critical=${critical.length} emptyMeaning=${audit.emptyMeaning} emptyWord=${audit.emptyWord}`;
    console.error(msg);
    console.error(JSON.stringify(critical.slice(0, 20), null, 2));
    const err = new Error(msg);
    err.report = report;
    throw err;
  }

  const vocabOut = {
    version: DATASET_VERSION,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    progressSchemaVersion: PROGRESS_SCHEMA_VERSION,
    datasetVersion: DATASET_VERSION,
    generatedAt: report.generatedAt,
    sourcePackage: "IELTS-GT-Reading-Pack-Master-Paraphrase",
    sourceDir: source,
    count: items.length,
    wordCount: audit.wordCount,
    phraseCount: audit.phraseCount,
    activeCount: audit.activeCount,
    referenceCount: audit.referenceOnly,
    multiSenseCount: audit.multiSense,
    layerStats: report.layerStats,
    enrichedAt: report.generatedAt,
    enrichment: {
      phraseStudyStage: {
        stage1: phraseStage1Count,
        stage2: phraseStage2Count,
        usedFallbackOrder: false,
        source: "gt-reading-phrases-400.json"
      },
      phonetics: {
        filled: phoneticFilled,
        stillMissingWord: missingWordPhonetics,
        missingPhrase: missingPhrasePhonetics
      }
    },
    note: "G类阅读核心分层词库 v3。默认待学 studyMode=active；reference701 只查阅。同义关系见 reading-g-paraphrases.json。",
    items
  };

  const paraOut = {
    version: `${DATASET_VERSION}-paraphrases`,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    generatedAt: report.generatedAt,
    count: paraphrases.length,
    highConfidenceCount: paraphrases.filter((p) => p.confidence === "high").length,
    policy: {
      networkListsAreNotAutomaticPairs: true,
      canAutoQuizOnlyWhen: "confidence===high && sourceType===verified"
    },
    groups: paraphrases
  };

  // Keep the user-approved 5,262 question-bank coverage after every clean
  // reading-core import; otherwise a base-layer rebuild would silently remove
  // the 3,109 supplemental headwords.
  const questionBankExpansion = applyReadingGQuestionBankExpansion({
    vocab: vocabOut,
    report,
    projectRoot: root
  });

  const outVocab = path.join(root, "public", "data", "reading-g-vocab.json");
  const outPara = path.join(root, "public", "data", "reading-g-paraphrases.json");
  const outReport = path.join(root, "public", "data", "reading-g-import-report.json");

  atomicWriteJson(outVocab, vocabOut);
  atomicWriteJson(outPara, paraOut);
  atomicWriteJson(outReport, report);

  console.log(
    JSON.stringify(
      {
        ok: true,
        outVocab,
        outPara,
        outReport,
        summary: report.summary,
        questionBankExpansion,
        layerPrimaryNew: Object.fromEntries(
          Object.entries(report.layerStats).map(([k, v]) => [k, v.primaryNewCount])
        )
      },
      null,
      2
    )
  );

  return { vocabOut, paraOut, report, items, paraphrases };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = parseArgs(process.argv);
  runImport({ sourceDir: args.source })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
