"use client";
/**
 * Local ops factory — split from useHomeLexiconAdmin (v2026-07-10.3)
 */
import {
  applyEditDraftToWord,
  buildLocalCleanResult,
  buildLocalExactDedupeResult,
  buildLocalFormFamilyResult,
  buildLocalOptimizeResult,
  cleanTtsSymbolsInWord,
  collectObscureDerivedCandidates,
  getLocalWrongReasons,
  normalizeWord,
  repairHeadwordLocally,
  repairObviousWrongWordLocally,
  wordToEditDraft
} from "../lib/vocab/page-word-helpers.mjs";
import { buildLocalChangeLog } from "../lib/vocab/local-change-log.mjs";
import { buildLexiconDeletionIntent } from "../lib/vocab/lexicon-delete-intent.mjs";
import { filterKey, isIdictationFlashFilter } from "../lib/vocab/word-flashcard-study-pool.mjs";


export function createLocalOps(ctx) {
  const {
    words, setWords, index, setIndex, filter,
    lastLocalChange, setLastLocalChange,
    setLoading, setToast, setDuplicateInfo,
    setEditOpen, setEditDraft, editDraft,
    isExternalIdictationItem,
    persistWordsImmediately, resetWordStudySessionState,
    latestStateRef, entryPositionsRef, persistWordFlashSessionNow
  } = ctx;

  function recordLocalChange(actionName, beforeWords, afterWords) {
    const log = buildLocalChangeLog(actionName, beforeWords, afterWords);
    setLastLocalChange(log);
    return log;
  }

  function persistConfirmedChange(nextWords, beforeWords, action) {
    const deletionIntent = buildLexiconDeletionIntent(beforeWords, nextWords, {
      action,
      confirmed: true
    });
    return persistWordsImmediately(nextWords, deletionIntent ? { deletionIntent } : undefined);
  }

  function undoLastLocalChange() {
    if (!lastLocalChange?.beforeWords?.length) {
      setToast("没有可撤回的本地操作");
      return;
    }

    const ok = confirm(
      `撤回上一次本地操作？\n\n` +
      `操作：${lastLocalChange.actionName}\n` +
      `恢复词数：${lastLocalChange.beforeCount}\n` +
      `这会把词库恢复到该操作之前。`
    );

    if (!ok) return;

    setWords(lastLocalChange.beforeWords);
    resetWordStudySessionState();
    persistConfirmedChange(lastLocalChange.beforeWords, words, "undo-local-change");
    setToast(`已撤回：${lastLocalChange.actionName}`);
    setLastLocalChange(null);
  }

  function clearLastLocalChangeLog() {
    setLastLocalChange(null);
    setToast("已清空本地修改记录");
  }

  function undoOneLocalChangeItem(changeIndex) {
    if (!lastLocalChange?.changes?.length) {
      setToast("没有可撤回的单项记录");
      return;
    }

    const change = lastLocalChange.changes[changeIndex];

    if (!change) {
      setToast("找不到这条修改记录");
      return;
    }

    const beforeWord = Number.isInteger(change.beforeIndex) && change.beforeIndex >= 0
      ? lastLocalChange.beforeWords?.[change.beforeIndex]
      : null;
    const afterWord = Number.isInteger(change.afterIndex) && change.afterIndex >= 0
      ? lastLocalChange.afterWords?.[change.afterIndex]
      : null;

    let nextWords = [...words];
    let message = "";

    if (change.type === "修改") {
      if (!beforeWord) {
        setToast("撤回失败：找不到修改前的词");
        return;
      }

      let targetIndex = Number.isInteger(change.afterIndex) ? change.afterIndex : -1;

      if (targetIndex < 0 || targetIndex >= nextWords.length || normalizeWord(nextWords[targetIndex].word) !== normalizeWord(afterWord?.word || change.word)) {
        targetIndex = nextWords.findIndex((word) => normalizeWord(word.word) === normalizeWord(afterWord?.word || change.word));
      }

      if (targetIndex < 0) {
        setToast("撤回失败：当前词库里找不到这条已修改词");
        return;
      }

      nextWords[targetIndex] = beforeWord;
      message = `已撤回单项修改：${change.word}`;
    } else if (change.type === "删除") {
      if (!beforeWord) {
        setToast("撤回失败：找不到被删除的词");
        return;
      }

      const exists = nextWords.some((word) => normalizeWord(word.word) === normalizeWord(beforeWord.word));

      if (!exists) {
        const insertIndex = Math.max(0, Math.min(change.beforeIndex, nextWords.length));
        nextWords.splice(insertIndex, 0, beforeWord);
      }

      message = `已恢复被删除词：${beforeWord.word}`;
    } else if (change.type === "新增") {
      let targetIndex = Number.isInteger(change.afterIndex) ? change.afterIndex : -1;

      if (targetIndex < 0 || targetIndex >= nextWords.length || normalizeWord(nextWords[targetIndex].word) !== normalizeWord(change.word)) {
        targetIndex = nextWords.findIndex((word) => normalizeWord(word.word) === normalizeWord(change.word));
      }

      if (targetIndex < 0) {
        setToast("撤回失败：当前词库里找不到这个新增词");
        return;
      }

      const removedWord = nextWords[targetIndex]?.word || change.word;
      nextWords.splice(targetIndex, 1);
      message = `已移除新增词：${removedWord}`;
    } else {
      setToast("暂不支持撤回这种记录类型");
      return;
    }

    const nextChanges = lastLocalChange.changes.filter((_, index) => index !== changeIndex);

    setWords(nextWords);
    persistConfirmedChange(nextWords, words, "undo-added-word");
    setLastLocalChange({
      ...lastLocalChange,
      afterWords: nextWords,
      afterCount: nextWords.length,
      changedCount: Math.max(0, lastLocalChange.changedCount - 1),
      changes: nextChanges
    });

    setToast(`${message}｜剩余可单项撤回 ${nextChanges.length} 条`);
  }

  function applyLocalResult(result, message, actionName = message) {
    const nextWords = Array.isArray(result?.words) ? result.words : [];
    const studyOrderChanged = words.length !== nextWords.length || words.some((word, wordIndex) => (
      normalizeWord(word?.word) !== normalizeWord(nextWords[wordIndex]?.word)
    ));
    const changed = words.length !== nextWords.length || words.some((word, wordIndex) => (
      JSON.stringify(word) !== JSON.stringify(nextWords[wordIndex])
    ));

    if (!changed) {
      setDuplicateInfo(message);
      setToast(`${message}｜检查结果无变化，未改写本地词库`);
      return false;
    }

    const deletionIntent = buildLexiconDeletionIntent(words, nextWords, {
      action: "confirmed-local-cleanup",
      confirmed: true
    });
    if (deletionIntent) {
      const preview = deletionIntent.removed
        .slice(0, 8)
        .map((entry) => entry.word)
        .join("、");
      const confirmed = confirm(
        `这项整理将从正式主词库删除 ${deletionIntent.removed.length} 条记录。\n\n` +
        `${preview}${deletionIntent.removed.length > 8 ? "……" : ""}\n\n` +
        "删除前会自动保存可恢复备份，是否继续？"
      );
      if (!confirmed) return false;
    }

    recordLocalChange(actionName, words, nextWords);
    setWords(nextWords);
    if (studyOrderChanged) resetWordStudySessionState();
    persistWordsImmediately(nextWords, deletionIntent ? { deletionIntent } : undefined);
    setDuplicateInfo(message);
    setToast(`${message}｜已生成修改记录，可撤回`);
    return true;
  }

  function localCleanWordList() {
    try {
      setLoading(true);
      const result = buildLocalCleanResult(words);

      applyLocalResult(
        result,
        `本地整理完成：改写 ${result.stats.changed} 个，删除空项 ${result.stats.removed} 个`
      );
    } catch (error) {
      setToast(error.message || "本地整理失败");
    } finally {
      setLoading(false);
    }
  }

  function localDedupeWords() {
    try {
      setLoading(true);
      const dedupeResult = buildLocalExactDedupeResult(words);

      applyLocalResult(
        dedupeResult,
        `完全同名去重完成：合并 ${dedupeResult.stats.merged} 个；未按后缀合并`
      );
    } catch (error) {
      setToast(error.message || "本地去重失败");
    } finally {
      setLoading(false);
    }
  }

  function localMergeWordForms() {
    try {
      setLoading(true);
      const formResult = buildLocalFormFamilyResult(words);

      applyLocalResult(
        formResult,
        `人工词形关系校验完成：补齐 ${formResult.stats.referenceLinksAdded} 条，更新 ${formResult.stats.referenceLinksUpdated} 条，移除错误归属 ${formResult.stats.wrongOwnerLinksRemoved} 条；后缀猜测 0 条`
      );
    } catch (error) {
      setToast(error.message || "本地词形校验失败");
    } finally {
      setLoading(false);
    }
  }

  function localOptimizeWordList() {
    try {
      setLoading(true);
      const result = buildLocalOptimizeResult(words);

      applyLocalResult(
        result,
        `安全本地规整完成：格式整理 ${result.stats.changed} 个，完全同名去重 ${result.stats.exactMerged} 个，人工词形补齐 ${result.stats.referenceLinksAdded} 条，错误归属移除 ${result.stats.wrongOwnerLinksRemoved} 条；后缀猜测 0 条`
      );
    } catch (error) {
      setToast(error.message || "本地优化失败");
    } finally {
      setLoading(false);
    }
  }

  function openEditCurrentWord() {
    if (isExternalIdictationItem) {
      setToast("爱听写独立入口来自表格，不在这里编辑总词库。");
      return;
    }

    const currentWord = words[index];

    if (!currentWord) {
      setToast("没有当前单词");
      return;
    }

    setEditDraft(wordToEditDraft(currentWord));
    setEditOpen(true);
  }

  function updateEditDraft(field, value) {
    setEditDraft((draft) => ({
      ...(draft || {}),
      [field]: value
    }));
  }

  function saveEditCurrentWord() {
    if (!editDraft) return;
    if (isExternalIdictationItem) {
      setToast("爱听写独立入口来自表格，不在这里编辑总词库。");
      return;
    }

    const oldWord = words[index];

    if (!oldWord) return;

    const oldKey = normalizeWord(oldWord.word);
    const nextWord = applyEditDraftToWord(oldWord, editDraft);
    const nextKey = normalizeWord(nextWord.word);

    const nextWords = [...words];
    nextWords[index] = nextWord;
    setWords(nextWords);
    persistWordsImmediately(nextWords);

    if (oldKey && nextKey && oldKey !== nextKey) {
      if (entryPositionsRef?.current) {
        entryPositionsRef.current[filterKey(filter)] = nextKey;
      }
      if (typeof persistWordFlashSessionNow === "function") {
        persistWordFlashSessionNow(index, filter);
      }
    }

    setEditOpen(false);
    setToast("已修改当前单词");
  }

  function localCleanCurrentTtsSymbols() {
    try {
      const currentWord = words[index];

      if (!currentWord) {
        setToast("没有当前单词");
        return;
      }

      const result = cleanTtsSymbolsInWord(currentWord);

      if (!result.changed) {
        setToast(`当前词没有需要转换的朗读符号：${currentWord.word}`);
        return;
      }

      const nextWords = [...words];
      nextWords[index] = result.word;

      recordLocalChange("转换当前单词符号", words, nextWords);
      setWords(nextWords);
      persistWordsImmediately(nextWords);

      setToast(`已转换当前词单词符号：${currentWord.word} → ${result.word.word}｜已生成修改记录，可撤回`);
    } catch (error) {
      setToast(error.message || "转换当前词单词符号失败");
    }
  }

  function localScanTtsSymbols() {
    try {
      const candidates = words
        .map((word, i) => {
          const result = cleanTtsSymbolsInWord(word);
          return result.changed ? { i, word: word.word, reasons: result.reasons } : null;
        })
        .filter(Boolean);

      if (!candidates.length) {
        setToast("没有发现 word 单词本身疑似有符号问题");
        return;
      }

      // 每点一次跳到“当前位置之后”的下一个候选词。
      // 到最后一个后，从头循环，不再每次都跳第一个。
      const nextCandidate =
        candidates.find((item) => item.i > index) ||
        candidates[0];

      const candidatePosition = candidates.findIndex((item) => item.i === nextCandidate.i) + 1;
      const wrapped = nextCandidate.i <= index;

      setIndex(nextCandidate.i);
      setToast(
        `${wrapped ? "已从头循环，" : ""}` +
        `跳到第 ${candidatePosition} / ${candidates.length} 个单词符号疑似项：${nextCandidate.word}` +
        `｜${nextCandidate.reasons.slice(0, 2).join("；")}`
      );
    } catch (error) {
      setToast(error.message || "检查单词符号失败");
    }
  }

  function localCleanTtsSymbols() {
    try {
      const candidates = [];
      const nextWords = words.map((word, i) => {
        const result = cleanTtsSymbolsInWord(word);

        if (result.changed) {
          candidates.push({
            i,
            before: word.word,
            after: result.word.word,
            reasons: result.reasons
          });

          return result.word;
        }

        return word;
      });

      if (!candidates.length) {
        setToast("没有发现 word 单词本身需要转换的括号或斜杠");
        return;
      }

      const preview = candidates
        .slice(0, 12)
        .map((item) => `${item.before} → ${item.after}｜${item.reasons.slice(0, 2).join("；")}`)
        .join("\\n");

      const ok = confirm(
        `将批量转换 ${candidates.length} 个 word 字段真正含括号/斜杠的词。\\n\\n` +
        `预览：\\n${preview}${candidates.length > 12 ? "\\n..." : ""}\\n\\n` +
        `确定执行吗？执行后可在“本地修改记录 / 撤回”里逐条撤回。`
      );

      if (!ok) return;

      recordLocalChange("批量转换单词符号（慎用）", words, nextWords);
      setWords(nextWords);
      persistWordsImmediately(nextWords);

      setToast(`已批量转换 ${candidates.length} 个 word 字段含括号/斜杠的词｜已生成修改记录，可逐条撤回`);
    } catch (error) {
      setToast(error.message || "清理单词符号失败");
    }
  }

  function localRepairTruncatedHeadwords() {
    try {
      let changed = 0;
      const changedSamples = [];

      const nextWords = words.map((word) => {
        const oldWord = String(word.word || "").trim();
        const fixedWord = repairHeadwordLocally(oldWord);

        if (!fixedWord || fixedWord === oldWord) {
          return word;
        }

        changed += 1;
        if (changedSamples.length < 12) changedSamples.push(`${oldWord} → ${fixedWord}`);

        // 只改 word 字段，不动 phonetic / example / collocations / forms / wordFamily。
        return {
          ...word,
          word: fixedWord,
          originalBrokenWord: word.originalBrokenWord || oldWord,
          headwordRepairedAt: Date.now()
        };
      });

      if (!changed) {
        setToast("没有发现可确定修复的截断单词本身");
        return;
      }

      recordLocalChange("只修单词本身截断", words, nextWords);
      setWords(nextWords);
      persistWordsImmediately(nextWords);

      setToast(`已修复 ${changed} 个截断单词本身：${changedSamples.join("，")}${changed > changedSamples.length ? " ..." : ""}｜只改 word 字段，可逐条撤回`);
    } catch (error) {
      setToast(error.message || "修复截断单词本身失败");
    }
  }

  function clearWrongAiRepairFlags() {
    try {
      const nextWords = words.map((word) => {
        const copy = { ...word };

        delete copy.needsAiRepair;
        delete copy.localWrongReasons;
        delete copy.localWrongCheckedAt;

        return copy;
      });

      recordLocalChange("清除错误AI修复标记", words, nextWords);
      setWords(nextWords);
      persistWordsImmediately(nextWords);
      setToast("已清除错误的“待AI修复”标记；已生成修改记录，可撤回");
    } catch (error) {
      setToast(error.message || "清除待AI修复标记失败");
    }
  }

  function localScanObscureDerivedWords() {
    try {
      const candidates = collectObscureDerivedCandidates(words);

      if (!candidates.length) {
        setToast("没有发现需要人工复核的冷僻/派生词候选");
        return;
      }

      const first = candidates[0];

      setIndex(first.index);
      setToast(`发现 ${candidates.length} 个只读审核候选，已跳到第一个：${first.word}｜${first.reason}｜不会自动删除`);
    } catch (error) {
      setToast(error.message || "扫描冷僻/派生词失败");
    }
  }

  function localScanAndRepairWrongWords() {
    try {
      setLoading(true);

      let suspected = 0;
      let changed = 0;
      let remaining = [];

      const nextWords = words.map((word, i) => {
        // 先清掉之前强扫描留下来的错误 AI 标记。
        const cleanWord = { ...word };
        delete cleanWord.needsAiRepair;
        delete cleanWord.localWrongReasons;
        delete cleanWord.localWrongCheckedAt;

        const reasons = getLocalWrongReasons(cleanWord);

        if (!reasons.length) return cleanWord;

        suspected += 1;

        const repaired = repairObviousWrongWordLocally(cleanWord);
        const afterReasons = getLocalWrongReasons(repaired.word);

        if (repaired.changed) {
          changed += 1;
        }

        if (afterReasons.length) {
          remaining.push({
            i,
            word: repaired.word.word,
            reasons: afterReasons
          });
        }

        return {
          ...repaired.word,
          localWrongReasons: afterReasons,
          localWrongCheckedAt: Date.now()
        };
      });

      recordLocalChange("稳定本地修复确定错词", words, nextWords);
      setWords(nextWords);
      persistWordsImmediately(nextWords);

      if (remaining.length) {
        setIndex(remaining[0].i);
      }

      setToast(
        `稳定本地修复完成：确定错词 ${suspected} 个，本地修复 ${changed} 个，仍需人工/AI确认 ${remaining.length} 个`
      );
    } catch (error) {
      setToast(error.message || "稳定本地扫描/修复错词失败");
    } finally {
      setLoading(false);
    }
  }

  function deleteCurrentWord(preparedDeletion = null) {
    const latest = latestStateRef.current || {};
    if (isExternalIdictationItem || isIdictationFlashFilter(latest.filter || filter)) {
      setToast("爱听写独立入口来自表格，不从总词库删除。");
      return null;
    }

    const sourceWords = Array.isArray(latest.words) && latest.words.length ? latest.words : words;
    const targetIndex = Number.isInteger(latest.index) ? latest.index : index;
    const currentWord = sourceWords[targetIndex] || words[index];

    if (!currentWord) {
      setToast("没有当前单词");
      return null;
    }

    const targetKey = normalizeWord(currentWord.word);

    if (!targetKey) {
      setToast("当前单词无效，无法删除");
      return null;
    }

    const sameCount = sourceWords.filter((word) => normalizeWord(word.word) === targetKey).length;

    const ok = confirm(
      `确定删除这个单词？\n\n${currentWord.word}\n\n` +
      `将从本地总词库删除 ${sameCount} 条同名单词记录。\n` +
      `删除后会立即保存；重新发布后手机端也会移除。`
    );

    if (!ok) return null;

    const canUsePreparedDeletion = preparedDeletion?.targetKey === targetKey
      && Array.isArray(preparedDeletion.words)
      && Number.isInteger(preparedDeletion.index);
    const next = canUsePreparedDeletion
      ? preparedDeletion.words
      : sourceWords.filter((word) => normalizeWord(word.word) !== targetKey);
    const nextIndex = canUsePreparedDeletion
      ? preparedDeletion.index
      : Math.min(targetIndex, Math.max(0, next.length - 1));

    recordLocalChange("删除当前单词", sourceWords, next);
    setWords(next);
    setIndex(nextIndex);
    persistConfirmedChange(next, sourceWords, "delete-current-word");

    setToast(`已彻底删除：${currentWord.word}（${sameCount} 条记录）｜已生成修改记录，可撤回`);
    return {
      ...(canUsePreparedDeletion ? preparedDeletion : {}),
      deleted: true,
      words: next,
      index: nextIndex,
      deletedCount: sameCount,
      targetKey
    };
  }

  return { recordLocalChange, undoLastLocalChange, clearLastLocalChangeLog, undoOneLocalChangeItem, applyLocalResult, localCleanWordList, localDedupeWords, localMergeWordForms, localOptimizeWordList, openEditCurrentWord, updateEditDraft, saveEditCurrentWord, localCleanCurrentTtsSymbols, localScanTtsSymbols, localCleanTtsSymbols, localRepairTruncatedHeadwords, clearWrongAiRepairFlags, localScanObscureDerivedWords, localScanAndRepairWrongWords, deleteCurrentWord };
}
