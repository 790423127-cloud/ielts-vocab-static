from pathlib import Path


def replace_once(path: str, before: str, after: str) -> None:
    file_path = Path(path)
    source = file_path.read_text(encoding="utf-8")
    if before not in source:
        if after in source:
            print(f"already applied: {path}")
            return
        raise RuntimeError(f"patch anchor not found in {path}: {before[:120]!r}")
    if source.count(before) != 1:
        raise RuntimeError(f"patch anchor is not unique in {path}")
    file_path.write_text(source.replace(before, after, 1), encoding="utf-8")


replace_once(
    "app/lib/vocab/word-flashcard-study-pool.mjs",
    '''import {
  isMissingAiFields,
  isMissingClassification
} from "./word-quality-status.mjs";''',
    '''import {
  getWordEnrichmentStatus,
  getWordQualityStatus,
  isMissingAiFields,
  isMissingClassification
} from "./word-quality-status.mjs";'''
)
replace_once(
    "app/lib/vocab/word-flashcard-study-pool.mjs",
    '''    if (filter.value === "待补全") return isMissingAiFields(word);
    if (filter.value === "待归纳") return !isMissingAiFields(word) && isMissingClassification(word);''',
    '''    if (filter.value === "待补全") return isMissingAiFields(word);
    if (filter.value === "待修复") return getWordQualityStatus(word).contentInvalid;
    if (filter.value === "待归纳") {
      const quality = getWordQualityStatus(word);
      return !quality.contentMissing && !quality.contentInvalid && isMissingClassification(word);
    }
    if (filter.value === "待丰富") {
      const quality = getWordQualityStatus(word);
      return !quality.contentMissing && !quality.contentInvalid && getWordEnrichmentStatus(word).needsOptionalEnrichment;
    }'''
)
replace_once(
    "app/lib/vocab/word-flashcard-study-pool.mjs",
    '''  if (filter.type === "status" && filter.value === "待补全") return "资料缺失";
  if (filter.type === "status" && filter.value === "待归纳") return "仅缺分类";''',
    '''  if (filter.type === "status" && filter.value === "待补全") return "必须补全";
  if (filter.type === "status" && filter.value === "待修复") return "结构异常";
  if (filter.type === "status" && filter.value === "待归纳") return "仅缺分类";
  if (filter.type === "status" && filter.value === "待丰富") return "可选丰富";'''
)

