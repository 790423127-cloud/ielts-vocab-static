export function formatHeadwordForDisplay(value) {
  return String(value || "")
    .trim()
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatHeadwordForSpeech(value) {
  return formatHeadwordForDisplay(value)
    .replace(/\band\s+\/\s+or\b/gi, "and or")
    .replace(/\bor\s+\/\s+and\b/gi, "or and")
    .replace(/\s+\/\s+/g, " or ")
    .replace(/\s+/g, " ")
    .trim();
}

export function preserveHeadwordSlashAlternatives(originalValue, repairedValue) {
  const original = formatHeadwordForDisplay(originalValue);
  const repaired = formatHeadwordForDisplay(repairedValue);
  const originalSlashCount = (original.match(/\//g) || []).length;
  const repairedSlashCount = (repaired.match(/\//g) || []).length;

  // A slash in a headword carries lexical information. If AI removes or adds
  // alternatives, keep the original headword rather than accepting corruption.
  if (originalSlashCount > 0 && repairedSlashCount !== originalSlashCount) {
    return original;
  }

  return repaired || original;
}
