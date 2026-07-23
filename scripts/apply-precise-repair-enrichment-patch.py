from pathlib import Path


def replace_once(path: str, before: str, after: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {before[:80]!r}")
    file_path.write_text(text.replace(before, after, 1), encoding="utf-8")


def replace_count(path: str, before: str, after: str, expected: int) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(before)
    if count != expected:
        raise RuntimeError(f"Expected {expected} matches in {path}, found {count}: {before[:80]!r}")
    file_path.write_text(text.replace(before, after), encoding="utf-8")


plan = "app/lib/vocab/admin-ai-batch-plan.mjs"
replace_once(
    plan,
    '''  isMissingClassification,
  summarizeWordQuality
} from "./word-quality-status.mjs";''',
    '''  isMissingClassification,
  needsOptionalWordEnrichment,
  summarizeWordQuality
} from "./word-quality-status.mjs";'''
)
replace_once(
    plan,
    '''function needsRepair(word) {
  return isInvalidAiContent(word) || isLikelyWrongAiWord(word) || hasHeadwordRepair(word?.word);
}''',
    '''function needsStructureRepair(word) {
  return isInvalidAiContent(word) || isLikelyWrongAiWord(word);
}

function needsRepair(word) {
  return needsStructureRepair(word) || hasHeadwordRepair(word?.word);
}'''
)
replace_once(plan, '''    { needsRepair }
  );''', '''    { needsRepair: needsStructureRepair }
  );''')
replace_once(plan, '''    const wrong = needsRepair(w);''', '''    const wrong = needsStructureRepair(w);''')
replace_count(plan, '''selectIndexedWords(words, needsRepair,''', '''selectIndexedWords(words, needsStructureRepair,''', 2)
replace_once(
    plan,
    '''export function buildBulkCompletionPlan(words, options = {}) {''',
    '''function enrichmentPriority(word = {}) {
  let score = 0;
  if (word.favorite) score += 100;
  if (String(word.status || "").trim() === "不熟") score += 40;
  const difficulty = String(word.difficulty || "").trim();
  if (difficulty === "基础高频") score += 30;
  else if (difficulty === "中级核心") score += 20;
  else if (difficulty === "高级加分") score += 10;
  return score;
}

export function buildEnrichmentPlan(words, options = {}) {
  const maxTargets = resolveTargetLimit(options.maxTargets, PAID_AI_LIMITS.fast);
  const excludedWordKeys = options.excludeWordKeys instanceof Set
    ? options.excludeWordKeys
    : new Set(options.excludeWordKeys || []);
  const candidates = [];

  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (!isPaidAiEligibleWord(w)) continue;
    const key = normalizeWord(w.word);
    if (!key || excludedWordKeys.has(key) || hasHeadwordRepair(w.word)) continue;
    if (getUnifiedQualityQueue(w, { needsRepair: needsStructureRepair(w) }) !== "ready") continue;
    if (!needsOptionalWordEnrichment(w)) continue;
    candidates.push({ w, i, priority: enrichmentPriority(w) });
  }

  candidates.sort((left, right) => right.priority - left.priority || left.i - right.i);
  const targets = candidates.slice(0, maxTargets).map(({ w, i }) => ({ w, i, enrichment: true }));
  return buildPlan(targets, {
    batchSize: PAID_AI_LIMITS.batchSize,
    concurrency: PAID_AI_LIMITS.concurrency
  });
}

export function buildBulkCompletionPlan(words, options = {}) {'''
)

helpers = "app/lib/vocab/page-word-helpers.mjs"
replace_count(helpers, '''.slice(0, 3);''', '''.slice(0, 4);''', 2)

merge_file = "app/lib/vocab/ai-write-merge.mjs"
replace_once(
    merge_file,
    '''import { USER_STATE_FIELDS, wordIdentity } from "./word-cache-meta.mjs";''',
    '''import { USER_STATE_FIELDS, wordIdentity } from "./word-cache-meta.mjs";
import {
  AI_WRITE_MODES,
  mergeOptionalEnrichment,
  mergePreciseStructureRepair
} from "./ai-field-repair-policy.mjs";'''
)
replace_once(
    merge_file,
    '''export function mergeAiWriteWithExisting(existingWord = {}, candidateWord = {}) {
  if (!candidateWord || typeof candidateWord !== "object") return candidateWord;
  if (!Object.prototype.hasOwnProperty.call(candidateWord, AI_REPLACE_EXISTING_FIELD)) {''',
    '''export function mergeAiWriteWithExisting(existingWord = {}, candidateWord = {}) {
  if (!candidateWord || typeof candidateWord !== "object") return candidateWord;

  if (candidateWord.aiWriteMode === AI_WRITE_MODES.PRECISE_STRUCTURE_REPAIR) {
    return mergePreciseStructureRepair(existingWord, candidateWord);
  }
  if (candidateWord.aiWriteMode === AI_WRITE_MODES.OPTIONAL_ENRICHMENT) {
    return mergeOptionalEnrichment(existingWord, candidateWord);
  }

  if (!Object.prototype.hasOwnProperty.call(candidateWord, AI_REPLACE_EXISTING_FIELD)) {'''
)

hook = "app/hooks/useHomeLexiconAdmin.ai.js"
replace_once(
    hook,
    '''  buildClassificationPlan,
  buildCleanWordsPlan,''',
    '''  buildClassificationPlan,
  buildCleanWordsPlan,
  buildEnrichmentPlan,'''
)
replace_once(
    hook,
    '''} from "../lib/vocab/ai-write-merge.mjs";
''',
    '''} from "../lib/vocab/ai-write-merge.mjs";
import { needsOptionalWordEnrichment } from "../lib/vocab/word-quality-status.mjs";
'''
)
replace_once(
    hook,
    '''              status: existing.status || "",
              aiWrongRepairedAt: Date.now()
            }));''',
    '''              status: existing.status || "",
              aiWriteMode: "precise-structure-repair",
              aiWrongRepairedAt: Date.now()
            }));'''
)

enrichment_code = '''  function countEnrichmentTargets(sourceWords, excludedWordKeys = new Set()) {
    return buildEnrichmentPlan(sourceWords, {
      maxTargets: Infinity,
      excludeWordKeys: excludedWordKeys
    }).targets.length;
  }

  async function executeEnrichmentRound(sourceWords, options = {}) {
    const {
      excludedWordKeys = new Set(),
      roundNumber = 1,
      signal
    } = options;
    const { targets, chunks, workerCount } = buildEnrichmentPlan(sourceWords, {
      excludeWordKeys: excludedWordKeys
    });

    if (!targets.length) {
      return {
        words: sourceWords,
        total: 0,
        filled: 0,
        failed: 0,
        failedWordKeys: [],
        aborted: Boolean(signal?.aborted)
      };
    }

    const generatedByInputId = new Map();
    const failedWordKeys = new Set();
    const failureDetails = [];

    await runAdminAiBatch({
      chunks,
      workerCount,
      signal,
      maxRetries: 1,
      allowAutomaticRetry: true,
      shouldRetry: ({ error }) => error?.retryable === true,
      retryDelayMs: ({ error, workerId }) => error?.retryAfterMs || (1200 + workerId * 250),
      onChunkStart({ chunk, workerId, completedItems }) {
        const preview = chunk.map(({ w }) => w.word).slice(0, 5).join(", ");
        setBatchInfo(
          `AI丰富第 ${roundNumber} 轮：${completedItems} / ${targets.length} ｜ 第 ${workerId} 路：${preview}${chunk.length > 5 ? "..." : ""}`
        );
      },
      async executeChunk({ chunk }) {
        const res = await fetch("/api/generate-words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: chunk.map(({ w }) => requestItemForWord(w)),
            force: true
          }),
          signal
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw retryableBatchError(
            data?.detail || data?.error || `AI丰富接口返回 HTTP ${res.status}`,
            res.status,
            res.headers?.get?.("retry-after")
          );
        }
        if (!Array.isArray(data?.items) || !data.items.length) {
          throw retryableBatchError("AI丰富批次没有返回可用词条", 422);
        }

        const entriesByInputId = indexAiResponses(data.items);
        for (const target of chunk) {
          const writeTarget = targetForWord(target.w);
          const entry = entriesByInputId.get(writeTarget.inputId);
          const key = normalizeWord(target.w.word);
          if (entry) generatedByInputId.set(writeTarget.inputId, entry);
          else if (key) failedWordKeys.add(key);
        }
      },
      onRetry({ workerId, error }) {
        setBatchInfo(`AI丰富第 ${workerId} 路失败，正在重试：${error.message}`);
      },
      onChunkError({ chunk, workerId, error }) {
        if (signal?.aborted || error?.name === "AbortError") return;
        for (const { w } of chunk) {
          const key = normalizeWord(w.word);
          if (key) failedWordKeys.add(key);
        }
        if (error?.message && !failureDetails.includes(error.message)) failureDetails.push(error.message);
        setBatchInfo(`AI丰富第 ${workerId} 路失败：${error.message}`);
      },
      onChunkSettled({ completedItems, remainingChunks }) {
        setBatchInfo(
          `AI丰富第 ${roundNumber} 轮：${Math.min(completedItems, targets.length)} / ${targets.length} ｜ 已返回 ${generatedByInputId.size} ｜ 失败 ${failedWordKeys.size} ｜ 剩余批次 ${remainingChunks}`
        );
      }
    });

    let nextWords = sourceWords;
    let enriched = 0;
    for (const { w } of targets) {
      const writeTarget = targetForWord(w);
      const entry = generatedByInputId.get(writeTarget.inputId);
      const key = normalizeWord(w.word);
      if (!entry) continue;

      try {
        nextWords = applyIdentityUpdate(nextWords, writeTarget, entry, (existing) => ({
          ...entry,
          aiWriteMode: "optional-enrichment",
          collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
          phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations),
          status: existing.status || "",
          aiEnrichedAt: Date.now()
        }));
        const updated = resolveWordWriteTarget(nextWords, writeTarget).word;
        if (needsOptionalWordEnrichment(updated)) {
          if (key) failedWordKeys.add(key);
        } else {
          enriched += 1;
          if (key) failedWordKeys.delete(key);
        }
      } catch (error) {
        if (key) failedWordKeys.add(key);
        if (error?.message && !failureDetails.includes(error.message)) failureDetails.push(error.message);
      }
    }

    return {
      words: nextWords,
      total: targets.length,
      filled: enriched,
      failed: failedWordKeys.size,
      failedWordKeys: [...failedWordKeys],
      error: failureDetails[0] || "",
      aborted: Boolean(signal?.aborted)
    };
  }

  async function enrichOptionalBatch() {
    try {
      setLoading(true);
      setBatchInfo("");
      const result = await executeEnrichmentRound(words);
      if (!result.total) {
        setToast("没有可选丰富词条，或必须修复/分类队列尚未完成");
        return result;
      }
      setWords(result.words);
      setBatchInfo("");
      setToast(`AI可选丰富完成：处理 ${result.total} 个，达到标准 ${result.filled} 个，未达标或失败 ${result.failed} 个`);
      return result;
    } catch (error) {
      setToast(error.message || "AI可选丰富失败");
      return { words, total: 0, failed: 0, filled: 0, failedWordKeys: [] };
    } finally {
      setLoading(false);
    }
  }

  async function startContinuousAiEnrichment() {
    const controlRef = aiRunControlRef || fallbackAiRunControlRef;
    if (controlRef.current?.running) {
      setToast("已有连续 AI 任务正在运行");
      return;
    }

    const initialRemaining = countEnrichmentTargets(words);
    if (!initialRemaining) {
      setToast("没有可选丰富词条，或必须修复/分类队列尚未完成");
      return;
    }

    const controller = new AbortController();
    controlRef.current = { controller, running: true };
    setLoading(true);
    setAiRunState?.({
      mode: "enrichment",
      status: "running",
      rounds: 0,
      processed: 0,
      filled: 0,
      failed: 0,
      remaining: initialRemaining,
      initialRemaining
    });

    try {
      const result = await runContinuousAiCompletion({
        initialWords: words,
        signal: controller.signal,
        maxRounds: Math.min(
          CONTINUOUS_AI_POLICY.maxRounds,
          Math.ceil(initialRemaining / 100) + 1
        ),
        countRemaining: (snapshot, excludedWordKeys) => (
          countEnrichmentTargets(snapshot, excludedWordKeys)
        ),
        executeRound: async ({ words: snapshot, roundNumber, failedWordKeys, signal }) => {
          const roundResult = await executeEnrichmentRound(snapshot, {
            excludedWordKeys: failedWordKeys,
            roundNumber,
            signal
          });
          if (roundResult.total > 0) setWords(roundResult.words);
          return roundResult;
        },
        onProgress(progress) {
          setAiRunState?.({ ...progress, mode: "enrichment" });
        }
      });

      const status = result.reason === "completed"
        ? "completed"
        : result.reason === "completed-with-failures"
          ? "completed-with-failures"
          : result.reason;
      setAiRunState?.({ ...result, mode: "enrichment", status });
      setBatchInfo("");

      if (result.reason === "stopped") {
        setToast(`AI连续丰富已停止：达到标准 ${result.filled} 个，剩余 ${result.remaining} 个`);
      } else if (result.reason === "fused") {
        setToast(`AI连续丰富已熔断：达到标准 ${result.filled} 个，失败 ${result.failed} 个`);
      } else if (result.reason === "limit") {
        setToast(`AI连续丰富达到安全轮次上限：达到标准 ${result.filled} 个，剩余 ${result.remaining} 个`);
      } else {
        setToast(`AI连续丰富结束：${result.rounds} 轮，达到标准 ${result.filled} 个，失败 ${result.failed} 个`);
      }
      return result;
    } catch (error) {
      const stopped = controller.signal.aborted || error?.name === "AbortError";
      setAiRunState?.((previous) => ({
        ...(previous || {}),
        mode: "enrichment",
        status: stopped ? "stopped" : "failed",
        error: stopped ? "" : (error.message || "连续丰富失败")
      }));
      setToast(stopped ? "AI连续丰富已停止" : (error.message || "AI连续丰富失败"));
      return undefined;
    } finally {
      if (controlRef.current?.controller === controller) {
        controlRef.current = { controller: null, running: false };
      }
      setBatchInfo("");
      setLoading(false);
    }
  }

'''
replace_once(hook, '''  async function startContinuousAiCompletion() {''', enrichment_code + '''  async function startContinuousAiCompletion() {''')
replace_once(hook, '''      setToast("当前没有正在运行的连续补全");''', '''      setToast("当前没有正在运行的连续 AI 任务");''')
replace_once(hook, '''    setBatchInfo("正在停止连续补全，已完成的轮次会保留...");''', '''    setBatchInfo("正在停止连续 AI 任务，已完成的轮次会保留...");''')
replace_once(
    hook,
    '''    aiStableRepairWrongWords10x2,
    generateHundredByFiveBatch,
    startContinuousAiCompletion,''',
    '''    aiStableRepairWrongWords10x2,
    enrichOptionalBatch,
    startContinuousAiEnrichment,
    generateHundredByFiveBatch,
    startContinuousAiCompletion,'''
)

panel = "app/components/VocabAdminToolsPanel.jsx"
replace_once(
    panel,
    '''  const continuousActive = ["running", "stopping"].includes(aiRunState?.status);
  const continuousStatusLabel = {
    running: "连续补全运行中",
    stopping: "正在安全停止",
    completed: "连续补全已完成",
    "completed-with-failures": "仍有失败词待处理",
    stopped: "连续补全已停止",
    fused: "已触发失败熔断",
    limit: "已到安全轮次上限",
    failed: "连续补全失败"
  }[aiRunState?.status] || "";''',
    '''  const continuousActive = ["running", "stopping"].includes(aiRunState?.status);
  const continuousModeLabel = aiRunState?.mode === "enrichment" ? "连续丰富" : "连续补全";
  const continuousStatusLabel = {
    running: `${continuousModeLabel}运行中`,
    stopping: "正在安全停止",
    completed: `${continuousModeLabel}已完成`,
    "completed-with-failures": "仍有失败词待处理",
    stopped: `${continuousModeLabel}已停止`,
    fused: "已触发失败熔断",
    limit: "已到安全轮次上限",
    failed: `${continuousModeLabel}失败`
  }[aiRunState?.status] || "";'''
)
replace_once(
    panel,
    '''                      <p><strong>异常重做：</strong>只重做含占位符或明显异常内容的资料，不修改词头。</p>''',
    '''                      <p><strong>异常重做：</strong>按字段精准修复，保留词形、词族、ID、收藏和学习进度。</p>
                      <p><strong>可选丰富：</strong>只合并自然搭配与句型，最多 4+4；不覆盖释义、例句、分类或词族。</p>'''
)
replace_once(
    panel,
    '''                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI修复结构异常资料：最多100词 / 每请求5词 / 2并发（会扣费）") && a.aiStableRepairWrongWords10x2?.()}>
                        修复结构异常 · 最多100词
                      </button>''',
    '''                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI精准修复结构异常：最多100词 / 每请求5词 / 2并发；不改词族和学习状态（会扣费）") && a.aiStableRepairWrongWords10x2?.()}>
                        精准修复结构异常 · 最多100词
                      </button>
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.(`AI丰富可选词条：当前约 ${qualityStats.enrichmentThin || 0} 词；本轮最多100词，只补搭配和句型（会扣费）`) && a.enrichOptionalBatch?.()}>
                        丰富可选项 · 最多100词
                      </button>
                      <button className="small-btn ai-paid ai-continuous-start" disabled={loading} onClick={() => a.confirmAiCost?.(`AI连续丰富可选词条：当前约 ${qualityStats.enrichmentThin || 0} 词；逐轮处理，可随时停止（会持续扣费）`) && a.startContinuousAiEnrichment?.()}>
                        连续丰富可选项 · 可暂停
                      </button>'''
)
replace_once(
    panel,
    '''                        {aiRunState?.status === "stopping" ? "正在停止..." : "停止连续补全"}''',
    '''                        {aiRunState?.status === "stopping" ? "正在停止..." : "停止连续任务"}'''
)

print("Precise repair and optional enrichment patch applied.")