replace_once(
    "app/page.jsx",
    'import { getUnifiedQualityQueue } from "./lib/vocab/word-quality-status.mjs";',
    'import { getWordQualityEvaluation } from "./lib/vocab/word-quality-status.mjs";'
)
replace_once(
    "app/page.jsx",
    '''      return { total: 0, physical: 0, references: 0, pending: 0, blurry: 0, unfamiliar: 0, familiar: 0, todayReviewed: 0, missing: 0, classifyMissing: 0, repairMissing: 0 };''',
    '''      return { total: 0, physical: 0, references: 0, pending: 0, blurry: 0, unfamiliar: 0, familiar: 0, todayReviewed: 0, missing: 0, classifyMissing: 0, repairMissing: 0, enrichmentThin: 0, familyReview: 0, familyPromotion: 0 };'''
)
replace_once(
    "app/page.jsx",
    '''    let repairMissing = 0;

    for (const word of words) {''',
    '''    let repairMissing = 0;
    let enrichmentThin = 0;
    let familyReview = 0;
    let familyPromotion = 0;
    const knownHeadwords = new Set(libraryWordMap.keys());

    for (const word of words) {'''
)
replace_once(
    "app/page.jsx",
    '''      const qualityQueue = getUnifiedQualityQueue(word, {
        needsRepair: isLikelyWrongAiWord(word) || hasHeadwordRepair(word.word)
      });
      if (qualityQueue === "completion") missing += 1;
      if (qualityQueue === "classification") classifyMissing += 1;
      if (qualityQueue === "repair") repairMissing += 1;''',
    '''      const quality = getWordQualityEvaluation(word, {
        needsRepair: isLikelyWrongAiWord(word) || hasHeadwordRepair(word.word),
        knownHeadwords
      });
      if (quality.lane === "completion") missing += 1;
      if (quality.lane === "classification") classifyMissing += 1;
      if (quality.lane === "repair") repairMissing += 1;
      if (quality.needsOptionalEnrichment) enrichmentThin += 1;
      if (quality.needsFamilyReview) familyReview += 1;
      if (quality.hasFamilyPromotionCandidate) familyPromotion += 1;'''
)
replace_once(
    "app/page.jsx",
    '''    return { total, physical: words.length, references, pending, blurry, unfamiliar, familiar, todayReviewed, missing, classifyMissing, repairMissing };
  }, [isWordFlashActive, words]);

  const familiarCount = wordLibraryStats.familiar;
  const missingCount = wordLibraryStats.missing;
  const classifyMissingCount = wordLibraryStats.classifyMissing;''',
    '''    return { total, physical: words.length, references, pending, blurry, unfamiliar, familiar, todayReviewed, missing, classifyMissing, repairMissing, enrichmentThin, familyReview, familyPromotion };
  }, [isWordFlashActive, words, libraryWordMap]);

  const familiarCount = wordLibraryStats.familiar;
  const missingCount = wordLibraryStats.missing;
  const classifyMissingCount = wordLibraryStats.classifyMissing;
  const repairMissingCount = wordLibraryStats.repairMissing;
  const enrichmentThinCount = wordLibraryStats.enrichmentThin;
  const familyReviewCount = wordLibraryStats.familyReview;
  const familyPromotionCount = wordLibraryStats.familyPromotion;'''
)
replace_once(
    "app/page.jsx",
    '''            familiarCount,
            missingCount,
            classifyMissingCount
''',
    '''            familiarCount,
            missingCount,
            classifyMissingCount,
            repairMissingCount,
            enrichmentThinCount,
            familyReviewCount,
            familyPromotionCount
'''
)
replace_once(
    "app/page.jsx",
    '''            aiRunState,
            duplicateInfo,
''',
    '''            aiRunState,
            qualityStats: wordLibraryStats,
            duplicateInfo,
'''
)

replace_once(
    "app/components/WordFlashcardView.jsx",
    '''    familiarCount,
    missingCount,
    classifyMissingCount
''',
    '''    familiarCount,
    missingCount,
    classifyMissingCount,
    repairMissingCount,
    enrichmentThinCount,
    familyReviewCount,
    familyPromotionCount
'''
)
replace_once(
    "app/components/WordFlashcardView.jsx",
    '''    aiRunState,
    duplicateInfo,
''',
    '''    aiRunState,
    qualityStats,
    duplicateInfo,
'''
)
replace_once(
    "app/components/WordFlashcardView.jsx",
    '''          可刷 {wordLibraryStats.total} · 词形参考 {wordLibraryStats.references} · 总记录 {wordLibraryStats.physical} · 待学习 {wordLibraryStats.pending} · 不熟 {wordLibraryStats.unfamiliar} · 已认识 {familiarCount} · 资料缺失 {missingCount} · 仅缺分类 {classifyMissingCount} · 音频 {audioStats.state === "error" ? "核对失败" : audioStats.state !== "ready" ? "核对中" : `${audioStats.has}/${audioStats.total}`}
''',
    '''          可刷 {wordLibraryStats.total} · 词形参考 {wordLibraryStats.references} · 总记录 {wordLibraryStats.physical} · 待学习 {wordLibraryStats.pending} · 不熟 {wordLibraryStats.unfamiliar} · 已认识 {familiarCount} · 必须补全 {missingCount} · 结构异常 {repairMissingCount} · 仅缺分类 {classifyMissingCount} · 可选丰富 {enrichmentThinCount} · 词族复核 {familyReviewCount} · 独立词候选 {familyPromotionCount} · 音频 {audioStats.state === "error" ? "核对失败" : audioStats.state !== "ready" ? "核对中" : `${audioStats.has}/${audioStats.total}`}
'''
)
replace_once(
    "app/components/WordFlashcardView.jsx",
    '''{[["待补全", "资料缺失"], ["待归纳", "仅缺分类"]].map(([value, label]) => (''',
    '''{[["待补全", "必须补全"], ["待修复", "结构异常"], ["待归纳", "仅缺分类"], ["待丰富", "可选丰富"]].map(([value, label]) => ('''
)
replace_once(
    "app/components/WordFlashcardView.jsx",
    '''                  aiRunState={aiRunState}
                  pendingAiCount={missingCount}
''',
    '''                  aiRunState={aiRunState}
                  qualityStats={qualityStats}
                  pendingAiCount={missingCount}
'''
)

