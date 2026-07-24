"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";

function isTypingTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target?.isContentEditable
  );
}

/**
 * Reuse the page's existing Delete-key workflow instead of locating the hidden
 * tools button by its visible Chinese label. This keeps confirmation, saving,
 * study-session guards, and undo logging in the single existing delete path.
 */
function requestCurrentWordDeletion() {
  window.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Delete",
    code: "Delete",
    bubbles: true,
    cancelable: true
  }));
}

export default function QuickDeleteCurrentWordButton() {
  const [portalTarget, setPortalTarget] = useState(null);
  const [disabled, setDisabled] = useState(true);

  const syncButtonState = useCallback(() => {
    const topbar = document.querySelector(".word-flash-shell .topbar");
    const favoriteButton = document.querySelector('button[aria-label="收藏当前单词"]');

    setPortalTarget(topbar instanceof HTMLElement ? topbar : null);
    // The favorite control uses the same empty/external-item guards as deletion.
    // Loading is still guarded by the existing Delete-key handler itself.
    setDisabled(!topbar || Boolean(favoriteButton?.disabled));
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    const scheduleSync = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(syncButtonState);
    };

    scheduleSync();

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "disabled"]
    });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [syncButtonState]);

  useEffect(() => {
    function handleKeyDown(event) {
      const isDShortcut = event.key?.toLowerCase() === "d" || event.code === "KeyD";
      if (!isDShortcut) return;
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      requestCurrentWordDeletion();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  if (!portalTarget) return null;

  return createPortal(
    <button
      type="button"
      className="top-pill quick-delete-pill"
      disabled={disabled}
      onClick={requestCurrentWordDeletion}
      title="删除当前单词（快捷键 D 或 Delete）"
      aria-label="删除当前单词"
    >
      <Trash2 aria-hidden="true" />
      删除
    </button>,
    portalTarget
  );
}
