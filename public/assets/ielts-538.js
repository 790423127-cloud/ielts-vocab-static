(function () {
  "use strict";

  var DATA_URL = "./data/ielts-538-words.json";
  var STATUS_KEY = "ielts_538_flash_status_v1";
  var SESSION_KEY = "ielts_538_static_session_v1";
  var DELETED_KEY = "ielts_538_static_deleted_v1";
  var words = [];
  var study = [];
  var statusMap = readJson(STATUS_KEY, {});
  var deletedMap = readJson(DELETED_KEY, {});
  var session = readJson(SESSION_KEY, {});
  var filter = session.filter || "all";
  var index = Number(session.index) || 0;
  var selectedById = {};
  var showMeanings = true;

  var els = {};
  [
    "searchInput", "searchBtn", "filterSelect", "shuffleBtn", "deleteBtn",
    "rangeLabel", "progressFill", "progressCount", "positionMeta", "favoriteBtn",
    "exampleSoundBtn", "exampleEn", "exampleCn", "wordSoundBtn", "word",
    "phonetic", "pos", "meaning", "paraphrase", "relatedGrid", "meaningToggle",
    "studyCard", "prevBtn", "knownBtn", "unknownBtn", "nextBtn", "toast"
  ].forEach(function (id) { els[id] = document.getElementById(id); });
  var swipeStart = null;

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function norm(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function meaningKey(value) {
    return norm(value).replace(/[\s，,。；;：:、（）()\[\]【】“”"'·\/\\-]+/g, "");
  }

  function meaningParts(value) {
    return String(value || "").split(/[，,。；;：:、\/（）()\[\]【】]+/)
      .map(function (part) { return part.trim(); }).filter(Boolean);
  }

  function chineseMeaningParts(value) {
    return meaningParts(value).filter(function (part) {
      return /[\u3400-\u9fff]/.test(part);
    });
  }

  function additionalMeaning(candidateMeaning, currentMeaning) {
    var current = {};
    chineseMeaningParts(currentMeaning).forEach(function (part) {
      current[meaningKey(part)] = true;
    });
    var seen = {};
    return chineseMeaningParts(candidateMeaning).filter(function (part) {
      var key = meaningKey(part);
      if (!key || current[key] || seen[key]) return false;
      seen[key] = true;
      return true;
    }).join("；");
  }

  function compactPosLabel(value) {
    var primary = String(value || "").trim().toLowerCase().split(/\s*(?:\/|\||,|;)\s*/)[0];
    var labels = [
      [/\bpreposition\b|介词/, "介"],
      [/\bconjunction\b|连词/, "连"],
      [/\badjective\b|\badj\b|形容词/, "形"],
      [/\badverb\b|\badv\b|副词/, "副"],
      [/\bpronoun\b|代词/, "代"],
      [/\bdeterminer\b|限定词/, "限"],
      [/\bnumeral\b|\bnumber\b|数词/, "数"],
      [/\bverb\b|\bv\b|动词/, "动"],
      [/\bnoun\b|\bn\b|名词/, "名"],
      [/\bphrase\b|短语/, "短"]
    ];
    for (var i = 0; i < labels.length; i += 1) {
      if (labels[i][0].test(primary)) return labels[i][1];
    }
    return "";
  }

  function wordId(item) {
    return String(item && (item.wordId || item.id || item.word) || "");
  }

  function statusOf(item) {
    var value = statusMap[wordId(item)];
    if (typeof value === "string") return { status: value, favorite: false };
    return value && typeof value === "object"
      ? { status: value.status || "", favorite: !!value.favorite }
      : { status: "", favorite: false };
  }

  function patchStatus(item, patch) {
    var id = wordId(item);
    var previous = statusOf(item);
    statusMap[id] = {
      status: patch.status !== undefined ? patch.status : previous.status,
      favorite: patch.favorite !== undefined ? !!patch.favorite : previous.favorite
    };
    writeJson(STATUS_KEY, statusMap);
  }

  function toast(message) {
    els.toast.textContent = message || "";
    els.toast.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { els.toast.classList.remove("show"); }, 2200);
  }

  function visibleWords() {
    return words.filter(function (item) {
      if (deletedMap[wordId(item)]) return false;
      var state = statusOf(item);
      if (filter === "everything") return true;
      if (filter === "unfamiliar") return state.status === "不熟";
      if (filter === "favorite") return state.favorite && state.status !== "熟悉";
      return state.status !== "熟悉";
    });
  }

  function rebuildStudy(preferredId) {
    study = visibleWords();
    if (preferredId) {
      var found = study.findIndex(function (item) { return wordId(item) === preferredId; });
      if (found >= 0) index = found;
    }
    if (!study.length) index = 0;
    else index = Math.max(0, Math.min(index, study.length - 1));
    writeJson(SESSION_KEY, { index: index, filter: filter });
  }

  function current() {
    return study[index] || null;
  }

  function sectionFor(item, replacement, pair) {
    return String(
      pair && pair.readingSection ||
      item.synonymSections && (
        item.synonymSections[replacement] ||
        item.synonymSections[Object.keys(item.synonymSections).find(function (key) {
          return norm(key) === norm(replacement);
        })]
      ) || ""
    );
  }

  function relatedFor(item) {
    var pairMap = {};
    (item.paraphraseExamples || []).forEach(function (pair) {
      if (pair && pair.replacement) pairMap[norm(pair.replacement)] = pair;
    });
    var detailMap = {};
    Object.keys(item.synonymDetails || {}).forEach(function (key) {
      detailMap[norm(key)] = item.synonymDetails[key] || {};
    });
    var recommended = {};
    (item.recommendedSynonyms || []).forEach(function (word) { recommended[norm(word)] = true; });
    var seen = {};
    return (item.synonyms || []).concat((item.paraphraseExamples || []).map(function (pair) {
      return pair.replacement;
    })).map(function (word) { return String(word || "").trim(); }).filter(function (word) {
      var key = norm(word);
      if (!key || key === norm(item.word) || seen[key]) return false;
      seen[key] = true;
      return true;
    }).map(function (word) {
      var pair = pairMap[norm(word)] || null;
      var detail = detailMap[norm(word)] || {};
      return {
        word: word,
        pair: pair,
        section: sectionFor(item, word, pair),
        recommended: !!recommended[norm(word)] || !!(pair && pair.isRecommended),
        pos: String(detail.pos || ""),
        posLabel: compactPosLabel(detail.pos),
        originalMeaning: String(detail.originalMeaning || ""),
        extra: additionalMeaning(detail.originalMeaning, item.meaning)
      };
    });
  }

  function selectedRelated(item, related) {
    var selected = selectedById[wordId(item)];
    return related.find(function (entry) { return entry.word === selected; }) ||
      related.find(function (entry) { return entry.recommended; }) ||
      related.find(function (entry) { return entry.pair; }) ||
      related[0] || null;
  }

  function speak(text) {
    var value = String(text || "").trim();
    if (!value || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = "en-GB";
    utterance.rate = 0.86;
    window.speechSynthesis.speak(utterance);
  }

  function renderParaphrase(item, selected) {
    if (!selected) {
      els.paraphrase.innerHTML = '<div class="study538-para-title">暂无同义替换</div>';
      return;
    }
    var pair = selected.pair;
    var badge = selected.section
      ? '<em class="study538-section">' + esc(selected.section) + "</em>" : "";
    var recommended = selected.recommended
      ? '<em class="study538-recommended">★ 最推荐</em>' : "";
    if (!pair) {
      els.paraphrase.innerHTML =
        '<div class="study538-para-title">该候选词暂无审核例句</div>' +
        '<div class="study538-replacement"><button class="study538-sound" data-speak="' +
        esc(selected.word) + '">🔊</button><strong>' + esc(selected.word) +
        "</strong>" + badge + recommended + "</div>";
      return;
    }
    els.paraphrase.innerHTML =
      '<div class="study538-para-title">仿雅思 G 类题目改写句</div>' +
      '<div class="study538-replacement"><button class="study538-sound" data-speak="' +
      esc(selected.word) + '">🔊</button><strong>' + esc(selected.word) +
      "</strong>" + badge + recommended + "</div>" +
      '<div class="study538-para-sentence">' + esc(pair.paraphraseSentence) + "</div>" +
      '<div class="study538-para-cn">' + esc(pair.meaningCn) + "</div>";
  }

  function renderRelated(item, related, selected) {
    var hasExtra = related.some(function (entry) { return !!entry.extra; });
    els.meaningToggle.classList.toggle("hidden", !hasExtra);
    els.meaningToggle.textContent = showMeanings ? "隐藏释义" : "显示释义";
    els.meaningToggle.setAttribute("aria-expanded", String(showMeanings));
    els.relatedGrid.innerHTML = related.map(function (entry) {
      var extra = showMeanings && entry.extra
        ? '<div class="study538-extra" title="' + esc(entry.extra) +
          '"><span class="study538-extra-label">其他义</span>' +
          (entry.posLabel ? '<b title="' + esc(entry.pos) + '">' +
            esc(entry.posLabel) + "</b>" : "") +
          "<span>" + esc(entry.extra) + "</span></div>" : "";
      return '<div class="study538-synonym ' +
        (selected && selected.word === entry.word ? "active" : "") +
        '" data-word="' + esc(entry.word) + '" tabindex="0" role="button">' +
        '<div class="study538-synonym-head"><span class="study538-synonym-word">' +
        esc(entry.word) + "</span>" +
        (entry.section ? '<em class="study538-section">' + esc(entry.section) + "</em>" : "") +
        (entry.recommended ? '<em class="study538-recommended">★ 最推荐</em>' : "") +
        '</div><div class="study538-synonym-state">' +
        (entry.pair ? "已审核" : "暂无审核例句") + "</div>" + extra +
        '<button class="study538-sound" data-speak="' + esc(entry.word) +
        '" aria-label="播放 ' + esc(entry.word) + '">🔊</button></div>';
    }).join("");
  }

  function rangeName() {
    return filter === "everything" ? "全部376词" :
      filter === "unfamiliar" ? "不熟词" :
      filter === "favorite" ? "收藏词" : "全部待学";
  }

  function render() {
    var item = current();
    els.filterSelect.value = filter;
    els.rangeLabel.textContent = rangeName();
    if (!item) {
      els.word.textContent = "暂无单词";
      els.meaning.textContent = "当前范围没有内容，可以切换到“全部376词”。";
      els.exampleEn.textContent = "";
      els.exampleCn.textContent = "";
      els.relatedGrid.innerHTML = "";
      els.paraphrase.innerHTML = "";
      els.progressCount.textContent = "0 / 0";
      els.progressFill.style.width = "0%";
      return;
    }
    var related = relatedFor(item);
    var selected = selectedRelated(item, related);
    var state = statusOf(item);
    els.positionMeta.textContent = "当前位置：" + (index + 1) + " / " + study.length +
      " · 当前词：" + item.word;
    els.favoriteBtn.textContent = state.favorite ? "★" : "☆";
    els.word.textContent = item.word || "—";
    els.phonetic.textContent = item.phonetic || "";
    els.pos.textContent = item.pos || "";
    els.pos.classList.toggle("hidden", !item.pos);
    els.meaning.textContent = item.meaning || "";
    els.exampleEn.textContent = item.example || "暂无例句";
    els.exampleCn.textContent = item.exampleCn || "";
    els.progressCount.textContent = (index + 1) + " / " + study.length;
    els.progressFill.style.width = study.length ? ((index + 1) / study.length * 100) + "%" : "0%";
    els.knownBtn.classList.toggle("active", state.status === "熟悉");
    els.unknownBtn.classList.toggle("active", state.status === "不熟");
    renderParaphrase(item, selected);
    renderRelated(item, related, selected);
    writeJson(SESSION_KEY, { index: index, filter: filter });
  }

  function move(offset) {
    if (!study.length) return;
    index = (index + offset + study.length) % study.length;
    render();
  }

  function mark(status) {
    var item = current();
    if (!item) return;
    var currentState = statusOf(item);
    patchStatus(item, { status: currentState.status === status ? "" : status });
    var id = wordId(item);
    rebuildStudy(id);
    if (!study.some(function (entry) { return wordId(entry) === id; })) {
      index = Math.min(index, Math.max(0, study.length - 1));
    }
    render();
  }

  function search() {
    var query = norm(els.searchInput.value);
    if (!query) return;
    var found = study.findIndex(function (item) {
      return norm(item.word).indexOf(query) >= 0 ||
        (item.synonyms || []).some(function (word) { return norm(word).indexOf(query) >= 0; });
    });
    if (found < 0) {
      found = words.findIndex(function (item) { return norm(item.word).indexOf(query) >= 0; });
      if (found >= 0) {
        filter = "everything";
        rebuildStudy(wordId(words[found]));
        found = study.findIndex(function (item) { return wordId(item) === wordId(words[found]); });
      }
    }
    if (found < 0) toast("没有找到：" + els.searchInput.value);
    else { index = found; render(); }
  }

  function deleteCurrent() {
    var item = current();
    if (!item) return;
    if (!confirm("确定从当前浏览器的538词库中隐藏这个词吗？\n\n" + item.word +
      "\n\n静态网站不会直接修改云端正式词库。")) return;
    deletedMap[wordId(item)] = Date.now();
    writeJson(DELETED_KEY, deletedMap);
    rebuildStudy();
    render();
    toast("已在当前浏览器隐藏：" + item.word);
  }

  els.prevBtn.onclick = function () { move(-1); };
  els.nextBtn.onclick = function () { move(1); };
  els.knownBtn.onclick = function () { mark("熟悉"); };
  els.unknownBtn.onclick = function () { mark("不熟"); };
  els.shuffleBtn.onclick = function () {
    if (!study.length) return;
    index = Math.floor(Math.random() * study.length);
    render();
  };
  els.searchBtn.onclick = search;
  els.searchInput.onkeydown = function (event) { if (event.key === "Enter") search(); };
  els.filterSelect.onchange = function () {
    filter = els.filterSelect.value;
    index = 0;
    rebuildStudy();
    render();
  };
  els.deleteBtn.onclick = deleteCurrent;
  els.favoriteBtn.onclick = function () {
    var item = current();
    if (!item) return;
    patchStatus(item, { favorite: !statusOf(item).favorite });
    render();
  };
  els.wordSoundBtn.onclick = function () { var item = current(); if (item) speak(item.word); };
  els.exampleSoundBtn.onclick = function () { var item = current(); if (item) speak(item.example); };
  els.meaningToggle.onclick = function () { showMeanings = !showMeanings; render(); };
  els.paraphrase.onclick = function (event) {
    var button = event.target.closest("[data-speak]");
    if (button) speak(button.getAttribute("data-speak"));
  };
  els.relatedGrid.onclick = function (event) {
    var sound = event.target.closest("[data-speak]");
    if (sound) {
      event.stopPropagation();
      speak(sound.getAttribute("data-speak"));
      return;
    }
    var card = event.target.closest("[data-word]");
    var item = current();
    if (card && item) {
      selectedById[wordId(item)] = card.getAttribute("data-word");
      render();
    }
  };

  els.studyCard.addEventListener("touchstart", function (event) {
    if (event.touches.length !== 1) return;
    if (event.target.closest("button, a, input, select, textarea, [role='button']")) {
      swipeStart = null;
      return;
    }
    var touch = event.touches[0];
    swipeStart = { x: touch.clientX, y: touch.clientY, at: Date.now() };
  }, { passive: true });
  els.studyCard.addEventListener("touchend", function (event) {
    var start = swipeStart;
    swipeStart = null;
    if (!start || event.changedTouches.length !== 1) return;
    var touch = event.changedTouches[0];
    var deltaX = touch.clientX - start.x;
    var deltaY = touch.clientY - start.y;
    if (
      Date.now() - start.at > 900 ||
      Math.abs(deltaX) < 56 ||
      Math.abs(deltaX) <= Math.abs(deltaY) * 1.35
    ) {
      return;
    }
    event.preventDefault();
    move(deltaX < 0 ? 1 : -1);
  }, { passive: false });
  els.studyCard.addEventListener("touchcancel", function () {
    swipeStart = null;
  });

  window.addEventListener("keydown", function (event) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") move(1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") move(-1);
    else if (event.key === "Tab") { event.preventDefault(); var item = current(); if (item) speak(item.word); }
    else if (event.key === " ") { event.preventDefault(); var currentItem = current(); if (currentItem) speak(currentItem.example); }
  });

  fetch(DATA_URL, { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then(function (data) {
      words = Array.isArray(data.words) ? data.words.filter(function (item) {
        return item && item.word && (item.wordId || item.id);
      }) : [];
      if (Number(data.count) !== words.length) {
        throw new Error("词库声明数量与实际数量不一致");
      }
      rebuildStudy();
      render();
    })
    .catch(function (error) {
      els.word.textContent = "词库加载失败";
      els.meaning.textContent = error.message || String(error);
      toast("538考点词库加载失败");
    });
})();
