const RELOAD_MARKER_KEY = "ielts-vocab:stale-chunk-reload";
const DEFAULT_COOLDOWN_MS = 30_000;

export function isStaleChunkError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || error || "");
  return (
    name === "ChunkLoadError" ||
    /Loading chunk \d+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /_next\/static\/chunks\/.+\.js/i.test(message)
  );
}

export function recoverFromStaleChunk(error, options = {}) {
  if (!isStaleChunkError(error)) {
    return { stale: false, reloading: false };
  }

  const windowObject = options.windowObject ?? globalThis.window;
  const now = Number(options.now ?? Date.now());
  const cooldownMs = Math.max(1, Number(options.cooldownMs) || DEFAULT_COOLDOWN_MS);

  if (!windowObject?.location) {
    return { stale: true, reloading: false };
  }

  let lastReloadAt = 0;
  try {
    lastReloadAt = Number(windowObject.sessionStorage?.getItem(RELOAD_MARKER_KEY)) || 0;
  } catch {
    lastReloadAt = 0;
  }

  if (now - lastReloadAt < cooldownMs) {
    return { stale: true, reloading: false };
  }

  try {
    windowObject.sessionStorage?.setItem(RELOAD_MARKER_KEY, String(now));
  } catch {
    // A blocked sessionStorage must not prevent recovery.
  }

  const url = new URL(windowObject.location.href);
  url.searchParams.set("_app_refresh", String(now));
  windowObject.location.replace(url.toString());
  return { stale: true, reloading: true };
}
