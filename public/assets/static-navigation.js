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

  function renderStaticStateNotice() {
    if (document.getElementById("staticStateNotice")) return;
    var main = document.querySelector("main");
    if (!main) return;
    var notice = document.createElement("p");
    notice.id = "staticStateNotice";
    notice.className = "static-state-notice";
    notice.setAttribute("role", "note");
    notice.textContent = "独立静态学习包：本页的错词、SRS 与学习进度不会自动和正式网页共享；请在同一版本内连续学习。";
    main.insertBefore(notice, main.firstChild);
  }

  renderStaticStateNotice();

  /* Shared static flashcard swipe controller.
   * Touch and non-mouse Pointer Events are both accepted so phones, pens and
   * hybrid Windows devices follow the same path.  An explicit swipe handle may
   * remain tappable while still allowing a horizontal gesture to start there.
   */
  var STATIC_SWIPE_VERSION = "touch-pointer-v5";
  var STATIC_SWIPE_CONTROL_SELECTOR = "button,a,input,textarea,select,option,label,summary,details,[contenteditable='true'],[data-static-swipe-ignore]";
  var STATIC_SWIPE_ROLE_SELECTOR = "[role='button']";

  function isInteractiveSwipeTarget(target, card) {
    if (!target || !target.closest) return false;
    var control = target.closest(STATIC_SWIPE_CONTROL_SELECTOR);
    if (control && card.contains(control)) return true;
    var roleButton = target.closest(STATIC_SWIPE_ROLE_SELECTOR);
    return Boolean(
      roleButton &&
      card.contains(roleButton) &&
      !roleButton.hasAttribute("data-static-swipe-handle")
    );
  }

  function bindStaticCardSwipe(card, onSwipe) {
    if (!card || typeof onSwipe !== "function" || card.dataset.staticSwipeBound === "true") return false;
    card.dataset.staticSwipeBound = "true";
    card.style.touchAction = "pan-y";
    var touchStart = null;
    var pointerStart = null;
    var lastSwipeAt = 0;
    var lastSwipeSource = "";
    var lastSwipeDirection = "";
    var suppressClickUntil = 0;

    function resetTouchSwipe() {
      touchStart = null;
    }

    function finishSwipe(start, endX, endY, duration, event, source) {
      if (!start) return false;
      var now = Date.now();
      var deltaX = Number(endX) - start.x;
      var deltaY = Number(endY) - start.y;
      var direction = deltaX < 0 ? "next" : "previous";
      if (
        lastSwipeSource &&
        lastSwipeSource !== source &&
        lastSwipeDirection === direction &&
        now - lastSwipeAt < 180
      ) return false;
      if (
        duration > 900 ||
        Math.abs(deltaX) < 56 ||
        Math.abs(deltaX) <= Math.abs(deltaY) * 1.35
      ) return false;
      if (event && event.cancelable) event.preventDefault();
      onSwipe(direction);
      lastSwipeAt = now;
      lastSwipeSource = source;
      lastSwipeDirection = direction;
      suppressClickUntil = now + 450;
      return true;
    }

    card.addEventListener("touchstart", function (event) {
      if (!event.touches || event.touches.length !== 1 || isInteractiveSwipeTarget(event.target, card)) {
        resetTouchSwipe();
        return;
      }
      var touch = event.touches[0];
      touchStart = { x: touch.clientX, y: touch.clientY, at: Date.now() };
    }, { passive: true });
    card.addEventListener("touchend", function (event) {
      var start = touchStart;
      resetTouchSwipe();
      if (!start || !event.changedTouches || event.changedTouches.length !== 1) return;
      var touch = event.changedTouches[0];
      finishSwipe(start, touch.clientX, touch.clientY, Date.now() - start.at, event, "touch");
    }, { passive: false });
    card.addEventListener("touchcancel", resetTouchSwipe, { passive: true });

    if ("PointerEvent" in window) {
      card.addEventListener("pointerdown", function (event) {
        if (!event.isPrimary || event.pointerType === "mouse" || isInteractiveSwipeTarget(event.target, card)) {
          pointerStart = null;
          return;
        }
        pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, at: Date.now() };
      }, { passive: true });
      card.addEventListener("pointerup", function (event) {
        var start = pointerStart;
        pointerStart = null;
        if (!start || start.id !== event.pointerId) return;
        finishSwipe(start, event.clientX, event.clientY, Date.now() - start.at, event, "pointer");
      }, { passive: false });
      card.addEventListener("pointercancel", function () {
        pointerStart = null;
      }, { passive: true });
    }
    card.addEventListener("click", function (event) {
      if (Date.now() >= suppressClickUntil) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    return true;
  }

  window.StaticCardSwipe = {
    version: STATIC_SWIPE_VERSION,
    bind: bindStaticCardSwipe
  };

  Array.prototype.forEach.call(document.querySelectorAll("[data-static-swipe-card]"), function (card) {
    bindStaticCardSwipe(card, function (direction) {
      var buttonId = direction === "next"
        ? (card.dataset.staticSwipeNext || "nextBtn")
        : (card.dataset.staticSwipePrevious || "prevBtn");
      var button = document.getElementById(buttonId);
      if (button && !button.disabled) button.click();
    });
  });

  window.__IELTS_STATIC_SWIPE_VERSION__ = STATIC_SWIPE_VERSION;
}());
