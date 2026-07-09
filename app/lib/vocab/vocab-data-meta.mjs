import crypto from "node:crypto";

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function buildVocabDataPayload(rawText) {
  const parsed = JSON.parse(String(rawText || "{}"));
  const words = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.words) ? parsed.words : [];

  return {
    ok: true,
    count: words.length,
    words,
    version: String(parsed?.version || ""),
    savedAt: String(parsed?.savedAt || ""),
    lexiconHash: String(parsed?.lexiconHash || ""),
    fileHash: sha256(String(rawText || "")),
    wordsHash: sha256(JSON.stringify(words))
  };
}

export function validateVocabDataPayload(payload, expected = {}) {
  const words = Array.isArray(payload?.words) ? payload.words : [];
  const errors = [];

  if (!payload?.ok) errors.push("ok must be true");
  if (Number(payload?.count) !== words.length) errors.push("count does not match words.length");
  if (!String(payload?.version || "").trim()) errors.push("version is missing");
  if (!String(payload?.savedAt || "").trim()) errors.push("savedAt is missing");
  if (!String(payload?.lexiconHash || "").trim()) errors.push("lexiconHash is missing");
  if (!String(payload?.fileHash || "").trim()) errors.push("fileHash is missing");
  if (!String(payload?.wordsHash || "").trim()) errors.push("wordsHash is missing");
  if (payload?.wordsHash && payload.wordsHash !== sha256(JSON.stringify(words))) {
    errors.push("wordsHash does not match words content");
  }

  for (const field of ["count", "version", "lexiconHash", "fileHash", "wordsHash"]) {
    if (expected[field] !== undefined && payload?.[field] !== expected[field]) {
      errors.push(`${field} does not match active words metadata`);
    }
  }

  return { ok: errors.length === 0, errors };
}
