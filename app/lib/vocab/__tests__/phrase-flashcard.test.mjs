import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildPhraseLexiconMeta, normalizePhraseKey } from "../load-phrases.mjs";
import { isPhraseCacheValid } from "../phrase-flashcard-store.mjs";
import {
  PHRASE_FLASHCARD_DAILY_KEY,
  PHRASE_FLASHCARD_POSITIONS_KEY,
  PHRASE_FLASHCARD_SESSION_KEY,
  PHRASE_FLASHCARD_STATUS_KEY,
  PHRASE_FLASH_STUDY_MODE_KEY,
  WORD_FLASHCARD_KEYS
} from "../phrase-flashcard-keys.mjs";
import { PHRASE_PRIORITY_FILTERS, phraseMatchesFilter, getPhraseStatus } from "../phrase-flashcard-utils.mjs";
import { asPhraseList } from "../../spelling/lexicon-merge.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("phrases.json keeps the original layer and supports Excel phrase additions", () => {
  const raw = fs.readFileSync(path.join(root, "public/data/phrases.json"), "utf8");
  const payload = JSON.parse(raw);
  const phrases = asPhraseList(payload);
  assert.ok(phrases.length >= 1280, `expected at least 1280 phrases, got ${phrases.length}`);
  assert.equal(Number(payload.count), phrases.length);
  assert.match(String(payload.version || ""), /^phrase-layer-v\d+/);
  const withPhonetic = phrases.filter((phrase) => String(phrase.phonetic || "").trim()).length;
  assert.ok(withPhonetic >= 1200, `expected most phrases to have phonetics, got ${withPhonetic}`);
});

test("words.json includes the listening expansion and has zero phrase-type rows", () => {
  const raw = fs.readFileSync(path.join(root, ".static-export-cache/words.json"), "utf8");
  const payload = JSON.parse(raw);
  const words = payload.words || payload;
  assert.ok(words.length >= 11532, `expected at least 11532 words, got ${words.length}`);
  assert.equal(Number(payload.count), words.length);
  const phraseRows = words.filter((w) => w.pos === "phrase" || w.entryType === "phrase");
  assert.equal(phraseRows.length, 0);
  assert.match(String(payload.version || ""), /^v\d+-\d+-/);
});

test("phrase and word flashcard storage keys are isolated", () => {
  const phraseKeys = [
    PHRASE_FLASH_STUDY_MODE_KEY,
    PHRASE_FLASHCARD_SESSION_KEY,
    PHRASE_FLASHCARD_POSITIONS_KEY,
    PHRASE_FLASHCARD_STATUS_KEY,
    PHRASE_FLASHCARD_DAILY_KEY
  ];
  phraseKeys.forEach((key) => {
    assert.ok(!WORD_FLASHCARD_KEYS.includes(key));
    assert.ok(!key.includes("ielts_vocab_session"));
    assert.ok(!key.includes("ielts_vocab_entry_positions"));
  });
});

test("phrase cache invalidates when lexicon hash changes", () => {
  const oldMeta = { phraseLexiconHash: "phrase-layer-v1|1280|a|b", total: 1280 };
  const sameMeta = { phraseLexiconHash: "phrase-layer-v1|1280|a|b", count: 1280 };
  const newMeta = { phraseLexiconHash: "phrase-layer-v2|1280|a|b", count: 1280 };
  assert.equal(isPhraseCacheValid(oldMeta, sameMeta), true);
  assert.equal(isPhraseCacheValid(oldMeta, newMeta), false);
});

test("phrase filter respects independent status map without mutating source", () => {
  const entry = { word: "be due to", id: "phrase_test", status: "", favorite: false };
  const statusMap = { [normalizePhraseKey(entry)]: { status: "熟悉", favorite: true } };
  const merged = getPhraseStatus(entry, statusMap);
  assert.equal(merged.status, "熟悉");
  assert.equal(merged.favorite, true);
  assert.equal(entry.status, "");
  assert.equal(entry.favorite, false);
  assert.equal(phraseMatchesFilter(entry, { type: "all", value: "" }, statusMap), false);
  assert.equal(phraseMatchesFilter(entry, { type: "status", value: "收藏" }, statusMap), true);
});

