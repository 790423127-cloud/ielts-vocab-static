/* Static 便携版 · G类阅读提升 — vocab + paraphrases MCQ + separated status (v4 keys) */
(function () {
  "use strict";

  var STATUS_KEY = "ielts_reading_g_status_v3";
  var PARA_KEY = "ielts_reading_g_paraphrase_status_v3";
  var COVERAGE_KEY = "ielts_reading_g_para_coverage_v1";
  var REVIEW_KEY = "ielts_reading_g_paraphrase_review_v1";
  var PARA_SESSION_KEY = "ielts_reading_g_paraphrase_session_v1";
  var SESSION_KEY = "ielts_reading_g_session_v3";
  var CONTROLS_COLLAPSED_KEY = "ielts_static_reading_g_controls_collapsed_v1_";
  var MIG_V4 = "ielts_reading_g_migration_v4";
  var DATA_URL = "./data/reading-g-vocab.json";
  var PARA_URL = "./data/reading-g-paraphrases.json";
  var DATA_VERSION = "20260714_d28_load_performance_v1";
  var SESSION_SIZES = { guided: 10, quick: 20, full: 80 };

  var words = [];
  var groups = [];
  var filter = { type: "pathStage", value: "1" };
  var statusMap = {};
  var paraMap = {};
  var index = 0;
  var study = [];
  var quizQueue = [];
  var quizPos = 0;
  var quizRevealed = false;
  var quizSelected = null;
  var quizSessionMode = "guided";
  var paraReview = { version: 1, groups: {}, updatedAt: 0 };
  var paraSession = null;
  var recallRevealed = false;
  var resumePending = false;
  var coverage = {
    version: 1,
    seenGroupIds: [],
    currentCycleOrder: [],
    currentCycleIndex: 0,
    cycleNumber: 1,
    lastSessionGroupIds: [],
    sessionMode: "guided",
    sessionSize: 10
  };

  var els = {
    word: document.getElementById("word"),
    basic: document.getElementById("basic"),
    example: document.getElementById("example"),
    exampleCn: document.getElementById("exampleCn"),
    count: document.getElementById("count"),
    progressFill: document.getElementById("progressFill"),
    favoriteBtn: document.getElementById("favoriteBtn"),
    unfamiliarAlert: document.getElementById("unfamiliarAlert"),
    bankMeta: document.getElementById("bankMeta"),
    topicBar: document.getElementById("topicBar"),
    toast: document.getElementById("toast"),
    knownBtn: document.getElementById("knownBtn"),
    unknownBtn: document.getElementById("unknownBtn"),
    loadInfo: document.getElementById("loadInfo"),
    quizBox: document.getElementById("quizBox"),
    quizOptions: document.getElementById("quizOptions"),
    quizExplain: document.getElementById("quizExplain"),
    swipeArea: document.getElementById("swipeArea"),
    exampleCard: document.querySelector(".example-card"),
    readingControls: document.getElementById("readingControls"),
    readingControlsToggle: document.getElementById("readingControlsToggle"),
    readingControlsSummary: document.getElementById("readingControlsSummary")
  };

  var controlsViewport = "";
  var controlsCollapsed = false;

  function controlsViewportKey() {
    return window.matchMedia("(max-width: 900px)").matches ? "mobile" : "desktop";
  }

  function controlsStorageKey(viewport) {
    return CONTROLS_COLLAPSED_KEY + viewport;
  }

  function filterSummaryLabel() {
    if (filter.type === "paraphraseQuiz") {
      if (filter.sessionMode === "quick") return "快速测验 · 本轮20题";
      if (filter.sessionMode === "full") return "完整测验 · 本轮80题";
      return "引导学习 · 本轮10组";
    }
    if (filter.type === "learnMode") return filter.value === "phrase" ? "短语学习" : "词义学习";
    if (filter.type === "pathStage") return "阶段" + (filter.value || "1");
    if (filter.type === "status") return filter.value || "学习状态";
    if (filter.type === "layer") {
      var layerLabels = {
        paraCore600: "表达识别核心",
        paraExt500: "表达识别扩展"
      };
      return layerLabels[filter.value] || "专项分层";
    }
    if (filter.type === "active") return "全部待学";
    return "当前学习范围";
  }

  function updateControlsSummary() {
    if (!els.readingControlsSummary) return;
    var total = isQuiz() ? eligibleGroups().length + "组安全题库" : study.length + "个词条";
    els.readingControlsSummary.innerHTML =
      "<strong>当前范围</strong> · " + filterSummaryLabel() + " · " + total;
  }

  function applyControlsState(collapsed, persist) {
    controlsCollapsed = !!collapsed;
    if (els.readingControls) {
      els.readingControls.classList.toggle("is-collapsed", controlsCollapsed);
    }
    if (els.readingControlsToggle) {
      els.readingControlsToggle.setAttribute("aria-expanded", String(!controlsCollapsed));
      els.readingControlsToggle.textContent = controlsCollapsed ? "展开设置" : "收起设置";
    }
    if (persist && controlsViewport) {
      try {
        localStorage.setItem(controlsStorageKey(controlsViewport), controlsCollapsed ? "1" : "0");
      } catch (e) {}
    }
  }

  function syncControlsMode() {
    var nextViewport = controlsViewportKey();
    if (nextViewport === controlsViewport) return;
    controlsViewport = nextViewport;
    var saved = null;
    try {
      saved = localStorage.getItem(controlsStorageKey(controlsViewport));
    } catch (e) {}
    applyControlsState(saved == null ? controlsViewport === "mobile" : saved === "1", false);
  }

  function toast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg || "";
    els.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      els.toast.classList.remove("show");
    }, 1800);
  }

  function loadJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function nk(word) {
    return String(word || "")
      .trim()
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, " ");
  }

  function entryKey(item) {
    if (!item) return "";
    if (item.id) return String(item.id);
    var t = item.entryType === "phrase" || /\s/.test(item.word || "") ? "phrase" : "word";
    return t + "::" + (item.normalizedKey || nk(item.word));
  }

  function normalizeEntry(entry, i) {
    if (!entry || typeof entry !== "object") return null;
    var word = String(entry.word || "").trim();
    if (!word) return null;
    var entryType =
      entry.entryType === "phrase" || /\s/.test(word) ? "phrase" : "word";
    var meaning = String(
      entry.primaryMeaningZh || entry.meaning || entry.meaningZh || entry.definition || ""
    ).trim();
    var layers = Array.isArray(entry.layers) ? entry.layers.slice() : [];
    return {
      id: entry.id || "rg_" + entryType + "_" + i,
      entryType: entryType,
      word: word,
      normalizedKey: entry.normalizedKey || nk(word),
      phonetic: String(entry.phonetic || "").trim(),
      pos: String(entry.primaryPos || entry.pos || (entryType === "phrase" ? "phrase" : "")).trim(),
      meaning: meaning,
      example: String(entry.example || "").trim(),
      exampleCn: String(entry.exampleCn || entry.exampleZh || "").trim(),
      layers: layers,
      primaryLayer: String(entry.primaryLayer || layers[0] || "").trim(),
      phraseStudyStage: Number(entry.phraseStudyStage) || 0,
      studyMode: entry.studyMode === "reference" ? "reference" : "active",
      senses: Array.isArray(entry.senses) ? entry.senses : [],
      topics: Array.isArray(entry.topics) ? entry.topics : []
    };
  }

  function emptyStatus() {
    return {
      meaningStatus: "unlearned",
      phraseStatus: "unlearned",
      paraphraseStatus: "unlearned",
      status: "",
      favorite: false
    };
  }

  function normStatus(raw) {
    if (!raw) return emptyStatus();
    if (typeof raw === "string") {
      return {
        meaningStatus: raw === "熟悉" ? "familiar" : raw === "不熟" ? "unfamiliar" : "unlearned",
        phraseStatus: "unlearned",
        paraphraseStatus: "unlearned",
        status: raw,
        favorite: false
      };
    }
    return {
      meaningStatus: raw.meaningStatus || (raw.status === "熟悉" ? "familiar" : raw.status === "不熟" ? "unfamiliar" : "unlearned"),
      phraseStatus: raw.phraseStatus || "unlearned",
      paraphraseStatus: raw.paraphraseStatus || "unlearned",
      status: raw.status || "",
      favorite: !!raw.favorite
    };
  }

  function readStatusMap() {
    var raw = loadJson(STATUS_KEY, {});
    if (raw && raw.entries) return raw.entries;
    return raw && typeof raw === "object" ? raw : {};
  }

  function writeStatusMap(map) {
    var payload = {
      progressSchemaVersion: 4,
      entries: map || {},
      paraphrases: paraMap || {}
    };
    saveJson(STATUS_KEY, payload);
  }

  function isQuiz() {
    return filter.type === "paraphraseQuiz";
  }

  function modeOf(item) {
    if (isQuiz()) return "paraphrase";
    if (filter.type === "learnMode" && filter.value === "phrase") return "phrase";
    if (filter.type === "learnMode" && filter.value === "meaning") return "meaning";
    if (item && (item.entryType === "phrase" || /\s/.test(item.word || ""))) return "phrase";
    return "meaning";
  }

  function getStatusCode(item) {
    var e = normStatus(statusMap[entryKey(item)] || statusMap[nk(item && item.word)]);
    var m = modeOf(item);
    if (m === "phrase") return e.phraseStatus || "unlearned";
    if (m === "paraphrase") return e.paraphraseStatus || "unlearned";
    return e.meaningStatus || "unlearned";
  }

  function getUiStatus(item) {
    var c = getStatusCode(item);
    if (c === "familiar") return "熟悉";
    if (c === "unfamiliar") return "不熟";
    return "";
  }

  function isFavorite(item) {
    return !!normStatus(statusMap[entryKey(item)]).favorite;
  }

  function patchStatus(item, patch) {
    var key = entryKey(item);
    if (!key) return;
    var prev = normStatus(statusMap[key]);
    var next = Object.assign({}, prev);
    var m = modeOf(item);
    if (patch.favorite !== undefined) next.favorite = !!patch.favorite;
    if (patch.status !== undefined) {
      var code =
        patch.status === "熟悉" ? "familiar" : patch.status === "不熟" ? "unfamiliar" : "unlearned";
      if (m === "phrase") next.phraseStatus = code;
      else if (m === "paraphrase") next.paraphraseStatus = code;
      else {
        next.meaningStatus = code;
        next.status = patch.status;
      }
    }
    statusMap[key] = next;
    writeStatusMap(statusMap);
  }

  function matchStage(item, stage) {
    var layers = item.layers || [];
    if (stage === "1") {
      if (item.studyMode === "reference") return false;
      if (
        layers.indexOf("priority1500") >= 0 ||
        layers.indexOf("answerCore250") >= 0 ||
        layers.indexOf("logic120") >= 0
      )
        return true;
      return layers.indexOf("phrases400") >= 0 && Number(item.phraseStudyStage) === 1;
    }
    if (stage === "2") {
      if (item.studyMode === "reference") return false;
      if (layers.indexOf("tierB1200") >= 0) return true;
      return layers.indexOf("phrases400") >= 0 && Number(item.phraseStudyStage) === 2;
    }
    if (stage === "3") {
      if (item.studyMode === "reference") return false;
      return (
        layers.indexOf("paraCore600") >= 0 ||
        layers.indexOf("tierC800") >= 0 ||
        layers.indexOf("paraExt500") >= 0
      );
    }
    if (stage === "4") {
      return item.studyMode === "reference" || layers.indexOf("reference701") >= 0;
    }
    return false;
  }

  function matches(item) {
    if (!item) return false;
    var st = getUiStatus(item);
    var fav = isFavorite(item);
    var layers = item.layers || [];

    if (filter.type === "everything") return true;
    if (filter.type === "status") {
      if (filter.value === "不熟") return st === "不熟";
      if (filter.value === "熟悉") return st === "熟悉";
      if (filter.value === "收藏") return fav && st !== "熟悉";
    }
    if (
      st === "熟悉" &&
      filter.type !== "status" &&
      filter.type !== "everything" &&
      filter.type !== "paraphrase" &&
      !(filter.type === "pathStage" && filter.value === "4") &&
      filter.type !== "reference"
    ) {
      return false;
    }
    if (filter.type === "active") return item.studyMode === "active";
    if (filter.type === "reference") return item.studyMode === "reference";
    if (filter.type === "stage1" || (filter.type === "pathStage" && filter.value === "1"))
      return matchStage(item, "1");
    if (filter.type === "pathStage") return matchStage(item, String(filter.value));
    if (filter.type === "learnMode") {
      if (filter.value === "meaning")
        return item.studyMode === "active" && item.entryType !== "phrase" && !/\s/.test(item.word);
      if (filter.value === "phrase")
        return item.studyMode === "active" && (item.entryType === "phrase" || /\s/.test(item.word));
    }
    if (filter.type === "layer") return layers.indexOf(filter.value) >= 0;
    if (filter.type === "entryType") return item.entryType === filter.value;
    if (filter.type === "all") return item.studyMode === "active";
    return item.studyMode === "active";
  }

  function rebuildStudy() {
    study = [];
    for (var i = 0; i < words.length; i++) {
      if (matches(words[i])) study.push(i);
    }
    if (study.indexOf(index) < 0) index = study[0] != null ? study[0] : 0;
  }

  function eligibleGroups() {
    return (groups || []).filter(function (g) {
      return (
        g &&
        g.confidence === "high" &&
        g.canAutoQuiz === true &&
        String(g.commonMeaningZh || "").trim()
      );
    });
  }

  function loadCoverage() {
    var raw = loadJson(COVERAGE_KEY, null);
    if (!raw || typeof raw !== "object") return coverage;
    coverage = {
      version: 1,
      seenGroupIds: Array.isArray(raw.seenGroupIds) ? raw.seenGroupIds : [],
      currentCycleOrder: Array.isArray(raw.currentCycleOrder) ? raw.currentCycleOrder : [],
      currentCycleIndex: Number(raw.currentCycleIndex) || 0,
      cycleNumber: Number(raw.cycleNumber) || 1,
      lastSessionGroupIds: Array.isArray(raw.lastSessionGroupIds) ? raw.lastSessionGroupIds : [],
      sessionMode: raw.sessionMode || "guided",
      sessionSize: Number(raw.sessionSize) || SESSION_SIZES.guided,
      updatedAt: Number(raw.updatedAt) || 0
    };
    return coverage;
  }

  function saveCoverage() {
    saveJson(COVERAGE_KEY, coverage);
  }

  function emptyReviewEntry() {
    return { seenCount: 0, recallAttemptCount: 0, correctCount: 0, wrongCount: 0, correctStreak: 0, selfRating: "unknown", anchorToMemberCorrect: 0, memberToAnchorCorrect: 0, previewCompleted: false, lastReviewedAt: null, nextReviewAt: null, lastResult: null };
  }

  function reviewEntry(groupId) {
    return Object.assign(emptyReviewEntry(), (paraReview.groups || {})[groupId] || {});
  }

  function patchReview(groupId, patch) {
    var groupsNext = Object.assign({}, paraReview.groups || {});
    groupsNext[groupId] = Object.assign(reviewEntry(groupId), patch);
    paraReview = { version: 1, groups: groupsNext, updatedAt: Date.now() };
    saveJson(REVIEW_KEY, paraReview);
  }

  function saveParaSession() {
    if (!paraSession || paraSession.completed) {
      try { localStorage.removeItem(PARA_SESSION_KEY); } catch (e) {}
      return;
    }
    paraSession.updatedAt = Date.now();
    saveJson(PARA_SESSION_KEY, paraSession);
  }

  function shuffleArr(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function surfaceKey(s) {
    return nk(s);
  }

  function groupKeys(g) {
    var s = {};
    s[surfaceKey(g.anchor)] = 1;
    (g.members || []).forEach(function (m) {
      s[surfaceKey(m)] = 1;
    });
    return s;
  }

  function buildOneMcq(group, all) {
    var stem = String(group.anchor || "").trim();
    var stemK = surfaceKey(stem);
    var members = (group.members || [])
      .map(function (m) {
        return String(m || "").trim();
      })
      .filter(function (m) {
        return m && surfaceKey(m) !== stemK;
      });
    if (!members.length) return null;
    var correct = members[Math.floor(Math.random() * members.length)];
    var correctK = surfaceKey(correct);
    var own = groupKeys(group);
    var pos = String(group.posConstraint || "").trim().toLowerCase();
    var cMean = String(group.commonMeaningZh || "").trim().toLowerCase();
    var pool = [];
    for (var i = 0; i < all.length; i++) {
      var g = all[i];
      if (!g || g.groupId === group.groupId) continue;
      var gPos = String(g.posConstraint || "").trim().toLowerCase();
      if (pos && gPos && pos !== gPos) continue;
      if (pos && !gPos) continue;
      if (!pos && gPos) continue;
      var gMean = String(g.commonMeaningZh || "").trim().toLowerCase();
      if (cMean && gMean && cMean === gMean) continue;
      var gk = groupKeys(g);
      var hit = false;
      for (var k in gk) {
        if (own[k]) {
          hit = true;
          break;
        }
      }
      if (hit) continue;
      [g.anchor].concat(g.members || []).forEach(function (c) {
        var t = String(c || "").trim();
        var ck = surfaceKey(t);
        if (!t || ck === stemK || ck === correctK || own[ck]) return;
        pool.push(t);
      });
    }
    // shuffle
    for (var p = pool.length - 1; p > 0; p--) {
      var j = Math.floor(Math.random() * (p + 1));
      var tmp = pool[p];
      pool[p] = pool[j];
      pool[j] = tmp;
    }
    var d = [];
    var seen = {};
    seen[stemK] = 1;
    seen[correctK] = 1;
    for (var di = 0; di < pool.length && d.length < 3; di++) {
      var dk = surfaceKey(pool[di]);
      if (seen[dk]) continue;
      seen[dk] = 1;
      d.push(pool[di]);
    }
    if (d.length < 3) return null;
    var correctIndex = Math.floor(Math.random() * 4);
    var options = new Array(4);
    options[correctIndex] = correct;
    var oi = 0;
    for (var x = 0; x < 4; x++) {
      if (x === correctIndex) continue;
      options[x] = d[oi++];
    }
    return {
      groupId: group.groupId,
      stem: stem,
      correct: correct,
      options: options,
      correctIndex: correctIndex,
      meta: {
        relationType: group.relationType || "",
        commonMeaningZh: group.commonMeaningZh || "",
        differenceZh: group.differenceZh || "",
        posConstraint: group.posConstraint || ""
      }
    };
  }

  function groupById(groupId) {
    for (var i = 0; i < groups.length; i++) if (groups[i].groupId === groupId) return groups[i];
    return null;
  }

  function buildQuestions(ids) {
    var all = eligibleGroups();
    return (ids || []).map(function (id) { return buildOneMcq(groupById(id), all); }).filter(Boolean);
  }

  function rebuildQuiz(mode) {
    if (mode) quizSessionMode = mode;
    var size = SESSION_SIZES[quizSessionMode] || 10;
    var all = eligibleGroups();
    var ids = all.map(function (g) { return g.groupId; });
    var byId = {};
    all.forEach(function (g) { byId[g.groupId] = g; });
    loadCoverage();
    coverage.sessionMode = quizSessionMode;
    coverage.sessionSize = size;
    var order = (coverage.currentCycleOrder || []).filter(function (id) { return !!byId[id]; });
    var have = {};
    order.forEach(function (id) { have[id] = 1; });
    var missing = ids.filter(function (id) { return !have[id]; });
    if (!order.length) order = shuffleArr(ids);
    else if (missing.length) order = order.concat(shuffleArr(missing));
    var idx = Math.min(Number(coverage.currentCycleIndex) || 0, order.length);
    var sessionIds = [];
    var kinds = [];
    var used = {};
    var reviewLimit = Math.floor(size / 2);
    ids.forEach(function (id) {
      if (sessionIds.length >= reviewLimit || used[id]) return;
      var entry = reviewEntry(id);
      var legacy = paraMap[id] || {};
      if (entry.lastResult !== "wrong" && entry.selfRating !== "dontKnow" && legacy.paraphraseStatus !== "unfamiliar") return;
      sessionIds.push(id); kinds.push("wrong"); used[id] = 1;
    });
    var guard = 0;
    var crossedCycle = false;
    while (sessionIds.length < size && guard < ids.length * 3) {
      guard++;
      if (idx >= order.length) {
        crossedCycle = true;
        order = shuffleArr(ids);
        idx = 0;
        coverage.cycleNumber = (coverage.cycleNumber || 1) + 1;
      }
      var id = order[idx++];
      if (!id || used[id]) continue;
      sessionIds.push(id); kinds.push(crossedCycle ? "nextCycle" : "new"); used[id] = 1;
    }
    coverage.currentCycleOrder = order;
    coverage.currentCycleIndex = idx;
    coverage.lastSessionGroupIds = sessionIds;
    coverage.updatedAt = Date.now();
    saveCoverage();
    paraSession = {
      version: 1,
      mode: quizSessionMode,
      sessionId: "para-static-" + Date.now(),
      currentSessionGroupIds: sessionIds,
      sessionTaskKinds: kinds,
      baseGroupCount: sessionIds.length,
      currentIndex: 0,
      currentLearningStage: quizSessionMode === "guided" ? "preview" : "quiz",
      currentDirection: "anchorToMember",
      currentCycleIndex: idx,
      wrongReinsertQueue: [], uncertainReinsertQueue: [], sessionResults: [],
      startedAt: Date.now(), updatedAt: Date.now(), completed: false
    };
    quizQueue = buildQuestions(sessionIds);
    quizPos = 0; quizRevealed = false; quizSelected = null; recallRevealed = false;
    saveParaSession();
  }

  function hydrateQuizSession(saved) {
    paraSession = saved;
    quizSessionMode = saved.mode === "wrongReview" ? "guided" : saved.mode;
    quizPos = Math.min(Number(saved.currentIndex) || 0, saved.currentSessionGroupIds.length - 1);
    quizQueue = buildQuestions(saved.currentSessionGroupIds);
    if (saved.currentQuestion && quizQueue[quizPos]) quizQueue[quizPos] = saved.currentQuestion;
    quizSelected = saved.selectedIndex == null ? null : saved.selectedIndex;
    quizRevealed = saved.currentLearningStage === "feedback";
    recallRevealed = false;
  }

  function markCurrentSeen() {
    var q = quizQueue[quizPos];
    if (!q) return;
    var seen = {};
    (coverage.seenGroupIds || []).forEach(function (id) { seen[id] = 1; });
    if (!seen[q.groupId]) {
      seen[q.groupId] = 1;
      coverage.seenGroupIds = Object.keys(seen);
      coverage.updatedAt = Date.now();
      saveCoverage();
    }
  }

  function currentItem() {
    if (isQuiz()) {
      var q = quizQueue[quizPos];
      return {
        word: q ? q.stem : "—",
        meaning: q ? "选择最接近的替换表达" : "无可用题目",
        phonetic: "",
        pos: "",
        example: "",
        exampleCn: ""
      };
    }
    return words[index] || { word: "—", meaning: "", phonetic: "", pos: "", example: "", exampleCn: "" };
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function appendSessionResult(result) {
    paraSession.sessionResults.push(Object.assign({ at: Date.now() }, result));
  }

  function scheduleStaticReinsert(groupId, kind, offset) {
    var repeats = paraSession.sessionTaskKinds.filter(function (value) { return value === "wrong" || value === "uncertain"; }).length;
    if (repeats >= Math.floor(paraSession.baseGroupCount / 2)) return;
    var at = Math.min(paraSession.currentSessionGroupIds.length, paraSession.currentIndex + offset + 1);
    paraSession.currentSessionGroupIds.splice(at, 0, groupId);
    paraSession.sessionTaskKinds.splice(at, 0, kind);
    var queueName = kind === "uncertain" ? "uncertainReinsertQueue" : "wrongReinsertQueue";
    if (paraSession[queueName].indexOf(groupId) < 0) paraSession[queueName].push(groupId);
    quizQueue.splice(at, 0, buildOneMcq(groupById(groupId), eligibleGroups()));
  }

  function advanceStaticTask() {
    if (paraSession.currentIndex + 1 >= paraSession.currentSessionGroupIds.length) {
      paraSession.currentLearningStage = "summary";
      paraSession.completed = true;
      saveParaSession();
      render();
      return;
    }
    paraSession.currentIndex++;
    quizPos = paraSession.currentIndex;
    paraSession.currentLearningStage = paraSession.mode === "guided" ? "preview" : "quiz";
    quizRevealed = false; quizSelected = null; recallRevealed = false;
    saveParaSession();
    render();
  }

  function startStaticRecall() {
    var q = quizQueue[quizPos];
    var g = q && groupById(q.groupId);
    if (!g) return;
    var entry = reviewEntry(g.groupId);
    patchReview(g.groupId, { previewCompleted: true, seenCount: entry.seenCount + 1, lastReviewedAt: Date.now() });
    appendSessionResult({ type: "preview", groupId: g.groupId });
    paraSession.currentDirection = entry.seenCount % 2 ? "memberToAnchor" : "anchorToMember";
    paraSession.currentLearningStage = "recall";
    saveParaSession(); render();
  }

  function rateStaticRecall(rating) {
    var q = quizQueue[quizPos];
    if (!q) return;
    var entry = reviewEntry(q.groupId);
    patchReview(q.groupId, { recallAttemptCount: entry.recallAttemptCount + 1, selfRating: rating, lastReviewedAt: Date.now(), nextReviewAt: rating === "know" ? entry.nextReviewAt : Date.now() + 86400000 });
    appendSessionResult({ type: "recall", groupId: q.groupId, rating: rating });
    if (rating === "know") {
      paraSession.currentLearningStage = "quiz"; recallRevealed = false; saveParaSession(); render(); return;
    }
    scheduleStaticReinsert(q.groupId, rating === "uncertain" ? "uncertain" : "wrong", rating === "uncertain" ? 4 : 2);
    if (rating === "dontKnow") {
      paraMap[q.groupId] = { paraphraseStatus: "unfamiliar", mastered: false, at: new Date().toISOString() };
      saveJson(PARA_KEY, paraMap); writeStatusMap(statusMap);
    }
    saveParaSession(); advanceStaticTask();
  }

  function selectStaticQuiz(oi) {
    var q = quizQueue[quizPos];
    if (!q || quizRevealed) return;
    var correct = oi === q.correctIndex;
    var wasFamiliar = paraMap[q.groupId] && paraMap[q.groupId].paraphraseStatus === "familiar";
    var entry = reviewEntry(q.groupId);
    var streak = correct ? entry.correctStreak + 1 : 0;
    var days = !correct || streak <= 1 ? 1 : streak === 2 ? 3 : streak === 3 ? 7 : 14;
    patchReview(q.groupId, {
      correctCount: entry.correctCount + (correct ? 1 : 0), wrongCount: entry.wrongCount + (correct ? 0 : 1),
      correctStreak: streak, anchorToMemberCorrect: entry.anchorToMemberCorrect + (correct ? 1 : 0),
      lastResult: correct ? "correct" : "wrong", lastReviewedAt: Date.now(), nextReviewAt: Date.now() + days * 86400000
    });
    appendSessionResult({ type: "quiz", groupId: q.groupId, correct: correct, selectedIndex: oi, direction: "anchorToMember" });
    if (!correct) {
      scheduleStaticReinsert(q.groupId, "wrong", 2);
      paraMap[q.groupId] = { paraphraseStatus: "unfamiliar", mastered: false, at: new Date().toISOString() };
      saveJson(PARA_KEY, paraMap); writeStatusMap(statusMap);
    } else {
      var nextEntry = reviewEntry(q.groupId);
      var pending = paraSession.currentSessionGroupIds.slice(paraSession.currentIndex + 1).indexOf(q.groupId) >= 0;
      if (nextEntry.previewCompleted && nextEntry.recallAttemptCount > 0 && nextEntry.lastResult === "correct" && nextEntry.anchorToMemberCorrect > 0 && !pending) {
        paraMap[q.groupId] = { paraphraseStatus: "familiar", mastered: true, at: new Date().toISOString() };
        saveJson(PARA_KEY, paraMap); writeStatusMap(statusMap);
        appendSessionResult({ type: "mastery", groupId: q.groupId, firstMastered: !wasFamiliar, legalDirectionsCompleted: true });
      }
    }
    quizSelected = oi; quizRevealed = true;
    paraSession.currentLearningStage = "feedback";
    paraSession.currentQuestion = q; paraSession.selectedIndex = oi;
    saveParaSession(); render();
  }

  function staticSummary() {
    var results = paraSession.sessionResults || [];
    var correct = results.filter(function (row) { return row.type === "quiz" && row.correct; }).length;
    var wrong = results.filter(function (row) { return row.type === "quiz" && !row.correct; }).length;
    var uncertain = results.filter(function (row) { return row.type === "recall" && row.rating === "uncertain"; }).length;
    var firstMastered = new Set(results.filter(function (row) { return row.type === "mastery" && row.firstMastered; }).map(function (row) { return row.groupId; })).size;
    var legalDirectionsCompleted = new Set(results.filter(function (row) { return row.type === "mastery" && row.legalDirectionsCompleted; }).map(function (row) { return row.groupId; })).size;
    return { correct: correct, wrong: wrong, uncertain: uncertain, firstMastered: firstMastered, legalDirectionsCompleted: legalDirectionsCompleted, review: paraSession.wrongReinsertQueue.length + paraSession.uncertainReinsertQueue.length };
  }

  function renderQuiz() {
    var q = quizQueue[quizPos];
    if (!els.quizBox) return;
    if (!isQuiz() || !q || !paraSession) {
      els.quizBox.classList.add("hidden");
      if (els.exampleCard) els.exampleCard.classList.remove("hidden");
      return;
    }
    markCurrentSeen();
    els.quizBox.classList.remove("hidden");
    if (els.exampleCard) els.exampleCard.classList.add("hidden");
    var g = groupById(q.groupId);
    var stage = paraSession.currentLearningStage;
    var html = "";
    if (resumePending) {
      html = '<div class="para-stage">未完成的同义学习</div><h2>继续上次同义学习</h2><p>长期覆盖与旧掌握状态均已保留。</p><div class="para-actions"><button id="paraResume" class="topic-chip active">继续</button><button id="paraRestart" class="topic-chip">重新开始本轮</button></div>';
    } else if (stage === "summary") {
      var sum = staticSummary();
      html = '<div class="para-stage">本轮总结</div><h2>' + (paraSession.mode === "guided" ? "引导学习完成" : "测验完成") + '</h2>' +
        '<div class="para-summary"><span>本轮组数 <strong>' + paraSession.baseGroupCount + '</strong></span><span>正确 <strong>' + sum.correct + '</strong></span><span>错误 <strong>' + sum.wrong + '</strong></span><span>模糊 <strong>' + sum.uncertain + '</strong></span><span>首次掌握 <strong>' + sum.firstMastered + '</strong></span><span>合法方向完成 <strong>' + sum.legalDirectionsCompleted + '</strong></span><span>累计覆盖 <strong>' + coverage.seenGroupIds.length + '/233</strong></span></div>' +
        '<div class="para-actions"><button id="paraContinue" class="topic-chip active">继续下一轮</button>' + (sum.review ? '<button id="paraReviewWrong" class="topic-chip">复习本轮错题</button>' : '') + '<button id="paraBackMeaning" class="topic-chip">返回词义学习</button></div>';
    } else if (stage === "preview") {
      html = '<div class="para-stage">阶段 1 · 关系预览</div><div class="para-pair"><strong>' + esc(g.anchor) + '</strong><span>↔</span><strong>' + esc(g.members[0]) + '</strong></div>' +
        (g.commonMeaningZh ? '<div class="para-meaning">共同义：' + esc(g.commonMeaningZh) + '</div>' : '') +
        (g.differenceZh ? '<div class="para-note">区别：' + esc(g.differenceZh) + '</div>' : '') + '<div class="para-actions"><button id="paraStartRecall" class="topic-chip active">开始回忆</button></div>';
    } else if (stage === "recall") {
      var reverse = paraSession.currentDirection === "memberToAnchor";
      var prompt = reverse ? g.members[0] : g.anchor;
      var answer = reverse ? g.anchor : g.members[0];
      html = '<div class="para-stage">阶段 2 · 主动回忆</div><div class="para-recall"><strong>' + esc(prompt) + '</strong><span>→</span><strong>?</strong></div>' +
        (recallRevealed ? '<div class="para-answer">' + esc(answer) + '</div><div class="para-actions"><button data-rating="know" class="topic-chip active">会</button><button data-rating="uncertain" class="topic-chip">模糊</button><button data-rating="dontKnow" class="topic-chip danger">不会</button></div>' : '<div class="para-actions"><button id="paraReveal" class="topic-chip active">显示答案</button></div>');
    } else {
      html = '<div class="para-stage">' + (stage === "feedback" ? "阶段 3 · 验证反馈" : "阶段 3 · 四选一验证") + '</div><div class="para-stem">' + esc(q.stem) + '</div><div id="quizOptions"></div><div id="quizExplain" class="hidden para-note"></div>';
    }
    els.quizBox.innerHTML = html;
    els.quizOptions = document.getElementById("quizOptions");
    els.quizExplain = document.getElementById("quizExplain");
    if (els.quizOptions) q.options.forEach(function (opt, oi) {
      var btn = document.createElement("button"); btn.type = "button"; btn.className = "topic-chip para-option";
      if (quizRevealed && oi === q.correctIndex) btn.className += " correct";
      else if (quizRevealed && quizSelected === oi) btn.className += " wrong";
      btn.textContent = String.fromCharCode(65 + oi) + ". " + opt; btn.disabled = quizRevealed;
      btn.onclick = function () { selectStaticQuiz(oi); }; els.quizOptions.appendChild(btn);
    });
    if (quizRevealed && els.quizExplain) {
      els.quizExplain.classList.remove("hidden");
      els.quizExplain.innerHTML = '<div>正确答案：<strong>' + esc(q.correct) + '</strong></div><div>你选择：' + esc(q.options[quizSelected]) + '</div>' + (q.meta.commonMeaningZh ? '<div>共同义：' + esc(q.meta.commonMeaningZh) + '</div>' : '') + '<div>区别：' + esc(q.meta.differenceZh || "两者在本题语境中意义接近，使用场景可能不同。") + '</div><div class="para-actions"><button id="paraNext" class="topic-chip active">下一题</button></div>';
    }
    var start = document.getElementById("paraStartRecall"); if (start) start.onclick = startStaticRecall;
    var resume = document.getElementById("paraResume"); if (resume) resume.onclick = function () { resumePending = false; saveParaSession(); render(); };
    var restart = document.getElementById("paraRestart"); if (restart) restart.onclick = function () { paraSession.currentIndex = 0; quizPos = 0; paraSession.currentLearningStage = paraSession.mode === "guided" ? "preview" : "quiz"; paraSession.wrongReinsertQueue = []; paraSession.uncertainReinsertQueue = []; paraSession.sessionResults = []; quizRevealed = false; quizSelected = null; resumePending = false; saveParaSession(); render(); };
    var reveal = document.getElementById("paraReveal"); if (reveal) reveal.onclick = function () { recallRevealed = true; render(); };
    document.querySelectorAll("[data-rating]").forEach(function (button) { button.onclick = function () { rateStaticRecall(button.getAttribute("data-rating")); }; });
    var next = document.getElementById("paraNext"); if (next) next.onclick = advanceStaticTask;
    var cont = document.getElementById("paraContinue"); if (cont) cont.onclick = function () { rebuildQuiz(quizSessionMode); render(); };
    var reviewWrong = document.getElementById("paraReviewWrong"); if (reviewWrong) reviewWrong.onclick = function () { rebuildQuiz("guided"); render(); };
    var backMeaning = document.getElementById("paraBackMeaning"); if (backMeaning) backMeaning.onclick = function () { setFilter({ type: "learnMode", value: "meaning" }); };
  }

  function render() {
    var item = currentItem();
    var st = isQuiz()
      ? (function () {
          var q = quizQueue[quizPos];
          if (!q) return "";
          var e = paraMap[q.groupId] || {};
          var code = e.paraphraseStatus || (e.mastered ? "familiar" : "");
          return code === "familiar" ? "熟悉" : code === "unfamiliar" ? "不熟" : "";
        })()
      : getUiStatus(item);

    if (els.word) els.word.textContent = item.word || "—";
    if (els.basic) {
      els.basic.textContent = isQuiz()
        ? item.meaning
        : (item.phonetic ? item.phonetic + " · " : "") +
          (item.pos || "") +
          " · " +
          (item.meaning || "");
    }
    if (els.example) els.example.textContent = isQuiz() ? "" : item.example || "—";
    if (els.exampleCn) els.exampleCn.textContent = isQuiz() ? "" : item.exampleCn || "";

    var total = isQuiz() ? (paraSession ? paraSession.baseGroupCount : SESSION_SIZES[quizSessionMode]) : study.length;
    var pos = isQuiz() ? Math.min(quizPos + 1, total) : Math.max(1, study.indexOf(index) + 1);
    if (els.count) {
      if (isQuiz()) {
        var pool = eligibleGroups().length;
        var cov = (coverage.seenGroupIds || []).length;
        els.count.textContent =
          (total ? pos + " / " + total : "0 / 0") + " · 累计 " + cov + "/" + pool;
      } else {
        els.count.textContent = total ? pos + " / " + total : "0 / 0";
      }
    }
    if (els.progressFill) {
      els.progressFill.style.width = total ? Math.max(1, (pos / total) * 100) + "%" : "0%";
    }
    if (els.favoriteBtn) {
      els.favoriteBtn.textContent = !isQuiz() && isFavorite(item) ? "★" : "☆";
    }
    if (els.unfamiliarAlert) {
      if (st === "不熟") els.unfamiliarAlert.classList.remove("hidden");
      else els.unfamiliarAlert.classList.add("hidden");
    }
    if (els.knownBtn) { els.knownBtn.textContent = "熟悉"; els.knownBtn.style.display = isQuiz() ? "none" : ""; }
    if (els.unknownBtn) { els.unknownBtn.textContent = st === "不熟" ? "取消不熟" : "不熟"; els.unknownBtn.style.display = isQuiz() ? "none" : ""; }

    renderQuiz();
  }

  function go(delta) {
    if (isQuiz()) {
      if (delta > 0 && paraSession && paraSession.currentLearningStage === "feedback") advanceStaticTask();
      return;
    }
    if (!study.length) return;
    var p = study.indexOf(index);
    if (p < 0) p = 0;
    p = (p + delta + study.length) % study.length;
    index = study[p];
    render();
  }

  function setFilter(next) {
    filter = next;
    quizRevealed = false;
    quizSelected = null;
    if (filter.type === "paraphraseQuiz") {
      quizSessionMode = filter.sessionMode || "guided";
      rebuildQuiz(quizSessionMode);
      toast(
        "同义替换训练 · 安全题库 " +
          eligibleGroups().length +
          " 组 · 本轮 " +
          (SESSION_SIZES[quizSessionMode] || 10) +
          " 题"
      );
    } else {
      rebuildStudy();
    }
    renderTopics();
    render();
  }

  function renderTopics() {
    if (!els.topicBar) return;
    var chips = [
      { label: "词义", f: { type: "learnMode", value: "meaning" } },
      { label: "短语", f: { type: "learnMode", value: "phrase" } },
      { label: "引导学习·10组", f: { type: "paraphraseQuiz", value: "", sessionMode: "guided" } },
      { label: "快速测验·20题", f: { type: "paraphraseQuiz", value: "", sessionMode: "quick" } },
      { label: "完整测验·80题", f: { type: "paraphraseQuiz", value: "", sessionMode: "full" } },
      { label: "表达识别核心·1006个表达", f: { type: "layer", value: "paraCore600" } },
      { label: "表达识别扩展·500个表达", f: { type: "layer", value: "paraExt500" } },
      { label: "阶段1", f: { type: "pathStage", value: "1" } },
      { label: "阶段2", f: { type: "pathStage", value: "2" } },
      { label: "阶段3", f: { type: "pathStage", value: "3" } },
      { label: "阶段4", f: { type: "pathStage", value: "4" } },
      { label: "不熟", f: { type: "status", value: "不熟" } },
      { label: "熟悉", f: { type: "status", value: "熟悉" } },
      { label: "active", f: { type: "active", value: "" } }
    ];
    els.topicBar.innerHTML = "";
    chips.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className =
        "topic-chip" +
        (filter.type === c.f.type &&
        String(filter.value || "") === String(c.f.value || "") &&
        (c.f.type !== "paraphraseQuiz" ||
          (filter.sessionMode || "guided") === (c.f.sessionMode || "guided"))
          ? " active"
          : "");
      b.textContent = c.label;
      b.onclick = function () {
        setFilter(c.f);
        if (controlsViewport === "mobile") applyControlsState(true, true);
      };
      els.topicBar.appendChild(b);
    });
    updateControlsSummary();
  }

  function mark(kind) {
    if (isQuiz()) {
      toast("请按预览、回忆和验证流程完成当前关系");
      return;
    }
    var item = words[index];
    if (!item) return;
    var cur = getUiStatus(item);
    var next = kind;
    if (kind === "不熟" && cur === "不熟") next = "";
    patchStatus(item, { status: next });
    toast(next === "熟悉" ? "已熟悉" : next === "不熟" ? "已不熟" : "已取消");
    rebuildStudy();
    if (next === "熟悉") go(1);
    else render();
  }

  function migrateV4Once() {
    var flag = loadJson(MIG_V4, null);
    if (flag && flag.completed) return;
    var raw = loadJson(STATUS_KEY, {});
    var flat = raw && raw.entries ? raw.entries : raw || {};
    var next = {};
    var matched = 0;
    Object.keys(flat).forEach(function (k) {
      if (k === "progressSchemaVersion" || k === "entries" || k === "paraphrases") return;
      var val = flat[k];
      // try id
      var item = null;
      for (var i = 0; i < words.length; i++) {
        if (words[i].id === k) {
          item = words[i];
          break;
        }
      }
      if (!item && k.indexOf("::") >= 0) {
        for (var j = 0; j < words.length; j++) {
          if (entryKey(words[j]) === k) {
            item = words[j];
            break;
          }
        }
      }
      if (!item) {
        var candidates = words.filter(function (w) {
          return nk(w.word) === nk(k) || w.normalizedKey === nk(k);
        });
        if (candidates.length === 1) item = candidates[0];
        else return; // ambiguous or missing
      }
      next[entryKey(item)] = normStatus(val);
      matched++;
    });
    statusMap = next;
    paraMap = (raw && raw.paraphrases) || loadJson(PARA_KEY, {}) || {};
    writeStatusMap(statusMap);
    saveJson(PARA_KEY, paraMap);
    saveJson(MIG_V4, { completed: true, matchedCount: matched, at: new Date().toISOString() });
  }

  function speak(text) {
    var value = String(text || "").trim();
    if (!value) return;
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(value);
        u.lang = "en-US";
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {}
  }

  function bind() {
    var prev = document.getElementById("prevBtn");
    var next = document.getElementById("nextBtn");
    var shuffle = document.getElementById("shuffleBtn");
    var wordSound = document.getElementById("wordSoundBtn");
    var exampleSound = document.getElementById("exampleSoundBtn");
    if (prev) prev.onclick = function () { go(-1); };
    if (next) next.onclick = function () { go(1); };
    if (shuffle)
      shuffle.onclick = function () {
        if (isQuiz()) {
          if (!paraSession) return;
          var start = paraSession.currentIndex + 1;
          var tail = paraSession.currentSessionGroupIds.slice(start).map(function (id, offset) {
            return { id: id, kind: paraSession.sessionTaskKinds[start + offset], question: quizQueue[start + offset] };
          });
          tail = shuffleArr(tail);
          paraSession.currentSessionGroupIds = paraSession.currentSessionGroupIds.slice(0, start).concat(tail.map(function (row) { return row.id; }));
          paraSession.sessionTaskKinds = paraSession.sessionTaskKinds.slice(0, start).concat(tail.map(function (row) { return row.kind; }));
          quizQueue = quizQueue.slice(0, start).concat(tail.map(function (row) { return row.question; }));
          var cycleStart = Math.min(coverage.currentCycleIndex, coverage.currentCycleOrder.length);
          coverage.currentCycleOrder = coverage.currentCycleOrder.slice(0, cycleStart).concat(shuffleArr(coverage.currentCycleOrder.slice(cycleStart)));
          saveCoverage(); saveParaSession();
          render();
          toast("已重排本轮未完成任务，覆盖周期未重置");
          return;
        }
        if (!study.length) return;
        index = study[Math.floor(Math.random() * study.length)];
        render();
      };
    if (els.knownBtn) els.knownBtn.onclick = function () { mark("熟悉"); };
    if (els.unknownBtn) els.unknownBtn.onclick = function () { mark("不熟"); };
    if (els.favoriteBtn)
      els.favoriteBtn.onclick = function () {
        if (isQuiz()) return;
        var item = words[index];
        patchStatus(item, { favorite: !isFavorite(item) });
        render();
      };
    if (wordSound)
      wordSound.onclick = function () {
        var item = currentItem();
        speak(item && item.word);
      };
    if (exampleSound)
      exampleSound.onclick = function () {
        var item = currentItem();
        speak(item && item.example);
      };

    if (els.readingControlsToggle && !bind._controlsBound) {
      bind._controlsBound = true;
      els.readingControlsToggle.addEventListener("click", function () {
        applyControlsState(!controlsCollapsed, true);
      });
      window.addEventListener("resize", syncControlsMode);
    }
    syncControlsMode();

    // Align with Next /reading-g + static basic.js: keyboard navigation
    if (!bind._keysBound) {
      bind._keysBound = true;
      window.addEventListener("keydown", function (e) {
        var tag = (document.activeElement && document.activeElement.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;

        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          go(1);
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          go(-1);
          return;
        }

        if (!isQuiz()) {
          if (e.key === "Tab") {
            e.preventDefault();
            var c = currentItem();
            if (c) speak(c.word);
            return;
          }
          if (e.code === "Space" || e.key === " ") {
            e.preventDefault();
            var c2 = currentItem();
            if (c2) speak(c2.example);
            return;
          }
          if (e.key === "0" || e.key === "2") {
            e.preventDefault();
            if (els.knownBtn) els.knownBtn.click();
            return;
          }
          if (e.key === "1") {
            e.preventDefault();
            if (els.unknownBtn) els.unknownBtn.click();
            return;
          }
        } else if (!quizRevealed) {
          // 同义四选一：A-D 选选项（与正式站一致；数字键留给熟悉/不熟）
          var map = { a: 0, b: 1, c: 2, d: 3, A: 0, B: 1, C: 2, D: 3 };
          if (map[e.key] != null && typeof selectStaticQuiz === "function") {
            e.preventDefault();
            selectStaticQuiz(map[e.key]);
          }
        } else if (quizRevealed && (e.key === "Enter" || e.key === "ArrowRight" || e.key === "ArrowDown")) {
          // already handled ArrowRight above via go(1) which advances feedback
        }
      });
    }
  }

  function boot() {
    if (els.loadInfo) {
      els.loadInfo.textContent =
        "静态便携版 · data/reading-g-vocab.json + paraphrases · 进度本机 · 与正式站核心能力对齐";
    }
    Promise.all([
      fetch(DATA_URL + "?v=" + DATA_VERSION, { cache: "default" }).then(function (r) {
        if (!r.ok) throw new Error("vocab " + r.status);
        return r.json();
      }),
      fetch(PARA_URL + "?v=" + DATA_VERSION, { cache: "default" }).then(function (r) {
        if (!r.ok) throw new Error("paraphrases " + r.status);
        return r.json();
      })
    ])
      .then(function (pair) {
        var data = pair[0];
        var para = pair[1];
        words = (data.items || data.words || [])
          .map(normalizeEntry)
          .filter(Boolean);
        groups = para.groups || [];
        statusMap = readStatusMap();
        paraMap = loadJson(PARA_KEY, {}) || {};
        paraReview = loadJson(REVIEW_KEY, { version: 1, groups: {}, updatedAt: 0 }) || { version: 1, groups: {}, updatedAt: 0 };
        migrateV4Once();
        rebuildStudy();
        loadCoverage();
        var savedParaSession = loadJson(PARA_SESSION_KEY, null);
        if (savedParaSession && !savedParaSession.completed && Array.isArray(savedParaSession.currentSessionGroupIds) && savedParaSession.currentSessionGroupIds.length) {
          filter = { type: "paraphraseQuiz", value: "", sessionMode: savedParaSession.mode === "wrongReview" ? "guided" : savedParaSession.mode };
          hydrateQuizSession(savedParaSession);
          resumePending = true;
        }
        if (els.bankMeta) {
          els.bankMeta.textContent =
            "G类阅读提升 · 静态便携版 · " +
            words.length +
            " 词 · 安全同义题库 " +
            eligibleGroups().length +
            " 组";
        }
        renderTopics();
        bind();
        render();
      })
      .catch(function (err) {
        if (els.bankMeta) els.bankMeta.textContent = "加载失败：" + (err && err.message);
        if (els.word) els.word.textContent = "Error";
        if (els.basic) els.basic.textContent = String(err && err.message);
      });
  }

  boot();
})();
