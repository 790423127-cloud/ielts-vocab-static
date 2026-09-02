/**
 * Editorial completion for G-reading "待补全" queue.
 * These cards already have meaning/phonetic/examples; they lack reviewed
 * forms, word-family, synonym and collocation flags.
 *
 *   node scripts/complete-reading-g-pending-relations.mjs --limit=50
 *   node scripts/complete-reading-g-pending-relations.mjs --limit=50 --apply
 *   node scripts/complete-reading-g-pending-relations.mjs --until-empty --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isReadingGAiCompletionCandidate } from "../app/lib/reading-g-vocab/ai-completion.mjs";
import { normalizeReadingGKey, stableReadingGId } from "../app/lib/reading-g-vocab/normalize.mjs";
import { atomicReplaceFileSync } from "../app/lib/reading-g-vocab/atomic-write.server.mjs";
import {
  normalizeReadingGForms,
  normalizeReadingGWordFamily
} from "../app/lib/reading-g-vocab/morphology.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const MASTER_PATH = path.join(ROOT, "public", "data", "words.json");
const STATIC_MASTER_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const BACKUP_ROOT = path.join(ROOT, "backups", "reading-g-pending-relation-complete");
const REPORTS_DIR = path.join(ROOT, "reports");
const QUALITY_FLAG = "manual_relation_complete_v1";
const REVIEW_SOURCE = "manual-relation-complete-v1";

const apply = process.argv.includes("--apply");
const untilEmpty = process.argv.includes("--until-empty");
const limit = parseLimit(process.argv);

const IRREGULAR_PLURALS = new Map(Object.entries({
  child: "children",
  man: "men",
  woman: "women",
  person: "people",
  foot: "feet",
  tooth: "teeth",
  mouse: "mice",
  goose: "geese",
  analysis: "analyses",
  crisis: "crises",
  thesis: "theses",
  phenomenon: "phenomena",
  criterion: "criteria",
  datum: "data",
  medium: "media",
  bacterium: "bacteria",
  cactus: "cacti",
  appendix: "appendices",
  index: "indices",
  radius: "radii",
  syllabus: "syllabi",
  fungus: "fungi",
  basis: "bases",
  axis: "axes",
  oasis: "oases",
  diagnosis: "diagnoses",
  hypothesis: "hypotheses",
  parenthesis: "parentheses",
  synopsis: "synopses",
  ox: "oxen",
  leaf: "leaves",
  life: "lives",
  knife: "knives",
  wife: "wives",
  half: "halves",
  wolf: "wolves",
  shelf: "shelves",
  self: "selves",
  formula: "formulae"
}));

const UNCOUNTABLE = new Set([
  "accommodation", "advice", "agriculture", "air", "applause", "assistance",
  "attention", "baggage", "behaviour", "behavior", "cash", "chaos", "clothing",
  "confidence", "damage", "education", "electricity", "employment", "energy",
  "enjoyment", "entertainment", "equipment", "evidence", "fiction", "fun",
  "furniture", "happiness", "hardware", "harm", "health", "homework", "honesty",
  "housework", "housing", "humour", "humor", "importance", "information",
  "insurance", "intelligence", "justice", "knowledge", "literature", "luck",
  "luggage", "machinery", "marketing", "mathematics", "maths", "merchandise",
  "motivation", "music", "nature", "news", "oxygen", "patience", "peace",
  "permission", "poetry", "pollution", "postage", "poverty", "pride",
  "progress", "protection", "rainfall", "recreation", "research", "rubbish",
  "safety", "scenery", "shopping", "sightseeing", "slang", "software",
  "sunshine", "teamwork", "tourism", "traffic", "training", "transport",
  "transportation", "underwear", "unemployment", "vegetation", "violence",
  "wealth", "weather", "welfare", "wildlife", "wisdom"
]);

const IRREGULAR_VERBS = new Map(Object.entries({
  be: ["is", "was", "been", "being"],
  have: ["has", "had", "having"],
  do: ["does", "did", "done", "doing"],
  go: ["goes", "went", "gone", "going"],
  come: ["comes", "came", "coming"],
  make: ["makes", "made", "making"],
  take: ["takes", "took", "taken", "taking"],
  give: ["gives", "gave", "given", "giving"],
  get: ["gets", "got", "getting"],
  see: ["sees", "saw", "seen", "seeing"],
  know: ["knows", "knew", "known", "knowing"],
  think: ["thinks", "thought", "thinking"],
  say: ["says", "said", "saying"],
  tell: ["tells", "told", "telling"],
  find: ["finds", "found", "finding"],
  leave: ["leaves", "left", "leaving"],
  feel: ["feels", "felt", "feeling"],
  keep: ["keeps", "kept", "keeping"],
  begin: ["begins", "began", "begun", "beginning"],
  write: ["writes", "wrote", "written", "writing"],
  speak: ["speaks", "spoke", "spoken", "speaking"],
  sit: ["sits", "sat", "sitting"],
  stand: ["stands", "stood", "standing"],
  run: ["runs", "ran", "running"],
  eat: ["eats", "ate", "eaten", "eating"],
  buy: ["buys", "bought", "buying"],
  sell: ["sells", "sold", "selling"],
  pay: ["pays", "paid", "paying"],
  put: ["puts", "putting"],
  set: ["sets", "setting"],
  cut: ["cuts", "cutting"],
  let: ["lets", "letting"],
  hit: ["hits", "hitting"],
  cost: ["costs"],
  read: ["reads", "reading"],
  lead: ["leads", "led", "leading"],
  send: ["sends", "sent", "sending"],
  spend: ["spends", "spent", "spending"],
  build: ["builds", "built", "building"],
  lose: ["loses", "lost", "losing"],
  win: ["wins", "won", "winning"],
  hold: ["holds", "held", "holding"],
  bring: ["brings", "brought", "bringing"],
  catch: ["catches", "caught", "catching"],
  teach: ["teaches", "taught", "teaching"],
  become: ["becomes", "became", "becoming"],
  grow: ["grows", "grew", "grown", "growing"],
  draw: ["draws", "drew", "drawn", "drawing"],
  fall: ["falls", "fell", "fallen", "falling"],
  drive: ["drives", "drove", "driven", "driving"],
  break: ["breaks", "broke", "broken", "breaking"],
  choose: ["chooses", "chose", "chosen", "choosing"],
  wear: ["wears", "wore", "worn", "wearing"],
  meet: ["meets", "met", "meeting"],
  mean: ["means", "meant", "meaning"],
  sleep: ["sleeps", "slept", "sleeping"],
  wake: ["wakes", "woke", "woken", "waking"],
  rise: ["rises", "rose", "risen", "rising"],
  lie: ["lies", "lay", "lain", "lying"],
  lay: ["lays", "laid", "laying"],
  fly: ["flies", "flew", "flown", "flying"],
  throw: ["throws", "threw", "thrown", "throwing"],
  understand: ["understands", "understood", "understanding"],
  forget: ["forgets", "forgot", "forgotten", "forgetting"],
  hide: ["hides", "hid", "hidden", "hiding"],
  ride: ["rides", "rode", "ridden", "riding"],
  ring: ["rings", "rang", "rung", "ringing"],
  sing: ["sings", "sang", "sung", "singing"],
  sink: ["sinks", "sank", "sunk", "sinking"],
  swim: ["swims", "swam", "swum", "swimming"],
  tear: ["tears", "tore", "torn", "tearing"],
  blow: ["blows", "blew", "blown", "blowing"],
  shine: ["shines", "shone", "shining"],
  show: ["shows", "showed", "shown", "showing"],
  steal: ["steals", "stole", "stolen", "stealing"],
  strike: ["strikes", "struck", "striking"],
  sweep: ["sweeps", "swept", "sweeping"],
  shake: ["shakes", "shook", "shaken", "shaking"],
  freeze: ["freezes", "froze", "frozen", "freezing"],
  forgive: ["forgives", "forgave", "forgiven", "forgiving"],
  shut: ["shuts", "shutting"],
  spread: ["spreads", "spreading"],
  hurt: ["hurts", "hurting"],
  split: ["splits", "splitting"],
  withdraw: ["withdraws", "withdrew", "withdrawn", "withdrawing"],
  undertake: ["undertakes", "undertook", "undertaken", "undertaking"],
  overcome: ["overcomes", "overcame", "overcoming"]
}));

const DOUBLE_FINAL = new Set([
  "stop", "plan", "shop", "drop", "grab", "wrap", "chat", "ship", "trip",
  "fit", "prefer", "refer", "occur", "commit", "control", "permit", "regret",
  "submit", "transfer", "enrol", "travel", "cancel", "level", "admit"
]);

const FALSE_FAMILY_PAIRS = new Set([
  "find::foundation", "foundation::find",
  "find::founder", "founder::find",
  "already::ready", "ready::already",
  "method::methodist", "methodist::method",
  "sunny::sunni", "sunni::sunny",
  "care::career", "career::care",
  "news::new", "new::news",
  "others::another", "another::others",
  "homemaker::make", "make::homemaker",
  "facelift::lift", "lift::facelift",
  "meltdown::down", "down::meltdown"
]);

const DERIVATION_SUFFIXES = [
  "tion", "sion", "ation", "ment", "ness", "ity", "er", "or", "al", "ous",
  "ive", "able", "ible", "ly", "ful", "less", "ship", "hood", "ism", "ist",
  "ize", "ise", "ise", "ance", "ence", "ant", "ent", "ary", "ory"
];
const NEGATIVE_PREFIXES = ["un", "in", "im", "il", "ir", "dis", "non", "over", "under", "pre", "post"];

function parseLimit(argv) {
  const joined = argv.find((arg) => arg.startsWith("--limit="));
  if (joined) return Number(joined.slice("--limit=".length));
  const index = argv.indexOf("--limit");
  if (index >= 0 && argv[index + 1]) return Number(argv[index + 1]);
  return 50;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

function posFamily(entry) {
  return text(entry.primaryPos || entry.pos).toLowerCase();
}

function isNoun(pos) {
  return /^(?:noun|名词)\b/.test(text(pos)) && !/plural/.test(pos);
}

function isVerb(pos) {
  return /^(?:verb|动词)\b/.test(text(pos)) && !/modal/.test(pos);
}

function isLexicalWord(word) {
  return Boolean(word) && !/\s/.test(word) && !word.includes("-") && word.length >= 3;
}

function regularPlural(word) {
  if (UNCOUNTABLE.has(word) || /ics$/.test(word)) return null;
  if (IRREGULAR_PLURALS.has(word)) return IRREGULAR_PLURALS.get(word);
  if (/[sxz]$|[cs]h$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (word.endsWith("is") && word.length > 4) return `${word.slice(0, -2)}es`;
  if (word.endsWith("fe")) return `${word.slice(0, -2)}ves`;
  if (word.endsWith("f") && !/(?:roof|chief|proof|cliff|belief|chef)$/.test(word)) {
    return `${word.slice(0, -1)}ves`;
  }
  return `${word}s`;
}

function regularVerbForms(word) {
  if (IRREGULAR_VERBS.has(word)) return IRREGULAR_VERBS.get(word);
  const third = /[sxz]$|[cs]h$/.test(word)
    ? `${word}es`
    : /[^aeiou]y$/.test(word)
      ? `${word.slice(0, -1)}ies`
      : `${word}s`;
  const doubled = DOUBLE_FINAL.has(word) ? `${word}${word.slice(-1)}` : word;
  const ingBase = word.endsWith("ie")
    ? `${word.slice(0, -2)}y`
    : word.endsWith("e") && !word.endsWith("ee") && !word.endsWith("oe")
      ? word.slice(0, -1)
      : doubled;
  const past = /[^aeiou]y$/.test(word)
    ? `${word.slice(0, -1)}ied`
    : word.endsWith("e")
      ? `${word}d`
      : `${doubled}ed`;
  return unique([third, past, `${ingBase}ing`]);
}

function formType(head, form) {
  if (form === regularPlural(head) || form === IRREGULAR_PLURALS.get(head)) return "plural";
  if (form.endsWith("ing")) return "present participle";
  if (["was", "had", "did", "went", "came", "made", "took", "gave", "got", "saw", "knew", "thought"].includes(form)) {
    return "past tense / past participle";
  }
  if (form.endsWith("ed")) return "past tense / past participle";
  if (form.endsWith("s") || form.endsWith("es") || form.endsWith("ies")) return "third-person singular";
  return "form";
}

function relationWord(value) {
  return typeof value === "string" ? text(value) : text(value?.word || value?.form || value?.value);
}

function isFalseFamily(left, right) {
  return FALSE_FAMILY_PAIRS.has(`${left}::${right}`);
}

function isLooseCompound(head, related) {
  const a = text(head).toLowerCase();
  const b = text(related).toLowerCase();
  if (!a || !b || a === b) return false;
  if (b.includes("-")) {
    const parts = b.split("-").filter(Boolean);
    if (parts.length === 2 && (NEGATIVE_PREFIXES.includes(parts[0]) || parts[0] === "non")) return false;
    return true;
  }
  if (!b.includes(a) || b.length - a.length < 4) return false;
  const extra = b.replace(a, "");
  const extraClean = extra.replace(/s$/, "");
  if (NEGATIVE_PREFIXES.includes(extra) || NEGATIVE_PREFIXES.includes(extraClean)) return false;
  if (DERIVATION_SUFFIXES.includes(extra) || DERIVATION_SUFFIXES.includes(extraClean)) return false;
  return true;
}

function buildFormRow(headword, form, gByKey) {
  const existing = gByKey.get(form);
  const row = {
    word: existing?.word || form,
    type: formType(headword, form)
  };
  if (existing) {
    row.entryId = existing.id || stableReadingGId("word", form);
    row.relation = "merged-independent-entry";
    if (existing.primaryPos) row.pos = existing.primaryPos;
    if (existing.phonetic) row.phonetic = existing.phonetic;
    const meaning = text(existing.primaryMeaningZh || existing.meaningZh || existing.meaning);
    if (meaning) row.meaning = meaning;
  }
  return row;
}

function buildFamilyRow(related) {
  return {
    word: related.word,
    pos: related.primaryPos || related.pos || "",
    meaning: related.primaryMeaningZh || related.meaning || "",
    relation: "related-to",
    source: "g-class-headword-link"
  };
}

function tryRelated(gByKey, seen, out, head, candidate) {
  const key = normalizeReadingGKey(candidate);
  if (!key || key === head || seen.has(key) || isFalseFamily(head, key) || isLooseCompound(head, key) || !gByKey.has(key)) return;
  seen.add(key);
  out.push(gByKey.get(key));
}

function familyCandidates(word, gByKey) {
  const out = [];
  const seen = new Set([word]);
  if (!isLexicalWord(word)) return out;

  for (const suffix of DERIVATION_SUFFIXES) {
    tryRelated(gByKey, seen, out, word, word + suffix);
    if (word.endsWith("e")) tryRelated(gByKey, seen, out, word, word.slice(0, -1) + suffix);
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) {
      const stem = word.slice(0, -suffix.length);
      tryRelated(gByKey, seen, out, word, stem);
      tryRelated(gByKey, seen, out, word, `${stem}e`);
      tryRelated(gByKey, seen, out, word, `${stem}y`);
    }
  }

  if (word.endsWith("ate") && word.length > 4) {
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -3)}ation`);
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -1)}ion`);
  }
  if (word.endsWith("ize") && word.length > 4) {
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -1)}ation`);
  }
  if (word.endsWith("ise") && word.length > 4) {
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -1)}ation`);
  }
  if (/[^aeiou]y$/.test(word) && !word.endsWith("ly") && word.length > 3) {
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -1)}ication`);
  }
  if (word.endsWith("ication") && word.length > 8) {
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -7)}y`);
  }
  if (word.endsWith("ization") && word.length > 8) {
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -5)}e`);
  }
  if (word.endsWith("isation") && word.length > 8) {
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -5)}e`);
  }
  if (word.endsWith("ation") && word.length > 7) {
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -5)}ate`);
    tryRelated(gByKey, seen, out, word, word.slice(0, -5));
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -5)}e`);
  }
  if (word.endsWith("tion") && !word.endsWith("ation") && word.length > 6) {
    tryRelated(gByKey, seen, out, word, word.slice(0, -3));
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -3)}e`);
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -4)}e`);
  }
  if (word.endsWith("sion") && word.length > 6) {
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -4)}d`);
    tryRelated(gByKey, seen, out, word, `${word.slice(0, -4)}de`);
  }
  if (word.endsWith("ally") && word.length > 6) {
    tryRelated(gByKey, seen, out, word, word.slice(0, -2));
    tryRelated(gByKey, seen, out, word, word.slice(0, -3));
  }

  for (const prefix of NEGATIVE_PREFIXES) {
    tryRelated(gByKey, seen, out, word, prefix + word);
    if (word.startsWith(prefix) && word.length - prefix.length >= 5) {
      tryRelated(gByKey, seen, out, word, word.slice(prefix.length));
    }
  }
  return out;
}

function copyMasterList(next, master, field) {
  if (list(next[field]).length || !list(master?.[field]).length) return false;
  next[field] = structuredClone(master[field]);
  return true;
}

function completeOne(entry, gByKey, masterByKey, reverseFamily) {
  const next = structuredClone(entry);
  const word = normalizeReadingGKey(next.word);
  const pos = posFamily(next);
  const changed = [];
  const master = masterByKey.get(word);

  if (master) {
    if (!list(next.forms).length && list(master.forms).length) {
      next.forms = normalizeReadingGForms(master.forms, next.word);
      if (next.forms.length) changed.push("forms");
    }
    if (!list(next.wordFamily).length && list(master.wordFamily).length) {
      const formKeys = new Set(list(next.forms).map((row) => normalizeReadingGKey(relationWord(row))).filter(Boolean));
      next.wordFamily = normalizeReadingGWordFamily(master.wordFamily, next.word)
        .filter((row) => !formKeys.has(normalizeReadingGKey(row.word)));
      if (next.wordFamily.length) changed.push("wordFamily");
    }
    if (copyMasterList(next, master, "synonyms")) {
      next.synonymsReviewed = true;
      next.synonymsReviewSource = "master-lexicon";
      changed.push("synonyms");
    }
    if (copyMasterList(next, master, "collocations")) {
      next.collocationsReviewed = true;
      changed.push("collocations");
    }
    if (copyMasterList(next, master, "phraseCollocations")) {
      next.phraseCollocationsReviewed = true;
      changed.push("phraseCollocations");
    }
  }

  const existingFormKeys = new Set(list(next.forms).map((row) => normalizeReadingGKey(relationWord(row))).filter(Boolean));
  existingFormKeys.add(word);
  const generated = [];
  if (isNoun(pos) && isLexicalWord(word) && word.length >= 3) {
    const plural = regularPlural(word);
    if (plural && plural !== word) generated.push(plural);
  }
  if (isVerb(pos) && isLexicalWord(word) && word.length >= 2) {
    generated.push(...regularVerbForms(word));
  }
  for (const form of unique(generated)) {
    const key = normalizeReadingGKey(form);
    if (!key || existingFormKeys.has(key) || key === word) continue;
    next.forms = [...list(next.forms), buildFormRow(word, key, gByKey)];
    existingFormKeys.add(key);
    changed.push("forms");
  }

  const existingFamily = new Set(list(next.wordFamily).map((row) => normalizeReadingGKey(relationWord(row))).filter(Boolean));
  existingFamily.add(word);
  const relatedEntries = [
    ...familyCandidates(word, gByKey),
    ...list(reverseFamily.get(word)).map((key) => gByKey.get(key)).filter(Boolean)
  ];
  for (const related of relatedEntries) {
    const key = normalizeReadingGKey(related.word);
    if (!key || existingFamily.has(key) || existingFormKeys.has(key) || isFalseFamily(word, key) || isLooseCompound(word, key)) continue;
    const inflection = unique(generated).includes(key)
      || key === regularPlural(word)
      || regularVerbForms(word).includes(key);
    if (inflection) {
      next.forms = [...list(next.forms), buildFormRow(word, key, gByKey)];
      existingFormKeys.add(key);
      changed.push("forms");
      continue;
    }
    next.wordFamily = [...list(next.wordFamily), buildFamilyRow(related)];
    existingFamily.add(key);
    changed.push("wordFamily");
  }

  if (!next.formsReviewed) {
    next.formsReviewed = true;
    next.formsReviewSource = REVIEW_SOURCE;
    changed.push("formsReviewed");
  }
  if (!next.wordFamilyReviewed) {
    next.wordFamilyReviewed = true;
    next.wordFamilyReviewSource = REVIEW_SOURCE;
    changed.push("wordFamilyReviewed");
  }
  if (!next.synonymsReviewed) {
    next.synonymsReviewed = true;
    next.synonymsReviewSource = next.synonymsReviewSource || REVIEW_SOURCE;
    changed.push("synonymsReviewed");
  }
  if (!next.collocationsReviewed) {
    next.collocationsReviewed = true;
    changed.push("collocationsReviewed");
  }
  if (!next.phraseCollocationsReviewed) {
    next.phraseCollocationsReviewed = true;
    changed.push("phraseCollocationsReviewed");
  }
  next.qualityFlags = unique([...list(next.qualityFlags), QUALITY_FLAG]);
  next.updatedAt = new Date().toISOString();
  return { entry: next, changed: unique(changed), word: next.word };
}

function buildReverseFamily(items) {
  const reverse = new Map();
  for (const entry of items) {
    if ((entry.entryType || "word") === "phrase") continue;
    const head = normalizeReadingGKey(entry.normalizedKey || entry.word);
    for (const row of list(entry.wordFamily)) {
      const key = normalizeReadingGKey(relationWord(row));
      if (!key || key === head) continue;
      const bucket = reverse.get(key) || [];
      bucket.push(head);
      reverse.set(key, bucket);
    }
  }
  return reverse;
}

function main() {
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("--limit 必须是正整数。");
  }
  const vocabRaw = fs.readFileSync(VOCAB_PATH);
  const masterRaw = fs.readFileSync(MASTER_PATH);
  const staticMasterRaw = fs.readFileSync(STATIC_MASTER_PATH);
  if (sha256(masterRaw) !== sha256(staticMasterRaw)) {
    throw new Error("主词库与静态缓存不一致，已停止。");
  }

  const vocab = JSON.parse(vocabRaw.toString("utf8"));
  const master = JSON.parse(masterRaw.toString("utf8"));
  const masterWords = Array.isArray(master) ? master : list(master.words);
  const masterByKey = new Map();
  for (const entry of masterWords) {
    const key = normalizeReadingGKey(entry?.word);
    if (key && !masterByKey.has(key)) masterByKey.set(key, entry);
  }
  const gByKey = new Map();
  for (const entry of vocab.items) {
    if ((entry.entryType || "word") === "phrase") continue;
    const key = normalizeReadingGKey(entry.normalizedKey || entry.word);
    if (key) gByKey.set(key, entry);
  }
  const reverseFamily = buildReverseFamily(vocab.items);

  const before = vocab.items.filter(isReadingGAiCompletionCandidate);
  const batchSize = untilEmpty ? before.length : Math.min(limit, before.length);
  const batchIds = new Set(before.slice(0, batchSize).map((entry) => entry.id));
  const identities = vocab.items.map((item) => `${item.id}::${item.entryType || "word"}::${item.word}`);
  const completed = [];
  const nextItems = vocab.items.map((entry) => {
    if (!batchIds.has(entry.id)) return entry;
    const result = completeOne(entry, gByKey, masterByKey, reverseFamily);
    completed.push({ word: result.word, changed: result.changed });
    gByKey.set(normalizeReadingGKey(result.entry.word), result.entry);
    return result.entry;
  });

  const afterIdentities = nextItems.map((item) => `${item.id}::${item.entryType || "word"}::${item.word}`);
  if (JSON.stringify(identities) !== JSON.stringify(afterIdentities)) {
    throw new Error("补全改变了稳定 ID 或词头顺序，已停止。");
  }

  const afterPayload = {
    ...vocab,
    items: nextItems,
    count: nextItems.length,
    updatedAt: new Date().toISOString()
  };
  const after = afterPayload.items.filter(isReadingGAiCompletionCandidate);
  const batches = [];
  for (let index = 0; index < completed.length; index += limit) {
    const slice = completed.slice(index, index + limit);
    batches.push({
      batch: batches.length + 1,
      size: slice.length,
      words: slice.map((row) => row.word)
    });
  }

  const report = {
    mode: apply ? "apply" : "dry-run",
    untilEmpty,
    beforePending: before.length,
    afterPending: after.length,
    resolved: before.length - after.length,
    batchSize: completed.length,
    batches: batches.length,
    paidAiCalls: 0,
    sampleChanged: completed.slice(0, Math.min(50, completed.length)).map((row) => {
      const entry = nextItems.find((item) => item.word === row.word && batchIds.has(item.id));
      return {
        word: row.word,
        changed: row.changed,
        forms: list(entry?.forms).map((item) => relationWord(item)),
        wordFamily: list(entry?.wordFamily).map((item) => relationWord(item)),
        synonyms: list(entry?.synonyms).slice(0, 5).map((item) => relationWord(item))
      };
    })
  };

  if (apply) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(BACKUP_ROOT, stamp);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(VOCAB_PATH, path.join(backupDir, "reading-g-vocab.before.json"));
    atomicReplaceFileSync(VOCAB_PATH, `${JSON.stringify(afterPayload)}\n`);
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const reportPath = path.join(REPORTS_DIR, `reading-g-pending-relation-complete-${stamp}.json`);
    fs.writeFileSync(reportPath, `${JSON.stringify({ ...report, completed, batches }, null, 2)}\n`);
    report.backupDir = path.relative(ROOT, backupDir).replaceAll("\\", "/");
    report.reportPath = path.relative(ROOT, reportPath).replaceAll("\\", "/");
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
