export const FONT_SCALE_STORAGE_KEY = "ielts-vocab-font-scale";
export const FONT_SCALE_CHANGE_EVENT = "ielts-vocab-font-scale-change";

export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.6;
export const FONT_SCALE_STEP = 0.05;
export const FONT_SCALE_DEFAULT = 1;

export function clampFontScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return FONT_SCALE_DEFAULT;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, numeric));
}

export function readStoredFontScale() {
  if (typeof localStorage === "undefined") return FONT_SCALE_DEFAULT;
  try {
    const raw = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
    if (raw == null || raw === "") return FONT_SCALE_DEFAULT;
    return clampFontScale(parseFloat(raw));
  } catch {
    return FONT_SCALE_DEFAULT;
  }
}

export function writeStoredFontScale(scale) {
  const next = clampFontScale(scale);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(next));
    } catch {
      // ignore quota / privacy mode
    }
  }
  applyFontScale(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FONT_SCALE_CHANGE_EVENT, { detail: { scale: next } }));
  }
  return next;
}

export function applyFontScale(scale) {
  if (typeof document === "undefined") return clampFontScale(scale);
  const next = clampFontScale(scale);
  const root = document.documentElement;
  root.dataset.fontScale = String(next);
  root.style.setProperty("--font-scale", String(next));
  return next;
}

export function formatFontScaleLabel(scale) {
  return `${Math.round(clampFontScale(scale) * 100)}%`;
}