"use client";
/**
 * Ai ops factory — split from useHomeLexiconAdmin (v2026-07-10.3)
 */
import {
  hasHeadwordRepair,
  isCompleteAiWord,
  isLikelyWrongAiWord,
  mergeWord,
  normalizePhraseItems,
  normalizeStringArray,
  normalizeWord,
  repairHeadwordLocally
} from "../lib/vocab/page-word-helpers.mjs";
import {
  buildClassificationPlan,
  buildCleanWordsPlan,
  buildEnrichmentPlan,
  buildFastCompletionPlan,
  buildGenerateMissingPlan,
  buildOneByOneCompletionPlan,
  buildSlowCompletionPlan,
  buildWrongRepairPlan
} from "../lib/vocab/admin-ai-batch-plan.mjs";
import { runAdminAiBatch } from "../lib/vocab/admin-ai-batch-runner.mjs";
import {
  CONTINUOUS_AI_POLICY,
  runContinuousAiCompletion
} from "../lib/vocab/admin-ai-continuous-runner.mjs";
import {
  applyAiResultByIdentity,
  captureWordWriteTarget,
  resolveWordWriteTarget
} from "../lib/vocab/ai-write-merge.mjs";
import {
  isInvalidAiContent,
  needsOptionalWordEnrichment
} from "../lib/vocab/word-quality-status.mjs";

function targetForWord(word) {
  return captureWordWriteTarget(word);
}

function requestItemForWord(word) {
  const target = targetForWord(word);
  return { inputId: target.inputId, word: target.requestedWord };
}

function indexAiResponses(items = []) {
  const byInputId = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const inputId = String(item?.inputId || "");
    if (!inputId) continue;
    if (byInputId.has(inputId)) {
      const error = new Error(`AI响应包含重复inputId：${inputId}`);
      error.code = "AI_INPUT_ID_CONFLICT";
      throw error;
    }
    byInputId.set(inputId, item);
  }
  return byInputId;
}

function applyIdentityUpdate(previousWords, target, response, buildCandidate, options = {}) {
  return applyAiResultByIdentity(
    previousWords,
    target,
    response,
    buildCandidate,
    options
  ).words;
}

function retryableBatchError(message, status = 0, retryAfter = "") {
  const error = new Error(message);
  error.status = Number(status) || 0;
  error.retryable = [429, 502, 503, 504].includes(error.status);
  const retryAfterSeconds = Number(retryAfter);
  error.retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds * 1000
    : 0;
  return error;
}

const fallbackAiRunControlRef = {
  current: {
    controller: null,
    running: false
  }
};

