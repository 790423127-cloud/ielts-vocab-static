"use client";

import { useCallback, useState } from "react";
import { loadSpellingLexicon } from "../lib/spelling/load-spelling-lexicon.mjs";
import { resolveSpellingEntryAiTarget } from "../lib/spelling/personal-wrong-lexicon-sync.mjs";
import {
  findWordIndexInList,
  loadActiveWordsForSync,
  persistWordsToLocalLexicon,
  updateWordInLocalLexicon
} from "../lib/vocab/word-store.mjs";

const AI_REQUEST_TIMEOUT_MS = 45000;

async function fetchAiJson(url, body) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || data?.detail || `AI 请求失败（HTTP ${response.status}）`);
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`AI 请求超时（${Math.round(AI_REQUEST_TIMEOUT_MS / 1000)} 秒），请稍后重试`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function normalizePhraseItems(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") {
        return { phrase: item, chinese: "" };
      }

      return {
        phrase: item?.phrase || item?.text || item?.collocation || "",
        chinese: item?.chinese || item?.translation || item?.meaning || ""
      };
    })
    .filter((item) => item.phrase)
    .slice(0, 3);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3);
}

function isCompleteAiWord(word) {
  return Boolean(
    word?.pos
    && word?.meaning
    && word?.definition
    && word?.example
    && word?.exampleCn
    && Array.isArray(word?.collocations)
    && word.collocations.length
    && Array.isArray(word?.phraseCollocations)
    && word.phraseCollocations.length
    && Array.isArray(word?.ieltsUse)
    && word.ieltsUse.length
    && Array.isArray(word?.topics)
    && word.topics.length
    && word?.difficulty
  );
}

function isOfficialLibraryEntry(word = {}) {
  return !(
    word?.personalWrongOnly === true
    || word?.addedFromPersonalWrongBook === true
    || word?.source === "personal_wrong_book"
    || word?.supplemental === true
    || word?.candidateSource === "personal-wrong-book"
  );
}

function cleanText(value) {
  return String(value || "").trim();
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const text = cleanText(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }

  return result;
}

function normalizeAiWordPatch(data = {}, targetWord = "", existing = {}) {
  const word = cleanText(data.word) || cleanText(existing.word) || targetWord;
  const meaning = cleanText(data.meaning || data.meaningZh || data.chinese_meaning || existing.meaning || existing.meaningZh);
  const definition = cleanText(data.definition || data.english_definition || existing.definition || meaning);
  const phonetic = cleanText(data.phonetic || existing.phonetic);
  const patch = {
    ...data,
    word,
    answer: cleanText(data.answer || existing.answer) || word,
    acceptedAnswers: uniqueStrings([
      targetWord,
      word,
      data.answer,
      ...(Array.isArray(existing.acceptedAnswers) ? existing.acceptedAnswers : [])
    ]),
    phonetic,
    pos: cleanText(data.pos || data.part_of_speech || existing.pos),
    meaning,
    meaningZh: cleanText(data.meaningZh || data.chinese_meaning || data.meaning || existing.meaningZh || meaning),
    definition,
    meaningDetailedZh: cleanText(
      data.meaningDetailedZh
      || data.meaningDetailZh
      || existing.meaningDetailedZh
      || existing.meaningDetailZh
      || definition
      || meaning
    ),
    meaningDetailZh: cleanText(
      data.meaningDetailZh
      || data.meaningDetailedZh
      || existing.meaningDetailZh
      || existing.meaningDetailedZh
      || definition
      || meaning
    ),
    example: cleanText(data.example || data.ielts_example || existing.example),
    exampleCn: cleanText(data.exampleCn || data.example_chinese || existing.exampleCn),
    ieltsUse: normalizeStringArray(data.ieltsUse || data.ielts_use || existing.ieltsUse),
    topics: normalizeStringArray(data.topics || data.topic || existing.topics),
    difficulty: cleanText(data.difficulty || existing.difficulty),
    collocations: normalizePhraseItems(data.collocations || data.common_collocations || existing.collocations),
    phraseCollocations: normalizePhraseItems(
      data.phraseCollocations || data.phrase_collocations || data.prepositional_phrases || existing.phraseCollocations
    ),
    status: existing.status || ""
  };

  if (phonetic) {
    patch.phoneticStatus = cleanText(data.phoneticStatus) || "deepseek_verified";
    patch.pronunciationSourceTier = cleanText(data.pronunciationSourceTier) || "D";
    patch.pronunciationVariant = cleanText(data.pronunciationVariant || existing.pronunciationVariant) || "en-US";
    patch.pronunciationVerified = true;
  } else {
    patch.phoneticStatus = existing.phoneticStatus || "pending_review";
    patch.pronunciationSourceTier = existing.pronunciationSourceTier || "pending_review";
    patch.pronunciationVerified = existing.pronunciationVerified;
  }

  return patch;
}

