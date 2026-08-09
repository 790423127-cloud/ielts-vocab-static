import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeIntegrityHash,
  computeLexiconHash
} from "../app/lib/vocab/lexicon-guard.mjs";
import { organizeReadingGMorphology } from "../app/lib/reading-g-vocab/morphology.mjs";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";
import { fillReadingGRelationMeanings } from "../app/lib/reading-g-vocab/relation-meaning-fill.mjs";
import {
  getReadingGContentIssues,
  isReadingGPlaceholderContent
} from "../app/lib/reading-g-vocab/content-completeness.mjs";
import {
  arpabetToIpa,
  isInvalidIpa,
  loadCmuDictionary
} from "./lib/gt-ipa-validate.mjs";
import { buildCuratedPool } from "./lib/gt-new-words-pool.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PATHS = {
  publicWords: path.join(ROOT, "public", "data", "words.json"),
  cacheWords: path.join(ROOT, ".static-export-cache", "words.json"),
  readingG: path.join(ROOT, "public", "data", "reading-g-vocab.json"),
  meaning: path.join(ROOT, "public", "data", "meaning-6000.json"),
  basic: path.join(ROOT, "public", "data", "basic-words.json"),
  ielts538: path.join(ROOT, "public", "data", "ielts-538-words.json"),
  phrases: path.join(ROOT, "public", "data", "phrases.json"),
  idictation: path.join(ROOT, "public", "data", "idictation-frequency.json"),
  readingGExampleRepairs: path.join(ROOT, "scripts", "data", "reading-g-example-repairs.json"),
  baseline: path.join(ROOT, "app", "lib", "vocab", "master-lexicon-baseline.mjs"),
  retirements: path.join(ROOT, "app", "lib", "vocab", "master-lexicon-retirements.json")
};

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function stableId(entry) {
  return String(entry?.wordId || entry?.id || "").trim();
}

