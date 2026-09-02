/* Static meaning quiz: English word → Chinese options (meaning-6000).
   Standalone for Tencent Cloud static hosting — no Next.js runtime required. */
(function () {
  "use strict";

  var DATA_URL = "./data/meaning-6000.json";
  var DATA_VERSION = "20260830_system_safety_v80";
  var PROGRESS_KEY = "ielts_meaning_static_progress_v1";
  var RECENT_KEY = "ielts_meaning_static_recent_v1";
  var AUTO_NEXT_MS = 450;
  var RECENT_LIMIT = 80;

  var bank = [];
  var byPos = {};
  var byTopic = {};
  var question = null;
  var answered = false;
  var stats = { done: 0, correct: 0 };
  var recentIds = [];
  var autoTimer = null;
  var bankMeta = { version: "meaning-6000", total: 0 };

  var els = {
    phaseText: document.getElementById("phaseText"),
    word: document.getElementById("word"),
    posLine: document.getElementById("posLine"),
    options: document.getElementById("options"),
    resultBox: document.getElementById("resultBox"),
    resultLine: document.getElementById("resultLine"),
    detailLine: document.getElementById("detailLine"),
    nextBtn: document.getElementById("nextBtn"),
    startBtn: document.getElementById("startBtn"),
    stats: document.getElementById("stats"),
    toast: document.getElementById("toast"),
    loadBar: document.getElementById("loadBar"),
    loadFill: document.getElementById("loadFill")
  };

  function toast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg || "";
    els.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      els.toast.classList.remove("show");
    }, 1600);
  }

  function setLoading() {
    if (els.phaseText) els.phaseText.textContent = "正在准备学习内容";
    if (els.loadBar) els.loadBar.classList.remove("hidden");
    if (els.loadFill) els.loadFill.classList.add("is-active");
  }

  function hideLoading() {
    if (els.loadBar) els.loadBar.classList.add("hidden");
    if (els.loadFill) els.loadFill.classList.remove("is-active");
  }

  function loadProgress() {
    try {
      var raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === "object") {
          stats.done = Number(p.done) || 0;
          stats.correct = Number(p.correct) || 0;
        }
      }
      var r = localStorage.getItem(RECENT_KEY);
      if (r) {
        var arr = JSON.parse(r);
        if (Array.isArray(arr)) recentIds = arr.slice(0, RECENT_LIMIT);
      }
    } catch (e) {}
  }

  function applyMergedCloudProgress() {
    stats = { done: 0, correct: 0 };
    recentIds = [];
    loadProgress();
    renderStats();
    if (bank.length && stats.done > 0) nextQuestion();
  }

  function saveProgress() {
    try {
      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify({
          done: stats.done,
          correct: stats.correct,
          savedAt: new Date().toISOString()
        })
      );
      localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds.slice(0, RECENT_LIMIT)));
    } catch (e) {}
  }

  function speak(text) {
    var value = String(text || "").trim();
    if (!value || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(value);
      u.lang = "en-US";
      u.rate = 0.88;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function gloss(item) {
    return String(
      (item && (item.quizMeaningZh || item.meaningZh || item.meaning)) || ""
    ).trim();
  }

  function posAtomCn(atom) {
    var t = String(atom || "").trim().toLowerCase();
    if (!t) return "";
    if (t === "noun" || t === "n" || t === "n.") return "名词";
    if (t === "verb" || t === "v" || t === "v.") return "动词";
    if (t === "adjective" || t === "adj" || t === "adj.") return "形容词";
    if (t === "adverb" || t === "adv" || t === "adv.") return "副词";
    if (t === "phrase") return "短语";
    if (t.indexOf("noun") >= 0) return "名词";
    if (t.indexOf("verb") >= 0) return "动词";
    if (t.indexOf("adj") >= 0) return "形容词";
    if (t.indexOf("adv") >= 0) return "副词";
    return "";
  }

  function posDisplay(pos) {
    var raw = String(pos || "").trim();
    if (!raw) return "词性";
    if (/[\u4e00-\u9fff]/.test(raw) && /[a-z]/i.test(raw)) return raw;
    var parts = raw.split(/\s*[\/,|&;·／、]\s*/);
    var zh = [];
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
      var c = posAtomCn(parts[i]);
      if (c && !seen[c]) {
        seen[c] = 1;
        zh.push(c);
      }
    }
    if (!zh.length) {
      var one = posAtomCn(raw);
      return one ? raw + " " + one : raw;
    }
    var joined = zh.join("/");
    return raw.indexOf(joined) >= 0 ? raw : raw + " " + joined;
  }

  function wordKey(item) {
    return String((item && (item.wordId || item.word)) || "").toLowerCase();
  }

  function buildPools() {
    byPos = {};
    byTopic = {};
    bank.forEach(function (item, idx) {
      var pos = item.posFamily || item.pos || "other";
      if (!byPos[pos]) byPos[pos] = [];
      byPos[pos].push(idx);
      var topics = Array.isArray(item.topics) ? item.topics : [];
      for (var t = 0; t < topics.length; t++) {
        var topic = String(topics[t] || "").trim();
        if (!topic) continue;
        if (!byTopic[topic]) byTopic[topic] = [];
        byTopic[topic].push(idx);
      }
    });
  }

  function pushUnique(list, seenGloss, seenIdx, idx, targetGloss) {
    if (seenIdx[idx]) return false;
    var g = gloss(bank[idx]);
    if (!g || g === targetGloss || seenGloss[g]) return false;
    seenIdx[idx] = true;
    seenGloss[g] = true;
    list.push(idx);
    return true;
  }

  function pickDistractors(targetIdx) {
    var target = bank[targetIdx];
    var pos = target.posFamily || target.pos || "other";
    var targetGloss = gloss(target);
    var seenGloss = {};
    var seenIdx = {};
    seenIdx[targetIdx] = true;
    seenGloss[targetGloss] = true;
    var picked = [];

    // Tier 1: same pos + shared topic
    var topics = Array.isArray(target.topics) ? target.topics : [];
    var topicPool = [];
    for (var t = 0; t < topics.length; t++) {
      var list = byTopic[topics[t]] || [];
      for (var i = 0; i < list.length; i++) {
        var idx = list[i];
        if (seenIdx[idx]) continue;
        var item = bank[idx];
        if ((item.posFamily || item.pos || "other") !== pos) continue;
        topicPool.push(idx);
      }
    }
    topicPool = shuffle(topicPool);
    for (var a = 0; a < topicPool.length && picked.length < 3; a++) {
      pushUnique(picked, seenGloss, seenIdx, topicPool[a], targetGloss);
    }

    // Tier 2: same pos + same difficulty
    if (picked.length < 3) {
      var posPool = shuffle((byPos[pos] || []).slice());
      var diff = target.difficulty || "";
      for (var b = 0; b < posPool.length && picked.length < 3; b++) {
        var bi = posPool[b];
        if (diff && bank[bi].difficulty !== diff) continue;
        pushUnique(picked, seenGloss, seenIdx, bi, targetGloss);
      }
    }

    // Tier 3: any same pos
    if (picked.length < 3) {
      var rest = shuffle((byPos[pos] || []).slice());
      for (var c = 0; c < rest.length && picked.length < 3; c++) {
        pushUnique(picked, seenGloss, seenIdx, rest[c], targetGloss);
      }
    }

    // Tier 4: any word (last resort so quiz still works)
    if (picked.length < 3) {
      var any = [];
      for (var j = 0; j < bank.length; j++) {
        if (seenIdx[j]) continue;
        any.push(j);
      }
      any = shuffle(any);
      for (var d = 0; d < any.length && picked.length < 3; d++) {
        pushUnique(picked, seenGloss, seenIdx, any[d], targetGloss);
      }
    }

    return picked.slice(0, 3);
  }

  function pickTargetIndex() {
    if (!bank.length) return 0;
    var recentSet = {};
    for (var i = 0; i < recentIds.length; i++) recentSet[recentIds[i]] = true;

    // Prefer not-recent words (up to 30 tries)
    for (var tryN = 0; tryN < 30; tryN++) {
      var idx = Math.floor(Math.random() * bank.length);
      var key = wordKey(bank[idx]);
      if (!recentSet[key]) return idx;
    }
    return Math.floor(Math.random() * bank.length);
  }

  function nextQuestion() {
    clearTimeout(autoTimer);
    answered = false;
    if (els.resultBox) els.resultBox.classList.add("hidden");
    if (els.startBtn) els.startBtn.classList.add("hidden");

    if (!bank.length) return;

    var targetIdx = pickTargetIndex();
    var target = bank[targetIdx];
    var distractorIdx = pickDistractors(targetIdx);
    if (distractorIdx.length < 3) {
      els.phaseText.textContent = "无法生成足够干扰项，请检查词库";
      return;
    }

    var options = shuffle(
      [{ idx: targetIdx, correct: true }].concat(
        distractorIdx.map(function (i) {
          return { idx: i, correct: false };
        })
      )
    );

    question = { targetIdx: targetIdx, options: options };
    var key = wordKey(target);
    recentIds = [key].concat(recentIds.filter(function (k) { return k !== key; })).slice(0, RECENT_LIMIT);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds));
    } catch (e) {}

    els.phaseText.textContent = "选择正确中文意思";
    els.word.textContent = target.word || "—";
    els.posLine.textContent =
      posDisplay(target.posFamily || target.pos || "词性") +
      (target.difficulty ? " · " + target.difficulty : "");
    els.options.innerHTML = "";
    options.forEach(function (opt, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "opt-btn";
      btn.setAttribute("data-index", String(i));
      btn.textContent = i + 1 + ". " + gloss(bank[opt.idx]);
      btn.onclick = function () {
        onSelect(i);
      };
      els.options.appendChild(btn);
    });
    renderStats();
  }

  function onSelect(optIndex) {
    if (answered || !question) return;
    answered = true;
    var opt = question.options[optIndex];
    var target = bank[question.targetIdx];
    var buttons = els.options.querySelectorAll(".opt-btn");
    Array.prototype.forEach.call(buttons, function (btn, i) {
      btn.disabled = true;
      var o = question.options[i];
      if (o.correct) btn.classList.add("correct");
      if (i === optIndex && !o.correct) btn.classList.add("wrong");
    });

    stats.done += 1;
    if (opt.correct) stats.correct += 1;
    saveProgress();
    renderStats();

    els.resultBox.classList.remove("hidden");
    if (opt.correct) {
      els.resultLine.className = "result-line ok";
      els.resultLine.textContent = "✓ 正确";
      els.detailLine.textContent =
        (target.meaningDetailedZh || gloss(target)) +
        (target.word ? " · " + target.word : "");
      autoTimer = setTimeout(function () {
        nextQuestion();
      }, AUTO_NEXT_MS);
    } else {
      els.resultLine.className = "result-line bad";
      els.resultLine.textContent = "✗ 错误";
      var detailed =
        target.meaningDetailedZh && target.meaningDetailedZh !== gloss(target)
          ? "（" + target.meaningDetailedZh + "）"
          : "";
      els.detailLine.textContent = "正确答案：" + gloss(target) + detailed;
    }
  }

  function renderStats() {
    var rate = stats.done ? Math.round((stats.correct / stats.done) * 100) : 0;
    els.stats.textContent =
      "核心6000 · 已做 " +
      stats.done +
      " · 正确 " +
      stats.correct +
      "（" +
      rate +
      "%）";
  }

  function resetStats() {
    if (!window.confirm("清空本机看词选意思进度？")) return;
    stats.done = 0;
    stats.correct = 0;
    recentIds = [];
    saveProgress();
    renderStats();
    toast("进度已清空");
  }

  var speakBtn = document.getElementById("speakBtn");
  if (speakBtn) {
    speakBtn.onclick = function () {
      if (question) speak(bank[question.targetIdx].word);
    };
  }
  if (els.word) {
    els.word.onclick = function () {
      if (question) speak(bank[question.targetIdx].word);
    };
  }
  if (els.nextBtn) {
    els.nextBtn.onclick = function () {
      nextQuestion();
    };
  }
  if (els.startBtn) {
    els.startBtn.onclick = function () {
      nextQuestion();
    };
  }
  var resetBtn = document.getElementById("resetBtn");
  if (resetBtn) {
    resetBtn.onclick = function () {
      resetStats();
    };
  }

  window.addEventListener("keydown", function (e) {
    var tag = (
      (document.activeElement && document.activeElement.tagName) ||
      ""
    ).toLowerCase();
    if (tag === "input" || tag === "textarea") return;

    if (!question || answered) {
      if (answered && (e.key === "Enter" || e.key === " " || e.key === "ArrowRight")) {
        e.preventDefault();
        nextQuestion();
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      speak(bank[question.targetIdx].word);
    }
    var n = Number(e.key);
    if (n >= 1 && n <= 4) {
      e.preventDefault();
      onSelect(n - 1);
    }
  });

  loadProgress();
  renderStats();
  setLoading();

  // Stream-friendly fetch with progress when Content-Length is available
  fetch(DATA_URL + "?v=" + DATA_VERSION, { cache: "default" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      var total = Number(r.headers.get("Content-Length") || 0);
      if (!r.body || !total || !r.body.getReader) {
        setLoading();
        return r.json();
      }
      var reader = r.body.getReader();
      var received = 0;
      var chunks = [];
      return reader.read().then(function process(result) {
        if (result.done) {
          setLoading();
          var all = new Uint8Array(received);
          var offset = 0;
          for (var i = 0; i < chunks.length; i++) {
            all.set(chunks[i], offset);
            offset += chunks[i].length;
          }
          var text = new TextDecoder("utf-8").decode(all);
          return JSON.parse(text);
        }
        chunks.push(result.value);
        received += result.value.length;
        setLoading();
        return reader.read().then(process);
      });
    })
    .then(function (data) {
      bankMeta.version = data.version || "meaning-6000";
      bankMeta.total = data.count || 0;
      bank = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.words)
          ? data.words
          : Array.isArray(data)
            ? data
            : [];
      bank = bank.filter(function (item) {
        return item && item.word && gloss(item);
      });
      if (bank.length < 20) throw new Error("词库过小或格式错误（有效词 " + bank.length + "）");
      buildPools();
      hideLoading();
      els.phaseText.textContent =
        "已加载 " + bank.length + " 词（" + bankMeta.version + "）· 点开始或自动出题";
      if (els.startBtn) {
        els.startBtn.textContent = "开始训练（" + bank.length + "）";
        els.startBtn.classList.remove("hidden");
      }
      renderStats();
      // Auto-start if user already has progress (resume feel)
      if (stats.done > 0) {
        nextQuestion();
      }
    })
    .catch(function (err) {
      hideLoading();
      els.phaseText.textContent =
        "加载失败：" + (err && err.message ? err.message : String(err));
      els.word.textContent = "—";
      if (els.startBtn) els.startBtn.classList.add("hidden");
      toast("词库加载失败，请检查网络后刷新");
    });
  if (window.StaticCloudSync) {
    window.StaticCloudSync.register("meaning", [PROGRESS_KEY, RECENT_KEY], {
      onMerged: applyMergedCloudProgress
    });
  }
})();
