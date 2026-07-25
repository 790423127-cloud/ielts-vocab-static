import { stripWordUserState, wordIdentity } from "./word-cache-meta.mjs";

function sameContent(a, b) {
  return JSON.stringify(stripWordUserState(a)) === JSON.stringify(stripWordUserState(b));
}

export function hasLexiconContentChange(beforeWords, nextWords) {
  if (!Array.isArray(beforeWords) || !Array.isArray(nextWords) || beforeWords === nextWords) return false;
  if (beforeWords.length !== nextWords.length) return true;

  let orderChanged = false;
  for (let index = 0; index < beforeWords.length; index += 1) {
    if (beforeWords[index] === nextWords[index]) continue;
    if (wordIdentity(beforeWords[index]) !== wordIdentity(nextWords[index])) {
      orderChanged = true;
      break;
    }
    if (!sameContent(beforeWords[index], nextWords[index])) return true;
  }
  if (!orderChanged) return false;

  const beforeById = new Map(beforeWords.map((word) => [wordIdentity(word), word]));
  return nextWords.some((word) => {
    const previous = beforeById.get(wordIdentity(word));
    return !previous || !sameContent(previous, word);
  });
}
