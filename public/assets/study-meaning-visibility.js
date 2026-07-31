(function () {
  "use strict";

  var STORAGE_KEY = "ielts_vocab_hide_meanings_v1";

  function isHidden() {
    return document.documentElement.dataset.studyMeaningsHidden === "true";
  }

  function updateButtons() {
    document.querySelectorAll("[data-study-meaning-toggle]").forEach(function (button) {
      var hidden = isHidden();
      button.textContent = hidden ? "显示释义" : "隐藏释义";
      button.setAttribute("aria-pressed", String(hidden));
      button.title = hidden ? "显示当前学习内容的释义和提示" : "只看单词，隐藏释义和提示";
    });
  }

  function apply(hidden, save) {
    document.documentElement.dataset.studyMeaningsHidden = hidden ? "true" : "false";
    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
      } catch (_) {}
    }
    updateButtons();
  }

  function bind() {
    updateButtons();
    document.querySelectorAll("[data-study-meaning-toggle]").forEach(function (button) {
      button.addEventListener("click", function () {
        apply(!isHidden(), true);
      });
    });
  }

  window.addEventListener("storage", function (event) {
    if (event.key === STORAGE_KEY) apply(event.newValue === "1", false);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