replace_once(
    "app/components/VocabAdminToolsPanel.jsx",
    '''  aiRunState = null,
  pendingAiCount = 0,
''',
    '''  aiRunState = null,
  qualityStats = {},
  pendingAiCount = 0,
'''
)
replace_once(
    "app/components/VocabAdminToolsPanel.jsx",
    '''                    <div className="ai-warning">
                      AI 工具统一使用“一个主释义、一个主例句、详细其他义项”的资料规则。单轮模式执行 100 词后停止；连续模式会自动进入下一轮，但可随时停止并带失败熔断。
                    </div>
''',
    '''                    <div className="ai-warning">
                      默认付费队列只处理必须补全、结构异常和分类缺失。搭配数量不足只算“可选丰富”，不会自动重写整个词库。
                    </div>
                    <div className="duplicate-box">
                      <div><strong>必须补全：</strong>{qualityStats.missing || 0}</div>
                      <div><strong>结构异常：</strong>{qualityStats.repairMissing || 0}</div>
                      <div><strong>仅缺分类：</strong>{qualityStats.classifyMissing || 0}</div>
                      <div><strong>可选丰富：</strong>{qualityStats.enrichmentThin || 0}（不进入默认付费队列）</div>
                      <div><strong>词族复核 / 独立词候选：</strong>{qualityStats.familyReview || 0} / {qualityStats.familyPromotion || 0}</div>
                    </div>
'''
)
replace_once(
    "app/components/VocabAdminToolsPanel.jsx",
    '''<p><strong>单轮补全：</strong>最多 100 词；每请求 10 词、最多 5 路并发，完成后停止。</p>''',
    '''<p><strong>单轮补全：</strong>最多 100 词；每请求 5 词、最多 3 路并发，完成后停止。</p>'''
)
replace_once(
    "app/components/VocabAdminToolsPanel.jsx",
    '''onClick={() => a.confirmAiCost?.("AI快速补全一轮：最多100词 / 10词每请求 / 5路并发（会扣费）") && a.generateHundredByFiveBatch?.()}>
                        补全一轮 · 最多100词''',
    '''onClick={() => a.confirmAiCost?.("AI修复必须补全项：最多100词 / 5词每请求 / 3路并发（会扣费）") && a.generateHundredByFiveBatch?.()}>
                        修复必须项 · 最多100词'''
)
replace_once(
    "app/components/VocabAdminToolsPanel.jsx",
    '''AI连续补全未完成资料：当前资料字段缺失约 ${pendingAiCount} 词；每轮最多100词，直到队列完成、手动停止或触发失败熔断（会持续扣费）''',
    '''AI连续修复必须补全项：当前约 ${pendingAiCount} 词；可选丰富不会进入本队列。每轮最多100词，直到队列完成、手动停止或触发失败熔断（会持续扣费）'''
)
replace_once(
    "app/components/VocabAdminToolsPanel.jsx",
    '''                        连续补全未完成 · 可暂停''',
    '''                        连续修复必须项 · 可暂停'''
)
replace_once(
    "app/components/VocabAdminToolsPanel.jsx",
    '''onClick={() => a.confirmAiCost?.("AI重做异常资料：最多100词 / 每请求10词 / 2并发（会扣费）") && a.aiStableRepairWrongWords10x2?.()}>
                        AI重做异常资料 · 最多100词 / 2并发''',
    '''onClick={() => a.confirmAiCost?.("AI修复结构异常资料：最多100词 / 每请求5词 / 2并发（会扣费）") && a.aiStableRepairWrongWords10x2?.()}>
                        修复结构异常 · 最多100词'''
)

print("Applied quality queue UI patch.")
