// Expressions Mode — storage layer.
// Uses existing key: ielts_expressions_700_progress_v1 (READ/WRITE compat).
// Structure preserved: { _v: 1, data: { [id]: "known" | "unknown" } }

const STORAGE_KEY = "ielts_expressions_700_progress_v1";
const STORAGE_VERSION = 1;

export function loadProgress() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && parsed._v === STORAGE_VERSION && typeof parsed.data === "object") {
      return parsed.data;
    }
    return {};
  } catch { return {}; }
}

export function saveProgress(progress) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ _v: STORAGE_VERSION, data: progress }));
  } catch { /* ignore */ }
}

export function markPhrase(phraseId, status) {
  if (!phraseId) return;
  const progress = loadProgress();
  progress[phraseId] = status;
  saveProgress(progress);
}

export function getPhraseStatus(phraseId) {
  const progress = loadProgress();
  return progress[phraseId] || null;
}

export function getProgressStats() {
  const progress = loadProgress();
  const entries = Object.entries(progress);
  const known = entries.filter(([, v]) => v === "known").length;
  const unknown = entries.filter(([, v]) => v === "unknown").length;
  return { known, unknown, totalKnownOrUnknown: entries.length };
}

export function getLearnedCount() {
  const progress = loadProgress();
  return Object.keys(progress).length;
}

export function clearProgress() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export { STORAGE_KEY, STORAGE_VERSION };