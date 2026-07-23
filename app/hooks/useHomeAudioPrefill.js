"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUDIO_PREFILL_CURSOR_KEY,
  REAL_AUDIO_BATCH_SIZE,
  REAL_AUDIO_PREFILL_CURSOR_KEY,
  isSimpleDictionaryWord,
  normalizeWord,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet
} from "../lib/vocab/page-word-helpers.mjs";
import { collectAllAudioTargets } from "../lib/vocab/audio-targets.mjs";

/**
 * Home audio status map + batch prefill / cache tools (I3.4).
 */
export function useHomeAudioPrefill({
  words,
  setWords,
  setAudioMap,
  setLoading,
  setToast,
  setBatchInfo,
  setAudioCacheStats
}) {
  const audioStatusMapRef = useRef({});
  const [audioStatsRevision, setAudioStatsRevision] = useState(0);
  const [audioStatusState, setAudioStatusState] = useState("loading");
  const audioStatusHydrationKeyRef = useRef("");

  const bumpAudioStatsRevision = useCallback(() => {
    setAudioStatsRevision((revision) => revision + 1);
  }, []);

  const patchAudioStatusKey = useCallback((key, patch) => {
    if (!key || !patch) return;
    audioStatusMapRef.current = {
      ...audioStatusMapRef.current,
      [key]: {
        ...(audioStatusMapRef.current[key] || {}),
        ...patch
      }
    };
    bumpAudioStatsRevision();
  }, [bumpAudioStatsRevision]);

  const mergeAudioStatusMap = useCallback((patch) => {
    if (!patch || !Object.keys(patch).length) return;
    const next = { ...audioStatusMapRef.current };
    for (const [key, value] of Object.entries(patch)) {
      next[key] = { ...(next[key] || {}), ...value };
    }
    audioStatusMapRef.current = next;
    bumpAudioStatsRevision();
  }, [bumpAudioStatsRevision]);


  function getAudioPrefillCursor(scope, total) {
    try {
      const saved = JSON.parse(safeLocalStorageGet(AUDIO_PREFILL_CURSOR_KEY) || "null");

      if (!saved || saved.scope !== scope || saved.total !== total) {
        return 0;
      }

      const nextIndex = Number(saved.nextIndex || 0);

      if (!Number.isFinite(nextIndex) || nextIndex < 0) return 0;
      if (nextIndex >= total) return total;

      return nextIndex;
    } catch {
      safeLocalStorageRemove(AUDIO_PREFILL_CURSOR_KEY);
      return 0;
    }
  }

  function saveAudioPrefillCursor(scope, total, nextIndex) {
    safeLocalStorageSet(
      AUDIO_PREFILL_CURSOR_KEY,
      JSON.stringify({
        scope,
        total,
        nextIndex: Math.max(0, Math.min(total, nextIndex)),
        updatedAt: Date.now()
      })
    );
  }

  function clearAudioPrefillCursor(showMessage = true) {
    safeLocalStorageRemove(AUDIO_PREFILL_CURSOR_KEY);

    if (showMessage) {
      setToast("已重置音频补全进度，下次会从头扫描");
    }
  }

  function getRealAudioPrefillCursor(total) {
    try {
      const saved = JSON.parse(safeLocalStorageGet(REAL_AUDIO_PREFILL_CURSOR_KEY) || "null");

      if (!saved || saved.total !== total) {
        return 0;
      }

      const nextIndex = Number(saved.nextIndex || 0);
      if (!Number.isFinite(nextIndex) || nextIndex < 0) return 0;
      if (nextIndex >= total) return total;

      return nextIndex;
    } catch {
      safeLocalStorageRemove(REAL_AUDIO_PREFILL_CURSOR_KEY);
      return 0;
    }
  }

  function saveRealAudioPrefillCursor(total, nextIndex) {
    safeLocalStorageSet(
      REAL_AUDIO_PREFILL_CURSOR_KEY,
      JSON.stringify({
        total,
        nextIndex: Math.max(0, Math.min(total, nextIndex)),
        updatedAt: Date.now()
      })
    );
  }

  function clearRealAudioPrefillCursor(showMessage = true) {
    safeLocalStorageRemove(REAL_AUDIO_PREFILL_CURSOR_KEY);

    if (showMessage) {
      setToast("已重置真人发音补全进度，下次会从头扫描");
    }
  }

  function applyRealAudioRetryResults(results = []) {
    const statusPatch = {};
    const phoneticMap = new Map();

    (results || []).forEach((entry) => {
      const key = normalizeWord(entry.text);
      if (!key) return;

      const hasAudio = Boolean(entry.ok || entry.skipped);
      statusPatch[key] = {
        checked: true,
        hasAudio,
        source: entry.source || (hasAudio ? "real-cache" : "none"),
        provider: entry.provider || "",
        realAudio: Boolean(entry.realAudio || entry.ok),
        phonetic: entry.phonetic || "",
        updatedAt: Date.now()
      };

      if (entry.phonetic) {
        phoneticMap.set(key, entry.phonetic);
      }
    });

    if (Object.keys(statusPatch).length) {
      mergeAudioStatusMap(statusPatch);
    }

    if (phoneticMap.size) {
      setWords((prev) =>
        prev.map((word) => {
          const key = normalizeWord(word.word);
          const phonetic = phoneticMap.get(key);
          if (!phonetic || word.phonetic) return word;
          return { ...word, phonetic };
        })
      );
    }
  }

  async function batchPrefillRealAudio(options = {}) {
    const { keepLoading = false, quiet = false, resetCursor = false } = options;

    try {
      if (!keepLoading) setLoading(true);

      const targets = collectAllAudioTargets(words, "word").filter(
        (target) => target.kind === "word" && isSimpleDictionaryWord(target.word)
      );

      if (!targets.length) {
        if (!quiet) setToast("没有可补全真人发音的单词");
        return { total: 0, attempted: 0, realFound: 0, realMissing: 0, skipped: 0 };
      }

      let startIndex = resetCursor ? 0 : getRealAudioPrefillCursor(targets.length);

      if (startIndex >= targets.length) {
        if (!quiet) {
          setToast("真人发音补全进度已经到末尾；如需重新扫描，请点“重置真人发音补全进度”");
        }
        return { total: 0, attempted: 0, realFound: 0, realMissing: 0, skipped: 0 };
      }

      const pending = targets.slice(startIndex);
      let completed = 0;
      let attempted = 0;
      let skipped = 0;
      let realFound = 0;
      let realMissing = 0;
      let replacedFallback = 0;

      setBatchInfo(`继续批量补全真人发音：${startIndex} / ${targets.length} ｜ 本次剩余 ${pending.length}`);

      for (let offset = 0; offset < pending.length; offset += REAL_AUDIO_BATCH_SIZE) {
        const chunk = pending.slice(offset, offset + REAL_AUDIO_BATCH_SIZE);
        const preview = chunk.map(({ word }) => word).slice(0, 6).join(", ");

        setBatchInfo(
          `继续批量补全真人发音：${startIndex + completed} / ${targets.length} ｜ ${preview}${chunk.length > 6 ? "..." : ""}`
        );

        const res = await fetch("/api/audio-cache", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "retryReal",
            limit: REAL_AUDIO_BATCH_SIZE,
            items: chunk.map(({ word, kind }) => ({ word, kind }))
          })
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.detail || data.error || "批量补全真人发音失败");
        }

        applyRealAudioRetryResults(data.results || data.retrySamples || []);
        setAudioCacheStats(data);

        attempted += data.attempted || 0;
        skipped += data.skipped || 0;
        realFound += data.realFound || 0;
        realMissing += data.realMissing || 0;
        replacedFallback += data.replacedFallback || 0;
        completed += chunk.length;

        saveRealAudioPrefillCursor(targets.length, startIndex + completed);
      }

      setBatchInfo("");

      if (!quiet) {
        setToast(
          `真人发音补全完成：检查 ${attempted} 个，跳过已有 ${skipped} 个，新增真人 ${realFound} 个，仍缺 ${realMissing} 个${replacedFallback ? `，替换兜底 ${replacedFallback} 个` : ""}`
        );
      }

      return {
        total: pending.length,
        attempted,
        skipped,
        realFound,
        realMissing,
        replacedFallback
      };
    } catch (error) {
      setBatchInfo("");
      if (!quiet) setToast(error.message || "批量补全真人发音失败");
      throw error;
    } finally {
      if (!keepLoading) setLoading(false);
    }
  }

  async function prefillWordAudio(options = {}) {
    const { keepLoading = false, quiet = false } = options;

    try {
      if (!keepLoading) setLoading(true);
      setBatchInfo("");

      const scope = options.scope || "all";
      const allTargets = collectAllAudioTargets(words, scope).map((target, audioTargetIndex) => ({
        ...target,
        audioTargetIndex
      }));

      if (!allTargets.length) {
        if (!quiet) setToast("没有可补全的音频目标");
        return { total: 0, success: 0, failed: 0 };
      }

      let startIndex = options.resetCursor ? 0 : getAudioPrefillCursor(scope, allTargets.length);

      if (startIndex >= allTargets.length) {
        if (!quiet) {
          setToast("音频补全进度已经到末尾；如需重新扫描，请点“重置音频补全进度”");
        }

        return { total: 0, success: 0, failed: 0 };
      }

      const targets = allTargets.slice(startIndex);

      const batchSize = 100;
      const concurrency = 5;
      const chunks = [];

      for (let start = 0; start < targets.length; start += batchSize) {
        chunks.push(targets.slice(start, start + batchSize));
      }

      let nextChunkIndex = 0;
      let committedChunkIndex = 0;
      let completed = 0;
      let success = 0;
      let failed = 0;
      const finishedChunks = new Set();

      setBatchInfo(
        `继续补全发音音频：${startIndex} / ${allTargets.length} ｜ 本次剩余 ${targets.length}`
      );

      function applyAudioItems(items) {
        const statusPatch = {};
        const audioPatch = {};
        const phoneticMap = new Map();

        (items || []).forEach((entry) => {
          const key = normalizeWord(entry.word);

          if (!key) return;

          const source = String(entry.source || "");
          const hasAudio = Boolean(
            entry.hasAudio ||
            entry.audioUrl ||
            entry.realAudio ||
            source.startsWith("real-") ||
            source.startsWith("edge-")
          );

          statusPatch[key] = {
            checked: true,
            hasAudio,
            source: entry.source || (hasAudio ? "speech-generated" : "none"),
            provider: entry.provider || "",
            realAudio: Boolean(entry.realAudio || source.startsWith("real-")),
            phonetic: entry.phonetic || "",
            updatedAt: Date.now()
          };

          if (entry.audioUrl) {
            audioPatch[key] = {
              audioUrl: entry.audioUrl,
              phonetic: entry.phonetic || "",
              source: entry.source || (entry.realAudio ? "real-commons" : "edge-cache")
            };
          }

          if (entry.phonetic) {
            phoneticMap.set(key, entry.phonetic);
          }

          if (hasAudio) success += 1;
          else failed += 1;
        });

        if (Object.keys(statusPatch).length) {
          mergeAudioStatusMap(statusPatch);
        }

        if (Object.keys(audioPatch).length) {
          setAudioMap((prev) => ({
            ...prev,
            ...audioPatch
          }));
        }

        if (phoneticMap.size) {
          setWords((prev) =>
            prev.map((word) => {
              const key = normalizeWord(word.word);
              const phonetic = phoneticMap.get(key);

              if (!phonetic || word.phonetic) return word;

              return {
                ...word,
                phonetic
              };
            })
          );
        }
      }

      async function runOneChunk(chunk, workerId, retry = 0) {
        const preview = chunk.map(({ word }) => word).slice(0, 6).join(", ");

        setBatchInfo(
          `继续补全发音音频：${Math.min(startIndex + completed, allTargets.length)} / ${allTargets.length} ｜ 第 ${workerId} 路：${preview}${chunk.length > 6 ? "..." : ""}`
        );

        const res = await fetch("/api/audio-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: chunk.map(({ word, kind }) => ({ word, kind })),
            generate: true
          })
        });

        const data = await res.json();

        if (!res.ok) {
          if (retry < 1) {
            return runOneChunk(chunk, workerId, retry + 1);
          }

          failed += chunk.length;

          const patch = {};
          chunk.forEach(({ key }) => {
            patch[key] = {
              checked: true,
              hasAudio: false,
              source: "failed",
              updatedAt: Date.now()
            };
          });

          mergeAudioStatusMap(patch);

          return;
        }

        applyAudioItems(data.items || []);
      }

      async function worker(workerId) {
        while (nextChunkIndex < chunks.length) {
          const chunkIndex = nextChunkIndex;
          nextChunkIndex += 1;
          const chunk = chunks[chunkIndex];

          try {
            await runOneChunk(chunk, workerId);
          } catch {
            failed += chunk.length;
          } finally {
            completed += chunk.length;
            finishedChunks.add(chunkIndex);

            while (finishedChunks.has(committedChunkIndex)) {
              finishedChunks.delete(committedChunkIndex);
              committedChunkIndex += 1;
            }

            const nextCursor = Math.min(
              allTargets.length,
              startIndex + committedChunkIndex * batchSize
            );

            saveAudioPrefillCursor(scope, allTargets.length, nextCursor);

            setBatchInfo(
              `继续补全发音音频：${Math.min(startIndex + completed, allTargets.length)} / ${allTargets.length} ｜ 成功 ${success} 个 ｜ 失败 ${failed} 个 ｜ 下次从 ${nextCursor} 继续`
            );
          }
        }
      }

      const workerCount = Math.min(concurrency, chunks.length);
      await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i + 1)));

      saveAudioPrefillCursor(scope, allTargets.length, allTargets.length);
      setBatchInfo("");
      if (!quiet) setToast(`发音音频补全完成：本次从 ${startIndex} 跑到 ${allTargets.length}，成功 ${success} 个，失败 ${failed} 个`);
      return { total: targets.length, success, failed };
    } catch (error) {
      setBatchInfo("");
      if (!quiet) setToast(error.message || "补全音频失败");
      throw error;
    } finally {
      if (!keepLoading) setLoading(false);
    }
  }


  async function rebuildMissingAudioFromStart() {
    const ok = confirm(
      "这会从头重新扫描当前词库需要的发音音频，并把缺失的音频补回来。\n\n" +
      "它不调用 DeepSeek，不扣 AI 费用，但如果音频很多会花比较久。\n\n" +
      "确定开始吗？"
    );

    if (!ok) return;

    clearAudioPrefillCursor(false);
    await prefillWordAudio({ resetCursor: true });
  }

  async function dedupeLocalAudio() {
    if (!confirm("开始扫描 .audio-cache 并删除重复 mp3？\n\n已有音频不会重新生成，只会清理内容完全相同的重复文件。")) return;

    setLoading(true);
    setBatchInfo("正在清理重复音频...");

    try {
      const res = await fetch("/api/audio-dedupe", {
        method: "POST"
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.detail || data.error || "清理重复音频失败");
      }

      setBatchInfo("");
      setToast(`重复音频清理完成：删除 ${data.removedFiles} 个，节省 ${Math.round((data.savedBytes || 0) / 1024)} KB`);
    } catch (error) {
      setBatchInfo("");
      setToast(error.message || "清理重复音频失败");
    } finally {
      setLoading(false);
    }
  }

  const refreshAudioCacheStats = useCallback(async (options = {}) => {
    const { quiet = false, includeStatus = true, statusOnly = false } = options;

    try {
      if (includeStatus) setAudioStatusState("loading");
      const suffix = includeStatus
        ? `?includeStatus=word${statusOnly ? "&summary=0" : ""}`
        : "";
      const res = await fetch(`/api/audio-cache${suffix}`, { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.detail || data.error || "读取发音缓存统计失败");
      }

      if (!statusOnly) setAudioCacheStats(data);
      if (includeStatus) {
        mergeAudioStatusMap(data.wordStatus || {});
        setAudioStatusState("ready");
      }
      if (!quiet) {
        setToast(`发音缓存：真人 ${data.files?.real || 0} 个，兜底 ${data.files?.fallback || 0} 个`);
      }

      return data;
    } catch (error) {
      if (includeStatus) setAudioStatusState("error");
      if (!quiet) setToast(error.message || "读取发音缓存统计失败");
      return null;
    }
  }, [mergeAudioStatusMap, setAudioCacheStats, setToast]);

  useEffect(() => {
    if (!words.length) return;

    const firstKey = normalizeWord(words[0]?.word);
    const lastKey = normalizeWord(words[words.length - 1]?.word);
    const hydrationKey = `${words.length}:${firstKey}:${lastKey}`;
    if (audioStatusHydrationKeyRef.current === hydrationKey) return;

    audioStatusHydrationKeyRef.current = hydrationKey;
    void refreshAudioCacheStats({
      quiet: true,
      includeStatus: true,
      statusOnly: true
    }).then((data) => {
      if (!data) audioStatusHydrationKeyRef.current = "";
    });
  }, [words, refreshAudioCacheStats]);

  async function cleanupFallbackAudioCache() {
    if (!confirm("删除所有兜底发音缓存？\n\n全站仅使用 Edge 兜底发音；删除后下次播放会重新生成。")) return;

    setLoading(true);
    setBatchInfo("正在删除兜底发音缓存...");

    try {
      const res = await fetch("/api/audio-cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cleanupFallback" })
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.detail || data.error || "删除兜底发音缓存失败");
      }

      setAudioCacheStats(data);
      setBatchInfo("");
      setToast(`已删除兜底缓存 ${data.removedFiles || 0} 个，释放 ${Math.round((data.savedBytes || 0) / 1024)} KB`);
    } catch (error) {
      setBatchInfo("");
      setToast(error.message || "删除兜底发音缓存失败");
    } finally {
      setLoading(false);
    }
  }

  async function retryRealAudioForCurrentLibrary() {
    const targets = collectAllAudioTargets(words, "word").filter(
      (target) => target.kind === "word" && isSimpleDictionaryWord(target.word)
    );

    if (!targets.length) {
      setToast("没有可补全真人发音的单词");
      return;
    }

    const startIndex = getRealAudioPrefillCursor(targets.length);
    const remaining = Math.max(0, targets.length - startIndex);

    if (
      !confirm(
        "批量补全真人发音（不调用 DeepSeek，不扣 AI 费用）。\n\n" +
        "只从 Lingua Libre WAV（LL-Q1860 eng）拉真人音频，不使用 dictionary MP3，不生成 Edge 兜底。\n" +
        `当前进度：${startIndex} / ${targets.length}，本次剩余约 ${remaining} 个单词。\n\n` +
        "支持断点续跑，可随时停止后下次继续。确定开始吗？"
      )
    ) {
      return;
    }

    await batchPrefillRealAudio();
  }

  async function rebuildRealAudioFromStart() {
    if (
      !confirm(
        "这会从头重新扫描全词库全部单词，并批量拉取 Lingua Libre WAV 真人发音。\n\n" +
        "不使用 dictionary MP3，不生成 Edge 兜底，不调用 DeepSeek。确定开始吗？"
      )
    ) {
      return;
    }

    clearRealAudioPrefillCursor(false);
    await batchPrefillRealAudio({ resetCursor: true });
  }



  return {
    audioStatusMapRef,
    audioStatsRevision,
    audioStatusState,
    bumpAudioStatsRevision,
    patchAudioStatusKey,
    mergeAudioStatusMap,
    prefillWordAudio,
    batchPrefillRealAudio,
    clearAudioPrefillCursor,
    clearRealAudioPrefillCursor,
    rebuildMissingAudioFromStart,
    rebuildRealAudioFromStart,
    retryRealAudioForCurrentLibrary,
    dedupeLocalAudio,
    refreshAudioCacheStats,
    cleanupFallbackAudioCache
  };
}