function buildLibraryWordPatch(libraryWord = {}, targetWord = "", existing = {}) {
  return {
    ...normalizeAiWordPatch(
      {
        word: libraryWord.word || targetWord,
        answer: libraryWord.answer || libraryWord.word || targetWord,
        acceptedAnswers: libraryWord.acceptedAnswers,
        phonetic: libraryWord.phonetic,
        pos: libraryWord.pos,
        meaning: libraryWord.meaning,
        meaningZh: libraryWord.meaningZh,
        definition: libraryWord.definition,
        meaningDetailedZh: libraryWord.meaningDetailedZh,
        meaningDetailZh: libraryWord.meaningDetailZh,
        example: libraryWord.example,
        exampleCn: libraryWord.exampleCn,
        ieltsUse: libraryWord.ieltsUse,
        topics: libraryWord.topics,
        difficulty: libraryWord.difficulty,
        collocations: libraryWord.collocations,
        phraseCollocations: libraryWord.phraseCollocations,
        phoneticStatus: "library_verified",
        pronunciationSourceTier: "library",
        pronunciationVariant: libraryWord.pronunciationVariant || existing.pronunciationVariant || "en-US"
      },
      targetWord,
      existing
    ),
    libraryRepairSource: "local_lexicon"
  };
}

function normalizeLookup(value = "") {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ");
}

function wordMatchesTarget(word = {}, targetWord = "", currentEntry = {}) {
  const target = normalizeLookup(targetWord);
  const source = currentEntry?.sourceWord || {};
  const sourceId = normalizeLookup(source.id || source.wordId);
  const candidates = [
    word.word,
    word.answer,
    word.id,
    word.wordId,
    ...(Array.isArray(word.acceptedAnswers) ? word.acceptedAnswers : [])
  ].map(normalizeLookup).filter(Boolean);

  return Boolean(
    target && candidates.includes(target)
    || sourceId && candidates.includes(sourceId)
  );
}

function findOfficialLibraryWord(words = [], targetWord = "", currentEntry = {}) {
  return (Array.isArray(words) ? words : []).find((word) => (
    isOfficialLibraryEntry(word)
    && isCompleteAiWord(word)
    && wordMatchesTarget(word, targetWord, currentEntry)
  )) || null;
}

async function persistPatchToMatchingWords(words = [], meta = {}, targetWord = "", patch = {}, currentEntry = {}) {
  const nextWords = Array.isArray(words) ? [...words] : [];
  const matchingIndexes = nextWords
    .map((word, index) => (wordMatchesTarget(word, targetWord, currentEntry) ? index : -1))
    .filter((index) => index >= 0);

  if (!matchingIndexes.length) {
    nextWords.push(buildGeneratedLocalEntry(targetWord, patch, currentEntry, "word"));
  } else {
    for (const index of matchingIndexes) {
      const previous = nextWords[index] || {};
      nextWords[index] = {
        ...previous,
        ...patch,
        source: previous.source || patch.source,
        supplemental: previous.supplemental ?? patch.supplemental,
        addedFromPersonalWrongBook: previous.addedFromPersonalWrongBook ?? patch.addedFromPersonalWrongBook,
        candidateSource: previous.candidateSource || patch.candidateSource,
        sourceType: previous.sourceType || patch.sourceType,
        duplicateCheckResult: previous.duplicateCheckResult || patch.duplicateCheckResult,
        word: patch.word || previous.word
      };
    }
  }

  await persistWordsToLocalLexicon(nextWords, meta);
  return nextWords;
}

