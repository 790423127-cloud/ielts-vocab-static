import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { asPhraseList, asWordList, mergeSpellingLexicon } from "./lexicon-merge.mjs";

function readNodeLexiconFiles(root = process.cwd()) {
  const wordsFile = path.join(root, ".static-export-cache", "words.json");
  const phrasesFile = path.join(root, "public", "data", "phrases.json");

  const wordsPayload = existsSync(wordsFile)
    ? JSON.parse(readFileSync(wordsFile, "utf8"))
    : { words: [] };
  const phrasesPayload = existsSync(phrasesFile)
    ? JSON.parse(readFileSync(phrasesFile, "utf8"))
    : { phrases: [] };

  return {
    headwords: asWordList(wordsPayload),
    phrases: asPhraseList(phrasesPayload),
    headwordVersion: String(wordsPayload?.version || wordsPayload?.savedAt || ""),
    phraseVersion: String(phrasesPayload?.version || phrasesPayload?.generatedAt || "")
  };
}

export async function loadSpellingLexicon(options = {}) {
  const loaded = readNodeLexiconFiles(options.root || process.cwd());

  return mergeSpellingLexicon(loaded.headwords, loaded.phrases, {
    headwordVersion: loaded.headwordVersion,
    phraseVersion: loaded.phraseVersion
  });
}