import { SPELLING_SCOPE_ENTRY_MODES, normalizeSpellingScope } from "./spelling-scope.mjs";

const ENTRY_MODE_ALIASES = {
  word: "headwords",
  words: "headwords",
  headword: "headwords",
  headwords: "headwords",
  phrase: "phrases",
  phrases: "phrases"
};

export function normalizeEntryMode(mode, options = {}) {
  const scope = normalizeSpellingScope(options.scope || "word");
  const fallback = SPELLING_SCOPE_ENTRY_MODES[scope];
  const value = String(mode || fallback).trim().toLowerCase();

  if (value === "all" || value === "mixed" || value === "mix") {
    return fallback;
  }

  return ENTRY_MODE_ALIASES[value] || fallback;
}

export function entryModeLabel(mode, options = {}) {
  const normalized = normalizeEntryMode(mode, options);
  return normalized === "phrases" ? "词组" : "单词";
}