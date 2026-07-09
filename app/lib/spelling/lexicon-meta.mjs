import { clearCandidateCache } from "./candidate-pool.mjs";
import { SPELLING_SCOPES } from "./spelling-scope.mjs";

const LEXICON_META_KEY = "ielts_spelling_lexicon_meta_v1";

function hashText(value) {
  let hash = 2166136261;
  const text = String(value || "");

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function entryContentFingerprint(entry = {}) {
  return [
    entry?.id || "",
    entry?.wordId || "",
    entry?.word || "",
    entry?.answer || "",
    entry?.phonetic || "",
    entry?.phoneticStatus || "",
    entry?.pronunciationSourceTier || "",
    entry?.meaning || "",
    entry?.meaningZh || "",
    entry?.definition || "",
    entry?.example || "",
    entry?.exampleCn || ""
  ].map((value) => String(value || "").trim()).join("\u001f");
}

function buildContentHash(headwords = [], phrases = []) {
  const content = [
    ...(Array.isArray(headwords) ? headwords : []),
    ...(Array.isArray(phrases) ? phrases : [])
  ].map(entryContentFingerprint).join("\u001e");

  return hashText(content);
}

export function buildLexiconFingerprint(headwords = [], phrases = [], versions = {}) {
  const headwordVersion = String(versions.headwordVersion || "");
  const phraseVersion = String(versions.phraseVersion || "");
  const headwordCount = Number(versions.headwordCount || headwords.length || 0);
  const phraseCount = Number(versions.phraseCount || phrases.length || 0);
  const contentHash = buildContentHash(headwords, phrases);
  const lexiconVersion = [headwordVersion, phraseVersion, headwordCount, phraseCount, contentHash].join("|");
  const lexiconHash = hashText(`${lexiconVersion}:${headwordCount}:${phraseCount}:${contentHash}`);

  return { lexiconVersion, lexiconHash, contentHash };
}

export function readStoredLexiconMeta() {
  if (typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem(LEXICON_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStoredLexiconMeta(meta = {}) {
  if (typeof localStorage === "undefined") return meta;

  const next = {
    lexiconVersion: meta.lexiconVersion || "",
    lexiconHash: meta.lexiconHash || "",
    counts: meta.counts || null,
    updatedAt: Date.now()
  };

  localStorage.setItem(LEXICON_META_KEY, JSON.stringify(next));
  return next;
}

export function syncLexiconMeta(meta = {}) {
  const previous = readStoredLexiconMeta();
  const changed = Boolean(
    previous &&
    (previous.lexiconHash !== meta.lexiconHash || previous.lexiconVersion !== meta.lexiconVersion)
  );

  writeStoredLexiconMeta(meta);

  if (changed) {
    for (const scope of SPELLING_SCOPES) {
      clearCandidateCache(scope);
    }
  }

  return {
    previous,
    changed,
    current: meta
  };
}