export function createAiOps(ctx) {
  const {
    words, setWords, index,
    setLoading, setToast, setBatchInfo, setDuplicateInfo,
    setAiRunState, aiRunControlRef,
    resetWordStudySessionState,
    prefillWordAudio, recordLocalChange
  } = ctx;

  async function cleanWordList() {
    try {
      setLoading(true);
      setBatchInfo("");

      const { targets, chunks, workerCount: concurrency } = buildCleanWordsPlan(words);

      if (!targets.length) {
        setToast("没有可整理的词条");
        return;
      }

      let failedWords = [];
      const cleanResults = new Map();
      const stableTargets = new Map(targets.map((target) => {
        const writeTarget = targetForWord(words[target.i]);
        return [target.id, { ...target, writeTarget }];
      }));
      const stableChunks = chunks.map((chunk) => (
        chunk.map((target) => stableTargets.get(target.id))
      ));

      await runAdminAiBatch({
        chunks: stableChunks,
        workerCount: concurrency,
        maxRetries: 1,
        shouldRetry: ({ error }) => error?.retryable === true,
        onChunkStart({ chunk, workerId, completedItems }) {
          const preview = chunk.map(({ text }) => text).slice(0, 6).join(", ");
          setBatchInfo(
            `AI深度整理词表：${completedItems} / ${targets.length} ｜ 第 ${workerId} 路：${preview}${chunk.length > 6 ? "..." : ""}`
          );
        },
        async executeChunk({ chunk }) {
          const res = await fetch("/api/clean-words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: chunk.map(({ writeTarget, text }) => ({
                id: writeTarget.inputId,
                text
              }))
            })
          });
          const data = await res.json();

          if (!res.ok) {
            throw retryableBatchError(data?.detail || data?.error || `HTTP ${res.status}`, res.status, res.headers.get("retry-after"));
          }

          (data.items || []).forEach((entry) => {
            cleanResults.set(String(entry.id), entry);
          });
        },
        onChunkError({ chunk }) {
          failedWords.push(...chunk.map(({ text }) => text));
        },
        onChunkSettled({ completedItems, remainingChunks }) {
          setBatchInfo(
            `AI深度整理词表：${Math.min(completedItems, targets.length)} / ${targets.length} ｜ 失败 ${failedWords.length} 个 ｜ 剩余批次 ${remainingChunks}`
          );
        }
      });

      let cleanedCount = 0;
      let changedCount = 0;
      let mergedCount = 0;

      setWords((prev) => {
        const cleaned = [...prev];

        for (const target of stableTargets.values()) {
          const entry = cleanResults.get(target.writeTarget.inputId);
          if (!entry) continue;
          const clean = String(entry.clean || "").trim();
          const resolved = resolveWordWriteTarget(cleaned, target.writeTarget);

          if (!clean) {
            cleaned.splice(resolved.index, 1);
            continue;
          }

          cleanedCount += 1;
          const changed = normalizeWord(clean) !== normalizeWord(resolved.word.word);
          if (!changed) continue;
          changedCount += 1;
          cleaned[resolved.index] = {
            ...resolved.word,
            word: clean,
            phonetic: "",
            pos: entry.type === "phrase" ? "phrase" : "",
            meaning: "",
            definition: "",
            example: "",
            exampleCn: "",
            collocations: [],
            phraseCollocations: [],
            ieltsUse: [],
            topics: [],
            difficulty: "",
            category: entry.type === "phrase" ? "AI深度整理词表 · 短语" : "AI深度整理词表 · 单词",
            status: resolved.word.status || "",
            favorite: Boolean(resolved.word.favorite)
          };
        }

        const map = new Map();

        cleaned.forEach((word) => {
          const key = normalizeWord(word.word);
          if (!key) return;

          if (map.has(key)) {
            mergedCount += 1;
            map.set(key, mergeWord(map.get(key), word));
          } else {
            map.set(key, word);
          }
        });

        return Array.from(map.values());
      });

      resetWordStudySessionState();
      setBatchInfo("");

      if (failedWords.length) {
        setToast(`AI深度整理词表完成，但有 ${failedWords.length} 个失败；改写 ${changedCount} 个，合并重复 ${mergedCount} 个`);
      } else {
        setToast(`AI深度整理词表完成：处理 ${cleanedCount} 个，改写 ${changedCount} 个，合并重复 ${mergedCount} 个`);
      }
    } catch (error) {
      setBatchInfo("");
      setToast(error.message || "AI 深度整理词表失败");
    } finally {
      setLoading(false);
    }
  }

  async function generateForIndex(targetIndex, options = {}) {
    const target = words[targetIndex];
    if (!target?.word) return null;
    const writeTarget = targetForWord(target);

    const force = !!options.force;

    if (!force && isCompleteAiWord(target)) {
      setToast("这个词已经补全，不需要调用 AI");
      return target;
    }

    const res = await fetch("/api/generate-word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        word: target.word,
        force,
        inputId: writeTarget.inputId
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || data?.detail || "AI 生成失败");
    }

    setWords((prev) => applyIdentityUpdate(
      prev,
      writeTarget,
      data,
      (existing) => ({
        ...data,
        ieltsUse: normalizeStringArray(data.ieltsUse || data.ielts_use),
        topics: normalizeStringArray(data.topics),
        difficulty: data.difficulty || existing.difficulty || "",
        collocations: normalizePhraseItems(data.collocations),
        phraseCollocations: normalizePhraseItems(data.phraseCollocations),
        status: existing.status || ""
      })
    ));

    return data;
  }

  function confirmAiCost(actionName) {
    return window.confirm(
      `${actionName}\n\n这个操作会调用 DeepSeek API，可能产生费用。\n\n建议：平时优先使用“安全本地规整 / 校验人工词形关系 / 修改当前单词 / 继续补全全部音频”。\n\n确定继续吗？`
    );
  }

  async function generateCurrent(options = {}) {
    const force = options.force !== false;

    try {
      setLoading(true);
      setBatchInfo("");
      await generateForIndex(index, { force });
      setToast(force ? "AI已修复当前词" : "DeepSeek 已补全当前词");
    } catch (error) {
      setToast(error.message || "AI 生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function aiRepairCurrentWordSymbol() {
    const currentWord = words[index];

    if (!currentWord?.word) {
      setToast("没有当前单词");
      return;
    }
    const writeTarget = targetForWord(currentWord);

    try {
      setLoading(true);
      setBatchInfo("AI 正在判断并修复当前词条符号...");

      const res = await fetch("/api/repair-word-symbol", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          word: currentWord.word,
          inputId: writeTarget.inputId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || data?.detail || "AI 修复当前词条符号失败");
      }

      const repairedWord = String(data.repairedWord || "").trim();

      if (!repairedWord) {
        throw new Error("AI 返回了空词条");
      }

      if (repairedWord === currentWord.word) {
        setToast(`AI判断无需修改：${currentWord.word}${data.reason ? "｜" + data.reason : ""}`);
        return;
      }

      setWords((prev) => {
        const nextWords = applyIdentityUpdate(
          prev,
          writeTarget,
          { ...data, word: repairedWord },
          (existing) => ({
            ...existing,
            word: repairedWord,
            aiSymbolRepairedAt: Date.now(),
            aiSymbolRepairReason: data.reason || ""
          }),
          { allowHeadwordChange: true }
        );
        recordLocalChange("AI修复当前单词符号", prev, nextWords);
        return nextWords;
      });

      setToast(`AI已修复当前单词符号：${currentWord.word} → ${repairedWord}${data.reason ? "｜" + data.reason : ""}`);
    } catch (error) {
      setToast(error.message || "AI修复当前单词符号失败");
    } finally {
      setBatchInfo("");
      setLoading(false);
    }
  }

  async function generateMissingBatch(options = {}) {
    const repairWrong = options.repairWrong !== false;
    const onlyWrong = !!options.onlyWrong;
    const modeName = onlyWrong
      ? "AI批量修复确定错词"
      : repairWrong
        ? "AI批量补全缺失+修复错词"
        : "AI批量补全缺失资料";

    try {
      setLoading(true);

      const { targets, chunks, workerCount: concurrency } = buildGenerateMissingPlan(words, {
        repairWrong,
        onlyWrong
      });

      if (!targets.length) {
        setToast(onlyWrong ? "没有发现确定错词" : repairWrong ? "没有发现缺失资料或明显错词" : "没有发现缺失资料");
        return { total: 0, failed: 0, repaired: 0 };
      }

      let failedWords = [];
      let repairedWords = 0;
      let completedMissing = 0;

      function applyGeneratedItems(chunk, items) {
        const itemMap = indexAiResponses(items);

        setWords((prev) => {
          let next = prev;

          chunk.items.forEach(({ w, wrong, missing }) => {
            const writeTarget = targetForWord(w);
            const entry = itemMap.get(writeTarget.inputId);

            if (!entry) {
              failedWords.push(w.word);
              return;
            }

            if (wrong) repairedWords += 1;
            if (missing) completedMissing += 1;

            next = applyIdentityUpdate(next, writeTarget, entry, (existing) => ({
              ...entry,
              ieltsUse: normalizeStringArray(entry.ieltsUse || entry.ielts_use),
              topics: normalizeStringArray(entry.topics),
              difficulty: entry.difficulty || existing.difficulty || "",
              collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
              phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations),
              status: existing.status || "",
              aiWrongRepairedAt: wrong ? Date.now() : existing.aiWrongRepairedAt
            }));
          });

          return next;
        });
      }

      await runAdminAiBatch({
        chunks,
        workerCount: concurrency,
        maxRetries: 1,
        getChunkSize: (chunk) => chunk.items.length,
        shouldRetry: ({ error }) => error?.retryable === true,
        onChunkStart({ chunk, workerId, completedItems }) {
          const wordList = chunk.items.map(({ w }) => w.word);
          const preview = wordList.slice(0, 5).join(", ");
          setBatchInfo(
            `${modeName} 20×5：${completedItems} / ${targets.length} ｜ 第 ${workerId} 路：${preview}${wordList.length > 5 ? "..." : ""}`
          );
        },
        async executeChunk({ chunk, workerId }) {
          const wordList = chunk.items.map(({ w }) => w.word);
          const res = await fetch("/api/generate-words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: chunk.items.map(({ w }) => requestItemForWord(w)),
              force: chunk.force
            })
          });
          const data = await res.json();

          if (!res.ok) {
            throw retryableBatchError(data?.detail || data?.error || `HTTP ${res.status}`, res.status, res.headers.get("retry-after"));
          }

          if (!Array.isArray(data.items) || !data.items.length) {
            failedWords.push(...wordList);
            setBatchInfo(`第 ${workerId} 路没有返回有效词条`);
            return;
          }

          applyGeneratedItems(chunk, data.items);
        },
        onRetry({ workerId, error }) {
          setBatchInfo(`第 ${workerId} 路失败，正在重试：${error.message}`);
        },
        onChunkError({ chunk, workerId, error }) {
          failedWords.push(...chunk.items.map(({ w }) => w.word));
          if (error?.retryable) setBatchInfo(`第 ${workerId} 路失败：${error.message}`);
        },
        onChunkSettled({ completedItems, remainingChunks }) {
          setBatchInfo(
            `${modeName} 20×5：${Math.min(completedItems, targets.length)} / ${targets.length} ｜ 已修错 ${repairedWords} 个 ｜ 失败 ${failedWords.length} 个 ｜ 剩余批次 ${remainingChunks}`
          );
        }
      });

      setBatchInfo("");

      setToast(
        `${modeName}完成：处理 ${targets.length} 个，修错 ${repairedWords} 个，补缺 ${completedMissing} 个，失败 ${failedWords.length} 个`
      );

      return {
        total: targets.length,
        repaired: repairedWords,
        completed: completedMissing,
        failed: failedWords.length
      };
    } catch (error) {
      setToast(error.message || "AI补全/修复失败");
    } finally {
      setLoading(false);
    }
  }

  async function aiCompletePendingAndUnclassifiedOneByOne() {
    try {
      setLoading(true);

      const { targets } = buildOneByOneCompletionPlan(words);

      if (!targets.length) {
        setToast("没有发现待补全、未归类或可修复错词");
        return { total: 0, failed: 0, filled: 0, repairedWordCount: 0 };
      }

      let filled = 0;
      let repairedWordCount = 0;
      const failed = [];
      const failedDetails = [];

      function normalizeCompletionEntry(entry, originalWord, existingWord) {
        const aiWord = String(entry?.word || "").trim();
        const localRepair = repairHeadwordLocally(existingWord || originalWord);
        const repairedWord = aiWord || localRepair || existingWord || originalWord;

        return {
          ...entry,
          // 逐个模式允许修正 word，用来查错词和补资料。
          word: repairedWord,
          ieltsUse: normalizeStringArray(entry.ieltsUse || entry.ielts_use),
          topics: normalizeStringArray(entry.topics),
          difficulty: entry.difficulty || "",
          collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
          phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations)
        };
      }

      function applyEntry(target, entry) {
        let applied = false;
        const writeTarget = targetForWord(target.w);

        setWords((prev) => {
          if (!entry) return prev;
          const next = applyIdentityUpdate(prev, writeTarget, entry, (existing) => {
            const beforeWord = String(existing.word || target.w.word || "").trim();
            const normalized = normalizeCompletionEntry(entry, target.w.word, beforeWord);
            const afterWord = String(normalized.word || beforeWord).trim();

            if (afterWord && normalizeWord(afterWord) !== normalizeWord(beforeWord)) {
              repairedWordCount += 1;
            }

            return {
              ...normalized,
              word: afterWord || beforeWord,
              difficulty: normalized.difficulty || existing.difficulty || "",
              status: existing.status || "",
              aiOneByOneCompletedAt: Date.now(),
              aiOneByOneWordRepairedAt: afterWord && normalizeWord(afterWord) !== normalizeWord(beforeWord) ? Date.now() : existing.aiOneByOneWordRepairedAt,
              originalBrokenWord: afterWord && normalizeWord(afterWord) !== normalizeWord(beforeWord) ? (existing.originalBrokenWord || beforeWord) : existing.originalBrokenWord
            };
          });

          applied = true;
          return next;
        });

        if (applied) filled += 1;
        return applied;
      }

      for (let position = 0; position < targets.length; position += 1) {
        const target = targets[position];
        const reasonText = [
          target.missing ? "待补全" : "",
          target.unclassified ? "未归类" : "",
          target.wrong ? "疑似错词" : "",
          target.truncated ? "截断词" : ""
        ].filter(Boolean).join("+");

        setBatchInfo(
          `AI逐个补全+查错词 1×1：${position + 1} / ${targets.length} ｜ ${target.w.word} ｜ ${reasonText}`
        );

        try {
          const writeTarget = targetForWord(target.w);
          const res = await fetch("/api/generate-word", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              word: target.w.word,
              force: target.wrong || target.truncated,
              inputId: writeTarget.inputId
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
          }

          const ok = applyEntry(target, data);

          if (!ok) {
            throw new Error("AI返回内容无法写入当前词");
          }
        } catch (error) {
          failed.push(target.w.word);
          failedDetails.push(`${target.w.word}: ${error.message || "逐个补全/查错失败"}`);
        }

        // 给 API 一点缓冲，避免连续请求太密。
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      setBatchInfo("");
      setToast(
        `AI逐个补全+查错词完成：处理 ${targets.length} 个，补全 ${filled} 个，改词 ${repairedWordCount} 个，失败 ${failed.length} 个${failedDetails[0] ? "｜失败示例：" + failedDetails.slice(0, 3).join("；") : ""}`
      );

      return {
        total: targets.length,
        filled,
        repairedWordCount,
        failed: failed.length,
        failedDetails
      };
    } catch (error) {
      setToast(error.message || "AI逐个补全+查错词失败");
    } finally {
      setLoading(false);
    }
  }

  async function aiSlowCompleteMissing10x1() {
    try {
      setLoading(true);

      const { targets, chunks } = buildSlowCompletionPlan(words);

      if (!targets.length) {
        setToast("没有发现缺失资料或可修复错字，不需要调用 AI");
        return { total: 0, failed: 0 };
      }

      let completed = 0;
      let filled = 0;
      let repairedWordCount = 0;
      const failed = [];
      const failedDetails = [];

      function normalizeCompletionEntry(entry, originalWord, existingWord) {
        const aiWord = String(entry?.word || "").trim();
        const localRepair = repairHeadwordLocally(existingWord || originalWord);
        const repairedWord = aiWord || localRepair || existingWord || originalWord;

        return {
          ...entry,
          // 慢速模式允许自动修正 word，例如 injur → injure。
          word: repairedWord,
          ieltsUse: normalizeStringArray(entry.ieltsUse || entry.ielts_use),
          topics: normalizeStringArray(entry.topics),
          difficulty: entry.difficulty || "",
          collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
          phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations)
        };
      }

      function applyEntries(chunk, items) {
        const responseMap = indexAiResponses(items);
        const missing = [];

        setWords((prev) => {
          let next = prev;

          chunk.forEach(({ w }) => {
            const writeTarget = targetForWord(w);
            const entry = responseMap.get(writeTarget.inputId);

            if (!entry) {
              missing.push({ w, reason: "AI没有返回可匹配词条" });
              return;
            }

            next = applyIdentityUpdate(next, writeTarget, entry, (existing) => {
              const beforeWord = String(existing.word || w.word || "").trim();
              const normalized = normalizeCompletionEntry(entry, w.word, beforeWord);
              const afterWord = String(normalized.word || beforeWord).trim();

              if (afterWord && normalizeWord(afterWord) !== normalizeWord(beforeWord)) {
                repairedWordCount += 1;
              }

              return {
                ...normalized,
                word: afterWord || beforeWord,
                difficulty: normalized.difficulty || existing.difficulty || "",
                status: existing.status || "",
                aiSlowCompletedAt: Date.now(),
                aiWordAutoRepairedAt: afterWord && normalizeWord(afterWord) !== normalizeWord(beforeWord) ? Date.now() : existing.aiWordAutoRepairedAt,
                originalBrokenWord: afterWord && normalizeWord(afterWord) !== normalizeWord(beforeWord) ? (existing.originalBrokenWord || beforeWord) : existing.originalBrokenWord
              };
            });
            filled += 1;
          });

          return next;
        });

        return missing;
      }

      async function completeSingle(item, reason = "") {
        try {
          const writeTarget = targetForWord(item.w);
          const res = await fetch("/api/generate-word", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              word: item.w.word,
              force: isLikelyWrongAiWord(item.w) || hasHeadwordRepair(item.w.word),
              inputId: writeTarget.inputId
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
          }

          const missing = applyEntries([item], [data]);

          if (missing.length) {
            throw new Error("AI返回词条无法写入");
          }
        } catch (error) {
          failed.push(item.w.word);
          failedDetails.push(`${item.w.word}: ${error.message || reason || "单词级补全/修错失败"}`);
        }
      }

      async function runChunk(chunk, chunkIndex, retry = 0) {
        const wordList = chunk.map(({ w }) => w.word);
        const preview = wordList.slice(0, 5).join(", ");

        setBatchInfo(
          `AI慢速补全+修错字 10×1：${completed} / ${targets.length} ｜ 第 ${chunkIndex + 1} 批：${preview}${wordList.length > 5 ? "..." : ""}`
        );

        try {
          const res = await fetch("/api/generate-words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: chunk.map(({ w }) => requestItemForWord(w)),
              // 慢速模式允许修错字，所以开启 force。
              force: true
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
          }

          if (!Array.isArray(data.items) || !data.items.length) {
            throw new Error("批量没有返回有效词条");
          }

          const missing = applyEntries(chunk, data.items);

          for (const item of missing) {
            await completeSingle(item, item.reason || "批量返回缺少这个词");
          }
        } catch (error) {
          if (retry < 2) {
            await new Promise((resolve) => setTimeout(resolve, 1500 * (retry + 1)));
            return runChunk(chunk, chunkIndex, retry + 1);
          }

          for (const item of chunk) {
            await completeSingle(item, error.message || "批量失败后单词级补救");
          }
        }
      }

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunk = chunks[chunkIndex];

        await runChunk(chunk, chunkIndex);

        completed += chunk.length;
        setBatchInfo(
          `AI慢速补全+修错字 10×1：${Math.min(completed, targets.length)} / ${targets.length} ｜ 已补全 ${filled} 个 ｜ 改词 ${repairedWordCount} 个 ｜ 失败 ${failed.length} 个`
        );
      }

      setBatchInfo("");
      setToast(`AI慢速补全+修错字完成：处理 ${targets.length} 个，补全 ${filled} 个，改词 ${repairedWordCount} 个，失败 ${failed.length} 个${failedDetails[0] ? "｜失败示例：" + failedDetails.slice(0, 3).join("；") : ""}`);

      return {
        total: targets.length,
        filled,
        repairedWordCount,
        failed: failed.length,
        failedDetails
      };
    } catch (error) {
      setToast(error.message || "AI慢速补全+修错字失败");
    } finally {
      setLoading(false);
    }
  }

  async function aiStableRepairWrongWords10x2() {
    try {
      setLoading(true);

      const { targets, chunks, workerCount: concurrency } = buildWrongRepairPlan(words);

      if (!targets.length) {
        setToast("没有发现确定错词");
        return { total: 0, failed: 0 };
      }

      let nextChunkIndex = 0;
      let completed = 0;
      let repaired = 0;
      const failed = [];
      const failedDetails = [];

      function applyEntries(chunk, items) {
        const itemMap = indexAiResponses(items);

        const missing = [];

        setWords((prev) => {
          let next = prev;

          chunk.forEach(({ w }) => {
            const writeTarget = targetForWord(w);
            const entry = itemMap.get(writeTarget.inputId);

            if (!entry) {
              missing.push({ w });
              return;
            }

            next = applyIdentityUpdate(next, writeTarget, entry, (existing) => ({
              ...entry,
              ieltsUse: normalizeStringArray(entry.ieltsUse || entry.ielts_use),
              topics: normalizeStringArray(entry.topics),
              difficulty: entry.difficulty || existing.difficulty || "",
              collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
              phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations),
              status: existing.status || "",
              aiWriteMode: "precise-structure-repair",
              aiWrongRepairedAt: Date.now()
            }));

            const updatedWord = resolveWordWriteTarget(next, writeTarget).word;
            if (isInvalidAiContent(updatedWord) || isLikelyWrongAiWord(updatedWord)) {
              if (!failed.includes(w.word)) failed.push(w.word);
              const reason = isLikelyWrongAiWord(updatedWord)
                ? "修复后仍命中异常判定"
                : "修复后其他义项结构仍无效";
              failedDetails.push(`${w.word}: ${reason}`);
            } else {
              repaired += 1;
            }
          });

          return next;
        });

        return missing;
      }

      async function repairSingle(item, reason = "") {
        try {
          const writeTarget = targetForWord(item.w);
          const res = await fetch("/api/generate-word", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              word: item.w.word,
              force: true,
              inputId: writeTarget.inputId
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
          }

          applyEntries([item], [data]);
        } catch (error) {
          failed.push(item.w.word);
          failedDetails.push(`${item.w.word}: ${error.message || reason || "单词级修复失败"}`);
        }
      }

      async function runChunk(chunk, workerId, retry = 0) {
        const wordList = chunk.map(({ w }) => w.word);
        const preview = wordList.slice(0, 5).join(", ");

        setBatchInfo(
          `AI稳定修复确定错词 10×2：${completed} / ${targets.length} ｜ 第 ${workerId} 路：${preview}${wordList.length > 5 ? "..." : ""}`
        );

        try {
          const res = await fetch("/api/generate-words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: chunk.map(({ w }) => requestItemForWord(w)),
              force: true
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
          }

          if (!Array.isArray(data.items) || !data.items.length) {
            throw new Error("批量没有返回有效词条");
          }

          const missing = applyEntries(chunk, data.items);

          for (const item of missing) {
            await repairSingle(item, "批量返回缺少这个词");
          }
        } catch (error) {
          if (retry < 2) {
            await new Promise((resolve) => setTimeout(resolve, 1200 * (retry + 1)));
            return runChunk(chunk, workerId, retry + 1);
          }

          for (const item of chunk) {
            await repairSingle(item, error.message || "批量失败后单词级补救");
          }
        }
      }

      async function worker(workerId) {
        while (nextChunkIndex < chunks.length) {
          const chunk = chunks[nextChunkIndex];
          nextChunkIndex += 1;

          try {
            await runChunk(chunk, workerId);
          } finally {
            completed += chunk.length;
            setBatchInfo(
              `AI稳定修复确定错词 10×2：${Math.min(completed, targets.length)} / ${targets.length} ｜ 已修复 ${repaired} 个 ｜ 失败 ${failed.length} 个`
            );
          }
        }
      }

      const workerCount = Math.min(concurrency, chunks.length);
      await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i + 1)));

      setBatchInfo("");
      setToast(`AI精准结构修复完成：尝试 ${targets.length} 个，真正退出异常队列 ${repaired} 个，仍需处理 ${failed.length} 个${failedDetails[0] ? "｜示例：" + failedDetails.slice(0, 3).join("；") : ""}`);

      return {
        total: targets.length,
        repaired,
        failed: failed.length,
        failedDetails
      };
    } catch (error) {
      setToast(error.message || "AI稳定修复确定错词失败");
    } finally {
      setLoading(false);
    }
  }

  function countFastCompletionTargets(sourceWords, excludedWordKeys = new Set()) {
    return buildFastCompletionPlan(sourceWords, {
      maxTargets: Infinity,
      excludeWordKeys: excludedWordKeys
    }).targets.length;
  }

  async function executeFastCompletionRound(sourceWords, options = {}) {
    const {
      excludedWordKeys = new Set(),
      roundNumber = 1,
      signal
    } = options;
    const { targets, chunks, workerCount: concurrency } = buildFastCompletionPlan(sourceWords, {
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
    let attemptedItems = 0;

    function markChunkFailed(chunk) {
      for (const { w } of chunk) {
        const key = normalizeWord(w.word);
        if (key) failedWordKeys.add(key);
      }
    }

    function collectGeneratedItems(chunk, items) {
      const entriesByInputId = indexAiResponses(items);

      for (const target of chunk) {
        const writeTarget = targetForWord(target.w);
        const key = normalizeWord(target.w.word);
        const entry = entriesByInputId.get(writeTarget.inputId);
        if (entry) generatedByInputId.set(writeTarget.inputId, entry);
        else if (key) failedWordKeys.add(key);
      }
    }

    async function runChunks(batchChunks, workerCount) {
      if (!batchChunks.length || signal?.aborted) return;
      const result = await runAdminAiBatch({
        chunks: batchChunks,
        workerCount,
        signal,
        maxRetries: 1,
        allowAutomaticRetry: true,
        shouldRetry: ({ error }) => error?.retryable === true,
        retryDelayMs: ({ error, workerId }) => error?.retryAfterMs || (1200 + workerId * 250),
        onChunkStart({ chunk, workerId, completedItems }) {
          const wordList = chunk.map(({ w }) => w.word);
          const preview = wordList.slice(0, 5).join(", ");
          setBatchInfo(
            `AI补全第 ${roundNumber} 轮：${attemptedItems + completedItems} / ${targets.length} ｜ 第 ${workerId} 路：${preview}${wordList.length > 5 ? "..." : ""}`
          );
        },
        async executeChunk({ chunk }) {
          const res = await fetch("/api/generate-words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: chunk.map(({ w }) => requestItemForWord(w))
            }),
            signal
          });
          const data = await res.json().catch(() => null);

          if (!res.ok) {
            throw retryableBatchError(
              data?.detail || data?.error || `AI批次接口返回 HTTP ${res.status}`,
              res.status,
              res.headers?.get?.("retry-after")
            );
          }

          if (!Array.isArray(data?.items) || !data.items.length) {
            const invalidReasons = (data?.stats?.invalidItems || [])
              .map((item) => item?.reason)
              .filter(Boolean)
              .slice(0, 3)
              .join("；");
            throw retryableBatchError(
              invalidReasons
                ? `AI返回内容未通过校验：${invalidReasons}`
                : "AI批次没有返回可用词条",
              422
            );
          }

          collectGeneratedItems(chunk, data.items);
        },
        onRetry({ workerId, error }) {
          setBatchInfo(`第 ${workerId} 路失败，正在进行一次受控重试：${error.message}`);
        },
        onChunkError({ chunk, workerId, error }) {
          if (signal?.aborted || error?.name === "AbortError") return;
          markChunkFailed(chunk);
          if (error?.message && !failureDetails.includes(error.message)) {
            failureDetails.push(error.message);
          }
          setBatchInfo(`第 ${workerId} 路失败：${error.message}`);
        },
        onChunkSettled({ completedItems, remainingChunks }) {
          setBatchInfo(
            `AI补全第 ${roundNumber} 轮：${Math.min(attemptedItems + completedItems, targets.length)} / ${targets.length} ｜ 已返回 ${generatedByInputId.size} ｜ 失败 ${failedWordKeys.size} ｜ 剩余批次 ${remainingChunks}`
          );
        }
      });
      attemptedItems += result.completedItems;
    }

    // Probe one 10-word chunk before opening the five-worker batch. If the
    // service, account, build, or response schema is broken, stop after this
    // bounded probe instead of turning the same root cause into 100 failures.
    await runChunks(chunks.slice(0, 1), 1);
    // A failed probe is diagnostic only. It must not prevent later batches
    // from running because one malformed group can otherwise hide the entire
    // remaining completion queue. Server-side adaptive splitting isolates the
    // bad words while later chunks continue normally.
    if (!signal?.aborted) {
      await runChunks(chunks.slice(1), concurrency);
    }

    let nextWords = sourceWords;
    for (const { w } of targets) {
      const writeTarget = targetForWord(w);
      const entry = generatedByInputId.get(writeTarget.inputId);
      if (!entry) continue;
      nextWords = applyIdentityUpdate(nextWords, writeTarget, entry, (existing) => ({
          ...entry,
          word: existing.word,
          ieltsUse: normalizeStringArray(entry.ieltsUse || entry.ielts_use),
          topics: normalizeStringArray(entry.topics),
          difficulty: entry.difficulty || existing.difficulty || "",
          collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
          phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations),
          status: existing.status || ""
        }));
    }

    return {
      words: nextWords,
      total: attemptedItems,
      filled: generatedByInputId.size,
      failed: failedWordKeys.size,
      failedWordKeys: [...failedWordKeys],
      error: failureDetails[0] || "",
      aborted: Boolean(signal?.aborted)
    };
  }

  async function generateHundredByFiveBatch(options = {}) {
    const { keepLoading = false, quiet = false } = options;

    try {
      if (!keepLoading) setLoading(true);
      setBatchInfo("");
      const result = await executeFastCompletionRound(words);

      if (!result.total) {
        if (!quiet) setToast("没有发现缺失资料，不需要调用 AI");
        return result;
      }

      setWords(result.words);
      setBatchInfo("");

      if (!quiet) {
        setToast(
          `AI单轮补全完成：处理 ${result.total} 个，补全 ${result.filled} 个，失败 ${result.failed} 个`
        );
      }
      return result;
    } catch (error) {
      setToast(error.message || "AI单轮补全失败");
      return { words, total: 0, failed: 0, filled: 0, failedWordKeys: [] };
    } finally {
      if (!keepLoading) setLoading(false);
    }
  }

  function countEnrichmentTargets(sourceWords, excludedWordKeys = new Set()) {
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

  async function startContinuousAiCompletion() {
    const controlRef = aiRunControlRef || fallbackAiRunControlRef;
    if (controlRef.current?.running) {
      setToast("连续补全已经在运行");
      return;
    }

    const initialRemaining = countFastCompletionTargets(words);
    if (!initialRemaining) {
      setToast("没有待补全资料，不需要调用 AI");
      return;
    }

    const controller = new AbortController();
    controlRef.current = { controller, running: true };
    setLoading(true);
    setAiRunState?.({
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
          countFastCompletionTargets(snapshot, excludedWordKeys)
        ),
        executeRound: async ({ words: snapshot, roundNumber, failedWordKeys, signal }) => {
          const roundResult = await executeFastCompletionRound(snapshot, {
            excludedWordKeys: failedWordKeys,
            roundNumber,
            signal
          });
          if (roundResult.filled > 0) setWords(roundResult.words);
          return roundResult;
        },
        onProgress(progress) {
          setAiRunState?.(progress);
        }
      });

      const status = result.reason === "completed"
        ? "completed"
        : result.reason === "completed-with-failures"
          ? "completed-with-failures"
          : result.reason;
      setAiRunState?.({ ...result, status });
      setBatchInfo("");

      if (result.reason === "stopped") {
        setToast(`AI连续补全已停止：完成 ${result.filled} 个，剩余 ${result.remaining} 个`);
      } else if (result.reason === "fused") {
        setToast(`AI连续补全已自动熔断：完成 ${result.filled} 个，失败 ${result.failed} 个，请检查网络或 API 返回`);
      } else if (result.reason === "limit") {
        setToast(`AI连续补全达到安全轮次上限：完成 ${result.filled} 个，剩余 ${result.remaining} 个`);
      } else {
        setToast(`AI连续补全结束：${result.rounds} 轮，完成 ${result.filled} 个，失败 ${result.failed} 个`);
      }

      return result;
    } catch (error) {
      const stopped = controller.signal.aborted || error?.name === "AbortError";
      setAiRunState?.((previous) => ({
        ...(previous || {}),
        status: stopped ? "stopped" : "failed",
        error: stopped ? "" : (error.message || "连续补全失败")
      }));
      setToast(stopped ? "AI连续补全已停止" : (error.message || "AI连续补全失败"));
      return undefined;
    } finally {
      if (controlRef.current?.controller === controller) {
        controlRef.current = { controller: null, running: false };
      }
      setBatchInfo("");
      setLoading(false);
    }
  }

  function stopContinuousAiCompletion() {
    const controlRef = aiRunControlRef || fallbackAiRunControlRef;
    const controller = controlRef.current?.controller;
    if (!controller || controller.signal.aborted) {
      setToast("当前没有正在运行的连续 AI 任务");
      return;
    }

    setAiRunState?.((previous) => ({
      ...(previous || {}),
      status: "stopping"
    }));
    setBatchInfo("正在停止连续 AI 任务，已完成的轮次会保留...");
    controller.abort();
  }

  async function completeMeaningAndAudio() {
    try {
      setLoading(true);
      setBatchInfo("AI补全释义+音频：正在补全单词释义...");

      const meaningResult = await generateHundredByFiveBatch({
        keepLoading: true,
        quiet: true
      });

      setBatchInfo("AI补全释义+音频：释义完成，正在继续补全全部音频...");

      const audioResult = await prefillWordAudio({
        keepLoading: true,
        quiet: true
      });

      setBatchInfo("");

      setToast(
        `AI补全释义+音频完成：释义 ${meaningResult?.total || 0} 个，释义失败 ${meaningResult?.failed || 0} 个；音频成功 ${audioResult?.success || 0} 个，音频失败 ${audioResult?.failed || 0} 个`
      );
    } catch (error) {
      setBatchInfo("");
      setToast(error.message || "AI补全释义+音频失败");
    } finally {
      setLoading(false);
    }
  }

  async function categorizeWords() {
    try {
      setLoading(true);
      setBatchInfo("");

      const { targets, chunks, workerCount: concurrency } = buildClassificationPlan(words);

      if (!targets.length) {
        setToast("没有需要归纳的单词");
        return;
      }

      let failedWords = [];

      function applyCategorizedItems(chunk, items) {
        const itemMap = indexAiResponses(items);

        setWords((prev) => {
          let next = prev;

          chunk.forEach(({ w }) => {
            const writeTarget = targetForWord(w);
            const match = itemMap.get(writeTarget.inputId);

            if (!match) {
              failedWords.push(w.word);
              return;
            }

            next = applyIdentityUpdate(next, writeTarget, match, (existing) => ({
              ...existing,
              ieltsUse: normalizeStringArray(match.ieltsUse || match.ielts_use),
              topics: normalizeStringArray(match.topics),
              difficulty: match.difficulty || existing.difficulty || "中级核心"
            }));
          });

          return next;
        });
      }

      await runAdminAiBatch({
        chunks,
        workerCount: concurrency,
        maxRetries: 1,
        shouldRetry: ({ error }) => error?.retryable === true,
        onChunkStart({ chunk, workerId, completedItems }) {
          const preview = chunk.map(({ w }) => w.word).slice(0, 6).join(", ");
          setBatchInfo(
            `AI归纳分类：${completedItems} / ${targets.length} ｜ 第 ${workerId} 路：${preview}${chunk.length > 6 ? "..." : ""}`
          );
        },
        async executeChunk({ chunk }) {
          const res = await fetch("/api/categorize-words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              words: chunk.map(({ w }) => ({
                inputId: targetForWord(w).inputId,
                word: w.word,
                pos: w.pos,
                meaning: w.meaning,
                example: w.example
              }))
            })
          });
          const data = await res.json();

          if (!res.ok) {
            throw retryableBatchError(data?.detail || data?.error || `HTTP ${res.status}`, res.status, res.headers.get("retry-after"));
          }

          applyCategorizedItems(chunk, data.items || []);
        },
        onChunkError({ chunk }) {
          failedWords.push(...chunk.map(({ w }) => w.word));
        },
        onChunkSettled({ completedItems, remainingChunks }) {
          setBatchInfo(
            `AI归纳分类：${Math.min(completedItems, targets.length)} / ${targets.length} ｜ 失败 ${failedWords.length} 个 ｜ 剩余批次 ${remainingChunks}`
          );
        }
      });

      setBatchInfo("");

      if (failedWords.length) {
        setToast(`AI归纳完成，但有 ${failedWords.length} 个失败，可再次点击归纳`);
      } else {
        setToast(`AI归纳完成：${targets.length} 个单词`);
      }
    } catch (error) {
      setToast(error.message || "AI 归纳分类失败");
    } finally {
      setLoading(false);
    }
  }

  async function aiDedupe() {
    try {
      setLoading(true);
      setDuplicateInfo("正在本地快速扫描重复词...");

      const localMap = new Map();
      let localRemoved = 0;

      const localDeduped = words.filter((word) => {
        const key = normalizeWord(word.word);
        if (!key) return false;

        if (localMap.has(key)) {
          const existingIndex = localMap.get(key);
          localRemoved += 1;

          setWords((prev) => {
            const next = [...prev];
            next[existingIndex] = mergeWord(next[existingIndex], word);
            return next;
          });

          return false;
        }

        localMap.set(key, localMap.size);
        return true;
      });

      const workingWords = localDeduped;
      setWords(workingWords);

      setDuplicateInfo(`本地去重完成：删除/合并 ${localRemoved} 个。AI 正在检查疑似重复...`);

      const res = await fetch("/api/dedupe-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          words: workingWords.map((w) => w.word)
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || data?.detail || "AI 去重失败");
      }

      const groups = Array.isArray(data.groups) ? data.groups : [];

      if (!groups.length) {
        setDuplicateInfo(`AI 检查完成：没有发现需要合并的疑似重复词。本地已处理 ${localRemoved} 个。`);
        setToast("AI 去重完成");
        return;
      }

      const duplicateSet = new Set();

      groups.forEach((group) => {
        (group.duplicates || []).forEach((word) => duplicateSet.add(normalizeWord(word)));
      });

      setWords((prev) => prev.filter((word) => !duplicateSet.has(normalizeWord(word.word))));
      resetWordStudySessionState();

      setDuplicateInfo(
        `AI 检查完成：发现 ${groups.length} 组疑似重复，AI 删除 ${duplicateSet.size} 个；本地已处理 ${localRemoved} 个。`
      );
      setToast(`AI 去重完成：删除 ${duplicateSet.size + localRemoved} 个重复项`);
    } catch (error) {
      setDuplicateInfo("");
      setToast(error.message || "AI 去重失败");
    } finally {
      setLoading(false);
    }
  }

  return {
    cleanWordList,
    generateForIndex,
    confirmAiCost,
    generateCurrent,
    aiRepairCurrentWordSymbol,
    generateMissingBatch,
    aiCompletePendingAndUnclassifiedOneByOne,
    aiSlowCompleteMissing10x1,
    aiStableRepairWrongWords10x2,
    enrichOptionalBatch,
    startContinuousAiEnrichment,
    generateHundredByFiveBatch,
    startContinuousAiCompletion,
    stopContinuousAiCompletion,
    completeMeaningAndAudio,
    categorizeWords,
    aiDedupe
  };
}