function buildGeneratedLocalEntry(targetWord, patch = {}, currentEntry = {}, scope = "word") {
  const source = currentEntry?.sourceWord || {};
  const word = patch.word || targetWord;
  const slug = word.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "word";
  const id = source.id || source.wordId || `word_ai_${slug}`;
  const isPhrase = scope === "phrase" || currentEntry?.entryType === "phrase" || currentEntry?.isPhrase;

  return {
    ...source,
    ...patch,
    id,
    wordId: source.wordId || id,
    word,
    answer: patch.answer || word,
    acceptedAnswers: patch.acceptedAnswers?.length ? patch.acceptedAnswers : [word],
    entryType: isPhrase ? "phrase" : "headword",
    isPhrase,
    source: source.source || "personal_wrong_book",
    supplemental: source.supplemental ?? true,
    addedFromPersonalWrongBook: source.addedFromPersonalWrongBook ?? true,
    candidateSource: source.candidateSource || "personal-wrong-book",
    sourceType: source.sourceType || "local-personal-wrong",
    duplicateCheckResult: source.duplicateCheckResult || "personal-local-deduped"
  };
}

function confirmAiCost(actionName) {
  return window.confirm(
    `${actionName}\n\n这个操作会调用 DeepSeek API，可能产生费用。\n\n确定继续吗？`
  );
}

