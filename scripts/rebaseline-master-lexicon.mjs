import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectMeaningWords } from "../app/lib/meaning-mode/selector.mjs";
import {
  computeIntegrityHash,
  computeLexiconHash
} from "../app/lib/vocab/lexicon-guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_PATH = path.join(ROOT, "public", "data", "words.json");
const CACHE_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const MEANING_PATH = path.join(ROOT, "public", "data", "meaning-6000.json");
const BASELINE_PATH = path.join(ROOT, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const RETIREMENTS_PATH = path.join(ROOT, "app", "lib", "vocab", "master-lexicon-retirements.json");

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function normalizeWord(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function stableId(entry) {
  return String(entry?.wordId || entry?.id || "").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath);
  return { raw, data: JSON.parse(raw.toString("utf8")) };
}

function normalizePosFamily(pos) {
  const value = String(pos || "").trim().toLowerCase();
  if (value.startsWith("noun") || value === "n" || value === "n.") return "noun";
  if (value.startsWith("verb") || value === "v" || value === "v." || value === "modal") return "verb";
  if (value.startsWith("adject") || value === "adj" || value === "adj.") return "adjective";
  if (value.startsWith("adverb") || value === "adv" || value === "adv.") return "adverb";
  if (value.includes("noun")) return "noun";
  if (value.includes("verb")) return "verb";
  if (value.includes("adj")) return "adjective";
  if (value.includes("adv")) return "adverb";
  return "other";
}

function bestMeaning(entry) {
  return String(
    entry?.quizSenses?.[0]?.quizMeaningZh ||
    entry?.meaningDetailedZh ||
    entry?.meaningDetailZh ||
    entry?.meaningZh ||
    entry?.meaning ||
    entry?.definition ||
    ""
  ).trim();
}

function buildMeaningReplacement(entry, selected) {
  const detailed = bestMeaning(entry);
  return {
    wordId: stableId(entry),
    word: String(entry.word || "").trim(),
    quizMeaningZh: detailed,
    meaningZh: detailed,
    meaningDetailedZh: detailed,
    meaningSource: "master-lexicon-rebaseline",
    posFamily: normalizePosFamily(entry.pos),
    difficulty: entry.difficulty || selected?.difficulty || "core",
    selectionScore: Number(selected?.score || 0),
    scoreBreakdown: selected?.scoreBreakdown || {},
    tags: Array.isArray(selected?.tags) ? selected.tags : [],
    topics: Array.isArray(entry.topics) ? entry.topics : [],
    sourceEvidence: Array.isArray(selected?.sourceEvidence)
      ? selected.sourceEvidence
      : ["masterLexicon"]
  };
}

function relationTarget(item) {
  return normalizeWord(typeof item === "string" ? item : item?.word);
}

function isSuffixAuditCandidate(value) {
  const word = normalizeWord(value);
  return ["s", "ed", "ing", "er", "est", "en", "ind"].some((ending) => word.endsWith(ending));
}

function mergeRetirementEntries(existingEntries, addedEntries) {
  const merged = [];
  const seenIds = new Set();
  const seenWords = new Set();

  for (const entry of [...existingEntries, ...addedEntries]) {
    const id = stableId(entry);
    const word = String(entry?.word || "").trim();
    const wordKey = normalizeWord(word);
    if ((!id && !wordKey) || (id && seenIds.has(id)) || (wordKey && seenWords.has(wordKey))) continue;
    if (id) seenIds.add(id);
    if (wordKey) seenWords.add(wordKey);
    merged.push({
      ...(id ? { id } : {}),
      word,
      reason: String(entry?.reason || "user-curated-removal"),
      ...(entry?.morphologyAuditIncluded === false ? { morphologyAuditIncluded: false } : {})
    });
  }

  return merged;
}

function buildMorphologyAudit(words, retirementEntries, previousAudit, generatedAt) {
  const inflectedReferences = words.filter(
    (entry) => entry?.entryType === "inflected-form" && entry?.studyMode === "reference"
  ).length;
  const previousVersion = String(previousAudit?.version || "").match(/-v(\d+)-/)?.[1];
  const nextVersion = Math.max(1, Number(previousVersion) + 1 || 1);
  const auditDate = String(generatedAt || "").slice(0, 10).replaceAll("-", "");

  return {
    version: `manual-morphology-audit-v${nextVersion}-${auditDate}`,
    rawSuffixHeadwordsReviewed:
      words.filter((entry) => isSuffixAuditCandidate(entry?.word)).length +
      retirementEntries.filter(
        (entry) => entry?.morphologyAuditIncluded !== false && isSuffixAuditCandidate(entry?.word)
      ).length,
    storedFormLinksReviewed: words.reduce(
      (sum, entry) => sum + (Array.isArray(entry?.forms) ? entry.forms.length : 0),
      0
    ),
    inflectedReferences,
    brushableHeadwords: words.length - inflectedReferences,
    meaningZhRepaired: Math.max(0, Number(previousAudit?.meaningZhRepaired) || 0),
    referenceLinksRepaired: Math.max(0, Number(previousAudit?.referenceLinksRepaired) || 0),
    wrongOwnerIdsRemoved: Math.max(0, Number(previousAudit?.wrongOwnerIdsRemoved) || 0),
    danglingFormsRemoved: Math.max(0, Number(previousAudit?.danglingFormsRemoved) || 0)
  };
}

function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.rebaseline-tmp`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

function buildPlan({ version, generatedAt, previousRef, allowAdditions = false }) {
  const publicFile = readJson(PUBLIC_PATH);
  const cacheFile = readJson(CACHE_PATH);
  const meaningFile = readJson(MEANING_PATH);
  const retirementFile = readJson(RETIREMENTS_PATH);

  if (!publicFile.raw.equals(cacheFile.raw)) {
    throw new Error("两个正式主词库当前并非逐字节一致，停止重建基线。");
  }

  const currentWords = Array.isArray(publicFile.data?.words) ? publicFile.data.words : [];
  if (!currentWords.length || currentWords.length !== Number(publicFile.data?.count)) {
    throw new Error("正式主词库数量元数据不一致，停止重建基线。");
  }

  const currentIds = new Set(currentWords.map(stableId).filter(Boolean));
  const currentWordKeys = new Set(currentWords.map((entry) => normalizeWord(entry.word)).filter(Boolean));
  if (currentIds.size !== currentWords.length || currentWordKeys.size !== currentWords.length) {
    throw new Error("正式主词库存在重复或缺失的稳定 ID/词头，停止重建基线。");
  }

  let previousPayload;
  try {
    previousPayload = JSON.parse(
      execFileSync("git", ["show", `${previousRef}:public/data/words.json`], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 100 * 1024 * 1024
      })
    );
  } catch (error) {
    throw new Error(`无法读取用于确认删除范围的历史版本 ${previousRef}：${error.message}`);
  }
  const previousWords = Array.isArray(previousPayload?.words) ? previousPayload.words : [];
  const previousWordKeys = new Set(previousWords.map((entry) => normalizeWord(entry.word)));
  const curatedRemovedEntries = previousWords.filter(
    (entry) => !currentWordKeys.has(normalizeWord(entry.word))
  );
  const curatedRemovedWordKeys = new Set(
    curatedRemovedEntries.map((entry) => normalizeWord(entry.word))
  );
  const addedSincePrevious = currentWords.filter(
    (entry) => !previousWordKeys.has(normalizeWord(entry.word))
  );
  if (addedSincePrevious.length && !allowAdditions) {
    throw new Error(
      `历史版本之后还新增了 ${addedSincePrevious.length} 个词；确认这些词应进入正式主词库后，使用 --allow-additions 重建基线。`
    );
  }

  const orphanReferences = currentWords.filter((entry) => {
    if (entry?.entryType !== "inflected-form" || entry?.studyMode !== "reference") return false;
    const baseKey = normalizeWord(entry.baseWord || entry.redirectToWord);
    const baseId = String(entry.baseWordId || "").trim();
    return !(baseKey && currentWordKeys.has(baseKey)) && !(baseId && currentIds.has(baseId));
  });
  const orphanIds = new Set(orphanReferences.map(stableId));
  const orphanWordKeys = new Set(orphanReferences.map((entry) => normalizeWord(entry.word)));
  const allowedPruneTargets = new Set([...curatedRemovedWordKeys, ...orphanWordKeys]);
  const retainedWords = currentWords.filter((entry) => !orphanIds.has(stableId(entry)));
  const retainedIds = new Set(retainedWords.map(stableId));
  const retainedWordKeys = new Set(retainedWords.map((entry) => normalizeWord(entry.word)));
  const prunedRelations = [];

  const finalWords = retainedWords.map((entry) => {
    let next = entry;
    for (const field of ["forms", "wordFamily"]) {
      if (!Array.isArray(entry[field])) continue;
      const filtered = entry[field].filter((item) => {
        const target = relationTarget(item);
        const keep = !target || retainedWordKeys.has(target) || !allowedPruneTargets.has(target);
        if (!keep) {
          prunedRelations.push({
            owner: entry.word,
            ownerId: stableId(entry),
            field,
            target: typeof item === "string" ? item : item?.word
          });
        }
        return keep;
      });
      if (filtered.length !== entry[field].length) next = { ...next, [field]: filtered };
    }
    return next;
  });

  const finalIds = new Set(finalWords.map(stableId));
  const finalWordKeys = new Set(finalWords.map((entry) => normalizeWord(entry.word)));
  const danglingBaseRelations = finalWords.filter((entry) => {
    const baseKey = normalizeWord(entry.baseWord || entry.redirectToWord);
    const baseId = String(entry.baseWordId || "").trim();
    if (!baseKey && !baseId) return false;
    return !(baseKey && finalWordKeys.has(baseKey)) && !(baseId && finalIds.has(baseId));
  });
  if (danglingBaseRelations.length) {
    throw new Error(
      `仍有 ${danglingBaseRelations.length} 条 baseWord/redirectToWord 悬空关系，停止写入：` +
      danglingBaseRelations.slice(0, 10).map((entry) => entry.word).join("、")
    );
  }

  const wordIds = finalWords.map(stableId);
  if (wordIds.some((id) => !id) || new Set(wordIds).size !== finalWords.length) {
    throw new Error("最终词库稳定 ID 不完整或重复，停止写入。");
  }

  const newRetirementEntries = [
    ...curatedRemovedEntries.map((entry) => ({
      id: stableId(entry),
      word: entry.word,
      reason: "user-curated-removal"
    })),
    ...orphanReferences.map((entry) => ({
      id: stableId(entry),
      word: entry.word,
      reason: "orphan-inflected-reference-after-base-removal"
    }))
  ];
  const existingRetirementEntries = Array.isArray(retirementFile.data?.entries)
    ? retirementFile.data.entries
    : [];
  const retirementEntries = mergeRetirementEntries(existingRetirementEntries, newRetirementEntries);
  const morphologyAudit = buildMorphologyAudit(
    finalWords,
    retirementEntries,
    previousPayload?.morphologyAudit || publicFile.data?.morphologyAudit,
    generatedAt
  );
  const wordsPayload = {
    ...publicFile.data,
    version,
    savedAt: generatedAt,
    count: finalWords.length,
    lexiconHash: computeLexiconHash(finalWords),
    integrityHash: computeIntegrityHash(finalWords),
    morphologyAudit,
    words: finalWords
  };
  const wordsContent = `${JSON.stringify(wordsPayload, null, 2)}\n`;
  const wordsFileHash = sha256(wordsContent);

  const oldMeaningItems = Array.isArray(meaningFile.data?.items) ? meaningFile.data.items : [];
  const wordById = new Map(finalWords.map((entry) => [stableId(entry), entry]));
  const retainedMeaningItems = oldMeaningItems
    .filter((item) => finalIds.has(String(item?.wordId || "").trim()))
    .map((item) => {
      if (item.meaningSource !== "master-lexicon-rebaseline") return item;
      const entry = wordById.get(String(item.wordId || "").trim());
      const posFamily = normalizePosFamily(entry?.pos);
      return item.posFamily === posFamily ? item : { ...item, posFamily };
    });
  const removedMeaningItems = oldMeaningItems.filter((item) => !finalIds.has(String(item?.wordId || "").trim()));
  const meaningIds = new Set(retainedMeaningItems.map((item) => String(item.wordId || "").trim()));
  const meaningWords = new Set(retainedMeaningItems.map((item) => normalizeWord(item.word)));
  const ranked = selectMeaningWords(finalWords, finalWords.length);
  const selectedById = new Map(ranked.map((item) => [String(item.wordId || "").trim(), item]));
  const addedMeaningItems = [];

  for (const selected of ranked) {
    if (retainedMeaningItems.length + addedMeaningItems.length >= 6000) break;
    const id = String(selected.wordId || "").trim();
    const entry = wordById.get(id);
    const wordKey = normalizeWord(entry?.word);
    if (
      !entry ||
      entry.entryType === "inflected-form" ||
      entry.studyMode === "reference" ||
      entry.sourceType === "interjection-replacement" ||
      String(stableId(entry)).startsWith("word_gt10500_") ||
      meaningIds.has(id) ||
      meaningWords.has(wordKey) ||
      !Array.isArray(entry.quizSenses) ||
      entry.quizSenses.length === 0 ||
      !String(entry.example || "").trim() ||
      !String(entry.exampleCn || "").trim() ||
      !bestMeaning(entry)
    ) {
      continue;
    }
    const replacement = buildMeaningReplacement(entry, selectedById.get(id));
    addedMeaningItems.push(replacement);
    meaningIds.add(id);
    meaningWords.add(wordKey);
  }

  const finalMeaningItems = [...retainedMeaningItems, ...addedMeaningItems];
  if (finalMeaningItems.length !== 6000) {
    throw new Error(`选义训练无法安全补足 6000 词，实际为 ${finalMeaningItems.length} 词。`);
  }
  if (
    new Set(finalMeaningItems.map((item) => item.wordId)).size !== finalMeaningItems.length ||
    new Set(finalMeaningItems.map((item) => normalizeWord(item.word))).size !== finalMeaningItems.length
  ) {
    throw new Error("最终选义训练数据存在重复 wordId 或词头，停止写入。");
  }

  const meaningPayload = {
    ...meaningFile.data,
    version: "meaning-6000-v6-user-curated-removal",
    generatedAt,
    count: finalMeaningItems.length,
    sourceLexiconVersion: version,
    sourceLexiconCount: finalWords.length,
    sourceLexiconSha256: wordsFileHash,
    items: finalMeaningItems
  };
  const meaningContent = `${JSON.stringify(meaningPayload, null, 2)}\n`;
  const baselineContent = [
    "// Baseline metadata for the bundled master lexicon.",
    "// Keep this in sync with public/data/words.json and .static-export-cache/words.json.",
    `export const MASTER_LEXICON_EXPECTED_COUNT = ${finalWords.length};`,
    `export const MASTER_LEXICON_VERSION = ${JSON.stringify(version)};`,
    `export const MASTER_LEXICON_SHA256 = ${JSON.stringify(wordsFileHash)};`,
    ""
  ].join("\n");
  const retirementsContent = `${JSON.stringify({
    version,
    generatedAt,
    previousRef,
    count: retirementEntries.length,
    entries: retirementEntries
  }, null, 2)}\n`;

  return {
    contents: { wordsContent, meaningContent, baselineContent, retirementsContent },
    report: {
      mode: process.argv.includes("--apply") ? "apply" : "dry-run",
      before: {
        wordCount: currentWords.length,
        meaningCount: oldMeaningItems.length,
        version: String(publicFile.data?.version || ""),
        fileHash: sha256(publicFile.raw)
      },
      after: {
        wordCount: finalWords.length,
        brushableCount: finalWords.filter(
          (entry) => !(entry.entryType === "inflected-form" && entry.studyMode === "reference")
        ).length,
        meaningCount: finalMeaningItems.length,
        version,
        fileHash: wordsFileHash,
        lexiconHash: wordsPayload.lexiconHash,
        morphologyAudit
      },
      removedOrphanReferences: orphanReferences.map((entry) => ({
        id: stableId(entry),
        word: entry.word,
        baseWord: entry.baseWord,
        baseWordId: entry.baseWordId,
        reason: "base-word-removed"
      })),
      curatedRemovedEntries: curatedRemovedEntries.map((entry) => ({
        id: stableId(entry),
        word: entry.word,
        reason: "user-curated-removal"
      })),
      addedEntries: addedSincePrevious.map((entry) => ({
        id: stableId(entry),
        word: entry.word,
        source: entry.source || "",
        addedFromReadingWords: entry.addedFromReadingWords === true
      })),
      prunedRelations,
      removedMeaningItems: removedMeaningItems.map((item) => ({
        wordId: item.wordId,
        word: item.word,
        reason: "master-word-removed"
      })),
      addedMeaningItems: addedMeaningItems.map((item) => ({
        wordId: item.wordId,
        word: item.word,
        reason: "replacement-for-retired-meaning-item"
      }))
    }
  };
}

const version = readArg("--version");
const generatedAt = readArg("--generated-at");
const previousRef = readArg("--previous-ref");
const apply = process.argv.includes("--apply");
const allowAdditions = process.argv.includes("--allow-additions");
const reportPathArg = readArg("--report");

if (!version || !generatedAt || !previousRef) {
  throw new Error("请提供 --version <新版本>、--generated-at <ISO 时间> 和 --previous-ref <删除前 Git 版本>。");
}

const plan = buildPlan({ version, generatedAt, previousRef, allowAdditions });
const reportContent = `${JSON.stringify(plan.report, null, 2)}\n`;

if (apply) {
  atomicWrite(PUBLIC_PATH, plan.contents.wordsContent);
  atomicWrite(CACHE_PATH, plan.contents.wordsContent);
  atomicWrite(MEANING_PATH, plan.contents.meaningContent);
  atomicWrite(BASELINE_PATH, plan.contents.baselineContent);
  atomicWrite(RETIREMENTS_PATH, plan.contents.retirementsContent);
}
if (reportPathArg) {
  const reportPath = path.resolve(ROOT, reportPathArg);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, reportContent, "utf8");
}

console.log(
  process.argv.includes("--verbose")
    ? reportContent
    : JSON.stringify({
        mode: plan.report.mode,
        before: plan.report.before,
        after: plan.report.after,
        addedCount: plan.report.addedEntries.length,
        curatedRemovedCount: plan.report.curatedRemovedEntries.length,
        removedOrphanReferenceCount: plan.report.removedOrphanReferences.length,
        prunedRelationCount: plan.report.prunedRelations.length,
        removedMeaningCount: plan.report.removedMeaningItems.length,
        addedMeaningCount: plan.report.addedMeaningItems.length
      }, null, 2)
);
