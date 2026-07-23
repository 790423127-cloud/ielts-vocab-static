import fs from "node:fs";

function replaceOrThrow(file, before, after) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Patch anchor not found in ${file}: ${before.slice(0, 100)}`);
  }
  fs.writeFileSync(file, source.replace(before, after), "utf8");
}

replaceOrThrow(
  "app/lib/vocab/admin-ai-batch-plan.mjs",
  `  getUnifiedQualityQueue,\n  isMissingAiFields,\n  isMissingClassification,\n  summarizeWordQuality\n`,
  `  getUnifiedQualityQueue,\n  isInvalidAiContent,\n  isMissingAiFields,\n  isMissingClassification,\n  summarizeWordQuality\n`
);
replaceOrThrow(
  "app/lib/vocab/admin-ai-batch-plan.mjs",
  `function needsRepair(word) {\n  return isLikelyWrongAiWord(word) || hasHeadwordRepair(word?.word);\n}`,
  `function needsRepair(word) {\n  return isInvalidAiContent(word) || isLikelyWrongAiWord(word) || hasHeadwordRepair(word?.word);\n}`
);
replaceOrThrow(
  "app/lib/vocab/admin-ai-batch-plan.mjs",
  `      wrong: isLikelyWrongAiWord(w),\n`,
  `      wrong: isInvalidAiContent(w) || isLikelyWrongAiWord(w),\n`
);
replaceOrThrow(
  "app/lib/vocab/admin-ai-batch-plan.mjs",
  `  const targets = selectIndexedWords(words, isLikelyWrongAiWord, PAID_AI_LIMITS.wrongRepair);\n`,
  `  const targets = selectIndexedWords(words, needsRepair, PAID_AI_LIMITS.wrongRepair);\n`
);

replaceOrThrow(
  "app/lib/vocab/word-flashcard-study-pool.mjs",
  `import {\n  isMissingAiFields,\n  isMissingClassification\n} from "./word-quality-status.mjs";`,
  `import {\n  getWordEnrichmentStatus,\n  getWordQualityStatus,\n  isMissingAiFields,\n  isMissingClassification\n} from "./word-quality-status.mjs";`
);
replaceOrThrow(
  "app/lib/vocab/word-flashcard-study-pool.mjs",
  `    if (filter.value === "待补全") return isMissingAiFields(word);\n    if (filter.value === "待归纳") return !isMissingAiFields(word) && isMissingClassification(word);\n`,
  `    if (filter.value === "待补全") return isMissingAiFields(word);\n    if (filter.value === "待修复") return getWordQualityStatus(word).contentInvalid;\n    if (filter.value === "待归纳") {\n      const quality = getWordQualityStatus(word);\n      return !quality.contentMissing && !quality.contentInvalid && isMissingClassification(word);\n    }\n    if (filter.value === "待丰富") {\n      const quality = getWordQualityStatus(word);\n      return !quality.contentMissing && !quality.contentInvalid && getWordEnrichmentStatus(word).needsOptionalEnrichment;\n    }\n`
);
replaceOrThrow(
  "app/lib/vocab/word-flashcard-study-pool.mjs",
  `  if (filter.type === "status" && filter.value === "待补全") return "资料缺失";\n  if (filter.type === "status" && filter.value === "待归纳") return "仅缺分类";\n`,
  `  if (filter.type === "status" && filter.value === "待补全") return "必须补全";\n  if (filter.type === "status" && filter.value === "待修复") return "结构异常";\n  if (filter.type === "status" && filter.value === "待归纳") return "仅缺分类";\n  if (filter.type === "status" && filter.value === "待丰富") return "可选丰富";\n`
);

replaceOrThrow(
  "app/page.jsx",
  `import { getUnifiedQualityQueue } from "./lib/vocab/word-quality-status.mjs";`,
  `import { getWordQualityEvaluation } from "./lib/vocab/word-quality-status.mjs";`
);
replaceOrThrow(
  "app/page.jsx",
  `      return { total: 0, physical: 0, references: 0, pending: 0, blurry: 0, unfamiliar: 0, familiar: 0, todayReviewed: 0, missing: 0, classifyMissing: 0, repairMissing: 0 };`,
  `      return { total: 0, physical: 0, references: 0, pending: 0, blurry: 0, unfamiliar: 0, familiar: 0, todayReviewed: 0, missing: 0, classifyMissing: 0, repairMissing: 0, enrichmentThin: 0, familyReview: 0, familyPromotion: 0 };`
);
replaceOrThrow(
  "app/page.jsx",
  `    let repairMissing = 0;\n\n    for (const word of words) {`,
  `    let repairMissing = 0;\n    let enrichmentThin = 0;\n    let familyReview = 0;\n    let familyPromotion = 0;\n    const knownHeadwords = new Set(libraryWordMap.keys());\n\n    for (const word of words) {`
);
replaceOrThrow(
  "app/page.jsx",
  `      const qualityQueue = getUnifiedQualityQueue(word, {\n        needsRepair: isLikelyWrongAiWord(word) || hasHeadwordRepair(word.word)\n      });\n      if (qualityQueue === "completion") missing += 1;\n      if (qualityQueue === "classification") classifyMissing += 1;\n      if (qualityQueue === "repair") repairMissing += 1;\n`,
  `      const quality = getWordQualityEvaluation(word, {\n        needsRepair: isLikelyWrongAiWord(word) || hasHeadwordRepair(word.word),\n        knownHeadwords\n      });\n      if (quality.lane === "completion") missing += 1;\n      if (quality.lane === "classification") classifyMissing += 1;\n      if (quality.lane === "repair") repairMissing += 1;\n      if (quality.needsOptionalEnrichment) enrichmentThin += 1;\n      if (quality.needsFamilyReview) familyReview += 1;\n      if (quality.hasFamilyPromotionCandidate) familyPromotion += 1;\n`
);
replaceOrThrow(
  "app/page.jsx",
  `    return { total, physical: words.length, references, pending, blurry, unfamiliar, familiar, todayReviewed, missing, classifyMissing, repairMissing };\n  }, [isWordFlashActive, words]);\n\n  const familiarCount = wordLibraryStats.familiar;\n  const missingCount = wordLibraryStats.missing;\n  const classifyMissingCount = wordLibraryStats.classifyMissing;`,
  `    return { total, physical: words.length, references, pending, blurry, unfamiliar, familiar, todayReviewed, missing, classifyMissing, repairMissing, enrichmentThin, familyReview, familyPromotion };\n  }, [isWordFlashActive, words, libraryWordMap]);\n\n  const familiarCount = wordLibraryStats.familiar;\n  const missingCount = wordLibraryStats.missing;\n  const classifyMissingCount = wordLibraryStats.classifyMissing;\n  const repairMissingCount = wordLibraryStats.repairMissing;\n  const enrichmentThinCount = wordLibraryStats.enrichmentThin;\n  const familyReviewCount = wordLibraryStats.familyReview;\n  const familyPromotionCount = wordLibraryStats.familyPromotion;`
);
replaceOrThrow(
  "app/page.jsx",
  `            familiarCount,\n            missingCount,\n            classifyMissingCount\n`,
  `            familiarCount,\n            missingCount,\n            classifyMissingCount,\n            repairMissingCount,\n            enrichmentThinCount,\n            familyReviewCount,\n            familyPromotionCount\n`
);
replaceOrThrow(
  "app/page.jsx",
  `            aiRunState,\n            duplicateInfo,\n`,
  `            aiRunState,\n            qualityStats: wordLibraryStats,\n            duplicateInfo,\n`
);

replaceOrThrow(
  "app/components/WordFlashcardView.jsx",
  `    familiarCount,\n    missingCount,\n    classifyMissingCount\n`,
  `    familiarCount,\n    missingCount,\n    classifyMissingCount,\n    repairMissingCount,\n    enrichmentThinCount,\n    familyReviewCount,\n    familyPromotionCount\n`
);
replaceOrThrow(
  "app/components/WordFlashcardView.jsx",
  `    aiRunState,\n    duplicateInfo,\n`,
  `    aiRunState,\n    qualityStats,\n    duplicateInfo,\n`
);
replaceOrThrow(
  "app/components/WordFlashcardView.jsx",
  `          可刷 {wordLibraryStats.total} · 词形参考 {wordLibraryStats.references} · 总记录 {wordLibraryStats.physical} · 待学习 {wordLibraryStats.pending} · 不熟 {wordLibraryStats.unfamiliar} · 已认识 {familiarCount} · 资料缺失 {missingCount} · 仅缺分类 {classifyMissingCount} · 音频 {audioStats.state === "error" ? "核对失败" : audioStats.state !== "ready" ? "核对中" : \`${audioStats.has}/${audioStats.total}\`}\n`,
  `          可刷 {wordLibraryStats.total} · 词形参考 {wordLibraryStats.references} · 总记录 {wordLibraryStats.physical} · 待学习 {wordLibraryStats.pending} · 不熟 {wordLibraryStats.unfamiliar} · 已认识 {familiarCount} · 必须补全 {missingCount} · 结构异常 {repairMissingCount} · 仅缺分类 {classifyMissingCount} · 可选丰富 {enrichmentThinCount} · 词族复核 {familyReviewCount} · 独立词候选 {familyPromotionCount} · 音频 {audioStats.state === "error" ? "核对失败" : audioStats.state !== "ready" ? "核对中" : \`${audioStats.has}/${audioStats.total}\`}\n`
);
replaceOrThrow(
  "app/components/WordFlashcardView.jsx",
  `{[["待补全", "资料缺失"], ["待归纳", "仅缺分类"]].map(([value, label]) => (`,
  `{[["待补全", "必须补全"], ["待修复", "结构异常"], ["待归纳", "仅缺分类"], ["待丰富", "可选丰富"]].map(([value, label]) => (`
);
replaceOrThrow(
  "app/components/WordFlashcardView.jsx",
  `                  aiRunState={aiRunState}\n                  pendingAiCount={missingCount}\n`,
  `                  aiRunState={aiRunState}\n                  qualityStats={qualityStats}\n                  pendingAiCount={missingCount}\n`
);

