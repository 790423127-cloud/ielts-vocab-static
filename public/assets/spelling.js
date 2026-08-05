(function () {
  const REPAIR_WORDS = 8;
  const REPAIR_MS = 3 * 60 * 1000;
  const FORCE_WORDS = 20;
  const FORCE_MS = 15 * 60 * 1000;
  const BATCH_SIZE = 400;
  const IDICTATION_BATCH_SIZE = 300;
  const STORE = "ielts_static_spelling_v1";
  const FLASH = "static_vocab_progress_v15_entry_edgetts_cache_fallback";
  const LEXICON_META_KEY = "ielts_spelling_lexicon_meta_v1";
  const ERROR_BANK_KEY = "ielts_static_error_bank_v1";
  const PERSONAL_WRONG_KEY = "ielts_static_personal_wrong_v1";
  const PREFS_KEY = "ielts_static_spelling_prefs_v1";
  const POSITION_KEY = "ielts_static_spelling_position_v1";
  const SETTINGS_PANEL_PREF_PREFIX = "ielts_static_spelling_settings_collapsed_v1_";
  const AUDIO_CACHE_NAME = "static_vocab_audio_20260729_mobile_native_audio_v2";

  const CATEGORY_TYPES = [
    { value: "difficulty", label: "难度分类" },
    { value: "lr_high_frequency", label: "训练重点" },
    { value: "topic", label: "主题分类" },
    { value: "all", label: "全部单词" }
  ];

  const DIFFICULTY_OPTIONS = ["基础高频", "中级核心", "高级加分", "阅读扩展", "低频认识即可"];
  const CATEGORY_QUICK_PICKS = [
    { label: "全部", categoryType: "all", categoryValue: "" },
    { label: "基础", categoryType: "difficulty", categoryValue: "基础高频" },
    { label: "中级", categoryType: "difficulty", categoryValue: "中级核心" },
    { label: "高级", categoryType: "difficulty", categoryValue: "高级加分" },
    { label: "阅读扩展", categoryType: "difficulty", categoryValue: "阅读扩展" },
    { label: "听力重点", categoryType: "lr_high_frequency", categoryValue: "listening" },
    { label: "阅读重点", categoryType: "lr_high_frequency", categoryValue: "reading" }
  ];
  const TOPIC_OPTIONS = ["教育", "工作", "住房", "交通", "健康", "环境", "科技", "政府", "社会", "消费", "旅行", "社区", "法律", "家庭", "公共服务"];
  const LR_OPTIONS = [
    { value: "listening", label: "听力高频" },
    { value: "listening_reading", label: "听读高频" },
    { value: "reading", label: "阅读高频" },
    { value: "writing", label: "写作高频" },
    { value: "task2", label: "Task2 写作" },
    { value: "speaking", label: "口语高频" },
    { value: "life_work", label: "生活工作" }
  ];

  const IDICTATION_SOURCES = [
    { value: "idictation_listening", sourceKey: "listening", label: "爱听写听力" },
    { value: "idictation_reading", sourceKey: "reading", label: "爱听写阅读" }
  ];

  const SOURCE_LABELS = {
    category: "词库分类",
    idictation_listening: "爱听写听力",
    idictation_reading: "爱听写阅读",
    error_bank: "错词本",
    personal_wrong_book: "做题错词",
    srs_review: "SRS复习"
  };
  const VALID_PRACTICE_SOURCES = new Set(Object.keys(SOURCE_LABELS));
  const VALID_ENTRY_MODES = new Set(["all", "headwords", "phrases"]);

  const POS_LABELS = {
    noun: "名词",
    verb: "动词",
    adjective: "形容词",
    adverb: "副词",
    preposition: "介词",
    conjunction: "连词",
    pronoun: "代词",
    interjection: "感叹词",
    phrase: "短语"
  };

  const $ = (id) => document.getElementById(id);
  let mode = "all";
  let practiceSource = "category";
  let categoryType = "all";
  let categoryValue = "";
  let batchIndex = 0;
  let allLexiconEntries = [];
  let wordPayload;
  let phrasePayload;
  let entries = [];
  let current = null;
  let sequence = 0;
  let lexiconMeta = null;
  let idictationPayload = null;
  let idictationPrefs = { listening: { groupKey: "", batchIndex: 0 }, reading: { groupKey: "", batchIndex: 0 } };
  let state = readState();
  let errorBank = readErrorBank();
  let personalWrongRecords = readPersonalWrong();
  let lexiconRevision = 0;
  let lexiconIndexCache = { revision: -1, value: new Map() };
  let categoryFilterCache = { key: "", value: [] };
  let idictationCache = { payload: null, groups: new Map(), entries: new Map() };
  let selectionLoadVersion = 0;
  const dataRequests = new Map();
  const audioUrlCache = new Map();
  let audioPlayer = null;
  let settingsViewport = "";
  let settingsCollapsed = false;

  function settingsViewportKey() {
    return window.matchMedia && window.matchMedia("(max-width: 900px)").matches ? "mobile" : "desktop";
  }

  function applySettingsPanelState() {
    const section = document.querySelector(".settings-section");
    const toggle = $("settingsToggle");
    if (!section || !toggle) return;
    section.classList.toggle("is-collapsed", settingsCollapsed);
    toggle.setAttribute("aria-expanded", settingsCollapsed ? "false" : "true");
    toggle.textContent = settingsCollapsed ? "展开" : "收起";
  }

  function syncSettingsPanelMode(force = false) {
    const viewport = settingsViewportKey();
    if (!force && viewport === settingsViewport) return;
    settingsViewport = viewport;
    const saved = localStorage.getItem(SETTINGS_PANEL_PREF_PREFIX + viewport);
    settingsCollapsed = saved === null ? viewport === "mobile" : saved === "1";
    applySettingsPanelState();
  }

  function readPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writePrefs(patch = {}) {
    const next = { ...readPrefs(), ...patch, updatedAt: Date.now() };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  }

  function spellingScopeFromMode(value = mode) {
    const normalized = normalizeEntryMode(value);
    if (normalized === "phrases") return "phrase";
    if (normalized === "headwords") return "word";
    return "mixed";
  }

  function buildActiveBatchId() {
    const scope = spellingScopeFromMode(mode);
    if (practiceSource === "personal_wrong_book") return `${scope}:personal-wrong:batch:0`;
    if (practiceSource === "error_bank") return `${scope}:error-bank:batch:0`;
    if (practiceSource === "srs_review") return `${scope}:srs-review:batch:0`;
    if (isIdictationPracticeSource(practiceSource)) {
      const sourceKey = idictationSourceKeyFromPracticeSource(practiceSource);
      const prefs = idictationPrefs[sourceKey] || {};
      return `${scope}:${practiceSource}:${prefs.groupKey || ""}:batch:${Number(prefs.batchIndex || 0)}`;
    }
    return `${scope}:${categoryType}:${categoryValue}:batch:${Number(batchIndex || 0)}`;
  }

  function readSpellingPosition(activeBatchId) {
    if (!activeBatchId) return null;
    try {
      const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
      return parsed?.activeBatchId === activeBatchId ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeSpellingPosition(position) {
    if (!position?.activeBatchId || !position?.wordId) return;
    localStorage.setItem(POSITION_KEY, JSON.stringify({ ...position, savedAt: Date.now() }));
  }

  function persistCurrentPosition(item) {
    const normalized = item ? normalizeEntry(item) : null;
    const wordId = normalized ? id(normalized) : "";
    if (!wordId) return;
    writeSpellingPosition({
      activeBatchId: buildActiveBatchId(),
      wordId,
      practiceSource,
      categoryType,
      categoryValue,
      batchIndex,
      mode
    });
  }

  function restoreSavedCandidate(list) {
    const saved = readSpellingPosition(buildActiveBatchId());
    const savedWordId = String(saved?.wordId || "").trim();
    if (!savedWordId) return null;
    const savedWord = list.find((item) => id(item) === savedWordId);
    if (!savedWord) return null;
    const r = record(savedWord);
    if (r.repairState === "must_repair" || r.repairState === "waiting_second" || !r.doneToday) {
      return savedWord;
    }
    return null;
  }

  function norm(v) {
    return String(v || "").trim().toLowerCase().replace(/[''`]/g, "'").replace(/\s+/g, " ");
  }

  function expectedAnswer(item) {
    return String(item?.expectedAnswer || item?.word || item?.answer || item?.text || item?.phrase || item?.inflected || "").trim();
  }

  function resolveEntryType(item, answer) {
    if (item?.entryType === "phrase" || item?.isPhrase) return "phrase";
    if (item?.entryType === "word" || item?.entryType === "headword") return "word";
    if (String(item?.pos || "").toLowerCase() === "phrase") return "phrase";
    if (/\s/.test(answer)) return "phrase";
    return "word";
  }

  function normalizeEntryMode(value) {
    const aliases = {
      word: "headwords",
      words: "headwords",
      headword: "headwords",
      headwords: "headwords",
      phrase: "phrases",
      phrases: "phrases",
      all: "all",
      mixed: "all",
      mix: "all"
    };
    return aliases[String(value || "all").trim().toLowerCase()] || "all";
  }

  function friendlyPosLabel(entryType, pos) {
    if (entryType === "phrase") return "短语";
    const key = String(pos || "").trim().toLowerCase();
    return POS_LABELS[key] || (pos || "单词");
  }

  function normalizeEntry(item) {
    const answer = expectedAnswer(item);
    const entryType = resolveEntryType(item, answer);
    return {
      ...item,
      wordId: String(item?.wordId || item?.id || ((entryType === "phrase" ? "phrase:" : "word:") + norm(answer))),
      displayText: answer,
      expectedAnswer: answer,
      entryType,
      meaning: String(item?.meaning || item?.definition || "").trim(),
      phonetic: String(item?.phonetic || "").trim(),
      pos: friendlyPosLabel(entryType, item?.pos),
      example: String(item?.example || "").trim(),
      exampleCn: String(item?.exampleCn || "").trim()
    };
  }

  function interleaveMixedCandidates(list) {
    const words = list.filter((item) => item.entryType === "word");
    const phrases = list.filter((item) => item.entryType === "phrase");
    const merged = [];
    let wordIndex = 0;
    let phraseIndex = 0;

    while (wordIndex < words.length || phraseIndex < phrases.length) {
      for (let step = 0; step < 5 && wordIndex < words.length; step += 1) merged.push(words[wordIndex++]);
      for (let step = 0; step < 1 && phraseIndex < phrases.length; step += 1) merged.push(phrases[phraseIndex++]);
    }

    return merged;
  }

  function isPhrase(w) {
    return resolveEntryType(w, expectedAnswer(w)) === "phrase";
  }

  function id(w) {
    return String(w.wordId || w.id || ((isPhrase(w) ? "phrase:" : "word:") + norm(expectedAnswer(w))));
  }

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || '{"records":{},"lastId":""}');
    } catch {
      return { records: {}, lastId: "" };
    }
  }

  function save() {
    localStorage.setItem(STORE, JSON.stringify(state));
  }

  function readErrorBank() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ERROR_BANK_KEY) || '{"records":{}}');
      return parsed.records && typeof parsed.records === "object" ? parsed : { records: {} };
    } catch {
      return { records: {} };
    }
  }

  function writeErrorBank() {
    localStorage.setItem(ERROR_BANK_KEY, JSON.stringify({ records: errorBank.records, updatedAt: Date.now() }));
  }

  function readPersonalWrong() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PERSONAL_WRONG_KEY) || '{"records":[]}');
      return Array.isArray(parsed.records) ? parsed.records : [];
    } catch {
      return [];
    }
  }

  function writePersonalWrong() {
    localStorage.setItem(PERSONAL_WRONG_KEY, JSON.stringify({ records: personalWrongRecords, updatedAt: Date.now() }));
  }

  function severityForWrongCount(count) {
    if (count >= 5) return "high";
    if (count >= 2) return "medium";
    return "low";
  }

  function upsertErrorBank(entry, submitted) {
    const normalized = normalizeEntry(entry);
    const key = id(normalized);
    const now = Date.now();
    const prev = errorBank.records[key] || {
      wordId: key,
      everWrong: true,
      totalWrongCount: 0,
      totalCorrectCount: 0,
      firstWrongAt: now,
      latestWrongAt: 0,
      lastWrongAnswer: "",
      active: true
    };

    prev.everWrong = true;
    prev.totalWrongCount += 1;
    prev.latestWrongAt = now;
    prev.lastWrongAnswer = String(submitted || "");
    prev.active = true;
    prev.severity = severityForWrongCount(prev.totalWrongCount);
    errorBank.records[key] = prev;
    writeErrorBank();
  }

  function parsePersonalWrongLines(input) {
    return String(input || "")
      .split(/[\n,;，；]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[|｜]/).map((part) => part.trim()).filter(Boolean);
        if (parts.length >= 2) {
          return { anchor: parts[0], inflected: parts[1], scope: /\s/.test(parts[1]) ? "phrase" : "word" };
        }
        const comma = line.split(",").map((part) => part.trim()).filter(Boolean);
        if (comma.length >= 2 && !/\s/.test(comma[0])) {
          return { anchor: comma[0], inflected: comma[1], scope: "word" };
        }
        return { anchor: line, inflected: line, scope: /\s/.test(line) ? "phrase" : "word" };
      });
  }

  function addPersonalWrongRecords(lines) {
    const now = Date.now();
    const byKey = new Map(personalWrongRecords.map((item) => [`${item.scope}:${norm(item.inflected || item.anchor)}`, item]));

    lines.forEach((line) => {
      const key = `${line.scope}:${norm(line.inflected || line.anchor)}`;
      byKey.set(key, {
        id: `personal_${key}`,
        anchor: line.anchor,
        inflected: line.inflected,
        targetAnswer: line.inflected,
        scope: line.scope,
        addedAt: now,
        active: true,
        source: "manual"
      });
    });

    personalWrongRecords = [...byKey.values()].sort((a, b) => Number(a.addedAt || 0) - Number(b.addedAt || 0));
    writePersonalWrong();
    renderPersonalWrongList();
  }

  function removePersonalWrong(targetKey) {
    personalWrongRecords = personalWrongRecords.filter((item) => `${item.scope}:${norm(item.inflected || item.anchor)}` !== targetKey);
    writePersonalWrong();
    renderPersonalWrongList();
    render();
  }

  function renderPersonalWrongList() {
    const el = $("personalWrongList");
    if (!el) return;

    if (!personalWrongRecords.length) {
      el.innerHTML = '<div class="panel-note">还没有手动添加的做题错词。</div>';
      return;
    }

    el.innerHTML = personalWrongRecords
      .map((item) => {
        const label = item.scope === "phrase" ? item.inflected : (item.anchor === item.inflected ? item.anchor : `${item.anchor} → ${item.inflected}`);
        const key = `${item.scope}:${norm(item.inflected || item.anchor)}`;
        return `<div class="personal-wrong-item"><span>${escapeHtml(label)}</span><button type="button" data-remove-personal="${escapeHtml(key)}">删除</button></div>`;
      })
      .join("");

    el.querySelectorAll("[data-remove-personal]").forEach((btn) => {
      btn.addEventListener("click", () => removePersonalWrong(btn.dataset.removePersonal || ""));
    });
  }

  function familiarMap() {
    try {
      return JSON.parse(localStorage.getItem(FLASH) || "{}").statuses || {};
    } catch {
      return {};
    }
  }

  function shouldExcludeFamiliar() {
    return practiceSource === "category" && !$("includeFamiliar").checked;
  }

  function readEntryField(entry, field) {
    return entry?.[field] ?? entry?.sourceWord?.[field];
  }

  function matchSpellingCategory(entry, type, value) {
    const category = String(type || "all").trim();
    const selected = String(value || "").trim();
    if (category === "all") return true;

    if (category === "difficulty") {
      return !selected || readEntryField(entry, "difficulty") === selected;
    }

    if (category === "topic") {
      const topics = readEntryField(entry, "topics");
      return !selected || (Array.isArray(topics) && topics.includes(selected));
    }

    if (category === "lr_high_frequency") {
      const uses = new Set((readEntryField(entry, "ieltsUse") || []).map((item) => String(item || "").trim().toLowerCase()));
      const topics = new Set((readEntryField(entry, "topics") || []).map((item) => String(item || "").trim().toLowerCase()));
      const difficulty = readEntryField(entry, "difficulty");
      const reliable = !String(readEntryField(entry, "entryQuality") || "").toLowerCase().includes("needs_editorial_review");
      const highFreq = ["基础高频", "中级核心"].includes(difficulty) && reliable;
      if (!highFreq && readEntryField(entry, "listeningPriority") !== true && readEntryField(entry, "writingPriority") !== true) return false;

      const flags = {
        listening: uses.has("listening") || readEntryField(entry, "listeningPriority") === true,
        reading: uses.has("reading"),
        writing: uses.has("writing") || readEntryField(entry, "writingPriority") === true || uses.has("g类书信"),
        task2: uses.has("task 2") || uses.has("task2") || uses.has("writing task 2"),
        speaking: uses.has("speaking"),
        life_work: uses.has("生活高频") || uses.has("工作高频") || ["工作", "住房", "交通", "健康", "消费", "旅行", "社区", "公共服务"].some((topic) => topics.has(topic.toLowerCase()))
      };

      if (selected === "reading") return flags.reading;
      if (selected === "writing") return flags.writing;
      if (selected === "task2") return flags.task2;
      if (selected === "speaking") return flags.speaking;
      if (selected === "life_work") return flags.life_work;
      if (selected === "listening_reading") return flags.listening || flags.reading;
      return flags.listening;
    }

    return true;
  }

  function filterByCategory(list) {
    return list.filter((entry) => matchSpellingCategory(entry, categoryType, categoryValue));
  }

  function isIdictationPracticeSource(value = "") {
    return IDICTATION_SOURCES.some((source) => source.value === value);
  }

  function idictationSourceKeyFromPracticeSource(value = "") {
    return IDICTATION_SOURCES.find((source) => source.value === value)?.sourceKey || "";
  }

  function getIdictationSource(sourceKey = "") {
    return idictationPayload?.sources?.[sourceKey] || null;
  }

  function shouldUseIdictationChapterGroups(sourceKey = "") {
    return sourceKey === "listening" || sourceKey === "reading";
  }

  function normalizeIdictationChapterLabel(chapter = "") {
    return String(chapter || "").split("|")[0].trim();
  }

  function chaptersForEntry(entry) {
    const raw = String(entry?.sourceChapter || "");
    if (!raw) return [];
    const parts = raw.split("|").map((part) => part.trim()).filter(Boolean);
    return parts.length ? parts : [raw.trim()];
  }

  function entryMatchesChapter(entry, chapter = "") {
    const target = String(chapter || "").trim();
    if (!target) return false;
    return chaptersForEntry(entry).includes(target);
  }

  function idictationChapterGroupKey(chapter = "") {
    return `chapter:${String(chapter || "").trim()}`;
  }

  function idictationChapterFromGroupKey(groupKey = "") {
    const value = String(groupKey || "");
    return value.startsWith("chapter:") ? value.slice("chapter:".length) : "";
  }

  function parseChapterFrequencyScore(chapter = "") {
    const value = String(chapter || "");
    if (value.includes("词组")) {
      const match = value.match(/(\d+)/);
      return match ? Number(match[1]) : 0;
    }
    const range = value.match(/(\d+)(?:~(\d+))?次/);
    if (range) return Number(range[2] || range[1]);
    const single = value.match(/^(\d+)次/);
    if (single) return Number(single[1]);
    return 0;
  }

  function idictationChapterRank(label = "", sourceKey = "") {
    const value = String(label || "");
    if (sourceKey === "listening") {
      if (value.includes("答案词")) return [0, -parseChapterFrequencyScore(value)];
      if (value.includes("听力原文")) return [1, -parseChapterFrequencyScore(value)];
      if (value.includes("词组")) return [2, -parseChapterFrequencyScore(value)];
      return [3, 0];
    }
    if (value.includes("词组")) return [1, -parseChapterFrequencyScore(value)];
    return [0, -parseChapterFrequencyScore(value)];
  }

  function matchesListeningCuratedGroup(entry, groupKey = "") {
    const frequency = Number(entry?.frequency || 0);
    const category = String(entry?.sourceCategory || "");
    const chapter = String(entry?.sourceChapter || "");
    if (frequency < 10) return false;
    if (groupKey === "listening:answer-10-plus") {
      return category.includes("高频答案词") && chapter.includes("答案词10次及以上");
    }
    if (groupKey === "listening:transcript-10-plus") {
      return category.includes("高频听力原文词");
    }
    if (groupKey === "listening:phrase-10-plus") {
      return category.includes("高频词组");
    }
    return false;
  }

  function listListeningCuratedGroupOptions(sourceKey = "") {
    const source = getIdictationSource(sourceKey);
    if (!source) return [];
    return [
      { value: "listening:answer-10-plus", label: "答案词10次及以上" },
      { value: "listening:transcript-10-plus", label: "听力原文10次及以上" },
      { value: "listening:phrase-10-plus", label: "词组10次及以上" }
    ]
      .map((group) => ({
        ...group,
        count: (source.entries || []).filter((entry) => matchesListeningCuratedGroup(entry, group.value)).length
      }))
      .filter((group) => group.count > 0)
      .map((group) => ({
        value: group.value,
        label: `${group.label} · ${group.count}词`,
        count: group.count
      }));
  }

  function listIdictationChapterGroupOptions(sourceKey = "") {
    const source = getIdictationSource(sourceKey);
    const byChapter = new Map();

    (source?.entries || []).forEach((entry) => {
      chaptersForEntry(entry).forEach((chapter) => {
        if (!chapter) return;
        if (!byChapter.has(chapter)) {
          byChapter.set(chapter, {
            value: idictationChapterGroupKey(chapter),
            label: chapter,
            count: 0,
            rank: idictationChapterRank(chapter, sourceKey)
          });
        }
        byChapter.get(chapter).count += 1;
      });
    });

    return Array.from(byChapter.values())
      .sort((a, b) => {
        for (let index = 0; index < Math.max(a.rank.length, b.rank.length); index += 1) {
          const left = a.rank[index] ?? 0;
          const right = b.rank[index] ?? 0;
          if (left !== right) return left - right;
        }
        return a.label.localeCompare(b.label, "zh-Hans-CN");
      })
      .map((group) => ({
        value: group.value,
        label: `${group.label} · ${group.count}词`,
        count: group.count
      }));
  }

  function listIdictationGroupOptions(sourceKey = "") {
    if (idictationCache.payload !== idictationPayload) {
      idictationCache = { payload: idictationPayload, groups: new Map(), entries: new Map() };
    }
    if (idictationCache.groups.has(sourceKey)) return idictationCache.groups.get(sourceKey);

    let groups;
    if (shouldUseIdictationChapterGroups(sourceKey)) {
      const chapterGroups = listIdictationChapterGroupOptions(sourceKey);
      if (chapterGroups.length) groups = chapterGroups;
    }

    if (!groups) {
      const source = getIdictationSource(sourceKey);
      groups = (source?.groups || []).map((group) => ({
        value: group.key,
        label: `${group.label} · ${group.count}词`,
        count: group.count
      }));
    }
    idictationCache.groups.set(sourceKey, groups);
    return groups;
  }

  function normalizeIdictationPrefs(sourceKey = "", prefs = {}) {
    const groups = listIdictationGroupOptions(sourceKey);
    const groupKey = groups.some((group) => group.value === prefs.groupKey) ? prefs.groupKey : (groups[0]?.value || "");
    return { groupKey, batchIndex: 0 };
  }

  function entriesForIdictationGroup(sourceKey = "", groupKey = "") {
    if (idictationCache.payload !== idictationPayload) {
      idictationCache = { payload: idictationPayload, groups: new Map(), entries: new Map() };
    }
    const cacheKey = `${sourceKey}:${groupKey}`;
    if (idictationCache.entries.has(cacheKey)) return idictationCache.entries.get(cacheKey);

    const source = getIdictationSource(sourceKey);
    if (!source) return [];
    let matched;
    if (String(groupKey || "").startsWith("listening:")) {
      matched = (source.entries || []).filter((entry) => matchesListeningCuratedGroup(entry, groupKey));
    } else {
      const chapter = idictationChapterFromGroupKey(groupKey);
      matched = chapter
        ? (source.entries || []).filter((entry) => entryMatchesChapter(entry, chapter))
        : (source.entries || []).filter((entry) => entry.frequencyGroup === groupKey);
    }
    idictationCache.entries.set(cacheKey, matched);
    return matched;
  }

  function listIdictationBatchOptions(sourceKey = "", groupKey = "") {
    const entries = entriesForIdictationGroup(sourceKey, groupKey);
    return [{ value: 0, label: `本章节 · ${entries.length}词`, count: entries.length }];
  }

  function selectIdictationBatch(sourceKey = "", prefs = {}) {
    const source = getIdictationSource(sourceKey);
    const normalized = normalizeIdictationPrefs(sourceKey, prefs);
    const groupOptions = listIdictationGroupOptions(sourceKey);
    const option = groupOptions.find((item) => item.value === normalized.groupKey) || groupOptions[0] || null;
    const group = (source?.groups || []).find((item) => item.key === normalized.groupKey) || source?.groups?.[0] || null;
    const batchEntries = entriesForIdictationGroup(sourceKey, option?.value || group?.key || "");
    return {
      entries: batchEntries,
      sourceKey,
      label: source?.label || "",
      groupKey: option?.value || group?.key || "",
      groupLabel: option?.label || group?.label || "",
      batchIndex: 0,
      batchCount: 1,
      batchEntryCount: batchEntries.length,
      uniqueWords: source?.uniqueWords || 0,
      rawRows: source?.rawRows || 0
    };
  }

  function resolveIdictationEntries() {
    const sourceKey = idictationSourceKeyFromPracticeSource(practiceSource);
    if (!sourceKey) return [];
    const selection = selectIdictationBatch(sourceKey, idictationPrefs[sourceKey] || {});
    return selection.entries.map((entry) => normalizeEntry({
      wordId: entry.id,
      word: entry.word,
      expectedAnswer: entry.expectedAnswer || entry.word,
      acceptedAnswers: entry.acceptedAnswers || [],
      meaning: entry.meaning || entry.frequencyGroupLabel || "爱听写词",
      phonetic: entry.phonetic || "",
      pos: entry.entryType === "phrase" ? "短语" : "单词",
      example: entry.example || "",
      exampleCn: entry.exampleCn || "",
      entryType: entry.entryType || "word"
    }));
  }

  function populateIdictationPanel() {
    const sourceKey = idictationSourceKeyFromPracticeSource(practiceSource);
    const panel = $("idictationPanel");
    const summary = $("idictationSummary");
    const groupSelect = $("idictationGroup");
    const batchSelect = $("idictationBatch");
    if (!panel || !sourceKey) return;

    const selection = selectIdictationBatch(sourceKey, idictationPrefs[sourceKey] || {});
    const groups = listIdictationGroupOptions(sourceKey);
    const batches = listIdictationBatchOptions(sourceKey, selection.groupKey);

    if (summary) {
      summary.textContent = `原始 ${selection.rawRows || 0} 行 · 去重 ${selection.uniqueWords || 0} 词 · 按原表章节分组`;
    }

    if (groupSelect) {
      const markup = groups.map((item) => `<option value="${item.value}">${escapeHtml(item.label)}</option>`).join("");
      if (groupSelect.innerHTML !== markup) groupSelect.innerHTML = markup;
      groupSelect.value = selection.groupKey;
    }

    if (batchSelect) {
      const markup = batches.map((item) => `<option value="${item.value}">${escapeHtml(item.label)}</option>`).join("");
      if (batchSelect.innerHTML !== markup) batchSelect.innerHTML = markup;
      batchSelect.value = String(selection.batchIndex);
    }
  }

  function splitBatches(list) {
    const batches = [];
    for (let index = 0; index < list.length; index += BATCH_SIZE) batches.push(list.slice(index, index + BATCH_SIZE));
    return batches.length ? batches : [[]];
  }

  function buildLexiconIndex() {
    if (lexiconIndexCache.revision === lexiconRevision) return lexiconIndexCache.value;
    const map = new Map();
    allLexiconEntries.forEach((entry) => {
      const normalized = normalizeEntry(entry);
      map.set(id(normalized), normalized);
      map.set(norm(normalized.expectedAnswer), normalized);
    });
    lexiconIndexCache = { revision: lexiconRevision, value: map };
    return map;
  }

  function resolveErrorBankEntries() {
    const index = buildLexiconIndex();
    return Object.values(errorBank.records)
      .filter((item) => item?.everWrong && item.active !== false)
      .map((item) => index.get(item.wordId) || index.get(norm(parseLegacyWordId(item.wordId))))
      .filter(Boolean);
  }

  function parseLegacyWordId(wordId) {
    const value = String(wordId || "");
    const match = value.match(/^(?:word|phrase):(.+)$/i);
    return match ? match[1] : value;
  }

  function resolvePersonalWrongEntries() {
    const index = buildLexiconIndex();
    return personalWrongRecords
      .filter((item) => item.active !== false)
      .map((item) => {
        const answer = String(item.inflected || item.anchor || "").trim();
        const matched = index.get(norm(answer)) || index.get(`word:${norm(answer)}`) || index.get(`phrase:${norm(answer)}`);
        if (matched) {
          return normalizeEntry({
            ...matched,
            expectedAnswer: answer,
            displayText: answer,
            meaning: matched.meaning || "（做题错词）"
          });
        }
        return normalizeEntry({
          wordId: `personal:${item.scope}:${norm(answer)}`,
          word: answer,
          expectedAnswer: answer,
          meaning: "（手动添加错词）",
          pos: item.scope === "phrase" ? "短语" : "单词",
          entryType: item.scope === "phrase" ? "phrase" : "word"
        });
      });
  }

  function resolveSrsEntries() {
    const now = Date.now();
    return allLexiconEntries
      .map((entry) => normalizeEntry(entry))
      .filter((entry) => {
        const r = state.records[id(entry)];
        return r && Number(r.srsNextReviewAt || 0) > 0 && Number(r.srsNextReviewAt) <= now;
      });
  }

  function refreshPracticeEntries() {
    if (practiceSource === "error_bank") {
      entries = resolveErrorBankEntries();
      return;
    }

    if (practiceSource === "personal_wrong_book") {
      entries = resolvePersonalWrongEntries();
      return;
    }

    if (practiceSource === "srs_review") {
      entries = resolveSrsEntries();
      return;
    }

    if (isIdictationPracticeSource(practiceSource)) {
      entries = resolveIdictationEntries();
      populateIdictationPanel();
      return;
    }

    const filterKey = `${lexiconRevision}:${categoryType}:${categoryValue}`;
    if (categoryFilterCache.key !== filterKey) {
      categoryFilterCache = { key: filterKey, value: filterByCategory(allLexiconEntries) };
    }
    const filtered = categoryFilterCache.value;
    const batches = splitBatches(filtered);
    const safeIndex = Math.min(Math.max(0, batchIndex), Math.max(0, batches.length - 1));
    entries = batches[safeIndex] || [];
    populateBatchOptions(batches.length, safeIndex);
  }

  function populateCategoryTypeOptions() {
    const select = $("categoryType");
    if (!select) return;
    select.innerHTML = CATEGORY_TYPES.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
    select.value = categoryType;
  }

  function isQuickPickAvailable(pick) {
    if (pick.categoryType === "all") return true;
    if (pick.categoryType === "difficulty") {
      return allLexiconEntries.some((entry) => readEntryField(entry, "difficulty") === pick.categoryValue);
    }
    if (pick.categoryType === "lr_high_frequency") {
      return allLexiconEntries.some((entry) => matchSpellingCategory(entry, pick.categoryType, pick.categoryValue));
    }
    return false;
  }

  function renderCategoryQuickPicks() {
    const wrap = $("categoryQuickPicks");
    if (!wrap) return;
    const picks = CATEGORY_QUICK_PICKS.filter(isQuickPickAvailable);
    wrap.innerHTML = picks.map((pick) => {
      const active = categoryType === pick.categoryType && String(categoryValue || "") === String(pick.categoryValue || "");
      return `<button type="button" class="${active ? "active" : ""}" data-category-type="${escapeHtml(pick.categoryType)}" data-category-value="${escapeHtml(pick.categoryValue)}">${escapeHtml(pick.label)}</button>`;
    }).join("");
  }

  function renderCategoryValueQuickPicks(options = []) {
    const wrap = $("categoryValueQuickPicks");
    if (!wrap) return;
    wrap.innerHTML = options.slice(0, 12).map((item) => {
      const active = String(item.value || "") === String(categoryValue || "");
      return `<button type="button" class="${active ? "active" : ""}" data-category-value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`;
    }).join("");
  }

  function populateCategoryValueOptions() {
    const select = $("categoryValue");
    if (!select) return;

    let options = [];
    if (categoryType === "difficulty") {
      const present = new Set(allLexiconEntries.map((entry) => readEntryField(entry, "difficulty")).filter(Boolean));
      options = DIFFICULTY_OPTIONS.filter((value) => present.has(value)).map((value) => ({ value, label: value }));
    } else if (categoryType === "topic") {
      const present = new Set();
      allLexiconEntries.forEach((entry) => (readEntryField(entry, "topics") || []).forEach((topic) => present.add(topic)));
      options = TOPIC_OPTIONS.filter((value) => present.has(value)).map((value) => ({ value, label: value }));
    } else if (categoryType === "lr_high_frequency") {
      options = LR_OPTIONS;
    } else {
      options = [{ value: "", label: "全部" }];
    }

    if (!options.length) options = [{ value: "", label: "暂无分类" }];
    select.innerHTML = options.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
    if (!options.some((item) => item.value === categoryValue)) categoryValue = options[0].value;
    select.value = categoryValue;
    renderCategoryQuickPicks();
    renderCategoryValueQuickPicks(options);
  }

  function populateBatchOptions(batchCount, selectedIndex) {
    const select = $("batchIndex");
    const count = Math.max(1, batchCount || 1);
    const safeIndex = Math.min(selectedIndex, count - 1);
    if (select) {
      const markup = Array.from({ length: count }, (_, index) => `<option value="${index}">第 ${index + 1} 批 / 共 ${count} 批</option>`).join("");
      if (select.innerHTML !== markup) select.innerHTML = markup;
      select.value = String(safeIndex);
    }

    const label = $("batchStepperLabel");
    const prev = $("batchPrev");
    const next = $("batchNext");
    if (label) label.textContent = `第 ${safeIndex + 1} / ${count} 批`;
    if (prev) prev.disabled = safeIndex <= 0;
    if (next) next.disabled = safeIndex >= count - 1;
  }

  function updatePanels() {
    const categoryPanel = $("categoryPanel");
    const idictationPanel = $("idictationPanel");
    const personalPanel = $("personalWrongPanel");
    const includeToggle = $("includeFamiliar")?.closest(".toggle");

    if (categoryPanel) categoryPanel.hidden = practiceSource !== "category";
    if (idictationPanel) idictationPanel.hidden = !isIdictationPracticeSource(practiceSource);
    if (personalPanel) personalPanel.hidden = practiceSource !== "personal_wrong_book";
    if (includeToggle) includeToggle.style.display = practiceSource === "category" ? "" : "none";
  }

  function record(w) {
    const k = id(w);
    return state.records[k] || (state.records[k] = {
      wordId: k,
      repairState: "normal",
      repairCorrectCount: 0,
      doneToday: false,
      wrongAttempts: 0,
      lastWrongAnswer: "",
      correctAttempts: 0,
      nextEligibleAt: 0,
      lastSeenSequence: -999,
      lastSeenAt: 0,
      srsNextReviewAt: 0
    });
  }

  function eligible(r, now) {
    return r.repairState === "waiting_second" && now >= r.nextEligibleAt && sequence - r.lastSeenSequence >= REPAIR_WORDS;
  }

  function forced(r, now) {
    return r.repairState === "waiting_second" && (now - r.lastSeenAt >= FORCE_MS || sequence - r.lastSeenSequence >= FORCE_WORDS);
  }

  function buildCandidateSet() {
    const statuses = familiarMap();
    const includeFamiliar = !shouldExcludeFamiliar();
    const normalizedMode = normalizeEntryMode(mode);
    const sessionCandidates = [];
    const seen = new Set();
    const breakdown = {
      rawBatchTotal: entries.length,
      eligibleTotal: 0,
      sessionTotal: 0,
      filteredOutTotal: 0,
      filteredByFamiliar: 0,
      filteredByInvalidAnswer: 0,
      filteredByMode: 0,
      filteredByCompleted: 0,
      filteredByDuplicate: 0,
      filteredOther: 0,
      currentMode: normalizedMode,
      includeFamiliar
    };

    entries.forEach((entry) => {
      const normalized = normalizeEntry(entry);
      const key = norm(normalized.expectedAnswer);
      if (!normalized.wordId || !key) {
        breakdown.filteredByInvalidAnswer += 1;
        return;
      }

      breakdown.eligibleTotal += 1;
      if (normalizedMode === "phrases" && normalized.entryType !== "phrase") {
        breakdown.filteredByMode += 1;
        return;
      }
      if (normalizedMode === "headwords" && normalized.entryType !== "word") {
        breakdown.filteredByMode += 1;
        return;
      }
      if (!includeFamiliar && statuses[key] === "熟悉") {
        breakdown.filteredByFamiliar += 1;
        return;
      }
      if (seen.has(key)) {
        breakdown.filteredByDuplicate += 1;
        return;
      }

      seen.add(key);
      sessionCandidates.push(normalized);
    });

    const ordered = normalizedMode === "all" ? interleaveMixedCandidates(sessionCandidates) : sessionCandidates;
    breakdown.sessionTotal = ordered.length;
    breakdown.filteredOutTotal = Math.max(0, breakdown.rawBatchTotal - breakdown.sessionTotal);
    return { candidates: ordered, breakdown };
  }

  function candidates(candidateSet) {
    return (candidateSet || buildCandidateSet()).candidates;
  }

  function select(candidateList) {
    const now = Date.now();
    const list = candidateList || candidates();
    if (!list.length) return null;

    const locked = list.find((w) => record(w).repairState === "must_repair");
    if (locked) return locked;

    const restored = restoreSavedCandidate(list);
    if (restored) return restored;

    const pending = list.filter((w) => eligible(record(w), now));
    const overdue = list.filter((w) => forced(record(w), now));
    const pool = (overdue.length ? overdue : pending).filter((w) => id(w) !== state.lastId);
    if (pool.length) return pool[0];

    const normal = list.filter((w) => {
      const r = record(w);
      return !r.doneToday && r.repairState === "normal" && id(w) !== state.lastId;
    });
    if (normal.length) return normal[0];

    const alternate = list.find((w) => id(w) !== state.lastId);
    return alternate || list[0];
  }

  function batchProgress(candidateSet) {
    const resolvedSet = candidateSet || buildCandidateSet();
    const list = resolvedSet.candidates;
    const breakdown = resolvedSet.breakdown;
    let completedCount = 0;
    list.forEach((w) => {
      if (record(w).doneToday) completedCount += 1;
    });

    return {
      rawBatchTotal: breakdown.rawBatchTotal,
      sessionTotal: breakdown.sessionTotal,
      completedCount,
      filteredOutTotal: breakdown.filteredOutTotal,
      currentNumber: breakdown.sessionTotal ? Math.min(completedCount + 1, breakdown.sessionTotal) : 0,
      percent: breakdown.sessionTotal ? Math.round((completedCount / breakdown.sessionTotal) * 100) : 0
    };
  }

  function stats(candidateSet) {
    const resolvedSet = candidateSet || buildCandidateSet();
    const list = resolvedSet.candidates;
    let repair = 0;
    let due = 0;
    let remaining = 0;

    list.forEach((w) => {
      const r = record(w);
      if (["must_repair", "waiting_second"].includes(r.repairState)) repair += 1;
      if (r.srsNextReviewAt && r.srsNextReviewAt <= Date.now()) due += 1;
      if (!r.doneToday) remaining += 1;
    });

    return {
      remaining,
      repair,
      due,
      progress: batchProgress(resolvedSet),
      errorBankCount: practiceSource === "error_bank" ? entries.length : 0,
      personalWrongCount: personalWrongRecords.length
    };
  }

  function renderProgress(progress) {
    const el = $("progress");
    if (!el || !progress.sessionTotal) {
      if (el) el.innerHTML = "";
      return;
    }

    el.innerHTML = [
      `<div class="spelling-progress-text">进度：${progress.completedCount} / ${progress.sessionTotal}</div>`,
      progress.filteredOutTotal > 0 ? `<p class="spelling-progress-note">当前范围原始 ${progress.rawBatchTotal} 项，实际训练 ${progress.sessionTotal} 项。</p>` : "",
      `<div class="spelling-progress-track"><div class="spelling-progress-fill" style="width:${progress.percent}%"></div></div>`
    ].join("");
  }

  function sourceDetailLabel() {
    if (practiceSource === "category") {
      const typeLabel = (CATEGORY_TYPES.find((item) => item.value === categoryType) || {}).label || "分类";
      const valueLabel = $("categoryValue")?.selectedOptions?.[0]?.textContent || "全部";
      return `${typeLabel} · ${valueLabel}`;
    }
    if (practiceSource === "error_bank") return `共 ${entries.length} 个错词`;
    if (practiceSource === "personal_wrong_book") return `共 ${personalWrongRecords.length} 条`;
    if (practiceSource === "srs_review") return `到期 ${entries.length} 个`;
    if (isIdictationPracticeSource(practiceSource)) {
      const sourceKey = idictationSourceKeyFromPracticeSource(practiceSource);
      const selection = selectIdictationBatch(sourceKey, idictationPrefs[sourceKey] || {});
      return `${selection.groupLabel || "原表章节"} · ${selection.batchEntryCount}词`;
    }
    return "";
  }

  function updateSettingsSummary() {
    const summary = $("settingsSummary");
    if (!summary) return;
    const source = SOURCE_LABELS[practiceSource] || practiceSource;
    const detail = practiceSource === "category"
      ? `${$("categoryValue")?.selectedOptions?.[0]?.textContent || "全部"} · 第 ${Number(batchIndex || 0) + 1} 批`
      : sourceDetailLabel();
    summary.textContent = `${modeLabel(mode)} · ${source}${detail ? ` · ${detail}` : ""}`;
  }

  function render(feedback = "", kind = "") {
    refreshPracticeEntries();
    const candidateSet = buildCandidateSet();
    current = select(candidateSet.candidates);
    const normalized = current ? normalizeEntry(current) : null;
    const s = stats(candidateSet);

    const statsMarkup = [
      `<span>来源：${SOURCE_LABELS[practiceSource] || practiceSource}</span>`,
      `<span>${escapeHtml(sourceDetailLabel())}</span>`,
      `<span>范围：${modeLabel(mode)}</span>`,
      `<span>待拼：${s.remaining}</span>`,
      practiceSource === "error_bank" ? `<span>错词本：${s.errorBankCount}</span>` : "",
      practiceSource === "personal_wrong_book" ? `<span>做题错词：${s.personalWrongCount}</span>` : "",
      `<span>SRS：${s.due}</span>`
    ].filter(Boolean).join("");
    if ($("stats").innerHTML !== statsMarkup) $("stats").innerHTML = statsMarkup;
    updateSettingsSummary();

    renderProgress(s.progress);
    $("feedback").className = "feedback " + kind;
    $("feedback").textContent = feedback;
    $("errorAnalysis").hidden = true;

    if (!normalized) {
      const emptyHint = practiceSource === "error_bank"
        ? "错词本还是空的；拼错后会自动收录。"
        : practiceSource === "personal_wrong_book"
          ? "请先在上面的输入框添加做题错词。"
          : practiceSource === "srs_review"
            ? "当前没有到期的 SRS 复习项。"
            : isIdictationPracticeSource(practiceSource)
              ? "当前爱听写组别没有可练题目，请切换频率组或组别。"
              : "当前分类范围没有可练题目，请切换分类或勾选“包含熟悉内容”。";
      $("question").textContent = emptyHint;
      $("answer").disabled = true;
      $("submit").disabled = true;
      $("hint").disabled = true;
      const audioBar = $("audioBar");
      if (audioBar) audioBar.hidden = true;
      return;
    }

    const exampleLine = formatExample(normalized.example, normalized.expectedAnswer);
    $("question").innerHTML = [
      `<div class="type">类型：${escapeHtml(normalized.pos)}</div>`,
      `<div>中文释义：${escapeHtml(normalized.meaning || "请根据释义拼写")}</div>`,
      normalized.phonetic ? `<div class="meta">音标：${escapeHtml(normalized.phonetic)}</div>` : "",
      exampleLine ? `<div class="example">例句：${escapeHtml(exampleLine)}</div>` : "",
      normalized.exampleCn ? `<div class="example-cn">${escapeHtml(normalized.exampleCn)}</div>` : "",
      `<div class="meta">提示：${normalized.expectedAnswer.length} 个字符</div>`
    ].join("");

    const r = record(normalized);
    $("answer").disabled = false;
    $("submit").disabled = false;
    $("hint").disabled = false;
    const audioBar = $("audioBar");
    if (audioBar) {
      audioBar.hidden = false;
      const playWordBtn = $("playWord");
      const playExampleBtn = $("playExample");
      if (playWordBtn) playWordBtn.disabled = !normalized.expectedAnswer;
      if (playExampleBtn) playExampleBtn.disabled = !normalized.example;
    }
    $("answer").placeholder = r.repairState === "must_repair" ? "必须先拼对当前内容" : normalized.entryType === "phrase" ? "输入完整短语" : "输入英文单词";
    persistCurrentPosition(normalized);
    focusAnswer();
  }

  function chunks(text) {
    const cleaned = String(text || "").trim();
    return cleaned.split(/\s+/).map((part) => part.match(/.{1,3}/g).join(" · ")).join("  /  ");
  }

  function formatExample(example, target) {
    const text = String(example || "").trim();
    if (!text) return "";
    if (text.includes("______")) return text;
    const escaped = String(target || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!escaped) return text;
    return text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "______");
  }

  function escapeHtml(v) {
    return String(v || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function isMobileViewport() {
    return Boolean(window.matchMedia?.("(max-width: 650px)")?.matches) || window.innerWidth <= 650;
  }

  let suppressAnswerFocusUntil = 0;

  function suppressAnswerFocus(ms = 1800) {
    suppressAnswerFocusUntil = Math.max(suppressAnswerFocusUntil, Date.now() + ms);
  }

  function shouldSkipAnswerFocus() {
    if (isMobileViewport() || Date.now() < suppressAnswerFocusUntil) return true;
    const active = document.activeElement;
    if (!active || active === document.body || active === $("answer")) return false;
    return Boolean(active.closest?.(".control-panel, .source-tabs, .mode-tabs"));
  }

  function focusAnswer() {
    if (shouldSkipAnswerFocus()) return;
    const input = $("answer");
    if (!input || input.disabled) return;
    window.requestAnimationFrame(() => {
      if (shouldSkipAnswerFocus()) return;
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    });
  }

  function repairRequired(r) {
    return Number(r.wrongAttempts || 0) >= 2 ? 3 : 2;
  }

  function diagnoseError(answer, expected) {
    if (answer.length < expected.length) return "缺少字母或单词";
    if (answer.length > expected.length) return "多出字母或单词";
    return "字母或词序不匹配";
  }

  function showErrorAnalysis(expected, submitted) {
    const el = $("errorAnalysis");
    el.innerHTML = [
      `<div><span>正确答案</span><strong>${escapeHtml(expected)}</strong></div>`,
      `<div><span>你的输入</span><b>${escapeHtml(submitted || "（空）")}</b></div>`,
      `<div><span>错误类型</span><b>${escapeHtml(diagnoseError(norm(submitted), norm(expected)))}</b></div>`
    ].join("");
    el.hidden = false;
  }

  function nextAfterCorrect(r) {
    r.lastSeenSequence = sequence;
    r.lastSeenAt = Date.now();
    state.lastId = current ? id(current) : "";
    sequence += 1;
    save();
    $("answer").value = "";
    render("拼写正确，已进入下一题。", "correct");
  }

  function modeLabel(value) {
    const normalized = normalizeEntryMode(value);
    if (normalized === "phrases") return "短语";
    if (normalized === "headwords") return "单词";
    return "混合";
  }

  function storeLexiconMeta(meta) {
    lexiconMeta = meta;
    localStorage.setItem(LEXICON_META_KEY, JSON.stringify({ lexiconVersion: meta.lexiconVersion, lexiconHash: meta.lexiconHash, counts: meta.counts, updatedAt: Date.now() }));
  }

  function restorePrefs() {
    const prefs = readPrefs();
    const query = new URLSearchParams(window.location.search);
    const requestedSource = query.get("source") || "";
    const requestedMode = query.get("mode") || "";
    practiceSource = VALID_PRACTICE_SOURCES.has(requestedSource)
      ? requestedSource
      : (prefs.practiceSource || "category");
    categoryType = prefs.categoryType || "all";
    categoryValue = prefs.categoryValue || "";
    batchIndex = Number(prefs.batchIndex || 0) || 0;
    mode = VALID_ENTRY_MODES.has(requestedMode) ? requestedMode : (prefs.mode || "all");
    idictationPrefs = {
      listening: normalizeIdictationPrefs("listening", prefs.idictation?.listening || {}),
      reading: normalizeIdictationPrefs("reading", prefs.idictation?.reading || {})
    };
  }

  function persistPrefs() {
    writePrefs({ practiceSource, categoryType, categoryValue, batchIndex, mode, idictation: idictationPrefs });
  }

  function syncPracticeSourceUrl() {
    const url = new URL(window.location.href);
    if (practiceSource === "category") url.searchParams.delete("source");
    else url.searchParams.set("source", practiceSource);
    window.history.replaceState(null, "", url);
  }

  function syncEntryModeUrl() {
    const url = new URL(window.location.href);
    if (mode === "all") url.searchParams.delete("mode");
    else url.searchParams.set("mode", mode);
    window.history.replaceState(null, "", url);
  }

  const STATIC_DATA_VERSION = "20260805_master_g_audit_sync_v20";

  function versionedDataPath(requestPath) {
    return requestPath + (requestPath.includes("?") ? "&" : "?") + "v=" + STATIC_DATA_VERSION;
  }

  async function fetchFirstOk(paths) {
    for (const requestPath of paths) {
      const response = await fetch(versionedDataPath(requestPath), { cache: "default" }).catch(() => null);
      if (response?.ok) return response;
    }
    return null;
  }

  function requestDataset(key, paths) {
    if (dataRequests.has(key)) return dataRequests.get(key);
    const request = fetchFirstOk(paths)
      .then((response) => response?.ok ? response.json() : {})
      .catch((error) => {
        dataRequests.delete(key);
        throw error;
      });
    dataRequests.set(key, request);
    return request;
  }

  function rebuildLexiconEntries() {
    const words = wordPayload || {};
    const phrases = phrasePayload || {};
    const raw = Array.isArray(words) ? words : (words.words || []);
    const extra = Array.isArray(phrases) ? phrases : (phrases.phrases || []);
    const seen = new Set(raw.map((entry) => norm(expectedAnswer(entry))));
    const restored = extra.filter((entry) => !seen.has(norm(expectedAnswer(entry))));

    allLexiconEntries = raw.concat(restored);
    lexiconRevision += 1;
    lexiconIndexCache.revision = -1;
    categoryFilterCache.key = "";
    storeLexiconMeta({
      lexiconVersion: [words.version || words.savedAt || "", phrases.version || phrases.generatedAt || "", raw.length, restored.length].join("|"),
      lexiconHash: String(raw.length) + ":" + String(restored.length),
      counts: { headwords: raw.length, phrases: restored.length, total: allLexiconEntries.length }
    });
  }

  async function ensureWordsLoaded() {
    if (wordPayload !== undefined) return;
    wordPayload = await requestDataset("words", ["./data/words.json", "/data/words.json"]);
    rebuildLexiconEntries();
  }

  async function ensurePhrasesLoaded() {
    if (phrasePayload !== undefined) return;
    phrasePayload = await requestDataset("phrases", ["./data/phrases.json", "/data/phrases.json"]);
    rebuildLexiconEntries();
  }

  async function ensureIdictationLoaded() {
    if (idictationPayload !== null) return;
    idictationPayload = await requestDataset("idictation", ["./data/idictation-frequency.json", "/data/idictation-frequency.json"]);
    idictationCache = { payload: idictationPayload, groups: new Map(), entries: new Map() };
    idictationPrefs = {
      listening: normalizeIdictationPrefs("listening", idictationPrefs.listening || {}),
      reading: normalizeIdictationPrefs("reading", idictationPrefs.reading || {})
    };
  }

  function showLoading(message = "正在准备本轮训练") {
    $("question").textContent = message;
    $("answer").disabled = true;
    $("submit").disabled = true;
    $("hint").disabled = true;
    if ($("audioBar")) $("audioBar").hidden = true;
  }

  async function loadCurrentSelection({ progressive = false } = {}) {
    const loadVersion = ++selectionLoadVersion;
    const sourceAtStart = practiceSource;
    const modeAtStart = mode;
    showLoading();

    if (isIdictationPracticeSource(sourceAtStart)) {
      await ensureIdictationLoaded();
    } else if (modeAtStart === "phrases") {
      await ensurePhrasesLoaded();
    } else {
      await ensureWordsLoaded();
      if (progressive && modeAtStart === "all" && loadVersion === selectionLoadVersion) {
        populateCategoryValueOptions();
        renderPersonalWrongList();
        render();
      }
      if (modeAtStart === "all") await ensurePhrasesLoaded();
    }

    if (loadVersion !== selectionLoadVersion || sourceAtStart !== practiceSource || modeAtStart !== mode) return;
    populateCategoryValueOptions();
    renderPersonalWrongList();
    render();
  }

  async function load() {
    try {
      syncSettingsPanelMode(true);
      restorePrefs();
      updatePanels();
      populateCategoryTypeOptions();
      document.querySelectorAll("[data-source]").forEach((btn) => btn.classList.toggle("active", btn.dataset.source === practiceSource));
      document.querySelectorAll("[data-mode]").forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === mode));
      await loadCurrentSelection({ progressive: true });
    } catch (e) {
      $("question").textContent = "词库加载失败：" + e.message;
    }
  }

  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!current) return;

    const normalized = normalizeEntry(current);
    const submitted = $("answer").value.trim();
    const answer = norm(submitted);
    const expected = norm(normalized.expectedAnswer);
    if (!answer) return;

    const r = record(normalized);
    if (answer !== expected) {
      r.wrongAttempts += 1;
      r.lastWrongAnswer = submitted;
      r.repairState = "must_repair";
      r.repairCorrectCount = 0;
      r.nextEligibleAt = 0;
      upsertErrorBank(normalized, submitted);
      save();
      $("answer").value = "";
      render("拼写错误，已加入错词本，请重新输入。", "wrong");
      showErrorAnalysis(normalized.expectedAnswer, submitted);
      focusAnswer();
      return;
    }

    r.correctAttempts += 1;
    if (r.repairState === "must_repair") {
      r.repairState = "waiting_second";
      r.repairCorrectCount = 1;
      r.nextEligibleAt = Date.now() + REPAIR_MS;
      nextAfterCorrect(r);
      return;
    }

    if (r.repairState === "waiting_second") {
      r.repairCorrectCount += 1;
      if (r.repairCorrectCount >= repairRequired(r)) {
        r.repairState = "done_today";
        r.doneToday = true;
        r.srsNextReviewAt = Date.now() + 24 * 60 * 60 * 1000;
      } else {
        r.nextEligibleAt = Date.now() + REPAIR_MS;
      }
      nextAfterCorrect(r);
      return;
    }

    r.doneToday = true;
    r.srsNextReviewAt = Date.now() + 24 * 60 * 60 * 1000;
    nextAfterCorrect(r);
  });

  $("hint").addEventListener("click", function () {
    if (!current) return;
    const normalized = normalizeEntry(current);
    const r = record(normalized);
    const level = Math.min(3, (r.hintLevel || 0) + 1);
    r.hintLevel = level;
    save();
    const ans = normalized.expectedAnswer;
    const hint = level === 1 ? "长度：" + ans.length : level === 2 ? chunks(ans) : ans;
    $("feedback").className = "feedback waiting";
    $("feedback").textContent = "提示：" + hint;
  });

  document.addEventListener("pointerdown", (event) => {
    if (event.target?.closest?.(".control-panel, .source-tabs, .mode-tabs")) suppressAnswerFocus();
  }, true);

  document.addEventListener("mousedown", (event) => {
    if (event.target?.closest?.(".control-panel, .source-tabs, .mode-tabs")) suppressAnswerFocus();
  }, true);

  document.addEventListener("touchstart", (event) => {
    if (event.target?.closest?.(".control-panel, .source-tabs, .mode-tabs")) suppressAnswerFocus();
  }, true);

  document.addEventListener("focusin", (event) => {
    if (event.target?.closest?.(".control-panel, .source-tabs, .mode-tabs")) suppressAnswerFocus();
  }, true);

  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      mode = btn.dataset.mode || "all";
      document.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x === btn));
      persistPrefs();
      syncEntryModeUrl();
      try {
        await loadCurrentSelection();
      } catch (e) {
        $("question").textContent = "词库加载失败：" + e.message;
      }
    });
  });

  $("settingsToggle")?.addEventListener("click", () => {
    settingsCollapsed = !settingsCollapsed;
    localStorage.setItem(SETTINGS_PANEL_PREF_PREFIX + settingsViewportKey(), settingsCollapsed ? "1" : "0");
    applySettingsPanelState();
  });

  window.addEventListener("resize", () => syncSettingsPanelMode(false), { passive: true });

  document.querySelectorAll("[data-source]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      practiceSource = btn.dataset.source || "category";
      document.querySelectorAll("[data-source]").forEach((x) => x.classList.toggle("active", x === btn));
      updatePanels();
      persistPrefs();
      syncPracticeSourceUrl();
      try {
        await loadCurrentSelection();
      } catch (e) {
        $("question").textContent = "词库加载失败：" + e.message;
      }
    });
  });

  $("categoryType")?.addEventListener("change", () => {
    categoryType = $("categoryType").value || "all";
    populateCategoryValueOptions();
    batchIndex = 0;
    persistPrefs();
    render();
  });

  $("categoryQuickPicks")?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button[data-category-type]");
    if (!button) return;
    categoryType = button.dataset.categoryType || "all";
    categoryValue = button.dataset.categoryValue || "";
    batchIndex = 0;
    populateCategoryTypeOptions();
    populateCategoryValueOptions();
    persistPrefs();
    render();
  });

  $("categoryValueQuickPicks")?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button[data-category-value]");
    if (!button) return;
    categoryValue = button.dataset.categoryValue || "";
    batchIndex = 0;
    populateCategoryValueOptions();
    persistPrefs();
    render();
  });

  $("categoryValue")?.addEventListener("change", () => {
    categoryValue = $("categoryValue").value || "";
    batchIndex = 0;
    persistPrefs();
    render();
  });

  $("idictationGroup")?.addEventListener("change", () => {
    const sourceKey = idictationSourceKeyFromPracticeSource(practiceSource);
    if (!sourceKey) return;
    idictationPrefs[sourceKey] = normalizeIdictationPrefs(sourceKey, {
      groupKey: $("idictationGroup").value || "",
      batchIndex: 0
    });
    persistPrefs();
    render();
  });

  $("idictationBatch")?.addEventListener("change", () => {
    const sourceKey = idictationSourceKeyFromPracticeSource(practiceSource);
    if (!sourceKey) return;
    idictationPrefs[sourceKey] = normalizeIdictationPrefs(sourceKey, {
      groupKey: $("idictationGroup")?.value || idictationPrefs[sourceKey]?.groupKey || "",
      batchIndex: Number($("idictationBatch").value || 0) || 0
    });
    persistPrefs();
    render();
  });

  $("batchIndex")?.addEventListener("change", () => {
    batchIndex = Number($("batchIndex").value || 0) || 0;
    persistPrefs();
    render();
  });

  $("batchPrev")?.addEventListener("click", () => {
    batchIndex = Math.max(0, Number(batchIndex || 0) - 1);
    persistPrefs();
    render();
  });

  $("batchNext")?.addEventListener("click", () => {
    batchIndex = Number(batchIndex || 0) + 1;
    persistPrefs();
    render();
  });

  $("includeFamiliar")?.addEventListener("change", () => render());

  $("addPersonalWrong")?.addEventListener("click", () => {
    const lines = parsePersonalWrongLines($("personalWrongInput").value || "");
    if (!lines.length) {
      $("feedback").className = "feedback waiting";
      $("feedback").textContent = "请先输入至少一个单词或短语。";
      return;
    }
    addPersonalWrongRecords(lines);
    $("personalWrongInput").value = "";
    render(`已添加 ${lines.length} 条做题错词。`, "correct");
  });

  $("playWord")?.addEventListener("click", () => {
    playCurrentWordAudio();
    focusAnswer();
  });

  $("playExample")?.addEventListener("click", () => {
    playCurrentExampleAudio();
    focusAnswer();
  });

  $("skipBtn")?.addEventListener("click", () => skipCurrent());

  $("clearPersonalWrong")?.addEventListener("click", () => {
    if (!personalWrongRecords.length) return;
    if (!window.confirm("确定清空所有做题错词吗？")) return;
    personalWrongRecords = [];
    writePersonalWrong();
    renderPersonalWrongList();
    render("做题错词已清空。", "waiting");
  });

  function resolveAudioPath(path) {
    const value = String(path || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("./")) return value;
    if (value.startsWith("/")) return "." + value;
    return "./" + value;
  }

  function resolveEntryAudioPath(item, kind) {
    if (!item) return "";
    if (kind === "example") {
      return resolveAudioPath(item.exampleAudio || item.example_audio || item.sentenceAudio || item.sentence_audio || "");
    }
    return resolveAudioPath(item.audio || item.wordAudio || item.word_audio || "");
  }

  function timeoutSignal(ms) {
    if (!("AbortController" in window)) return { signal: null, cancel() {} };
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, ms);
    return {
      signal: controller.signal,
      cancel() {
        window.clearTimeout(timer);
      }
    };
  }

  async function cachedAudioUrl(path, timeoutMs) {
    if (!path) throw new Error("no audio");
    if (audioUrlCache.has(path)) return audioUrlCache.get(path);
    let cache = null;
    let response = null;

    if ("caches" in window) {
      try {
        cache = await caches.open(AUDIO_CACHE_NAME);
        response = await cache.match(path);
      } catch {}
    }

    if (!response) {
      const timer = timeoutSignal(timeoutMs || 1200);
      try {
        response = await fetch(path, { cache: "force-cache", signal: timer.signal });
        timer.cancel();
        if (!response.ok) throw new Error("audio fetch failed");
        if (cache) {
          try {
            await cache.put(path, response.clone());
          } catch {}
        }
      } catch (error) {
        timer.cancel();
        throw error;
      }
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    audioUrlCache.set(path, url);
    return url;
  }

  function browserSpeak(text) {
    const value = String(text || "").trim();
    if (!value || !("speechSynthesis" in window)) return false;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(value);
      utterance.lang = "en-GB";
      utterance.rate = 0.92;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  function stopAudioPlayer() {
    if (audioPlayer) {
      audioPlayer.onended = null;
      audioPlayer.onerror = null;
      try {
        audioPlayer.pause();
      } catch {}
      try {
        audioPlayer.currentTime = 0;
      } catch {}
      audioPlayer = null;
    }
  }

  async function playAudio(path, fallbackText) {
    const text = String(fallbackText || "").trim();
    if (!path) {
      browserSpeak(text);
      return;
    }
    try {
      stopAudioPlayer();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      const url = await cachedAudioUrl(path, 1500);
      audioPlayer = new Audio(url);
      audioPlayer.preload = "auto";
      audioPlayer.playsInline = true;
      audioPlayer.volume = 1;
      await audioPlayer.play();
    } catch {
      stopAudioPlayer();
      browserSpeak(text);
    }
  }

  function playCurrentWordAudio() {
    if (!current) return;
    const normalized = normalizeEntry(current);
    playAudio(resolveEntryAudioPath(normalized, "word"), normalized.expectedAnswer);
  }

  function playCurrentExampleAudio() {
    if (!current) return;
    const normalized = normalizeEntry(current);
    playAudio(resolveEntryAudioPath(normalized, "example"), normalized.example);
  }

  function skipCurrent() {
    if (!current) return;
    state.lastId = id(current);
    sequence += 1;
    $("answer").value = "";
    save();
    render("已跳过，进入下一题。", "waiting");
  }

  let autoSubmitTimer = 0;
  $("answer").addEventListener("input", () => {
    window.clearTimeout(autoSubmitTimer);
    if (!current || norm($("answer").value) !== norm(expectedAnswer(current))) return;
    autoSubmitTimer = window.setTimeout(() => $("form").requestSubmit(), 350);
  });

  document.addEventListener("keydown", (event) => {
    if (!current) return;

    if (event.key === "Tab") {
      event.preventDefault();
      playCurrentWordAudio();
      focusAnswer();
      return;
    }

    if (event.key === " " || event.code === "Space") {
      const phraseTyping = isPhrase(current) && event.target === $("answer") && Boolean($("answer").value);
      if (phraseTyping) return;
      event.preventDefault();
      playCurrentExampleAudio();
      focusAnswer();
      return;
    }

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      skipCurrent();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      $("form").requestSubmit();
    }
  });

  load();
})();