function normalizedWord(entry) {
  return String(entry?.word || "").normalize("NFKC").trim().toLowerCase();
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasUsableText(value) {
  const valueText = text(value);
  return Boolean(valueText && !isReadingGPlaceholderContent(valueText));
}

function hasUsablePos(value) {
  const valueText = text(value);
  return Boolean(
    hasUsableText(valueText)
    && !/^(?:word|phrase|pos|词性|unknown|n\/?a|待补)$/i.test(valueText)
  );
}

function stripPosPrefix(value) {
  return text(value).replace(/^(?:phrase|n|v|adj|adv)\.\s*/i, "").trim();
}

function sourcePos(entry) {
  const direct = text(entry?.primaryPos || entry?.pos);
  if (hasUsablePos(direct)) return direct;
  const prefix = text(entry?.meaning).match(/^(phrase|n|v|adj|adv)\./i)?.[1]?.toLowerCase() || "";
  return ({ phrase: "phrase", n: "noun", v: "verb", adj: "adjective", adv: "adverb" })[prefix] || "";
}

function sourceMeaning(entry) {
  return stripPosPrefix(entry?.primaryMeaningZh || entry?.meaningZh || entry?.meaning);
}

function buildSourceMap(entries) {
  const result = new Map();
  for (const entry of asArray(entries)) {
    const key = normalizeReadingGKey(entry?.word);
    if (key && !result.has(key)) result.set(key, entry);
  }
  return result;
}

function firstUsableSource(sources, resolve, validator = hasUsableText) {
  for (const source of sources) {
    const value = text(resolve(source.entry));
    if (validator(value)) return { value, label: source.label };
  }
  return { value: "", label: "" };
}

function completeReadingGEntryFromLocalSources(entry, sourceMaps, cmuDictionary) {
  const beforeIssues = getReadingGContentIssues(entry);
  if (!beforeIssues.length || (entry?.entryType || "word") !== "word") {
    return { entry, changedFields: [], completed: false, sourceLabels: [] };
  }

  const next = structuredClone(entry);
  const key = normalizeReadingGKey(next.word);
  const matchedSources = sourceMaps.flatMap(({ label, entries }) => {
    const sourceEntry = entries.get(key);
    return sourceEntry ? [{ label, entry: sourceEntry }] : [];
  });
  const changedFields = [];
  const usedSourceLabels = new Set();

  if (!hasUsableText(next.phonetic)) {
    const sourcePhonetic = firstUsableSource(matchedSources, (source) => source?.phonetic);
    let phonetic = sourcePhonetic.value;
    let pronunciationSource = "local-lexicon";
    if (sourcePhonetic.label) usedSourceLabels.add(sourcePhonetic.label);
    if (!phonetic) {
      const cmuKey = text(next.word).toUpperCase();
      const arpabet = cmuDictionary[cmuKey] || cmuDictionary[cmuKey.toLowerCase()] || "";
      const candidate = arpabet ? arpabetToIpa(arpabet) : "";
      if (candidate && !isInvalidIpa(candidate)) {
        phonetic = candidate;
        pronunciationSource = "cmudict";
        usedSourceLabels.add("cmu-pronouncing-dictionary");
      }
    }
    if (phonetic) {
      next.phonetic = phonetic;
      next.phoneticSource = pronunciationSource;
      changedFields.push("phonetic");
    }
  }

  if (!hasUsablePos(next.primaryPos || next.rawPos || next.pos)) {
    const source = firstUsableSource(matchedSources, sourcePos, hasUsablePos);
    if (source.value) {
      next.primaryPos = source.value;
      next.pos = source.value;
      next.rawPos = source.value;
      usedSourceLabels.add(source.label);
      changedFields.push("pos");
    }
  }

  if (!hasUsableText(next.primaryMeaningZh || next.meaningZh || next.meaning)) {
    const source = firstUsableSource(matchedSources, sourceMeaning);
    if (source.value) {
      next.primaryMeaningZh = source.value;
      next.meaningZh = source.value;
      next.meaning = source.value;
      usedSourceLabels.add(source.label);
      changedFields.push("meaning");
    }
  }

  if (!hasUsableText(next.definition)) {
    const source = firstUsableSource(
      matchedSources,
      (source) => source?.definition || source?.meaningDetailZh || sourceMeaning(source)
    );
    if (source.value) {
      next.definition = source.value;
      usedSourceLabels.add(source.label);
      changedFields.push("definition");
    }
  }

  if (!hasUsableText(next.example)) {
    const source = firstUsableSource(matchedSources, (source) => source?.example);
    if (source.value) {
      next.example = source.value;
      usedSourceLabels.add(source.label);
      changedFields.push("example");
    }
  }

  if (!hasUsableText(next.exampleCn || next.exampleZh)) {
    const source = firstUsableSource(matchedSources, (source) => {
      const candidate = text(source?.exampleCn || source?.exampleZh);
      return /相关的实用例句/.test(candidate) ? "" : candidate;
    });
    if (source.value) {
      next.exampleCn = source.value;
      usedSourceLabels.add(source.label);
      changedFields.push("exampleCn");
    }
  }

  if (!changedFields.length) {
    return { entry, changedFields, completed: false, sourceLabels: [] };
  }

  const sourceLabels = [...usedSourceLabels];
  next.sourceFiles = [...new Set([...asArray(next.sourceFiles).map(text).filter(Boolean), ...sourceLabels])];
  next.qualityFlags = [...new Set([
    ...asArray(next.qualityFlags).map(text).filter(Boolean),
    "local_content_sources_merged"
  ])];
  const afterIssues = getReadingGContentIssues(next);
  return {
    entry: next,
    changedFields,
    completed: beforeIssues.length > 0 && afterIssues.length === 0,
    sourceLabels: [...new Set(sourceLabels)]
  };
}

function findUnique(items, word, expectedId = "") {
  const hits = items.filter((entry) => normalizedWord(entry) === word);
  if (hits.length !== 1) {
    throw new Error(`词条 ${word} 预期唯一，实际 ${hits.length} 条。`);
  }
  if (expectedId && stableId(hits[0]) !== expectedId) {
    throw new Error(`词条 ${word} 的稳定 ID 不符合预期，停止写入。`);
  }
  return hits[0];
}

function assertStableIdentity(before, after, label, { uniqueWords = false } = {}) {
  const beforeIds = before.map(stableId);
  const afterIds = after.map(stableId);
  const beforeWords = before.map(normalizedWord);
  const afterWords = after.map(normalizedWord);
  if (
    beforeIds.length !== afterIds.length
    || JSON.stringify(beforeIds) !== JSON.stringify(afterIds)
    || JSON.stringify(beforeWords) !== JSON.stringify(afterWords)
  ) {
    throw new Error(`${label} 的数量、顺序、词头或稳定 ID 发生变化，停止写入。`);
  }
  if (
    afterIds.some((value) => !value)
    || afterWords.some((value) => !value)
    || new Set(afterIds).size !== afterIds.length
    || (uniqueWords && new Set(afterWords).size !== afterWords.length)
  ) {
    throw new Error(`${label} 出现空值或不允许的重复稳定 ID/词头，停止写入。`);
  }
}

function patchMainWords(words, generatedAt) {
  const next = structuredClone(words);
  const publishing = findUnique(next, "publishing", "word_ab706c084103");
  if (publishing.pos !== "noun/verb" && publishing.pos !== "noun") {
    throw new Error(`publishing 当前词性异常：${publishing.pos}`);
  }
  Object.assign(publishing, {
    pos: "noun",
    meaning: "出版；出版业",
    definition: "出版；出版业",
    meaningDetailZh: "publishing 作名词时表示“出版”这一活动或“出版业”。动词 publish 的变形由 publish 词条负责展示。",
    meaningsZh: [
      {
        gloss: "出版；出版业",
        posFamily: "noun",
        label: "核心义",
        confidence: "high",
        evidence: ["dictionary-editorial-review-20260806"]
      }
    ],
    quizSenses: [
      {
        senseId: "word_ab706c084103-quiz-1",
        quizMeaningZh: "出版；出版业",
        meaningDetailedZh: "出版；出版业",
        posFamily: "noun",
        confidence: "editorial",
        generatedAt
      }
    ],
    wordFamily: [
      { word: "publish", pos: "verb", meaning: "出版；发表", relation: "related-to" },
      { word: "publisher", pos: "noun", meaning: "出版商；出版者", relation: "related-to" },
      { word: "publication", pos: "noun", meaning: "出版物；出版", relation: "related-to" }
    ],
    phraseCollocations: [
      { phrase: "publishing industry", chinese: "出版业" },
      { phrase: "publishing company", chinese: "出版公司" },
      { phrase: "publishing house", chinese: "出版社" },
      { phrase: "academic publishing", chinese: "学术出版" }
    ]
  });

  const alongside = findUnique(next, "alongside", "word_12112539049f");
  if (alongside.pos !== "preposition/adverb") {
    throw new Error(`alongside 当前词性异常：${alongside.pos}`);
  }
  Object.assign(alongside, {
    meaning: "在……旁边；与……一起",
    definition: "在……旁边；与……一起",
    meaningDetailZh: "alongside 可作介词，表示“在……旁边”或“与……一起”；也可作副词，表示“在旁边”。",
    senses: [
      {
        senseId: "word_12112539049f-preposition-1",
        pos: "preposition",
        meaningZh: "在……旁边；与……一起",
        definition: "在……旁边；与……一起",
        example: "The boat is alongside the dock.",
        exampleZh: "船在码头旁边。",
        isPrimary: true
      },
      {
        senseId: "word_12112539049f-adverb-1",
        pos: "adverb",
        meaningZh: "在旁边；在一旁",
        definition: "在旁边；在一旁",
        example: "A police car pulled up alongside.",
        exampleZh: "一辆警车在旁边停了下来。"
      }
    ],
    meaningsZh: [
      {
        gloss: "在……旁边；与……一起",
        posFamily: "preposition",
        label: "介词义",
        confidence: "high",
        evidence: ["dictionary-editorial-review-20260806"]
      },
      {
        gloss: "在旁边；在一旁",
        posFamily: "adverb",
        label: "副词义",
        confidence: "high",
        evidence: ["dictionary-editorial-review-20260806"]
      }
    ],
    phraseCollocations: [
      { phrase: "alongside someone or something", chinese: "与某人或某物一起；在其旁边" },
      { phrase: "work alongside", chinese: "与……一起工作" },
      { phrase: "alongside the road", chinese: "在路旁" }
    ]
  });

  assertStableIdentity(words, next, "正式主词库", { uniqueWords: true });
  return next;
}

async function patchReadingG(vocab, masterWords, generatedAt) {
  const originalItems = vocab.items;
  const targeted = structuredClone(originalItems);
  const publishing = findUnique(targeted, "publishing", "rg_word_publishing");
  Object.assign(publishing, {
    pos: "noun",
    primaryPos: "noun",
    primaryMeaningZh: "出版；出版业",
    meaning: "出版；出版业",
    meaningZh: "出版；出版业",
    definition: "出版；出版业",
    meaningDetailZh: "publishing 作名词时表示“出版”这一活动或“出版业”。动词 publish 的变形由 publish 词条负责展示。",
    senses: [
      {
        senseId: "rg_word_publishing_noun_01",
        pos: "noun",
        meaningZh: "出版；出版业",
        definition: "出版；出版业",
        example: "She works in the publishing industry.",
        exampleZh: "她在出版业工作。",
        isPrimary: true,
        readingCommon: true,
        sourceFiles: ["public/data/words.json"]
      }
    ],
    phraseCollocations: [
      { phrase: "publishing industry", chinese: "出版业" },
      { phrase: "publishing company", chinese: "出版公司" },
      { phrase: "publishing house", chinese: "出版社" },
      { phrase: "academic publishing", chinese: "学术出版" }
    ]
  });

  const alongside = findUnique(targeted, "alongside", "rg_word_alongside");
  Object.assign(alongside, {
    primaryPos: "preposition",
    primaryMeaningZh: "在……旁边；与……一起",
    meaning: "在……旁边；与……一起",
    meaningZh: "在……旁边；与……一起",
    definition: "在……旁边；与……一起",
    senses: [
      {
        senseId: "rg_word_alongside_preposition_01",
        pos: "preposition",
        meaningZh: "在……旁边；与……一起",
        definition: "在……旁边；与……一起",
        example: "The boat is alongside the dock.",
        exampleZh: "船在码头旁边。",
        isPrimary: true,
        readingCommon: true,
        sourceFiles: ["gt-reading-priority-1500.json", "gt-reading-main-enhanced-3592.json"]
      },
      {
        senseId: "rg_word_alongside_adverb_02",
        pos: "adverb",
        meaningZh: "在旁边；在一旁",
        definition: "在旁边；在一旁",
        example: "A police car pulled up alongside.",
        exampleZh: "一辆警车在旁边停了下来。",
        sourceFiles: ["dictionary-editorial-review-20260806"]
      }
    ],
    phraseCollocations: [
      { phrase: "alongside someone or something", chinese: "与某人或某物一起；在其旁边" },
      { phrase: "work alongside", chinese: "与……一起工作" },
      { phrase: "alongside the road", chinese: "在路旁" }
    ]
  });

  const idictation = readJson(PATHS.idictation);
  const localSourceMaps = [
    {
      label: "scripts/data/reading-g-example-repairs.json",
      entries: buildSourceMap(readJson(PATHS.readingGExampleRepairs).repairs)
    },
    {
      label: "public/data/idictation-frequency.json#reading",
      entries: buildSourceMap(idictation?.sources?.reading?.entries)
    },
    {
      label: "public/data/idictation-frequency.json#listening",
      entries: buildSourceMap(idictation?.sources?.listening?.entries)
    },
    { label: "public/data/words.json", entries: buildSourceMap(masterWords) },
    { label: "public/data/ielts-538-words.json", entries: buildSourceMap(readJson(PATHS.ielts538).words) },
    { label: "public/data/basic-words.json", entries: buildSourceMap(readJson(PATHS.basic).words) },
    { label: "public/data/phrases.json", entries: buildSourceMap(readJson(PATHS.phrases).phrases) },
    { label: "scripts/lib/gt-new-words-pool.mjs", entries: buildSourceMap(buildCuratedPool(new Set())) }
  ];
  const cmuDictionary = await loadCmuDictionary();
  const localStats = {
    entriesChanged: 0,
    entriesCompleted: 0,
    fieldsFilled: {},
    sourceUsage: {}
  };
  const locallyCompleted = targeted.map((entry) => {
    const result = completeReadingGEntryFromLocalSources(entry, localSourceMaps, cmuDictionary);
    if (result.changedFields.length) {
      localStats.entriesChanged += 1;
      if (result.completed) localStats.entriesCompleted += 1;
      for (const field of result.changedFields) {
        localStats.fieldsFilled[field] = (localStats.fieldsFilled[field] || 0) + 1;
      }
      for (const sourceLabel of result.sourceLabels) {
        localStats.sourceUsage[sourceLabel] = (localStats.sourceUsage[sourceLabel] || 0) + 1;
      }
    }
    return result.entry;
  });

  const masterByKey = new Map(
    masterWords.map((entry) => [normalizeReadingGKey(entry.word), entry])
  );
  const morphology = organizeReadingGMorphology(locallyCompleted, masterByKey);
  assertStableIdentity(originalItems, morphology.items, "G 类阅读词库");
  const relationMeanings = fillReadingGRelationMeanings(morphology.items, masterByKey);
  assertStableIdentity(originalItems, relationMeanings.items, "G 类阅读词库词形词族");

  const next = {
    ...vocab,
    generatedAt,
    multiSenseCount: relationMeanings.items.filter(
      (entry) => Array.isArray(entry?.senses) && entry.senses.length > 1
    ).length,
    enrichment: {
      ...(vocab.enrichment || {}),
      morphology: morphology.stats,
      relationMeanings: relationMeanings.stats.entriesChanged
        ? relationMeanings.stats
        : vocab.enrichment?.relationMeanings || relationMeanings.stats,
      contentRevision: "study-content-unification-20260806"
    },
    items: relationMeanings.items
  };
  return {
    vocab: next,
    morphologyStats: morphology.stats,
    relationMeaningStats: relationMeanings.stats,
    localStats
  };
}

function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.study-unification-tmp`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

function verifyBackup(backupDir) {
  const required = [
    "public-words.json",
    "static-cache-words.json",
    "reading-g-vocab.json",
    "basic-words.json",
    "ielts-538-words.json"
  ];
  for (const name of required) {
    const filePath = path.join(backupDir, name);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      throw new Error(`备份不完整：${filePath}`);
    }
  }
  const publicBackup = fs.readFileSync(path.join(backupDir, "public-words.json"));
  const cacheBackup = fs.readFileSync(path.join(backupDir, "static-cache-words.json"));
  if (!publicBackup.equals(cacheBackup)) {
    throw new Error("备份中的两份主词库不一致，停止写入。");
  }
}

const apply = process.argv.includes("--apply");
const requestedGeneratedAt = readArg("--generated-at");
const version = readArg("--version") || "v24-13374-content-unification-20260806";
const backupDir = readArg("--backup-dir");

if (apply) {
  if (!backupDir) throw new Error("正式写入必须提供 --backup-dir。");
  verifyBackup(path.resolve(backupDir));
}

const publicRaw = fs.readFileSync(PATHS.publicWords);
const cacheRaw = fs.readFileSync(PATHS.cacheWords);
if (!publicRaw.equals(cacheRaw)) {
  throw new Error("public 与静态缓存主词库不一致，停止处理。");
}

const publicPayload = JSON.parse(publicRaw.toString("utf8"));
const generatedAt = requestedGeneratedAt || (
  publicPayload.version === version && publicPayload.savedAt
    ? String(publicPayload.savedAt)
    : new Date().toISOString()
);
const originalWords = publicPayload.words;
if (!Array.isArray(originalWords) || originalWords.length !== Number(publicPayload.count)) {
  throw new Error("正式主词库数量元数据不一致，停止处理。");
}

const nextWords = patchMainWords(originalWords, generatedAt);
const nextWordsPayload = {
  ...publicPayload,
  version,
  savedAt: generatedAt,
  count: nextWords.length,
  lexiconHash: computeLexiconHash(nextWords),
  integrityHash: computeIntegrityHash(nextWords),
  words: nextWords
};
const wordsContent = `${JSON.stringify(nextWordsPayload, null, 2)}\n`;
const wordsFileHash = sha256(wordsContent);

const readingGSource = readJson(PATHS.readingG);
const {
  vocab: readingG,
  morphologyStats,
  relationMeaningStats,
  localStats: readingGLocalCompletion
} = await patchReadingG(readingGSource, nextWords, generatedAt);
const readingGContent = `${JSON.stringify(readingG)}\n`;

const meaning = readJson(PATHS.meaning);
const meaningPublishing = findUnique(meaning.items, "publishing", "word_ab706c084103");
Object.assign(meaningPublishing, {
  quizMeaningZh: "出版；出版业",
  meaningZh: "出版；出版业",
  meaningDetailedZh: "出版；出版业",
  posFamily: "noun"
});
meaning.generatedAt = generatedAt;
meaning.sourceLexiconVersion = version;
meaning.sourceLexiconCount = nextWords.length;
meaning.sourceLexiconSha256 = wordsFileHash;
const meaningContent = `${JSON.stringify(meaning, null, 2)}\n`;

const baselineContent = [
  "// Baseline metadata for the bundled master lexicon.",
  "// Keep this in sync with public/data/words.json and .static-export-cache/words.json.",
  `export const MASTER_LEXICON_EXPECTED_COUNT = ${nextWords.length};`,
  `export const MASTER_LEXICON_VERSION = ${JSON.stringify(version)};`,
  `export const MASTER_LEXICON_SHA256 = ${JSON.stringify(wordsFileHash)};`,
  ""
].join("\n");

const retirements = readJson(PATHS.retirements);
retirements.version = version;
retirements.generatedAt = generatedAt;
const retirementsContent = `${JSON.stringify(retirements, null, 2)}\n`;

const report = {
  mode: apply ? "apply" : "dry-run",
  generatedAt,
  version,
  main: {
    count: nextWords.length,
    stableIdsChanged: 0,
    patchedEntries: ["publishing", "alongside"],
    fileSha256Before: sha256(publicRaw),
    fileSha256After: wordsFileHash,
    lexiconHash: nextWordsPayload.lexiconHash,
    integrityHash: nextWordsPayload.integrityHash
  },
  readingG: {
    count: readingG.items.length,
    stableIdsChanged: 0,
    patchedEntries: ["publishing", "alongside"],
    localCompletion: readingGLocalCompletion,
    morphology: morphologyStats,
    relationMeanings: relationMeaningStats
  },
  preservedByProductDecision: ["public/data/basic-words.json", "public/data/ielts-538-words.json"]
};

if (apply) {
  atomicWrite(PATHS.publicWords, wordsContent);
  atomicWrite(PATHS.cacheWords, wordsContent);
  atomicWrite(PATHS.readingG, readingGContent);
  atomicWrite(PATHS.meaning, meaningContent);
  atomicWrite(PATHS.baseline, baselineContent);
  atomicWrite(PATHS.retirements, retirementsContent);
}

console.log(JSON.stringify(report, null, 2));