replaceOrThrow(
  "app/components/VocabAdminToolsPanel.jsx",
  `  aiRunState = null,\n  pendingAiCount = 0,\n`,
  `  aiRunState = null,\n  qualityStats = {},\n  pendingAiCount = 0,\n`
);
replaceOrThrow(
  "app/components/VocabAdminToolsPanel.jsx",
  `                    <div className="ai-warning">\n                      AI 工具统一使用“一个主释义、一个主例句、详细其他义项”的资料规则。单轮模式执行 100 词后停止；连续模式会自动进入下一轮，但可随时停止并带失败熔断。\n                    </div>\n`,
  `                    <div className="ai-warning">\n                      默认付费队列只处理必须补全、结构异常和分类缺失。搭配数量不足只算“可选丰富”，不会自动重写整个词库。\n                    </div>\n                    <div className="duplicate-box">\n                      <div><strong>必须补全：</strong>{qualityStats.missing || 0}</div>\n                      <div><strong>结构异常：</strong>{qualityStats.repairMissing || 0}</div>\n                      <div><strong>仅缺分类：</strong>{qualityStats.classifyMissing || 0}</div>\n                      <div><strong>可选丰富：</strong>{qualityStats.enrichmentThin || 0}（不进入默认付费队列）</div>\n                      <div><strong>词族复核 / 独立词候选：</strong>{qualityStats.familyReview || 0} / {qualityStats.familyPromotion || 0}</div>\n                    </div>\n`
);
replaceOrThrow(
  "app/components/VocabAdminToolsPanel.jsx",
  `<p><strong>单轮补全：</strong>最多 100 词；每请求 10 词、最多 5 路并发，完成后停止。</p>`,
  `<p><strong>单轮补全：</strong>最多 100 词；每请求 5 词、最多 3 路并发，完成后停止。</p>`
);
replaceOrThrow(
  "app/components/VocabAdminToolsPanel.jsx",
  `onClick={() => a.confirmAiCost?.("AI快速补全一轮：最多100词 / 10词每请求 / 5路并发（会扣费）") && a.generateHundredByFiveBatch?.()}>\n                        补全一轮 · 最多100词`,
  `onClick={() => a.confirmAiCost?.("AI修复必须补全项：最多100词 / 5词每请求 / 3路并发（会扣费）") && a.generateHundredByFiveBatch?.()}>\n                        修复必须项 · 最多100词`
);
replaceOrThrow(
  "app/components/VocabAdminToolsPanel.jsx",
  `AI连续补全未完成资料：当前资料字段缺失约 ${pendingAiCount} 词；每轮最多100词，直到队列完成、手动停止或触发失败熔断（会持续扣费）`,
  `AI连续修复必须补全项：当前约 ${pendingAiCount} 词；可选丰富不会进入本队列。每轮最多100词，直到队列完成、手动停止或触发失败熔断（会持续扣费）`
);
replaceOrThrow(
  "app/components/VocabAdminToolsPanel.jsx",
  `                        连续补全未完成 · 可暂停`,
  `                        连续修复必须项 · 可暂停`
);
replaceOrThrow(
  "app/components/VocabAdminToolsPanel.jsx",
  `onClick={() => a.confirmAiCost?.("AI重做异常资料：最多100词 / 每请求10词 / 2并发（会扣费）") && a.aiStableRepairWrongWords10x2?.()}>\n                        AI重做异常资料 · 最多100词 / 2并发`,
  `onClick={() => a.confirmAiCost?.("AI修复结构异常资料：最多100词 / 每请求5词 / 2并发（会扣费）") && a.aiStableRepairWrongWords10x2?.()}>\n                        修复结构异常 · 最多100词`
);

