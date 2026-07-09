export const STALE_LOCAL_STORAGE_KEYS = [
  "ielts_vocab_words_deepseek",
  "ielts_vocab_audio_status_v1"
];

export function safeLocalStorageGet(key) {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalStorageRemove(key) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function safeLocalStorageSet(key, value, options = {}) {
  if (typeof localStorage === "undefined") return false;
  const staleKeys = Array.isArray(options.staleKeys) ? options.staleKeys : STALE_LOCAL_STORAGE_KEYS;

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    for (const staleKey of staleKeys) {
      try {
        localStorage.removeItem(staleKey);
      } catch {}
    }

    try {
      localStorage.setItem(key, value);
      return true;
    } catch (retryError) {
      if (options.onError) {
        options.onError(retryError, key);
      }
      return false;
    }
  }
}

export function readJsonStorage(key, fallbackValue) {
  try {
    const raw = safeLocalStorageGet(key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch {
    safeLocalStorageRemove(key);
    return fallbackValue;
  }
}

export function writeJsonStorage(key, value, options = {}) {
  return safeLocalStorageSet(key, JSON.stringify(value), options);
}