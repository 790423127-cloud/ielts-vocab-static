import test from "node:test";
import assert from "node:assert/strict";
import { removeLinkedMainEntry, removeReadingWordEntry } from "../delete.mjs";

test("deleting the final visible reading word leaves an empty selection", () => {
  const onlyWord = {
    id: "reading-only-word",
    wordId: "reading-only-word",
    word: "pport"
  };

  const result = removeReadingWordEntry(
    [onlyWord],
    onlyWord.id,
    [onlyWord]
  );

  assert.deepEqual(result.words, []);
  assert.equal(result.removed, onlyWord);
  assert.equal(result.nextSelectedId, "");
});

test("linked main deletion uses the stable id and preserves unrelated homographs", () => {
  const linked = { id: "word_linked", wordId: "word_linked", word: "record" };
  const other = { id: "word_other", wordId: "word_other", word: "record" };
  const result = removeLinkedMainEntry([linked, other], linked);

  assert.deepEqual(result.removed, [linked]);
  assert.deepEqual(result.words, [other]);
});