test("home page exposes word/phrase flash tabs and does not merge phrases into words state", () => {
  const pageSource = fs.readFileSync(path.join(root, "app/page.jsx"), "utf8");
  assert.match(pageSource, /flash-mode-switch/);
  assert.match(pageSource, /单词刷词/);
  assert.match(pageSource, /词组刷词/);
  assert.match(pageSource, /phraseRuntimeCount/);
  assert.match(pageSource, /\/data\/phrases\.json/);
  assert.doesNotMatch(pageSource, /1,280 词组/);
  assert.match(pageSource, /PhraseFlashcardPanel/);
  assert.match(pageSource, /flashStudyMode === "phrase"/);
  assert.doesNotMatch(pageSource, /setWords\(.*phrases/);
  assert.doesNotMatch(pageSource, /words\.concat\(.*phrases/);
});

test("large word phrase and spelling record lists use VirtualList", () => {
  const pageSource = fs.readFileSync(path.join(root, "app/page.jsx"), "utf8");
  const wordFlashSource = fs.readFileSync(path.join(root, "app/components/WordFlashcardView.jsx"), "utf8");
  const phrasePanelSource = fs.readFileSync(path.join(root, "app/components/PhraseFlashcardPanel.jsx"), "utf8");
  const spellingSource = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  const personalWrongDock = fs.readFileSync(path.join(root, "app/components/SpellingPersonalWrongDock.jsx"), "utf8");
  const virtualListSource = fs.readFileSync(path.join(root, "app/components/VirtualList.jsx"), "utf8");

  assert.match(pageSource, /WordFlashcardView/);
  assert.match(wordFlashSource, /import VirtualList/);
  assert.match(wordFlashSource, /library-list--virtual/);
  assert.match(phrasePanelSource, /import VirtualList/);
  assert.match(phrasePanelSource, /library-list--virtual/);
  assert.match(spellingSource, /import VirtualList|SpellingStatsSidebar|SpellingPersonalWrongDock/);
  assert.match(personalWrongDock, /spelling-personal-wrong-list--virtual/);
  const statsSidebar = fs.readFileSync(path.join(root, "app/components/SpellingStatsSidebar.jsx"), "utf8");
  assert.match(statsSidebar, /spelling-error-bank-list--virtual/);
  assert.match(virtualListSource, /requestAnimationFrame/);
  assert.match(virtualListSource, /scrollRafRef/);
});

test("word flashcard keeps audio status out of React state and uses single-pass entry counts", () => {
  const pageSource = fs.readFileSync(path.join(root, "app/page.jsx"), "utf8");
  const audioHookSource = fs.readFileSync(path.join(root, "app/hooks/useHomeAudioPrefill.js"), "utf8");

  assert.match(pageSource, /audioStatusMapRef/);
  assert.match(pageSource, /audioStatsRevision/);
  assert.match(audioHookSource, /audioStatusMapRef/);
  assert.doesNotMatch(pageSource, /const \[audioStatusMap, setAudioStatusMap\]/);
  assert.match(pageSource, /buildLearningEntryCounts/);
  const navHook = fs.readFileSync(path.join(root, "app/hooks/useWordFlashNavigation.js"), "utf8");
  assert.match(navHook, /prev\.toSpliced\(currentOriginalIndex, 1/);
});

test("home page exposes idictation flash entrances without legacy lr high-frequency filters", () => {
  const pageSource = fs.readFileSync(path.join(root, "app/page.jsx"), "utf8");
  const studyPoolSource = fs.readFileSync(path.join(root, "app/lib/vocab/word-flashcard-study-pool.mjs"), "utf8");

  assert.match(pageSource, /word-flashcard-study-pool\.mjs/);
  assert.match(studyPoolSource, /IDICTATION_FLASH_FILTERS/);
  assert.match(studyPoolSource, /buildIdictationFlashWords/);
  assert.match(studyPoolSource, /buildLibraryWordMap/);
  assert.match(studyPoolSource, /findIdictationLibraryWord/);
  assert.match(studyPoolSource, /sourceLibraryWord/);
  assert.match(pageSource, /buildIdictationFlashWords\(idictationFlashSourceKey, words, libraryWordMap\)/);
  assert.match(pageSource, /const idictationFlashSourceKey = isWordFlashActive && isIdictationFlashFilter\(filter\) \? filter\.value : ""/);
  assert.match(studyPoolSource, /filter: \{ type: "idictation", value: entry\.value \}/);
  assert.doesNotMatch(pageSource, /SPELLING_LISTENING_READING_OPTIONS/);
  assert.doesNotMatch(pageSource, /filter: \{ type: "lr_high_frequency", value: "listening/);
});

test("word flashcard study correction uses study queue membership for idictation indices", () => {
  const pageSource = fs.readFileSync(path.join(root, "app/page.jsx"), "utf8");
  assert.match(pageSource, /isWordFlashActive/);
  assert.match(pageSource, /item\.word === "完成"/);
  assert.match(pageSource, /isStudyEmpty \|\| isWordLexiconLoading/);
  assert.match(pageSource, /studyWordIndices\.includes\(effectiveIndex\)/);
  const navHook = fs.readFileSync(path.join(root, "app/hooks/useWordFlashNavigation.js"), "utf8");
  assert.match(navHook, /flashStudyModeRef\.current !== "word"/);
  assert.match(pageSource, /studySessionRef/);
  assert.match(pageSource, /buildStudyPoolForFilter/);
  assert.match(pageSource, /studyPool/);
});

test("phrase flashcard restores before saving and debounces navigation persistence", () => {
  const phrasePanelSource = fs.readFileSync(path.join(root, "app/components/PhraseFlashcardPanel.jsx"), "utf8");
  const phraseProgressSource = fs.readFileSync(path.join(root, "app/lib/vocab/phrase-flashcard-progress.mjs"), "utf8");

  assert.match(phrasePanelSource, /phrase-flashcard-progress\.mjs/);
  assert.match(phraseProgressSource, /readWithLegacyFallback/);
  assert.match(phraseProgressSource, /PHRASE_FLASHCARD_PROGRESS_SESSION_KEY/);
  assert.match(phrasePanelSource, /pendingSessionRef/);
  assert.match(phrasePanelSource, /studySessionRef/);
  assert.match(phrasePanelSource, /migratePhraseStatusMap/);
  assert.match(phrasePanelSource, /resolvePhraseStudyIndex/);
  assert.match(phrasePanelSource, /useLayoutEffect/);
  assert.match(phrasePanelSource, /queuePhraseSessionPersist/);
  assert.match(phrasePanelSource, /pagehide/);
  assert.match(phrasePanelSource, /PHRASE_STUDY_STATUS\.FAMILIAR/);
  assert.match(phrasePanelSource, /restoreMessageForPhraseReason/);
  assert.match(phrasePanelSource, /effectiveStudyIndex/);
  assert.match(phrasePanelSource, /statusPersistTimerRef/);
  assert.doesNotMatch(phrasePanelSource, /鐔熸倝/);
  assert.doesNotMatch(phrasePanelSource, /sessionRestoredRef/);
});

test("word flashcard playback shortcuts are scoped to word mode only", () => {
  const pageSource = fs.readFileSync(path.join(root, "app/page.jsx"), "utf8");
  const speechHookSource = fs.readFileSync(path.join(root, "app/hooks/useHomeWordSpeech.js"), "utf8");
  const navHook = fs.readFileSync(path.join(root, "app/hooks/useWordFlashNavigation.js"), "utf8");
  assert.match(navHook, /if \(flashStudyMode !== "word"\) return;/);
  assert.match(navHook, /speakWordRef\.current\(true\)/);
  assert.match(navHook, /speakExampleRef\.current\(\)/);
  assert.match(navHook, /\}, \[flashStudyMode\]\);/);
  assert.match(navHook, /if \(event\.repeat\) return;\s*event\.preventDefault\(\);\s*speakWordRef/);
  assert.match(navHook, /if \(event\.repeat\) return;\s*event\.preventDefault\(\);\s*speakExampleRef/);
  assert.match(pageSource, /useHomeWordSpeech/);
  assert.match(pageSource, /\{ text: item\.example, kind: "sentence" \}/);
  assert.doesNotMatch(pageSource, /nextItem\?\.example/);
  // Speech implementation lives in the extracted home speech hook.
  assert.match(speechHookSource, /shouldIgnoreDuplicateSpeech\(cleanText, kind\)/);
  assert.match(speechHookSource, /if \(kind === "sentence"\) return;/);
  assert.match(speechHookSource, /await playSpeechAudio\(item\?\.example, "sentence"\)/);
  assert.match(speechHookSource, /播放例句 \$\{formatSpeechSourceLabel\(result\)\}/);

  const phrasePanelSource = fs.readFileSync(path.join(root, "app/components/PhraseFlashcardPanel.jsx"), "utf8");
  assert.match(phrasePanelSource, /if \(event\.repeat\) return;\s*event\.preventDefault\(\);\s*speakPhrase/);
  assert.match(phrasePanelSource, /if \(event\.repeat\) return;\s*event\.preventDefault\(\);\s*speakExample/);
  assert.match(phrasePanelSource, /shouldIgnoreDuplicateSpeech\(text, "phrase"\)/);
  assert.match(phrasePanelSource, /shouldIgnoreDuplicateSpeech\(text, "sentence"\)/);
  assert.match(phrasePanelSource, /const warmSpeechAudio = useCallback/);
  assert.match(phrasePanelSource, /\{ text: item\.example, kind: "sentence" \}/);
  assert.doesNotMatch(phrasePanelSource, /next\?\.example/);
  assert.match(phrasePanelSource, /resolveSpeechPlaybackOptions\(result, "sentence"\)/);
  assert.match(phrasePanelSource, /播放例句 \$\{formatSpeechSourceLabel\(result\)\}/);
});

test("rapid flashcard navigation coalesces persistence and cancels stale warmup timers", () => {
  const pageSource = fs.readFileSync(path.join(root, "app/page.jsx"), "utf8");
  const sessionHook = fs.readFileSync(path.join(root, "app/hooks/useWordFlashSession.js"), "utf8");

  assert.match(sessionHook, /sessionPersistTimerRef = useRef\(null\)/);
  assert.match(sessionHook, /pendingSessionPersistRef = useRef\(null\)/);
  assert.match(sessionHook, /function queueWordFlashSessionPersist/);
  assert.match(sessionHook, /window\.setTimeout\(\(\) => \{\s*const pending = pendingSessionPersistRef\.current/);
  assert.match(sessionHook, /function flushQueuedWordFlashSessionPersist/);
  assert.match(sessionHook, /queueWordFlashSessionPersist\(\)/);
  assert.match(pageSource, /useWordFlashSession/);
  assert.doesNotMatch(pageSource, /function nextWord\(\)[\s\S]*?persistWordFlashSessionNow\(nextIndex, latest\.filter, latest\.words\);[\s\S]*?function prevWord/);
  assert.match(pageSource, /warmTtsTimersRef = useRef\(\[\]\)/);
  assert.match(pageSource, /warmTtsBatchRef = useRef\(0\)/);
  assert.match(pageSource, /warmTtsTimersRef\.current\.forEach\(\(timer\) => clearTimeout\(timer\)\)/);
  assert.match(pageSource, /if \(warmTtsBatchRef\.current !== batch\) return;/);

  const phrasePanelSource = fs.readFileSync(path.join(root, "app/components/PhraseFlashcardPanel.jsx"), "utf8");
  assert.match(phrasePanelSource, /warmTtsTimersRef = useRef\(\[\]\)/);
  assert.match(phrasePanelSource, /warmTtsBatchRef = useRef\(0\)/);
  assert.match(phrasePanelSource, /warmTtsTimersRef\.current\.forEach\(\(timer\) => clearTimeout\(timer\)\)/);
  assert.match(phrasePanelSource, /if \(warmTtsBatchRef\.current !== batch\) return;/);
  assert.match(phrasePanelSource, /queuePhraseSessionPersist/);
  assert.match(phrasePanelSource, /PERSIST_DEBOUNCE_MS/);
});

test("PhraseFlashcardPanel loads phrases via unified loader only", () => {
  const panelSource = fs.readFileSync(path.join(root, "app/components/PhraseFlashcardPanel.jsx"), "utf8");
  assert.match(panelSource, /loadPhrases/);
  assert.match(panelSource, /\/data\/phrases\.json/);
  assert.match(panelSource, /phraseLexiconHash/);
  assert.match(panelSource, /词组库加载失败/);
  assert.doesNotMatch(panelSource, /DEMO_WORDS/);
  assert.doesNotMatch(panelSource, /setWords/);
});

test("phrase flashcard exposes curated IELTS priority filters", () => {
  const panelSource = fs.readFileSync(path.join(root, "app/components/PhraseFlashcardPanel.jsx"), "utf8");
  assert.ok(PHRASE_PRIORITY_FILTERS.some((entry) => entry.title === "口语模板" && entry.filter.value === "Speaking"));
  assert.ok(PHRASE_PRIORITY_FILTERS.some((entry) => entry.title === "Task 2 论证" && entry.filter.value === "Task 2"));
  assert.match(panelSource, /PHRASE_PRIORITY_FILTERS/);
  assert.match(panelSource, /训练重点/);
  assert.match(panelSource, /priorityPhraseFilters/);
});

test("buildPhraseLexiconMeta fingerprints version and count", () => {
  const phrases = [{ id: "p1", word: "a" }, { id: "p2", word: "b" }];
  const meta = buildPhraseLexiconMeta({ version: "phrase-layer-v1" }, phrases);
  assert.equal(meta.count, 2);
  assert.match(meta.phraseLexiconHash, /phrase-layer-v1\|2\|p1\|p2/);
});
