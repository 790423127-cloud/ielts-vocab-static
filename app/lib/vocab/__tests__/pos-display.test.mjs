import test from "node:test";
import assert from "node:assert/strict";
import { getPosChinese, getPosDisplay, getPosFamilyDisplay } from "../pos-display.mjs";

test("noun shows chinese", () => {
  assert.equal(getPosDisplay("noun"), "noun 名词");
  assert.equal(getPosDisplay("n."), "n. 名词");
});

test("compound pos maps both sides", () => {
  assert.equal(getPosChinese("noun/verb"), "名词/动词");
  assert.equal(getPosDisplay("noun/verb"), "noun/verb 名词/动词");
  assert.equal(getPosDisplay("n./v."), "n./v. 名词/动词");
});

test("pos family pill", () => {
  assert.equal(getPosFamilyDisplay("adjective"), "adjective 形容词");
  assert.equal(getPosFamilyDisplay("unknown"), "");
});

test("already bilingual kept", () => {
  assert.equal(getPosDisplay("noun 名词"), "noun 名词");
});
