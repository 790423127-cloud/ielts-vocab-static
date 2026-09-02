"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  EFFECTIVE_STUDY_ACTIVITY_EVENT,
  EFFECTIVE_STUDY_IDLE_MS,
  EFFECTIVE_STUDY_INITIAL_READING_MS,
  EFFECTIVE_STUDY_MODULE_CHANGE_EVENT,
  EFFECTIVE_STUDY_RESUME_MS,
  addEffectiveStudyDuration,
  addEffectiveStudyInterval,
  getEffectiveStudyModule,
  migrateLegacySpellingActiveTime,
  resolveEffectiveStudyModule
} from "../lib/study-time/effective-study-time.mjs";

const STUDY_SHORTCUT_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Enter",
  " ",
  "Tab",
  "1",
  "2",
  "3",
  "4",
  "a",
  "b",
  "c",
  "d",
  "A",
  "B",
  "C",
  "D"
]);

function isTextEntryTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName?.toLowerCase();
  if (tag === "textarea" || tag === "select" || target.isContentEditable) return true;
  if (tag !== "input") return false;
  const type = String(target.getAttribute("type") || "text").toLowerCase();
  return !["button", "checkbox", "radio", "range", "submit", "reset"].includes(type);
}

function hasReadyStudySurface() {
  return Boolean(document.querySelector("main[data-study-surface]:not(.system-loading-page)"));
}

export default function EffectiveStudyTimeTracker() {
  const pathname = usePathname() || "/";
  const module = resolveEffectiveStudyModule(pathname);
  const moduleKeyRef = useRef(module?.key || "");
  const routeShownAtRef = useRef(Date.now());
  const lastActivityAtRef = useRef(0);
  const lastTickAtRef = useRef(Date.now());
  const engagedRef = useRef(false);

  const finishActiveSlice = useCallback((now = Date.now()) => {
    const moduleKey = moduleKeyRef.current;
    if (!moduleKey || !engagedRef.current) return;
    const activeEnd = Math.min(now, lastActivityAtRef.current + EFFECTIVE_STUDY_IDLE_MS);
    if (activeEnd > lastTickAtRef.current) {
      addEffectiveStudyInterval(moduleKey, lastTickAtRef.current, activeEnd);
    }
    lastTickAtRef.current = now;
    if (now >= lastActivityAtRef.current + EFFECTIVE_STUDY_IDLE_MS) {
      engagedRef.current = false;
    }
  }, []);

  const switchModule = useCallback((nextModuleKey, now = Date.now()) => {
    const nextModule = getEffectiveStudyModule(nextModuleKey);
    if (!nextModule || nextModule.key === moduleKeyRef.current) return;
    finishActiveSlice(now);
    moduleKeyRef.current = nextModule.key;
    routeShownAtRef.current = now;
    lastActivityAtRef.current = 0;
    lastTickAtRef.current = now;
    engagedRef.current = false;
  }, [finishActiveSlice]);

  const recordActivity = useCallback((detail = {}) => {
    const moduleKey = detail.moduleKey || moduleKeyRef.current;
    if (!moduleKey) return;
    const now = Number(detail.now ?? Date.now());

    if (Number(detail.activeMs) > 0) {
      addEffectiveStudyDuration(moduleKey, detail.activeMs, { now });
      return;
    }
    if (document.visibilityState === "hidden" || !hasReadyStudySurface()) return;

    if (engagedRef.current) {
      finishActiveSlice(now);
    }

    const idleGap = lastActivityAtRef.current
      ? now - lastActivityAtRef.current
      : Number.POSITIVE_INFINITY;
    if (!engagedRef.current || idleGap > EFFECTIVE_STUDY_IDLE_MS) {
      const sinceRouteShown = Math.max(0, now - routeShownAtRef.current);
      const initialMs = !lastActivityAtRef.current && sinceRouteShown <= EFFECTIVE_STUDY_IDLE_MS
        ? Math.max(EFFECTIVE_STUDY_RESUME_MS, Math.min(sinceRouteShown, EFFECTIVE_STUDY_INITIAL_READING_MS))
        : EFFECTIVE_STUDY_RESUME_MS;
      addEffectiveStudyDuration(moduleKey, initialMs, { now });
      engagedRef.current = true;
    }

    lastActivityAtRef.current = now;
    lastTickAtRef.current = now;
  }, [finishActiveSlice]);

  useEffect(() => {
    migrateLegacySpellingActiveTime();
  }, []);

  useEffect(() => {
    finishActiveSlice(Date.now());
    moduleKeyRef.current = module?.key || "";
    routeShownAtRef.current = Date.now();
    lastActivityAtRef.current = 0;
    lastTickAtRef.current = Date.now();
    engagedRef.current = false;
  }, [finishActiveSlice, module?.key]);

  useEffect(() => {
    if (pathname !== "/") return undefined;

    const syncFromPage = () => {
      const moduleKey = document.querySelector("main[data-effective-study-module]")
        ?.getAttribute("data-effective-study-module");
      if (moduleKey) switchModule(moduleKey);
    };
    const handleModuleChange = (event) => switchModule(event.detail?.moduleKey);

    syncFromPage();
    window.addEventListener(EFFECTIVE_STUDY_MODULE_CHANGE_EVENT, handleModuleChange);
    return () => window.removeEventListener(EFFECTIVE_STUDY_MODULE_CHANGE_EVENT, handleModuleChange);
  }, [pathname, switchModule]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        finishActiveSlice(Date.now());
      }
    }, 1_000);

    function handleActivity(event) {
      recordActivity(event.detail || {});
    }

    function handlePointerDown(event) {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("[data-effective-study-ignore]")) return;
      const region = event.target.closest("[data-effective-study-region]");
      if (!region) return;
      const action = event.target.closest("button:not(:disabled), [role='button'], input[type='range']");
      if (action) recordActivity();
    }

    function handleKeyDown(event) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (!STUDY_SHORTCUT_KEYS.has(event.key) || isTextEntryTarget(event.target)) return;
      if (event.target instanceof Element) {
        if (event.target.closest(".study-brand-header, .study-shell-sidebar, .study-mobile-nav, [data-effective-study-ignore]")) return;
        const focusedControl = event.target.closest("button, a, [role='button']");
        if (focusedControl && !focusedControl.closest("[data-effective-study-region]")) return;
      }
      if (!hasReadyStudySurface()) return;
      recordActivity();
    }

    function finishAndPause() {
      finishActiveSlice(Date.now());
      engagedRef.current = false;
      lastTickAtRef.current = Date.now();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") finishAndPause();
      else routeShownAtRef.current = Date.now();
    }

    window.addEventListener(EFFECTIVE_STUDY_ACTIVITY_EVENT, handleActivity);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("ielts:word-card-swipe", recordActivity);
    window.addEventListener("blur", finishAndPause);
    window.addEventListener("pagehide", finishAndPause);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      finishActiveSlice(Date.now());
      window.removeEventListener(EFFECTIVE_STUDY_ACTIVITY_EVENT, handleActivity);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("ielts:word-card-swipe", recordActivity);
      window.removeEventListener("blur", finishAndPause);
      window.removeEventListener("pagehide", finishAndPause);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [finishActiveSlice, recordActivity]);

  return null;
}
