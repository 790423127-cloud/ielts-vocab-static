import test from "node:test";
import assert from "node:assert/strict";
import {
  RG_LEARN_MODE,
  RG_STATUS,
  getModeStatusCode,
  getRgStatus,
  patchRgStatus
} from "../storage.mjs";

const word = {
  id: "rg_word_issue",
  entryType: "word",
  word: "issue",
  normalizedKey: "issue"
};
const phrase = {
  id: "rg_phrase_in_advance",
  entryType: "phrase",
  word: "in advance",
  normalizedKey: "in advance"
};

test("meaning mode only writes meaningStatus", () => {
  let map = {};
  map = patchRgStatus(map, word, { status: RG_STATUS.FAMILIAR }, RG_LEARN_MODE.MEANING);
  assert.equal(getModeStatusCode(word, map, RG_LEARN_MODE.MEANING), "familiar");
  assert.equal(getModeStatusCode(word, map, RG_LEARN_MODE.PHRASE), "unlearned");
  assert.equal(getRgStatus(word, map, RG_LEARN_MODE.MEANING), RG_STATUS.FAMILIAR);
  assert.equal(getRgStatus(word, map, RG_LEARN_MODE.PHRASE), RG_STATUS.PENDING);
});

test("phrase mode only writes phraseStatus", () => {
  let map = {};
  map = patchRgStatus(map, phrase, { status: RG_STATUS.UNFAMILIAR }, RG_LEARN_MODE.PHRASE);
  assert.equal(getModeStatusCode(phrase, map, RG_LEARN_MODE.PHRASE), "unfamiliar");
  assert.equal(getModeStatusCode(phrase, map, RG_LEARN_MODE.MEANING), "unlearned");
});

test("favorite independent of statuses", () => {
  let map = patchRgStatus({}, word, { status: RG_STATUS.FAMILIAR }, RG_LEARN_MODE.MEANING);
  map = patchRgStatus(map, word, { favorite: true }, RG_LEARN_MODE.MEANING);
  map = patchRgStatus(map, word, { status: RG_STATUS.UNFAMILIAR }, RG_LEARN_MODE.PHRASE);
  assert.equal(map["rg_word_issue"].favorite, true);
  assert.equal(map["rg_word_issue"].meaningStatus, "familiar");
  assert.equal(map["rg_word_issue"].phraseStatus, "unfamiliar");
});

test("one click does not set all three statuses", () => {
  const map = patchRgStatus({}, word, { status: RG_STATUS.FAMILIAR }, RG_LEARN_MODE.MEANING);
  const e = map["rg_word_issue"];
  assert.equal(e.meaningStatus, "familiar");
  assert.equal(e.phraseStatus, "unlearned");
  assert.equal(e.paraphraseStatus, "unlearned");
});
