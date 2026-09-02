"use client";
/**
 * Io ops factory — split from useHomeLexiconAdmin (v2026-07-10.3)
 */
import {
  emergencyDefaultCloudUrl,
  isProbablyFullVocab,
  mergeWord,
  normalizeWord,
  parseImportText
} from "../lib/vocab/page-word-helpers.mjs";
import {
  buildBlankVocabTemplateCsvText,
  buildBlankVocabTemplateJsonPayload,
  csvToObjects,
  mergeBasicTemplateWord,
  normalizeTemplateWord
} from "../lib/vocab/vocab-template-io.mjs";
import {
  postExportCache,
  saveWordsToIndexedDB
} from "../lib/vocab/word-store.mjs";
import {
  buildLexiconDeletionIntent,
  formalLexiconWords
} from "../lib/vocab/lexicon-delete-intent.mjs";


export function createIoOps(ctx) {
  const {
    words, setWords,
    setLoading, setToast, setBatchInfo, setDuplicateInfo,
    pasteText, setPasteText,
    resetWordStudySessionState,
    cacheMetaRef,
    compactBrowserStorageForCurrentWords,
    demoWords, setFilter
  } = ctx;

  function confirmFormalDeletion(nextWords, previousWords, actionLabel = "恢复") {
    const deletionIntent = buildLexiconDeletionIntent(previousWords, nextWords, {
      action: "preview-formal-replacement",
      confirmed: true
    });
    if (!deletionIntent) return true;
    return confirm(
      `${actionLabel}会从正式主词库移除 ${deletionIntent.removed.length} 条记录。\n\n` +
      "服务器会先生成可恢复备份；每次删除都需要单独确认。是否继续？"
    );
  }

  async function publishConfirmedWords(nextWords, previousWords, source) {
    const deletionIntent = buildLexiconDeletionIntent(previousWords, nextWords, {
      action: source,
      confirmed: true
    });
    const result = await postExportCache(formalLexiconWords(nextWords), cacheMetaRef.current, {
      source,
      ...(deletionIntent ? { deletionIntent } : {})
    });
    if (!result?.ok) {
      throw new Error([result?.error, result?.detail].filter(Boolean).join("：") || "正式主词库写入失败");
    }
    return result;
  }

  function importWords(newWords) {
    if (!newWords.length) {
      setToast("没有识别到单词");
      return;
    }

    setWords((prev) => {
      const map = new Map();
      prev.forEach((word) => {
        map.set(normalizeWord(word.word), word);
      });

      let added = 0;
      let skipped = 0;
      let merged = 0;
      let inFileDuplicates = 0;
      const seenThisImport = new Set();

      for (const word of newWords) {
        const key = normalizeWord(word.word);
        if (!key) continue;

        if (seenThisImport.has(key)) {
          inFileDuplicates++;
        }

        seenThisImport.add(key);

        const existing = map.get(key);

        if (existing) {
          const before = JSON.stringify(existing);
          const after = mergeWord(existing, word);
          map.set(key, after);

          if (before === JSON.stringify(after)) {
            skipped++;
          } else {
            merged++;
          }
        } else {
          map.set(key, word);
          added++;
        }
      }

      setDuplicateInfo(`本次导入：新增 ${added} 个，跳过重复 ${skipped} 个，合并信息 ${merged} 个，文件内重复 ${inFileDuplicates} 个。`);
      setToast(`导入完成：新增 ${added}，重复 ${skipped + inFileDuplicates}`);
      return Array.from(map.values());
    });
  }

  function importFromText() {
    importWords(parseImportText(pasteText));
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    importWords(parseImportText(text));
    e.target.value = "";
  }

  function clearAll() {
    setWords(demoWords);
    setPasteText("");
    setDuplicateInfo("");
    setFilter({ type: "all", value: "" });
    resetWordStudySessionState();
    setToast("已恢复示例词库");
  }

  async function exportStaticSite() {
    try {
      setLoading(true);
      setBatchInfo("正在打包静态网站...");

      const res = await fetch("/api/export-static", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          words,
          exportedAt: new Date().toISOString()
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || data?.detail || "导出静态网站失败");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "static-site.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setToast("静态网站已导出：static-site.zip");
    } catch (error) {
      setToast(error.message || "导出静态网站失败");
    } finally {
      setBatchInfo("");
      setLoading(false);
    }
  }

  async function applyRecoveredWords(recoveredWords, sourceLabel) {
    if (!Array.isArray(recoveredWords) || recoveredWords.length < 1000) {
      setToast(`恢复失败：只找到 ${Array.isArray(recoveredWords) ? recoveredWords.length : 0} 个词，数量太少，已拒绝覆盖`);
      return;
    }
    if (!confirmFormalDeletion(recoveredWords, words, "恢复词库")) {
      setToast("已取消会删除正式词条的恢复操作");
      return;
    }

    setWords(recoveredWords);
    resetWordStudySessionState();

    await saveWordsToIndexedDB(recoveredWords, cacheMetaRef.current);

    await publishConfirmedWords(recoveredWords, words, sourceLabel);

    setToast(`词库已恢复：${recoveredWords.length} 个词｜来源：${sourceLabel}`);
  }

  async function recoverWordsFromLocalFiles() {
    setLoading(true);
    setBatchInfo("正在从本地发布缓存/导出文件恢复词库...");

    try {
      const res = await fetch("/api/recover-words", {
        method: "GET",
        cache: "no-store"
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.detail || data.error || "没有找到本地可恢复词库");
      }

      await applyRecoveredWords(data.words, data.source || "本地文件");
      setBatchInfo("");
    } catch (error) {
      setBatchInfo("");
      setToast(error.message || "从本地恢复失败");
    } finally {
      setLoading(false);
    }
  }

  async function recoverWordsFromTencentCloud() {
    const url = prompt(
      "请输入腾讯云静态网站地址，系统会尝试读取 data/words.json：",
      emergencyDefaultCloudUrl()
    );

    if (!url) return;

    setLoading(true);
    setBatchInfo("正在从腾讯云线上 words.json 恢复词库...");

    try {
      const res = await fetch("/api/recover-remote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url })
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.detail || data.error || "没有从腾讯云找到 words.json");
      }

      await applyRecoveredWords(data.words, data.source || "腾讯云线上");
      setBatchInfo("");
    } catch (error) {
      setBatchInfo("");
      setToast(error.message || "从腾讯云恢复失败");
    } finally {
      setLoading(false);
    }
  }

  async function cleanBrowserStorageNow() {
    if (!isProbablyFullVocab(words)) {
      setToast(`当前页面只有 ${words.length} 个词，禁止清理覆盖；请先用“紧急恢复词库”恢复`);
      return;
    }

    if (!confirm("清理当前浏览器里这个词库网站的旧缓存？\n\n会清理旧版大词库、旧音频状态表、Service Worker 缓存。\n不会删除当前页面里的词库；清理后会重新分块保存。")) return;

    setLoading(true);
    setBatchInfo("正在清理浏览器旧缓存并重新保存大词库...");

    try {
      await compactBrowserStorageForCurrentWords(words, cacheMetaRef.current);
      setBatchInfo("");
      setToast("浏览器存储清理完成，大词库已重新分块保存");
    } catch (error) {
      setBatchInfo("");
      setToast(error.message || "清理浏览器存储失败");
    } finally {
      setLoading(false);
    }
  }

  function downloadBlankVocabTemplateJson() {
    const payload = buildBlankVocabTemplateJsonPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const a = document.createElement("a");

    a.href = URL.createObjectURL(blob);
    a.download = "ielts-vocab-basic-template.json";
    a.click();
    URL.revokeObjectURL(a.href);

    setToast("已下载基础词库模板 JSON：只含 6 个字段");
  }

  function downloadBlankVocabTemplateCsv() {
    const blob = new Blob([buildBlankVocabTemplateCsvText()], {
      type: "text/csv;charset=utf-8"
    });
    const a = document.createElement("a");

    a.href = URL.createObjectURL(blob);
    a.download = "ielts-vocab-basic-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);

    setToast("已下载基础词库模板 CSV：只含 6 个字段");
  }

  function importTemplateVocabFile() {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = ".json,.csv,.txt,application/json,text/csv,text/plain";

    input.onchange = async () => {
      const file = input.files?.[0];

      if (!file) return;

      try {
        const text = await file.text();
        const lowerName = String(file.name || "").toLowerCase();
        let rawItems = [];

        if (lowerName.endsWith(".csv")) {
          rawItems = csvToObjects(text);
        } else {
          const data = JSON.parse(text);
          rawItems = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : Array.isArray(data?.words) ? data.words : [];
        }

        const importedWords = rawItems
          .map((item) => normalizeTemplateWord(item))
          .filter(Boolean);

        if (!importedWords.length) {
          setToast("导入失败：没有识别到有效单词。请检查模板里的 word 字段");
          return;
        }

        const existingMap = new Map();
        words.forEach((word, index) => {
          const key = normalizeWord(word.word);
          if (key && !existingMap.has(key)) existingMap.set(key, index);
        });

        let updateCount = 0;
        let appendCount = 0;
        let skipCount = 0;

        const nextWords = [...words];

        importedWords.forEach((incomingWord) => {
          const key = normalizeWord(incomingWord.word);

          if (!key) {
            skipCount += 1;
            return;
          }

          if (existingMap.has(key)) {
            const targetIndex = existingMap.get(key);
            nextWords[targetIndex] = mergeBasicTemplateWord(nextWords[targetIndex], incomingWord);
            updateCount += 1;
            return;
          }

          existingMap.set(key, nextWords.length);
          nextWords.push({
            ...incomingWord,
            importedFromBasicTemplateAt: Date.now()
          });
          appendCount += 1;
        });

        const ok = confirm(
          `识别到 ${importedWords.length} 个模板词条。\n\n` +
          `将合并到当前词库，不会清空原词库：\n` +
          `更新已有词：${updateCount} 个\n` +
          `追加新词：${appendCount} 个\n` +
          `跳过无效：${skipCount} 个\n\n` +
          `确定导入吗？\n\n` +
          `建议导入前先点“下载完整词库备份”。`
        );

        if (!ok) return;

        setWords(nextWords);
        resetWordStudySessionState();

        await saveWordsToIndexedDB(nextWords, cacheMetaRef.current);

        await publishConfirmedWords(nextWords, words, "template_merge_import");

        setToast(`模板词库已合并：更新 ${updateCount} 个，新增 ${appendCount} 个，当前总数 ${nextWords.length}`);
      } catch (error) {
        setToast(error.message || "导入模板词库失败");
      }
    };

    input.click();
  }

  function downloadVocabBackup() {
    if (!Array.isArray(words) || !words.length) {
      setToast("当前没有可下载的词库");
      return;
    }

    const payload = {
      type: "ielts_vocab_full_backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      count: words.length,
      words
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const a = document.createElement("a");

    a.href = URL.createObjectURL(blob);
    a.download = `ielts-vocab-backup-${words.length}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    setToast(`已下载完整词库备份：${words.length} 个词`);
  }

  function downloadEnglishOnlyTxt() {
    if (!Array.isArray(words) || !words.length) {
      setToast("当前没有可导出的词库");
      return;
    }

    const lines = words
      .map((word) => String(word?.word || "").trim())
      .filter(Boolean);

    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8"
    });
    const a = document.createElement("a");

    a.href = URL.createObjectURL(blob);
    a.download = `ielts-vocab-english-only-${lines.length}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);

    setToast(`已导出英文词 TXT：${lines.length} 行`);
  }

  function importVocabBackup() {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = ".json,application/json";

    input.onchange = async () => {
      const file = input.files?.[0];

      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const importedWords = Array.isArray(data) ? data : Array.isArray(data?.words) ? data.words : [];

        if (!importedWords.length) {
          setToast("导入失败：文件里没有 words 数组");
          return;
        }

        if (importedWords.length < 1000) {
          const okSmall = confirm(
            `这个文件只有 ${importedWords.length} 个词，数量偏少。\n\n` +
            `为了避免误覆盖完整大词库，默认不建议导入。\n\n` +
            `确定仍然要导入吗？`
          );

          if (!okSmall) return;
        }

        const deletionIntent = buildLexiconDeletionIntent(words, importedWords, {
          action: "manual_import",
          confirmed: true
        });
        const removedCount = deletionIntent?.removed?.length || 0;

        const ok = confirm(
          `确定导入这个词库备份？\n\n` +
          `文件词数：${importedWords.length}\n` +
          `当前词数：${words.length}\n` +
          `将从正式主词库移除：${removedCount} 条\n\n` +
          `导入后会替换当前本地词库；如有删除，服务器会先生成可恢复备份。`
        );

        if (!ok) return;

        setWords(importedWords);
        resetWordStudySessionState();

        await saveWordsToIndexedDB(importedWords, cacheMetaRef.current);

        await publishConfirmedWords(importedWords, words, "manual_import");

        setToast(`已恢复完整备份：${importedWords.length} 个词`);
      } catch (error) {
        setToast(error.message || "导入词库备份失败");
      }
    };

    input.click();
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(words, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ielts-vocab-deepseek.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return { importWords, importFromText, handleFile, clearAll, exportStaticSite, applyRecoveredWords, recoverWordsFromLocalFiles, recoverWordsFromTencentCloud, cleanBrowserStorageNow, downloadBlankVocabTemplateJson, downloadBlankVocabTemplateCsv, importTemplateVocabFile, downloadVocabBackup, downloadEnglishOnlyTxt, importVocabBackup, exportJSON };
}
