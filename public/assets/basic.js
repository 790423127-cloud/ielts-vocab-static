/* Static zero-foundation lexicon flashcard (independent of main words.json). */
(function () {
  "use strict";

  var STATUS_KEY = "ielts_basic_flash_status_v1";
  var SESSION_KEY = "ielts_basic_flash_session_v1";
  var DATA_URL = "./data/basic-words.json";
  var DATA_VERSION = "20260714_d28_load_performance_v1";

  var words = [];
  var filter = { type: "all", value: "" };
  var statusMap = {};
  var index = 0;
  var study = [];
  var audio = null;

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
    unknownBtn: document.getElementById("unknownBtn")
  };

  function toast(msg) {
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

  function posAtomCn(atom) {
    var t = String(atom || "").trim().toLowerCase();
    if (!t) return "";
    if (/^noun$|^n\.?$/.test(t) || t.indexOf("noun") >= 0) return "名词";
    if (/^verb$|^v\.?$/.test(t) || t.indexOf("verb") >= 0) return "动词";
    if (/^adjective$|^adj\.?$/.test(t) || t.indexOf("adj") >= 0) return "形容词";
    if (/^adverb$|^adv\.?$/.test(t) || t.indexOf("adv") >= 0) return "副词";
    if (/phrase|短语/.test(t)) return "短语";
    if (/preposition|^prep/.test(t)) return "介词";
    if (/conjunction|^conj/.test(t)) return "连词";
    if (/pronoun|^pron/.test(t)) return "代词";
    if (/exclamation|interjection/.test(t)) return "感叹词";
    if (/number|numeral/.test(t)) return "数词";
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
    if (!zh.length) return raw;
    var joined = zh.join("/");
    if (raw.indexOf(joined) >= 0) return raw;
    return raw + " " + joined;
  }

  function getStatus(item) {
    var e = statusMap[nk(item.word)];
    if (!e) return "";
    if (typeof e === "string") return e;
    return e.status || "";
  }

  function isFavorite(item) {
    var e = statusMap[nk(item.word)];
    if (!e || typeof e === "string") return false;
    return !!e.favorite;
  }

  function patchStatus(item, patch) {
    var key = nk(item.word);
    if (!key) return;
    var prev = statusMap[key];
    var base =
      typeof prev === "string"
        ? { status: prev, favorite: false }
        : prev && typeof prev === "object"
          ? { status: prev.status || "", favorite: !!prev.favorite }
          : { status: "", favorite: false };
    statusMap[key] = {
      status: patch.status !== undefined ? patch.status : base.status,
      favorite: patch.favorite !== undefined ? !!patch.favorite : base.favorite
    };
    saveJson(STATUS_KEY, statusMap);
  }

  function matches(item) {
    if (item && item.entryType === "inflected-form" && item.studyMode === "reference") return false;
    var st = getStatus(item);
    if (filter.type === "everything") return true;
    if (filter.type === "status") {
      if (filter.value === "不熟") return st === "不熟";
      if (filter.value === "熟悉") return st === "熟悉";
      if (filter.value === "收藏") return isFavorite(item) && st !== "熟悉";
    }
    if (st === "熟悉") return false;
    if (filter.type === "topic") {
      return Array.isArray(item.topics) && item.topics.indexOf(filter.value) >= 0;
    }
    return true;
  }

  function rebuildStudy() {
    study = [];
    for (var i = 0; i < words.length; i++) {
      if (matches(words[i])) study.push(i);
    }
    if (!study.length) {
      index = 0;
      return;
    }
    if (study.indexOf(index) < 0) index = study[0];
  }

  function studyPos() {
    var p = study.indexOf(index);
    return p < 0 ? 0 : p;
  }

  function current() {
    return words[index] || null;
  }

  function speak(text) {
    var value = String(text || "").trim();
    if (!value) return;
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(value);
        u.lang = "en-US";
        u.rate = 0.88;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {
      toast("发音不可用");
    }
  }

  function render() {
    var item = current();
    if (!study.length || !item) {
      els.word.textContent = "完成";
      els.basic.textContent = "当前范围没有待学词";
      els.example.textContent = "可切换主题或查看全部词";
      els.exampleCn.textContent = "";
      els.count.textContent = "0 / 0";
      els.progressFill.style.width = "0%";
      els.favoriteBtn.textContent = "☆";
      els.unfamiliarAlert.classList.add("hidden");
      return;
    }

    var pos = studyPos();
    els.word.textContent = item.word || "—";
    els.basic.textContent =
      (item.phonetic || "等待音标") +
      " · " +
      posDisplay(item.pos) +
      " · " +
      (item.meaning || "等待释义");
    els.example.textContent = item.example || "暂无例句";
    els.exampleCn.textContent = item.exampleCn || "";
    els.count.textContent = pos + 1 + " / " + study.length;
    els.progressFill.style.width = Math.max(1, ((pos + 1) / study.length) * 100) + "%";
    els.favoriteBtn.textContent = isFavorite(item) ? "⭐" : "☆";
    els.unfamiliarAlert.classList.toggle("hidden", getStatus(item) !== "不熟");

    saveJson(SESSION_KEY, {
      wordKey: nk(item.word),
      filter: filter,
      savedAt: new Date().toISOString()
    });
  }

  function go(delta) {
    if (!study.length) return;
    var pos = studyPos();
    pos = (pos + delta + study.length) % study.length;
    index = study[pos];
    render();
  }

  function setFilter(next) {
    filter = next;
    rebuildStudy();
    render();
    toast(
      filter.type === "topic"
        ? "主题：" + filter.value
        : filter.type === "status"
          ? "筛选：" + filter.value
          : filter.type === "everything"
            ? "全部零基础词"
            : "全部待学"
    );
  }

  function buildTopics() {
    var counts = {};
    words.forEach(function (w) {
      (w.topics || []).forEach(function (t) {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    var topics = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a];
    });
    var chips = [
      { label: "全部待学", f: { type: "all", value: "" } },
      { label: "全部词", f: { type: "everything", value: "" } },
      { label: "不熟", f: { type: "status", value: "不熟" } },
      { label: "熟悉", f: { type: "status", value: "熟悉" } },
      { label: "收藏", f: { type: "status", value: "收藏" } }
    ];
    topics.slice(0, 16).forEach(function (t) {
      chips.push({ label: t + " " + counts[t], f: { type: "topic", value: t } });
    });

    els.topicBar.innerHTML = "";
    chips.forEach(function (chip) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "topic-chip";
      b.textContent = chip.label;
      b.onclick = function () {
        setFilter(chip.f);
        Array.prototype.forEach.call(els.topicBar.children, function (c) {
          c.classList.remove("active");
        });
        b.classList.add("active");
      };
      if (
        chip.f.type === filter.type &&
        String(chip.f.value || "") === String(filter.value || "")
      ) {
        b.classList.add("active");
      }
      els.topicBar.appendChild(b);
    });
  }

  document.getElementById("prevBtn").onclick = function () {
    go(-1);
  };
  var nextBtn = document.getElementById("nextBtn");
  if (nextBtn) {
    nextBtn.onclick = function () {
      go(1);
    };
  }
  document.getElementById("shuffleBtn").onclick = function () {
    if (!study.length) return;
    index = study[Math.floor(Math.random() * study.length)];
    render();
    toast("已随机");
  };
  document.getElementById("wordSoundBtn").onclick = function () {
    var c = current();
    if (c) speak(c.word);
  };
  document.getElementById("exampleSoundBtn").onclick = function () {
    var c = current();
    if (c) speak(c.example);
  };
  els.word.onclick = function () {
    var c = current();
    if (c) speak(c.word);
  };
  els.favoriteBtn.onclick = function () {
    var c = current();
    if (!c) return;
    patchStatus(c, { favorite: !isFavorite(c) });
    render();
  };
  els.knownBtn.onclick = function () {
    var c = current();
    if (!c) return;
    patchStatus(c, { status: "熟悉" });
    rebuildStudy();
    if (study.length) {
      var pos = Math.min(studyPos(), study.length - 1);
      index = study[pos];
    }
    render();
    toast("已标记熟悉");
    if (study.length) setTimeout(function () { go(1); }, 200);
  };
  els.unknownBtn.onclick = function () {
    var c = current();
    if (!c) return;
    var next = getStatus(c) === "不熟" ? "" : "不熟";
    patchStatus(c, { status: next });
    rebuildStudy();
    render();
    toast(next ? "已标记不熟" : "已取消不熟");
  };

  window.addEventListener("keydown", function (e) {
    var tag = (document.activeElement && document.activeElement.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    if (e.key === "Tab") {
      e.preventDefault();
      var c = current();
      if (c) speak(c.word);
    }
    if (e.code === "Space") {
      e.preventDefault();
      var c2 = current();
      if (c2) speak(c2.example);
    }
    if (e.key === "0" || e.key === "2") { e.preventDefault(); els.knownBtn.click(); }
    if (e.key === "1") { e.preventDefault(); els.unknownBtn.click(); }
  });

  statusMap = loadJson(STATUS_KEY, {}) || {};
  var session = loadJson(SESSION_KEY, null);

  fetch(DATA_URL + "?v=" + DATA_VERSION, { cache: "default" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      words = Array.isArray(data.words) ? data.words : Array.isArray(data.items) ? data.items : [];
      if (!words.length) throw new Error("empty bank");
      els.bankMeta.textContent =
        "零基础 · " +
        words.length +
        " 词 · " +
        (data.version || "basic");
      if (session && session.filter) filter = session.filter;
      rebuildStudy();
      if (session && session.wordKey) {
        for (var i = 0; i < words.length; i++) {
          if (nk(words[i].word) === session.wordKey && matches(words[i])) {
            index = i;
            break;
          }
        }
      }
      buildTopics();
      render();
    })
    .catch(function (err) {
      els.word.textContent = "加载失败";
      els.basic.textContent = String(err && err.message ? err.message : err);
      els.bankMeta.textContent = "无法读取 data/basic-words.json";
    });
})();