replaceOrThrow(
  "scripts/build-manual-vocab-audit-queue.mjs",
  `import path from "node:path";\n`,
  `import path from "node:path";\nimport { getWordEnrichmentStatus } from "../app/lib/vocab/word-quality-status.mjs";\n`
);
replaceOrThrow(
  "scripts/build-manual-vocab-audit-queue.mjs",
  `  const validCommon = common.filter((item) => item.valid);\n  const validPhrase = phrase.filter((item) => item.valid);\n`,
  `  const validCommon = common.filter((item) => item.valid);\n  const validPhrase = phrase.filter((item) => item.valid);\n  const enrichment = getWordEnrichmentStatus(word);\n`
);
replaceOrThrow(
  "scripts/build-manual-vocab-audit-queue.mjs",
  `  const reviewReasons = [];\n  if (missingCoreFields.length) reviewReasons.push("missing-core-content");\n  if (validCommon.length < 4) reviewReasons.push("common-collocations-under-four");\n  if (validPhrase.length < 4) reviewReasons.push("phrase-collocations-under-four");\n  if (common.some((item) => !item.valid)) reviewReasons.push("invalid-common-collocation");\n  if (phrase.some((item) => !item.valid)) reviewReasons.push("invalid-phrase-collocation");\n  if (missingClassificationFields.length) reviewReasons.push("missing-classification");\n  if (invalidOtherMeaningIndexes.length) reviewReasons.push("invalid-other-meanings");\n`,
  `  const reviewReasons = [];\n  const optionalEnrichmentReasons = [];\n  if (missingCoreFields.length) reviewReasons.push("missing-core-content");\n  if (common.some((item) => !item.valid)) reviewReasons.push("invalid-common-collocation");\n  if (phrase.some((item) => !item.valid)) reviewReasons.push("invalid-phrase-collocation");\n  if (missingClassificationFields.length) reviewReasons.push("missing-classification");\n  if (invalidOtherMeaningIndexes.length) reviewReasons.push("invalid-other-meanings");\n  if (enrichment.needsOptionalEnrichment) optionalEnrichmentReasons.push("optional-enrichment-below-tier-target");\n`
);
replaceOrThrow(
  "scripts/build-manual-vocab-audit-queue.mjs",
  `    validCommonCount: validCommon.length,\n    validPhraseCount: validPhrase.length,\n    commonNeedsManualCompletion: validCommon.length < 4,\n    phraseNeedsManualCompletion: validPhrase.length < 4,\n    invalidOtherMeaningIndexes,\n    reviewReasons,\n    needsManualReview: reviewReasons.length > 0,\n    priority: missingCoreFields.length\n      ? "P1"\n      : (validCommon.length < 4 || validPhrase.length < 4 || invalidOtherMeaningIndexes.length)\n        ? "P2"\n        : missingClassificationFields.length\n          ? "P3"\n          : "READY"\n`,
  `    validCommonCount: validCommon.length,\n    validPhraseCount: validPhrase.length,\n    commonNeedsManualCompletion: enrichment.enrichmentCounts.common < enrichment.enrichmentTarget.standard.common,\n    phraseNeedsManualCompletion: enrichment.enrichmentCounts.phrase < enrichment.enrichmentTarget.standard.phrase,\n    enrichmentStatus: enrichment.enrichmentStatus,\n    enrichmentTarget: enrichment.enrichmentTarget,\n    optionalEnrichmentReasons,\n    needsOptionalEnrichment: enrichment.needsOptionalEnrichment,\n    invalidOtherMeaningIndexes,\n    reviewReasons,\n    needsManualReview: reviewReasons.length > 0,\n    priority: missingCoreFields.length || invalidOtherMeaningIndexes.length || common.some((item) => !item.valid) || phrase.some((item) => !item.valid)\n      ? "P1"\n      : missingClassificationFields.length\n        ? "P2"\n        : "READY"\n`
);
replaceOrThrow(
  "scripts/build-manual-vocab-audit-queue.mjs",
  `const collocationReview = reviewEntries.filter((entry) => (\n  entry.commonNeedsManualCompletion ||\n  entry.phraseNeedsManualCompletion ||\n  entry.commonCollocations.some((item) => !item.valid) ||\n  entry.phraseCollocations.some((item) => !item.valid)\n));\n`,
  `const optionalEnrichment = entries.filter((entry) => entry.needsOptionalEnrichment);\n`
);
replaceOrThrow(
  "scripts/build-manual-vocab-audit-queue.mjs",
  `  manualReviewCount: reviewEntries.length,\n`,
  `  manualReviewCount: reviewEntries.length,\n  optionalEnrichmentCount: optionalEnrichment.length,\n`
);
replaceOrThrow(
  "scripts/build-manual-vocab-audit-queue.mjs",
  `  note: "This report is deterministic triage only. It does not modify the lexicon and does not certify semantic correctness."\n`,
  `  note: "Required repair queues are separated from optional enrichment. Fewer than four collocations alone no longer makes an entry defective."\n`
);
replaceOrThrow(
  "scripts/build-manual-vocab-audit-queue.mjs",
  `writeJsonLines("collocation-review.jsonl", collocationReview);\n`,
  `writeJsonLines("optional-enrichment.jsonl", optionalEnrichment);\n`
);

replaceOrThrow(
  "app/lib/vocab/__tests__/admin-ai-batch-plan.test.mjs",
  `    contentMissing: 2,\n    classificationMissing: 1,\n    total: 4\n`,
  `    contentMissing: 2,\n    contentInvalid: 0,\n    classificationMissing: 1,\n    enrichmentThin: 4,\n    enrichmentStandard: 0,\n    enrichmentRich: 0,\n    familyReview: 0,\n    familyPromotion: 0,\n    total: 4\n`
);

console.log("Applied required-quality / optional-enrichment separation patch.");
