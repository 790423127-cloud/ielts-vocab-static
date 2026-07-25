import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Materializer anchor missing: ${label}`);
  }
  return source.replace(before, after);
}

function write(path, source) {
  fs.writeFileSync(path, source);
}

// Persist the audit trail in the existing IndexedDB KV store without changing its schema.
{
  const path = "app/lib/vocab/word-store.mjs";
  let source = read(path);
  source = replaceOnce(
    source,
    'export const BIG_WORD_USER_STATE_KEY = "word_user_state_v1";\n',
    'export const BIG_WORD_USER_STATE_KEY = "word_user_state_v1";\nexport const BIG_LEXICON_TIDY_AUDIT_KEY = "lexicon_tidy_audit_v1";\n',
    "word-store audit key"
  );
  source = replaceOnce(
    source,
    'export async function loadActiveWordsForSync() {\n',
    `export async function loadLexiconTidyAuditFromIndexedDB() {\n  let db;\n  try {\n    db = await openBigStore();\n  } catch {\n    return null;\n  }\n\n  try {\n    const [audit] = await readStoredValues(db, [BIG_LEXICON_TIDY_AUDIT_KEY]);\n    return audit && typeof audit === "object" ? audit : null;\n  } catch {\n    return null;\n  } finally {\n    db.close();\n  }\n}\n\nexport async function saveLexiconTidyAuditToIndexedDB(audit) {\n  const db = await openBigStore();\n  try {\n    const transaction = db.transaction(BIG_STORE_NAME, "readwrite");\n    const store = transaction.objectStore(BIG_STORE_NAME);\n    const done = transactionDone(transaction);\n    store.put(audit && typeof audit === "object" ? audit : {}, BIG_LEXICON_TIDY_AUDIT_KEY);\n    await done;\n  } finally {\n    db.close();\n  }\n  return true;\n}\n\nexport async function loadActiveWordsForSync() {\n`,
    "word-store audit functions"
  );
  write(path, source);
}

// Add the friendly range and allow page-supplied candidate matching.
{
  const path = "app/lib/vocab/word-flashcard-study-pool.mjs";
  let source = read(path);
  source = replaceOnce(
    source,
    '  if (isIdictationFlashFilter(filter)) return Boolean(word.__idictationFlash);\n',
    '  if (isIdictationFlashFilter(filter)) return Boolean(word.__idictationFlash);\n  if (filter.type === "tidy") return false;\n',
    "tidy default matcher guard"
  );
  source = replaceOnce(
    source,
    '  if (filter.type === "custom" && filter.value === "life-work") return "生活/工作高频";\n',
    '  if (filter.type === "custom" && filter.value === "life-work") return "生活/工作高频";\n  if (filter.type === "tidy" && filter.value === "basic") return "简单词";\n  if (filter.type === "tidy" && filter.value === "issues") return "可能有问题";\n  if (filter.type === "tidy") return "看看这些词";\n',
    "tidy filter names"
  );
  source = replaceOnce(
    source,
    `  {\n    group: "爱听写独立入口",\n`,
    `  {\n    group: "词库整理",\n    items: [\n      {\n        title: "看看这些词",\n        desc: "简单词和可能重复的词放在这里，你来决定留不留；已熟悉的简单词不会重复出现。",\n        filter: { type: "tidy", value: "review" }\n      }\n    ]\n  },\n  {\n    group: "爱听写独立入口",\n`,
    "friendly learning entry"
  );
  const oldBuilders = `export function buildStudyWordIndices(pool, filter, { idictation = false } = {}) {\n  if (idictation) {\n    return pool\n      .filter((word) => wordMatchesFilter(word, filter))\n      .map((word) => word.originalIndex);\n  }\n\n  const indices = [];\n  for (let i = 0; i < pool.length; i += 1) {\n    if (wordMatchesFilter(pool[i], filter)) indices.push(i);\n  }\n  return indices;\n}\n\nexport function buildFilteredWordIndices(pool, filter, search, { idictation = false } = {}) {\n  const q = search.trim().toLowerCase();\n\n  if (idictation) {\n    return pool\n      .filter((word) => {\n        if (q && !word.word.toLowerCase().includes(q)) return false;\n        return wordMatchesFilter(word, filter);\n      })\n      .map((word) => word.originalIndex);\n  }\n\n  const wordMap = buildLibraryWordMap(pool);\n  const indexByWord = new Map(pool.map((word, index) => [word, index]));\n  const seen = new Set();\n  const indices = [];\n  for (let i = 0; i < pool.length; i += 1) {\n    const word = pool[i];\n    if (q && !word.word.toLowerCase().includes(q)) continue;\n    const target = resolveBrushableWord(word, wordMap);\n    const targetIndex = indexByWord.get(target);\n    if (!Number.isInteger(targetIndex) || seen.has(targetIndex)) continue;\n    if (wordMatchesFilter(target, filter)) {\n      seen.add(targetIndex);\n      indices.push(targetIndex);\n    }\n  }\n\n  return indices;\n}\n`;
  const newBuilders = `export function buildStudyWordIndices(pool, filter, {\n  idictation = false,\n  matchesWord = wordMatchesFilter\n} = {}) {\n  const indices = [];\n  for (let i = 0; i < pool.length; i += 1) {\n    if (!matchesWord(pool[i], filter, i)) continue;\n    indices.push(idictation ? pool[i].originalIndex : i);\n  }\n  return indices;\n}\n\nexport function buildFilteredWordIndices(pool, filter, search, {\n  idictation = false,\n  matchesWord = wordMatchesFilter\n} = {}) {\n  const q = search.trim().toLowerCase();\n\n  if (idictation) {\n    const indices = [];\n    for (let i = 0; i < pool.length; i += 1) {\n      const word = pool[i];\n      if (q && !word.word.toLowerCase().includes(q)) continue;\n      if (matchesWord(word, filter, i)) indices.push(word.originalIndex);\n    }\n    return indices;\n  }\n\n  const wordMap = buildLibraryWordMap(pool);\n  const indexByWord = new Map(pool.map((word, index) => [word, index]));\n  const seen = new Set();\n  const indices = [];\n  for (let i = 0; i < pool.length; i += 1) {\n    const word = pool[i];\n    if (q && !word.word.toLowerCase().includes(q)) continue;\n    const target = resolveBrushableWord(word, wordMap);\n    const targetIndex = indexByWord.get(target);\n    if (!Number.isInteger(targetIndex) || seen.has(targetIndex)) continue;\n    if (matchesWord(target, filter, targetIndex)) {\n      seen.add(targetIndex);\n      indices.push(targetIndex);\n    }\n  }\n\n  return indices;\n}\n`;
  source = replaceOnce(source, oldBuilders, newBuilders, "custom study matchers");
  write(path, source);
}

// Atomic deletion needs the shifted source index for the custom tidy matcher.
{
  const path = "app/lib/vocab/word-navigation-index.mjs";
  let source = read(path);
  source = replaceOnce(
    source,
    '    if (wordMatchesFilter(sourceWords[sourceIndex], filter)) oldQueue.push(sourceIndex);\n',
    '    if (wordMatchesFilter(sourceWords[sourceIndex], filter, sourceIndex)) oldQueue.push(sourceIndex);\n',
    "atomic old queue matcher"
  );
  source = replaceOnce(
    source,
    '    if (wordMatchesFilter(word, filter)) nextQueue.push(nextIndex);\n',
    '    if (wordMatchesFilter(word, filter, nextIndex)) nextQueue.push(nextIndex);\n',
    "atomic next queue matcher"
  );
  write(path, source);
}

// Route all navigation and deletion calculations through the same active matcher.
{
  const path = "app/hooks/useWordFlashNavigation.js";
  let source = read(path);
  source = replaceOnce(
    source,
    '  speakExample,\n  deleteCurrentWord\n}) {\n',
    '  speakExample,\n  deleteCurrentWord,\n  matchesStudyWord = wordMatchesFilter\n}) {\n',
    "navigation matcher prop"
  );
  source = replaceOnce(
    source,
    '      if (wordMatchesFilter(sourceWords[sourceIndex], activeFilter)) {\n',
    '      if (matchesStudyWord(sourceWords[sourceIndex], activeFilter, sourceIndex)) {\n',
    "navigation queue matcher"
  );
  source = replaceOnce(
    source,
    '      if (wordMatchesFilter(simulatedWords[wordIndex], filter)) candidateIndices.push(wordIndex);\n',
    '      if (matchesStudyWord(simulatedWords[wordIndex], filter, wordIndex)) candidateIndices.push(wordIndex);\n',
    "status queue matcher"
  );
  source = replaceOnce(
    source,
    '      .filter(({ word }) => wordMatchesFilter(word, filter));\n',
    '      .filter(({ word, originalIndex }) => matchesStudyWord(word, filter, originalIndex));\n',
    "shuffle matcher"
  );
  source = replaceOnce(
    source,
    '          wordMatchesFilter,\n          normalizeWord\n',
    '          wordMatchesFilter: matchesStudyWord,\n          normalizeWord\n',
    "atomic deletion active matcher"
  );
  source = replaceOnce(
    source,
    '  }, [deleteCurrentWord, flashStudyModeRef, latestStateRef, persistWordFlashSessionNow, setIndex, studySessionRef]);\n',
    '  }, [deleteCurrentWord, flashStudyModeRef, latestStateRef, matchesStudyWord, persistWordFlashSessionNow, setIndex, studySessionRef]);\n',
    "delete effect dependencies"
  );
  write(path, source);
}

// Friendly review actions replace study grading only while this range is active.
{
  const path = "app/components/WordStudyActions.jsx";
  let source = read(path);
  source = replaceOnce(
    source,
    '  nextWord,\n  markStatus\n}) {\n  return (\n',
    `  nextWord,\n  markStatus,\n  tidyReview\n}) {\n  if (tidyReview?.active) {\n    return (\n      <footer className="bottom bottombar tidy-review-actions" aria-label="词库整理操作">\n        <button className="study-step-button study-step-button--previous" type="button" disabled={isStudyEmpty} onClick={prevWord}>\n          上一个\n        </button>\n        <div className="actions">\n          <button className="status known" type="button" disabled={isStudyEmpty} onClick={tidyReview.onKeep}>\n            留着\n          </button>\n          <button className="status uncertain" type="button" disabled={isStudyEmpty} onClick={tidyReview.onLater}>\n            以后再看\n          </button>\n          <button className="status unknown active-unknown" type="button" disabled={isStudyEmpty} onClick={tidyReview.onDelete} title="只从雅思主词库删除">\n            删除\n          </button>\n        </div>\n        <button className="study-step-button study-step-button--next" type="button" disabled={isStudyEmpty} onClick={nextWord}>\n          下一个\n        </button>\n      </footer>\n    );\n  }\n\n  return (\n`,
    "tidy review actions"
  );
  write(path, source);
}

// Add the reasons, audit counts, and sub-ranges to the card UI.
{
  const path = "app/components/WordFlashcardView.jsx";
  let source = read(path);
  source = replaceOnce(
    source,
    '    toggleFavorite,\n    markStatus\n  } = chrome;\n',
    '    toggleFavorite,\n    markStatus,\n    tidyReview\n  } = chrome;\n',
    "tidy chrome prop"
  );
  source = replaceOnce(
    source,
    ' · 词族复核 {familyReviewCount} · 独立词候选 {familyPromotionCount} · 音频 ',
    ' · 词族复核 {familyReviewCount} · 独立词候选 {familyPromotionCount} · 待整理 {tidyReview?.stats?.review || 0} · 音频 ',
    "tidy library stats"
  );
  source = replaceOnce(
    source,
    `        <div className="filter-group">\n          <div className="filter-title">资料质量</div>\n`,
    `        <div className="filter-group">\n          <div className="filter-title">词库整理</div>\n          <div className="filter-chips">\n            {[\n              ["review", "看看这些词"],\n              ["basic", "简单词"],\n              ["issues", "可能有问题"]\n            ].map(([value, label]) => (\n              <button type="button" key={value} className={\`chip-btn \${filter.type === "tidy" && filter.value === value ? "active" : ""}\`} onClick={() => setLibraryFilter("tidy", value)}>{label}</button>\n            ))}\n          </div>\n        </div>\n\n        <div className="filter-group">\n          <div className="filter-title">资料质量</div>\n`,
    "tidy filter chips"
  );
  source = replaceOnce(
    source,
    '            {item.status === "不熟" ? <div className="unfamiliar-alert">当前词标记为不熟，复习时会优先出现</div> : null}\n',
    `            {tidyReview?.active && !isStudyEmpty ? (\n              <div className="tidy-review-panel" role="status">\n                <div>\n                  <strong>这个词值得看一眼</strong>\n                  <span>{tidyReview.candidate?.reasons?.join(" · ") || "由整理规则选出"}</span>\n                </div>\n                <p>你点“留着”后它不会再出现；删除只影响雅思主词库，独立零基础 1500 仍会保留。</p>\n                <small>待看 {tidyReview.stats?.review || 0} · 已留 {tidyReview.stats?.manuallyKept || 0} · 因熟悉自动留着 {tidyReview.stats?.autoKeptFamiliar || 0} · 已删记录 {tidyReview.stats?.deleted || 0}</small>\n              </div>\n            ) : null}\n\n            {item.status === "不熟" ? <div className="unfamiliar-alert">当前词标记为不熟，复习时会优先出现</div> : null}\n`,
    "tidy review panel"
  );
  source = replaceOnce(
    source,
    '            markStatus={markStatus}\n          />\n',
    '            markStatus={markStatus}\n            tidyReview={tidyReview}\n          />\n',
    "tidy actions prop"
  );
  write(path, source);
}

// Wire the derived candidate pool into the main page without touching either lexicon file.
{
  const path = "app/page.jsx";
  let source = read(path);
  source = replaceOnce(
    source,
    'import { Suspense, useEffect, useMemo, useRef, useState } from "react";\n',
    'import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";\n',
    "page useCallback import"
  );
  source = replaceOnce(
    source,
    'import { useWordFlashNavigation } from "./hooks/useWordFlashNavigation.js";\n',
    'import { useWordFlashNavigation } from "./hooks/useWordFlashNavigation.js";\nimport { useLexiconTidyReview } from "./hooks/useLexiconTidyReview.js";\n',
    "page tidy hook import"
  );
  source = replaceOnce(
    source,
    '} from "./lib/vocab/word-flashcard-study-pool.mjs";\n',
    `} from "./lib/vocab/word-flashcard-study-pool.mjs";\nimport {\n  LEXICON_TIDY_FILTERS,\n  LEXICON_TIDY_FILTER_TYPE\n} from "./lib/vocab/lexicon-tidy-review.mjs";\n`,
    "page tidy model import"
  );
  source = replaceOnce(
    source,
    '  } = useHomeVocabBootstrap({ setToast });\n\n  const {\n    audioStatusMapRef,\n',
    `  } = useHomeVocabBootstrap({ setToast });\n\n  const {\n    ready: lexiconTidyReady,\n    review: lexiconTidyReview,\n    matchesWord: matchesTidyWord,\n    getCandidate: getTidyCandidate,\n    keepWord: keepTidyWord,\n    recordDeletedWords: recordTidyDeletedWords\n  } = useLexiconTidyReview({ words, setToast });\n\n  const matchesActiveFilter = useCallback((word, targetFilter, sourceIndex = -1) => {\n    if (targetFilter?.type === LEXICON_TIDY_FILTER_TYPE) {\n      const resolvedIndex = Number.isInteger(sourceIndex) && sourceIndex >= 0\n        ? sourceIndex\n        : words.indexOf(word);\n      return matchesTidyWord(\n        word,\n        resolvedIndex,\n        targetFilter.value || LEXICON_TIDY_FILTERS.REVIEW\n      );\n    }\n    return wordMatchesFilter(word, targetFilter);\n  }, [matchesTidyWord, words]);\n\n  const {\n    audioStatusMapRef,\n`,
    "page tidy hook setup"
  );
  source = replaceOnce(
    source,
    '? buildStudyWordIndices(activeWordPool, filter, { idictation: Boolean(idictationFlashSourceKey) })\n',
    '? buildStudyWordIndices(activeWordPool, filter, { idictation: Boolean(idictationFlashSourceKey), matchesWord: matchesActiveFilter })\n',
    "page study indices matcher"
  );
  source = replaceOnce(
    source,
    '[isWordFlashActive, activeWordPool, filter, idictationFlashSourceKey]\n',
    '[isWordFlashActive, activeWordPool, filter, idictationFlashSourceKey, matchesActiveFilter]\n',
    "page study index dependencies"
  );
  source = replaceOnce(
    source,
    '? buildFilteredWordIndices(activeWordPool, filter, search, { idictation: Boolean(idictationFlashSourceKey) })\n',
    '? buildFilteredWordIndices(activeWordPool, filter, search, { idictation: Boolean(idictationFlashSourceKey), matchesWord: matchesActiveFilter })\n',
    "page filtered indices matcher"
  );
  source = replaceOnce(
    source,
    '[isWordFlashActive, activeWordPool, filter, search, idictationFlashSourceKey]\n',
    '[isWordFlashActive, activeWordPool, filter, search, idictationFlashSourceKey, matchesActiveFilter]\n',
    "page filtered index dependencies"
  );
  source = replaceOnce(
    source,
    `  const {\n    markStatus,\n    nextWord,\n    prevWord,\n    toggleFavorite,\n    shuffleStudyWords\n  } = useWordFlashNavigation({\n`,
    `  const deleteCurrentWordWithTidyAudit = useCallback(() => {\n    const latest = latestStateRef.current || {};\n    const activeFilter = latest.filter || filter;\n    const sourceWords = Array.isArray(latest.words) && latest.words.length ? latest.words : words;\n    const targetIndex = Number.isInteger(latest.index) ? latest.index : index;\n\n    if (activeFilter?.type === LEXICON_TIDY_FILTER_TYPE) {\n      recordTidyDeletedWords(sourceWords, targetIndex);\n    }\n    deleteCurrentWord();\n  }, [deleteCurrentWord, filter, index, recordTidyDeletedWords, words]);\n\n  const {\n    markStatus,\n    nextWord,\n    prevWord,\n    toggleFavorite,\n    shuffleStudyWords\n  } = useWordFlashNavigation({\n`,
    "page audited delete wrapper"
  );
  source = replaceOnce(
    source,
    '    speakExample,\n    deleteCurrentWord\n  });\n',
    '    speakExample,\n    deleteCurrentWord: deleteCurrentWordWithTidyAudit,\n    matchesStudyWord: matchesActiveFilter\n  });\n',
    "page navigation tidy wiring"
  );
  source = replaceOnce(
    source,
    `  const learningEntryCounts = useMemo(() => {\n`,
    `  const keepCurrentTidyWord = useCallback(() => {\n    if (filter?.type !== LEXICON_TIDY_FILTER_TYPE || isStudyEmpty) return;\n    const currentIndex = Number.isInteger(latestStateRef.current?.index)\n      ? latestStateRef.current.index\n      : effectiveIndex;\n    const currentWord = words[currentIndex];\n    if (!currentWord || !getTidyCandidate(currentIndex)) return;\n\n    keepTidyWord(currentWord, currentIndex);\n    const currentPosition = studyWordIndices.indexOf(currentIndex);\n    const remaining = studyWordIndices.filter((wordIndex) => wordIndex !== currentIndex);\n    if (remaining.length) {\n      const nextPosition = Math.min(Math.max(0, currentPosition), remaining.length - 1);\n      const nextIndex = remaining[nextPosition];\n      latestStateRef.current.index = nextIndex;\n      setIndex(nextIndex);\n      persistWordFlashSessionNow(nextIndex, filter, words);\n    }\n    setToast(\`已留在主词库：\${currentWord.word}，以后不会再放进这份清单\`);\n  }, [effectiveIndex, filter, getTidyCandidate, isStudyEmpty, keepTidyWord, persistWordFlashSessionNow, studyWordIndices, words]);\n\n  const learningEntryCounts = useMemo(() => {\n`,
    "page keep tidy action"
  );
  source = replaceOnce(
    source,
    `    return buildLearningEntryCounts(words, LEARNING_ENTRIES, {\n      filterKey,\n      isIdictationFlashFilter,\n      getIdictationSource\n    });\n  }, [isWordFlashActive, words]);\n`,
    `    const counts = buildLearningEntryCounts(words, LEARNING_ENTRIES, {\n      filterKey,\n      isIdictationFlashFilter,\n      getIdictationSource\n    });\n    counts.set("tidy:review", lexiconTidyReview.counts.review);\n    counts.set("tidy:basic", lexiconTidyReview.counts.basic);\n    counts.set("tidy:issues", lexiconTidyReview.counts.issues);\n    return counts;\n  }, [isWordFlashActive, words, lexiconTidyReview.counts.review, lexiconTidyReview.counts.basic, lexiconTidyReview.counts.issues]);\n`,
    "page tidy entry counts"
  );
  source = replaceOnce(
    source,
    `  function setLibraryFilter(type, value) {\n    studySessionRef.current.userAdjusted = true;\n`,
    `  function setLibraryFilter(type, value) {\n    if (type === LEXICON_TIDY_FILTER_TYPE && !lexiconTidyReady) {\n      setToast("正在准备这份词库整理清单，请稍等一下");\n      return;\n    }\n\n    studySessionRef.current.userAdjusted = true;\n`,
    "page tidy readiness guard"
  );
  source = replaceOnce(
    source,
    '      wordMatchesFilter,\n      normalizeWord,\n',
    '      wordMatchesFilter: matchesActiveFilter,\n      normalizeWord,\n',
    "page filter switch matcher"
  );
  source = replaceOnce(
    source,
    '          return targetPool.findIndex((word) => wordMatchesFilter(word, nextFilter));\n',
    '          return targetPool.findIndex((word, sourceIndex) => matchesActiveFilter(word, nextFilter, sourceIndex));\n',
    "page first tidy candidate"
  );
  source = replaceOnce(
    source,
    '        const first = targetPool.find((word) => wordMatchesFilter(word, nextFilter));\n',
    '        const first = targetPool.find((word, sourceIndex) => matchesActiveFilter(word, nextFilter, sourceIndex));\n',
    "page first external candidate"
  );
  source = replaceOnce(
    source,
    '              importFromText, handleFile, openEditCurrentWord, deleteCurrentWord,\n',
    '              importFromText, handleFile, openEditCurrentWord, deleteCurrentWord: deleteCurrentWordWithTidyAudit,\n',
    "page admin audited delete"
  );
  source = replaceOnce(
    source,
    '            markStatus\n          }}\n',
    `            markStatus,\n            tidyReview: {\n              active: filter.type === LEXICON_TIDY_FILTER_TYPE,\n              ready: lexiconTidyReady,\n              candidate: getTidyCandidate(effectiveIndex),\n              stats: lexiconTidyReview.counts,\n              onKeep: keepCurrentTidyWord,\n              onLater: nextWord,\n              onDelete: deleteCurrentWordWithTidyAudit\n            }\n          }}\n`,
    "page tidy UI model"
  );
  write(path, source);
}

// Visual treatment stays compact and uses existing design tokens.
{
  const path = "app/globals.css";
  let source = read(path);
  const css = `\n/* Friendly main-lexicon tidy review */\n.tidy-review-panel {\n  margin: 0 0 18px;\n  padding: 14px 16px;\n  border: 1px solid rgba(180, 83, 9, 0.2);\n  border-radius: 14px;\n  background: rgba(255, 247, 237, 0.78);\n}\n\n.tidy-review-panel > div {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: 8px 12px;\n}\n\n.tidy-review-panel strong {\n  font-size: 14px;\n}\n\n.tidy-review-panel span,\n.tidy-review-panel p,\n.tidy-review-panel small {\n  color: var(--muted, #667085);\n}\n\n.tidy-review-panel p {\n  margin: 7px 0 5px;\n  font-size: 13px;\n  line-height: 1.55;\n}\n\n.tidy-review-panel small {\n  display: block;\n  font-size: 12px;\n}\n\n.tidy-review-actions .actions {\n  min-width: min(420px, 54vw);\n}\n\n@media (max-width: 720px) {\n  .tidy-review-actions .actions {\n    min-width: 0;\n  }\n}\n`;
  if (!source.includes("/* Friendly main-lexicon tidy review */")) source += css;
  write(path, source);
}

// Run the new deterministic tests in the existing pretest gate.
{
  const path = "package.json";
  let source = read(path);
  source = replaceOnce(
    source,
    'app/lib/vocab/__tests__/delete-navigation-performance.test.mjs",\n',
    'app/lib/vocab/__tests__/delete-navigation-performance.test.mjs app/lib/vocab/__tests__/lexicon-tidy-review.test.mjs",\n',
    "package pretest"
  );
  write(path, source);
}

// Verify index-aware matching in the deletion regression suite.
{
  const path = "app/lib/vocab/__tests__/delete-navigation-performance.test.mjs";
  let source = read(path);
  if (!source.includes("自定义整理筛选器会收到删除后的真实索引")) {
    source += `\n\ntest("自定义整理筛选器会收到删除后的真实索引", () => {\n  const words = [{ word: "a" }, { word: "b" }, { word: "c" }];\n  const result = buildAtomicDeletionNavigation({\n    words,\n    currentIndex: 1,\n    filter: { type: "tidy", value: "review" },\n    wordMatchesFilter: (_word, _filter, sourceIndex) => sourceIndex >= 1,\n    normalizeWord: (value) => String(value || "").toLowerCase()\n  });\n\n  assert.equal(result.queueLength, 1);\n  assert.equal(result.index, 1);\n  assert.equal(result.words[result.index].word, "c");\n});\n`;
  }
  write(path, source);
}

console.log("Friendly lexicon tidy review materialized.");
