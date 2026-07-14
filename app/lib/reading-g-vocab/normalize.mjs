/**
 * Shared normalization for G reading keys (stable across import & runtime).
 */
export function normalizeReadingGKey(input) {
  let s = String(input || "");
  try {
    s = s.normalize("NFKC");
  } catch {
    /* ignore */
  }
  return s
    .trim()
    .toLowerCase()
    .replace(/[’‘‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?·•\-–—]+|[\s.,;:!?·•\-–—]+$/g, "")
    .trim();
}

export function mergeKey(entryType, normalizedKey) {
  return `${entryType || "word"}::${normalizedKey}`;
}

export function stableReadingGId(entryType, normalizedKey) {
  const slug = String(normalizedKey || "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "empty";
  return `rg_${entryType || "word"}_${slug}`;
}
