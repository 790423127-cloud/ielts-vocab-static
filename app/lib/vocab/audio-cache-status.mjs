function normalizeAudioStatusKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

export function buildWordAudioStatusMap(index, availableFilenames) {
  const files = availableFilenames instanceof Set
    ? availableFilenames
    : new Set(availableFilenames || []);
  const statuses = {};

  for (const [rawKey, entry] of Object.entries(index || {})) {
    if (!entry || entry.kind !== "word") continue;

    const key = normalizeAudioStatusKey(entry.text || rawKey);
    if (!key) continue;

    const filename = String(entry.filename || "");
    statuses[key] = {
      checked: true,
      hasAudio: Boolean(entry.hasAudio && filename && files.has(filename))
    };
  }

  return statuses;
}
