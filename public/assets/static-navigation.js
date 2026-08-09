(function () {
  "use strict";

  var page = document.body && document.body.dataset ? document.body.dataset.staticPage : "";
  var query = new URLSearchParams(window.location.search);
  var source = query.get("source") || "";

  var primaryItems = [
    { key: "home", href: "./index.html", label: "刷词" },
    { key: "spelling", href: "./spelling.html", label: "拼写" },
    { key: "meaning", href: "./meaning.html", label: "选义" },
    { key: "ielts-538", href: "./ielts-538.html", label: "538考点" },
    { key: "basic", href: "./basic.html", label: "零基础词库" },
    { key: "reading-g", href: "./reading-g.html", label: "G类阅读提升" },
    { key: "reading-paraphrases", href: "./reading-paraphrases.html", label: "阅读同义替换" },
    { key: "reading-words", href: "./reading-words.html", label: "阅读生词本" }
  ];

  var groups = [
    {
      label: "学习",
      items: primaryItems.slice(0, 3)
    },
    {
      label: "专项学习",
      items: primaryItems.slice(3)
    },
    {
      label: "复习",
      items: [
        { key: "error-bank", href: "./spelling.html?source=error_bank", label: "错词本" },
        { key: "srs-review", href: "./spelling.html?source=srs_review", label: "SRS 复习" }
      ]
    }
  ];

  function isActive(item) {
    if (item.key === "error-bank") return page === "spelling" && source === "error_bank";
    if (item.key === "srs-review") return page === "spelling" && source === "srs_review";
    if (item.key === "spelling") return page === "spelling" && !source;
    return page === item.key;
  }

  function linkHtml(item, className) {
    var active = isActive(item);
    return '<a class="' + className + (active ? ' active' : '') + '" href="' + item.href + '"' + (active ? ' aria-current="page"' : '') + '>' + item.label + "</a>";
  }

  function renderPrimaryNav(container) {
    container.innerHTML = primaryItems.map(function (item) {
      return linkHtml(item, "static-primary-nav-link");
    }).join("");
  }

  function renderSidebar(container) {
    container.innerHTML = groups.map(function (group) {
      return '<section class="static-shell-nav-section"><span class="static-shell-label">' + group.label + "</span><nav>" + group.items.map(function (item) {
        return linkHtml(item, "static-shell-nav-link");
      }).join("") + "</nav></section>";
    }).join("");
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-static-primary-nav]"), renderPrimaryNav);
  Array.prototype.forEach.call(document.querySelectorAll("[data-static-sidebar]"), renderSidebar);

  /* Shared static flashcard swipe controller.
   * Pointer Events are the primary path on current phones. Touch Events remain
   * a fallback for older WebKit, while pan-y keeps normal vertical scrolling.
   */
  var STATIC_SWIPE_VERSION = "pointer-touch-v1";
  var swipeCards = Array.prototype.slice.call(document.querySelectorAll("[data-static-swipe-card]"));
  var swipeStart = null;
  var suppressClickUntil = 0;

  function closestSwipeCard(target) {
    return target && target.closest ? target.closest("[data-static-swipe-card]") : null;
  }

  function ignoresSwipe(target, card) {
    if (!target || !target.closest) return false;
    if (target.closest("[data-static-swipe-handle]")) return false;
    var ignored = target.closest("a, input, select, textarea, label, summary, details, [contenteditable='true'], [data-static-swipe-ignore]");
    return Boolean(ignored && card.contains(ignored));
  }

  function beginSwipe(card, x, y, pointerId) {
    swipeStart = {
      card: card,
      x: Number(x),
      y: Number(y),
      pointerId: pointerId,
      at: Date.now()
    };
  }

  function finishSwipe(card, x, y, pointerId) {
    var start = swipeStart;
    swipeStart = null;
    if (!start || start.card !== card || (start.pointerId != null && start.pointerId !== pointerId)) return false;
    var deltaX = Number(x) - start.x;
    var deltaY = Number(y) - start.y;
    if (
      Date.now() - start.at > 900 ||
      Math.abs(deltaX) < 56 ||
      Math.abs(deltaX) <= Math.abs(deltaY) * 1.35
    ) return false;

    var buttonId = deltaX < 0
      ? (card.dataset.staticSwipeNext || "nextBtn")
      : (card.dataset.staticSwipePrevious || "prevBtn");
    var button = document.getElementById(buttonId);
    if (!button || button.disabled) return false;
    suppressClickUntil = 0;
    button.click();
    suppressClickUntil = Date.now() + 450;
    return true;
  }

  function cancelSwipe() {
    swipeStart = null;
  }

  if (swipeCards.length) {
    swipeCards.forEach(function (card) {
      card.style.touchAction = "pan-y";
    });

    if ("PointerEvent" in window) {
      document.addEventListener("pointerdown", function (event) {
        if (event.pointerType === "mouse" || !event.isPrimary) return;
        var card = closestSwipeCard(event.target);
        if (!card || ignoresSwipe(event.target, card)) return;
        beginSwipe(card, event.clientX, event.clientY, event.pointerId);
      }, true);
      document.addEventListener("pointerup", function (event) {
        var card = closestSwipeCard(event.target) || (swipeStart && swipeStart.card);
        if (!card) return cancelSwipe();
        if (finishSwipe(card, event.clientX, event.clientY, event.pointerId)) event.preventDefault();
      }, true);
      document.addEventListener("pointercancel", cancelSwipe, true);
    } else {
      document.addEventListener("touchstart", function (event) {
        if (!event.touches || event.touches.length !== 1) return;
        var card = closestSwipeCard(event.target);
        if (!card || ignoresSwipe(event.target, card)) return;
        var touch = event.touches[0];
        beginSwipe(card, touch.clientX, touch.clientY, touch.identifier);
      }, { capture: true, passive: true });
      document.addEventListener("touchend", function (event) {
        if (!event.changedTouches || event.changedTouches.length !== 1) return cancelSwipe();
        var touch = event.changedTouches[0];
        var card = closestSwipeCard(event.target) || (swipeStart && swipeStart.card);
        if (!card) return cancelSwipe();
        if (finishSwipe(card, touch.clientX, touch.clientY, touch.identifier)) event.preventDefault();
      }, { capture: true, passive: false });
      document.addEventListener("touchcancel", cancelSwipe, true);
    }

    document.addEventListener("click", function (event) {
      if (Date.now() >= suppressClickUntil || !closestSwipeCard(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  window.__IELTS_STATIC_SWIPE_VERSION__ = STATIC_SWIPE_VERSION;
}());
