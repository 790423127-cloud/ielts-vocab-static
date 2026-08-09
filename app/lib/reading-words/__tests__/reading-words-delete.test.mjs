import test from "node:test";
import assert from "node:assert/strict";
import { removeReadingWordEntry } from "../delete.mjs";

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
