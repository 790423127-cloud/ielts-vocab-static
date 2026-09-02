import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySurfaceInflection,
  isDirectSurfaceInflection
} from "../word-surface-morphology.mjs";

test("surface morphology recognizes grammatical forms without reading lexicon labels", () => {
  assert.equal(classifySurfaceInflection("publish", "publishing"), "present-participle");
  assert.equal(classifySurfaceInflection("study", "studies"), "plural-or-third-person");
  assert.equal(classifySurfaceInflection("stop", "stopped"), "past-or-past-participle");
  assert.equal(classifySurfaceInflection("write", "wrote"), "irregular");
  assert.equal(classifySurfaceInflection("child", "children"), "irregular");
  assert.equal(classifySurfaceInflection("automaton", "automata"), "irregular");
  assert.equal(classifySurfaceInflection("bacterium", "bacteria"), "irregular");
  assert.equal(classifySurfaceInflection("dormouse", "dormice"), "irregular");
  assert.equal(classifySurfaceInflection("fisherman", "fishermen"), "irregular");
  assert.equal(classifySurfaceInflection("fireman", "firemen"), "irregular");
  assert.equal(classifySurfaceInflection("tear", "tore"), "irregular");
  assert.equal(classifySurfaceInflection("workman", "workmen"), "irregular");
});

test("surface morphology rejects derivations, spelling variants and lookalikes", () => {
  assert.equal(isDirectSurfaceInflection("publish", "publisher"), false);
  assert.equal(isDirectSurfaceInflection("actual", "actually"), false);
  assert.equal(isDirectSurfaceInflection("recognise", "recognize"), false);
  assert.equal(isDirectSurfaceInflection("fee", "feed"), false);
  assert.equal(isDirectSurfaceInflection("care", "career"), false);
});
