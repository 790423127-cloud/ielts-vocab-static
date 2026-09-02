"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeIdictationPrefs } from "../lib/spelling/idictation-frequency.mjs";
import { normalizeSpellingScope } from "../lib/spelling/spelling-scope.mjs";
import {
  normalizePrefs,
  normalizeStoredPrefs,
  readCategoryPrefs,
  readRangeSettingsExpanded,
  readUxPrefs,
  writeCategoryPrefs,
  writeRangeSettingsExpanded,
  writeUxPrefs
} from "../lib/spelling/spelling-training-page-helpers.mjs";

export const DEFAULT_SPELLING_UX_PREFS = Object.freeze({
  turboMode: false,
  autoNextOnCorrect: true,
  listenOnlyMode: false,
  showMeaning: true,
  showExample: false,
  statsSidebarOpen: false,
  soundEffectsEnabled: true
});

export function normalizeSpellingUxPrefs(prefs = {}) {
  return {
    turboMode: Boolean(prefs.turboMode),
    autoNextOnCorrect: prefs.autoNextOnCorrect !== false,
    listenOnlyMode: Boolean(prefs.listenOnlyMode),
    showMeaning: prefs.showMeaning !== false,
    showExample: prefs.showExample === true,
    statsSidebarOpen: prefs.statsSidebarOpen === true,
    soundEffectsEnabled: prefs.soundEffectsEnabled !== false
  };
}

export function loadSpellingTrainingPreferences(scope = "word") {
  const normalizedScope = normalizeSpellingScope(scope);

  return {
    scope: normalizedScope,
    rangeSettingsExpanded: readRangeSettingsExpanded(normalizedScope),
    uxPrefs: normalizeSpellingUxPrefs(readUxPrefs(normalizedScope)),
    storedPrefs: normalizeStoredPrefs(readCategoryPrefs(normalizedScope) || {}, normalizedScope)
  };
}

export function applyStoredPrefsPatch(current, patch, scope = "word") {
  return normalizeStoredPrefs({ ...current, ...patch }, scope);
}

export function applyCategoryPrefsPatch(current, patch, scope = "word") {
  return {
    ...current,
    category: normalizePrefs({ ...current.category, ...patch }, scope)
  };
}

export function applyIdictationPrefsPatch(current, sourceKey, patch) {
  if (!sourceKey) return current;

  return {
    ...current,
    idictation: {
      ...(current.idictation || {}),
      [sourceKey]: normalizeIdictationPrefs(sourceKey, {
        ...(current.idictation?.[sourceKey] || {}),
        ...patch
      })
    }
  };
}

export function useSpellingTrainingPreferences(scope = "word", requestedPracticeSource = "") {
  const normalizedScope = normalizeSpellingScope(scope);
  const [rangeSettingsExpanded, setRangeSettingsExpanded] = useState(false);
  const [uxPrefs, setUxPrefs] = useState(DEFAULT_SPELLING_UX_PREFS);
  const [storedPrefs, setStoredPrefs] = useState(() => normalizeStoredPrefs({}, normalizedScope));
  const [hydratedScope, setHydratedScope] = useState("");

  useEffect(() => {
    const snapshot = loadSpellingTrainingPreferences(normalizedScope);
    let nextStored = snapshot.storedPrefs;

    // Route pages pass this query value, so sidebar navigation between
    // /spelling-words?source=... entries also updates the active training source.
    const allowed = new Set(["error_bank", "srs_review", "personal_wrong_book", "category"]);
    if (requestedPracticeSource && allowed.has(requestedPracticeSource)) {
      nextStored = applyStoredPrefsPatch(nextStored, { practiceSource: requestedPracticeSource }, normalizedScope);
    }

    setRangeSettingsExpanded(snapshot.rangeSettingsExpanded);
    setUxPrefs(snapshot.uxPrefs);
    setStoredPrefs(nextStored);
    setHydratedScope(snapshot.scope);
  }, [normalizedScope, requestedPracticeSource]);

  useEffect(() => {
    if (hydratedScope !== normalizedScope) return;
    writeCategoryPrefs(normalizedScope, storedPrefs);
  }, [hydratedScope, normalizedScope, storedPrefs]);

  useEffect(() => {
    if (hydratedScope !== normalizedScope) return;
    writeRangeSettingsExpanded(normalizedScope, rangeSettingsExpanded);
  }, [hydratedScope, normalizedScope, rangeSettingsExpanded]);

  useEffect(() => {
    if (hydratedScope !== normalizedScope) return;
    writeUxPrefs(normalizedScope, uxPrefs);
  }, [hydratedScope, normalizedScope, uxPrefs]);

  const setUxPreference = useCallback((key, nextValue) => {
    setUxPrefs((current) => {
      const value = typeof nextValue === "function" ? nextValue(current[key]) : nextValue;
      return Object.is(value, current[key]) ? current : { ...current, [key]: value };
    });
  }, []);

  const setTurboMode = useCallback((value) => setUxPreference("turboMode", value), [setUxPreference]);
  const setAutoNextOnCorrect = useCallback((value) => setUxPreference("autoNextOnCorrect", value), [setUxPreference]);
  const setListenOnlyMode = useCallback((value) => setUxPreference("listenOnlyMode", value), [setUxPreference]);
  const setShowMeaning = useCallback((value) => setUxPreference("showMeaning", value), [setUxPreference]);
  const setShowExample = useCallback((value) => setUxPreference("showExample", value), [setUxPreference]);
  const setStatsSidebarOpen = useCallback((value) => setUxPreference("statsSidebarOpen", value), [setUxPreference]);
  const setSoundEffectsEnabled = useCallback((value) => setUxPreference("soundEffectsEnabled", value), [setUxPreference]);

  const patchStoredPrefs = useCallback((patch) => {
    setStoredPrefs((current) => applyStoredPrefsPatch(current, patch, normalizedScope));
  }, [normalizedScope]);

  const patchCategoryPrefs = useCallback((patch) => {
    setStoredPrefs((current) => applyCategoryPrefsPatch(current, patch, normalizedScope));
  }, [normalizedScope]);

  const patchIdictationPrefs = useCallback((sourceKey, patch) => {
    if (!sourceKey) return;
    setStoredPrefs((current) => applyIdictationPrefsPatch(current, sourceKey, patch));
  }, []);

  return {
    preferencesHydrated: hydratedScope === normalizedScope,
    rangeSettingsExpanded,
    setRangeSettingsExpanded,
    ...uxPrefs,
    setTurboMode,
    setAutoNextOnCorrect,
    setListenOnlyMode,
    setShowMeaning,
    setShowExample,
    setStatsSidebarOpen,
    setSoundEffectsEnabled,
    storedPrefs,
    patchStoredPrefs,
    patchCategoryPrefs,
    patchIdictationPrefs
  };
}

export default useSpellingTrainingPreferences;
