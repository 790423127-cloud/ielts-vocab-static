import { stripWordUserState } from "./word-cache-meta.mjs";

export function hasLexiconContentChange(beforeWords, nextWords) {
  if (!Array.isArray(beforeWords) || !Array.isArray(nextWords) || beforeWords === nextWords) return false;
  if (beforeWords.length !== nextWords.length) return true;

  for (let index = 0; index < beforeWords.length; index += 1) {
    if (beforeWords[index] === nextWords[index]) continue;
    if (JSON.stringify(stripWordUserState(beforeWords[index])) !== JSON.stringify(stripWordUserState(nextWords[index]))) return true;
  }

  return false;
}