export default function SpellingAiToolsPanel({
  scope = "word",
  currentEntry = null,
  onLexiconUpdated,
  onNotice
}) {
  const [loading, setLoading] = useState(false);
  const [batchInfo, setBatchInfo] = useState("");

  const currentTarget = resolveSpellingEntryAiTarget(currentEntry, scope);

  const notify = useCallback((message) => {
    if (typeof onNotice === "function") onNotice(message);
  }, [onNotice]);

  const refreshLexicon = useCallback(async () => {
    const payload = await loadSpellingLexicon({ force: true, scope });
    if (typeof onLexiconUpdated === "function") {
      onLexiconUpdated(payload);
    }
    return payload;
  }, [onLexiconUpdated, scope]);

  async function repairCurrentFromLibrary() {
    const targetWord = resolveSpellingEntryAiTarget(currentEntry, scope);

    if (!targetWord) {
      notify("当前没有可处理的词");
      return;
    }

    if (scope === "phrase") {
      notify("词组暂不支持从总词库修复，请使用 AI 补全或词组库入口处理");
      return;
    }

    try {
      setLoading(true);
      setBatchInfo(`正在从总词库查找：${targetWord}`);

      const { words, meta } = await loadActiveWordsForSync();
      const libraryWord = findOfficialLibraryWord(words, targetWord, currentEntry);

      if (!libraryWord) {
        notify(`总词库没有找到可直接修复「${targetWord}」的完整词条，可以再用 AI 补全`);
        return;
      }

      const patch = buildLibraryWordPatch(libraryWord, targetWord, currentEntry?.sourceWord || {});
      await persistPatchToMatchingWords(words, meta, targetWord, patch, currentEntry);
      await refreshLexicon();
      notify(`已从总词库修复当前词：${targetWord}`);
    } catch (error) {
      notify(error?.message || "从总词库修复失败");
    } finally {
      setLoading(false);
      setBatchInfo("");
    }
  }

  async function generateCurrentWord(options = {}) {
    const force = options.force !== false;
    const targetWord = resolveSpellingEntryAiTarget(currentEntry, scope);

    if (!targetWord) {
      notify("当前没有可处理的词");
      return;
    }

    const currentSource = currentEntry?.sourceWord || null;

    if (!force && currentSource && isCompleteAiWord(currentSource)) {
      notify("这个词已经补全，不需要调用 AI");
      return;
    }

    try {
      setLoading(true);
      setBatchInfo(`AI 正在处理：${targetWord}`);

      const data = await fetchAiJson("/api/generate-word", { word: targetWord, force });
      const { words, meta } = await loadActiveWordsForSync();
      const existingIndex = findWordIndexInList(words, targetWord);
      const existing = existingIndex >= 0 ? words[existingIndex] : currentSource;

      if (!data || typeof data !== "object") {
        throw new Error(data?.error || data?.detail || "AI 生成失败");
      }

      const patch = normalizeAiWordPatch(data, targetWord, existing || {});

      if (existingIndex >= 0) {
        await updateWordInLocalLexicon(targetWord, patch, { words, meta });
      } else {
        const nextWords = [
          ...words,
          buildGeneratedLocalEntry(targetWord, patch, currentEntry, scope)
        ];
        await persistWordsToLocalLexicon(nextWords, meta);
      }

      await refreshLexicon();
      notify(force ? `AI 已修复当前词：${targetWord}` : `DeepSeek 已补全当前词：${targetWord}`);
    } catch (error) {
      notify(error?.message || "AI 生成失败");
    } finally {
      setLoading(false);
      setBatchInfo("");
    }
  }

  async function repairCurrentWordSymbol() {
    const targetWord = resolveSpellingEntryAiTarget(currentEntry, scope);

    if (!targetWord) {
      notify("当前没有可处理的词");
      return;
    }

    try {
      setLoading(true);
      setBatchInfo(`AI 正在判断并修复词条符号：${targetWord}`);

      const data = await fetchAiJson("/api/repair-word-symbol", { word: targetWord });

      if (!data || typeof data !== "object") {
        throw new Error(data?.error || data?.detail || "AI 修复当前词条符号失败");
      }

      const repairedWord = String(data.repairedWord || "").trim();
      if (!repairedWord) {
        throw new Error("AI 返回了空词条");
      }

      if (repairedWord === targetWord) {
        notify(`AI 判断无需修改：${targetWord}${data.reason ? `｜${data.reason}` : ""}`);
        return;
      }

      const { words, meta } = await loadActiveWordsForSync();
      const index = findWordIndexInList(words, targetWord);

      if (index < 0) {
        notify(`AI 建议改为「${repairedWord}」，但本地词库还没有「${targetWord}」这条记录`);
        return;
      }

      const updateResult = await updateWordInLocalLexicon(targetWord, {
        word: repairedWord,
        answer: repairedWord,
        acceptedAnswers: [repairedWord]
      }, { words, meta });
      if (!updateResult.ok) {
        throw new Error(updateResult.error || "本地词库更新失败");
      }
      await refreshLexicon();
      notify(`AI 已修复词条：${targetWord} → ${repairedWord}`);
    } catch (error) {
      notify(error?.message || "AI 修复当前词条符号失败");
    } finally {
      setLoading(false);
      setBatchInfo("");
    }
  }

  return (
    <section className="spelling-ai-tools-dock" aria-label="拼写训练 AI 工具">
      <div className="spelling-ai-tools-dock__head">
        <div>
          <h2 className="spelling-ai-tools-dock__title">AI 工具</h2>
          <p className="spelling-export-panel__hint">
            在拼写页直接处理当前词，不会跳转到刷词页。优先使用总词库修复；只有 AI 按钮会调用 DeepSeek API，可能扣费。
          </p>
        </div>
      </div>

      <div className="ai-warning">
        当前处理对象：
        <strong>{currentTarget || "（还没有进入练习，或当前无词条）"}</strong>
      </div>

      <div className="ai-tool-explain">
        <p><strong>从总词库修复：</strong>如果总词库已有当前词，直接补全音标、释义、例句和搭配，不调用 AI。</p>
        <p><strong>AI 补全当前词：</strong>总词库没有完整词条时，调用 AI 补全音标、释义、例句、搭配、分类和难度。</p>
        <p><strong>AI 修复英文词条：</strong>只修当前词条的 word 字段，比如 in/within、effect(s)，不处理音标。</p>
      </div>

      <div className="action-grid">
        <button
          type="button"
          className="small-btn warm"
          disabled={loading || !currentTarget}
          onClick={repairCurrentFromLibrary}
        >
          {loading ? "处理中" : "从总词库修复当前词"}
        </button>
        <button
          type="button"
          className="small-btn ai-paid"
          disabled={loading || !currentTarget}
          onClick={() => confirmAiCost("AI 补全当前词（会扣费）") && generateCurrentWord({ force: true })}
        >
          AI 补全当前词（会扣费）
        </button>
        <button
          type="button"
          className="small-btn ai-paid"
          disabled={loading || !currentTarget}
          onClick={() => confirmAiCost("AI 修复英文词条（会扣费）") && repairCurrentWordSymbol()}
        >
          AI 修复英文词条（会扣费）
        </button>
      </div>

      {batchInfo ? <div className="status-line">{batchInfo}</div> : null}
    </section>
  );
}
