import test from "node:test";
import assert from "node:assert/strict";

import { hasLexiconContentChange } from "../lexicon-content-change.mjs";

function word(value, patch = {}) {
  return {
    id: `id-${value}`,
    word: value,
    meaning: value,
    status: "",
    favorite: false,
    reviewCount: 0,
    ...patch
  };
}

test("学习状态变化不会触发正式词库发布", () => {
  const before = [word("good")];
  const after = [{ ...before[0], status: "熟悉", favorite: true, reviewCount: 3 }];
  assert.equal(hasLexiconContentChange(before, after), false);
});

test("删除、修改内容和调整正式顺序会触发发布", () => {
  const first = word("good");
  const second = word("bad");

  assert.equal(hasLexiconContentChange([first, second], [first]), true);
  assert.equal(hasLexiconContentChange([first], [{ ...first, meaning: "好的" }]), true);
  assert.equal(hasLexiconContentChange([first, second], [second, first]), true);
});

test("相同数组或相同正式内容不会重复发布", () => {
  const before = [word("good")];
  assert.equal(hasLexiconContentChange(before, before), false);
  assert.equal(hasLexiconContentChange(before, [{ ...before[0] }]), false);
});
