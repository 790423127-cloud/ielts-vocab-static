"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";

function findDeleteCurrentWordButton() {
  return [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "删除当前单词"
  ) || null;
}

function isTypingTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target?.isContentEditable
  );
}

export default function QuickDeleteCurrentWordButton() {
  const [portalTarget, setPortalTarget] = useState(null);
  const [disabled, setDisabled] = useState(true);

  const syncButtonState = useCallback(() => {
    const topbar = document.querySelector(".word-flash-shell .topbar");
    const sourceButton = findDeleteCurrentWordButton();

    setPortalTarget(topbar instanceof HTMLElement ? topbar : null);
    setDisabled(!sourceButton || sourceButton.disabled);
  }, []);

  const deleteCurrentWord = useCallback(() => {
    const sourceButton = findDeleteCurrentWordButton();
    if (!sourceButton || sourceButton.disabled) return;
    sourceButton.click();
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
      if (event.key?.toLowerCase() !== "d") return;
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      const sourceButton = findDeleteCurrentWordButton();
      if (!sourceButton || sourceButton.disabled) return;

      event.preventDefault();
      event.stopPropagation();
      sourceButton.click();
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
      onClick={deleteCurrentWord}
      title="删除当前单词（快捷键 D 或 Delete）"
      aria-label="删除当前单词"
    >
      <Trash2 aria-hidden="true" />
      删除
    </button>,
    portalTarget
  );
}
