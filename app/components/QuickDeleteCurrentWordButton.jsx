"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { requestCurrentWordDeletion } from "../lib/vocab/delete-current-word-request.mjs";

function resolveDeletePortalTarget() {
  // Prefer the main flash topbar; fall back if layout wrappers rename slightly.
  const selectors = [
    ".word-flash-shell .topbar",
    ".page--word-flash .topbar",
    ".word-study-progress__actions .topbar",
    ".word-flash-shell header.topbar"
  ];
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (node instanceof HTMLElement) return node;
  }
  return null;
}

/**
 * Floating delete control for the main word flash page.
 * D / Delete shortcuts are handled in useWordFlashNavigation; this button only
 * raises the shared delete request event so confirm/save stay on one path.
 */
export default function QuickDeleteCurrentWordButton() {
  const [portalTarget, setPortalTarget] = useState(null);
  const [disabled, setDisabled] = useState(true);

  const syncButtonState = useCallback(() => {
    const topbar = resolveDeletePortalTarget();
    const favoriteButton = document.querySelector(
      '.word-flash-shell button[aria-label="收藏当前单词"], button[aria-label="收藏当前单词"]'
    );

    setPortalTarget(topbar);
    // Favorite control shares empty/external-item disabled state with deletion.
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

  // Keyboard D/Delete are owned by useWordFlashNavigation to avoid double confirm.
  // This component only mounts the visible delete control.

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
