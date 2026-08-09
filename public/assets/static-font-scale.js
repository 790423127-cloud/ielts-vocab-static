/**
 * Static pages: share the same font-scale key as Next (ielts-vocab-font-scale).
 * Applies --font-scale on <html> so relation/collocation CSS can scale.
 */
(function () {
  var KEY = "ielts-vocab-font-scale";
  var MIN = 0.8;
  var MAX = 1.6;
  var STEP = 0.05;

  function clamp(v) {
    v = Number(v);
    if (!isFinite(v)) return 1;
    return Math.min(MAX, Math.max(MIN, v));
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw == null || raw === "") return 1;
      return clamp(parseFloat(raw));
    } catch (e) {
      return 1;
    }
  }

  function apply(scale) {
    var next = clamp(scale);
    var root = document.documentElement;
    root.style.setProperty("--font-scale", String(next));
    root.dataset.fontScale = String(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch (e) {}
    return next;
  }

  function label(scale) {
    return Math.round(clamp(scale) * 100) + "%";
  }

  function ensureControl() {
    if (document.getElementById("static-font-scale")) return;
    var host =
      document.querySelector(".static-brand-bar .static-session-context") ||
      document.querySelector(".static-brand-bar") ||
      document.querySelector(".top-actions") ||
      document.body;
    if (!host) return;

    var wrap = document.createElement("div");
    wrap.id = "static-font-scale";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "全站字号");
    wrap.style.cssText =
      "display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:4px 8px;border:1px solid #dce3df;border-radius:999px;background:#fff;font-weight:800;color:#225f52;font-size:12px;";

    function btn(text, aria, onClick) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.setAttribute("aria-label", aria);
      b.style.cssText =
        "border:0;background:transparent;color:inherit;font:inherit;font-weight:900;cursor:pointer;padding:2px 6px;";
      b.onclick = onClick;
      return b;
    }

    var valueEl = document.createElement("button");
    valueEl.type = "button";
    valueEl.style.cssText =
      "border:0;background:#e5f2ed;border-radius:999px;padding:2px 8px;font:inherit;font-weight:900;color:#225f52;cursor:pointer;min-width:48px;";
    valueEl.title = "点击恢复默认 100%";

    function refresh() {
      var s = read();
      apply(s);
      valueEl.textContent = label(s);
    }

    wrap.appendChild(document.createTextNode("字号"));
    wrap.appendChild(
      btn("A−", "减小字号", function () {
        apply(read() - STEP);
        valueEl.textContent = label(read());
      })
    );
    wrap.appendChild(valueEl);
    wrap.appendChild(
      btn("A+", "增大字号", function () {
        apply(read() + STEP);
        valueEl.textContent = label(read());
      })
    );
    valueEl.onclick = function () {
      apply(1);
      valueEl.textContent = label(1);
    };

    host.appendChild(wrap);
    refresh();
  }

  // early apply before paint if possible
  apply(read());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureControl);
  } else {
    ensureControl();
  }

  window.addEventListener("storage", function (event) {
    if (event.key && event.key !== KEY) return;
    apply(read());
    var el = document.querySelector("#static-font-scale button[title]");
    if (el) el.textContent = label(read());
  });
})();
