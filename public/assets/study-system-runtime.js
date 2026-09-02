/** IELTS_STUDY_SYSTEM_V2
 * Shared, data-free shell bootstrap for every standalone static study page.
 */
(function () {
  "use strict";

  var FONT_KEY = "ielts-vocab-font-scale";
  var SURFACE_BY_PAGE = {
    home: "flash",
    basic: "basic",
    "ielts-538": "ielts-538",
    "reading-g": "reading-g",
    "reading-words": "reading-words",
    "reading-paraphrases": "paraphrase",
    spelling: "spelling",
    meaning: "quiz",
    "meaning-en": "quiz",
    expressions: "quiz"
  };

  function clamp(value) {
    var numeric = Number(value);
    if (!isFinite(numeric)) return 1;
    numeric = Math.min(1.6, Math.max(0.8, numeric));
    return Math.round(numeric * 100) / 100;
  }

  function readScale() {
    try {
      return clamp(parseFloat(localStorage.getItem(FONT_KEY)));
    } catch (error) {
      return 1;
    }
  }

  function resolveShell(width, scale) {
    if (!isFinite(width) || width <= 900) return "native";
    if (width <= 1440 || width / clamp(scale) <= 1180) return "compact";
    return "desktop";
  }

  function resolveLevel(scale) {
    if (scale >= 1.45) return "xlarge";
    if (scale >= 1.1) return "large";
    if (scale <= 0.9) return "small";
    return "normal";
  }

  function apply() {
    var root = document.documentElement;
    var scale = readScale();
    root.dataset.studySystem = "v2";
    root.dataset.adaptiveShell = resolveShell(window.innerWidth, scale);
    root.dataset.fontScale = String(scale);
    root.dataset.fontScaleLevel = resolveLevel(scale);
    root.style.setProperty("--font-scale", String(scale));
    if (document.body) document.body.style.setProperty("--font-scale", String(scale));
  }

  function markSurface() {
    if (!document.body) return;
    var page = document.body.dataset.staticPage || "";
    document.body.dataset.studySurface = SURFACE_BY_PAGE[page] || page || "study";
  }

  apply();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      markSurface();
      apply();
    }, { once: true });
  } else {
    markSurface();
  }

  window.addEventListener("resize", apply, { passive: true });
  window.addEventListener("storage", function (event) {
    if (!event.key || event.key === FONT_KEY) apply();
  });
})();
