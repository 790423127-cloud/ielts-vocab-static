export const FONT_SCALE_STORAGE_KEY = "ielts-vocab-font-scale";
export const FONT_SCALE_CHANGE_EVENT = "ielts-vocab-font-scale-change";

export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.6;
export const FONT_SCALE_STEP = 0.05;
export const FONT_SCALE_DEFAULT = 1;

export function resolveFontScaleLevel(scale) {
  const next = clampFontScale(scale);
  if (next >= 1.45) return "xlarge";
  if (next >= 1.25) return "large";
  if (next <= 0.9) return "small";
  return "normal";
}

export function resolveAdaptiveShell(viewportWidth, scale) {
  const width = Number(viewportWidth);
  if (!Number.isFinite(width) || width <= 900) return "native";
  return width / clampFontScale(scale) <= 900 ? "compact" : "desktop";
}

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
  root.dataset.fontScaleLevel = resolveFontScaleLevel(next);
  root.dataset.adaptiveShell = resolveAdaptiveShell(globalThis.innerWidth, next);
  // Must set on documentElement so all calc(... * var(--font-scale)) update live.
  root.style.setProperty("--font-scale", String(next));
  // Also mirror on body for any descendant that inherits custom props oddly.
  if (document.body) {
    document.body.style.setProperty("--font-scale", String(next));
  }
  return next;
}

export function formatFontScaleLabel(scale) {
  return `${Math.round(clampFontScale(scale) * 100)}%`;
}
