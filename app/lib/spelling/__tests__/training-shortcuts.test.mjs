import test from "node:test";
import assert from "node:assert/strict";

import {
  SPELLING_SHORTCUT_ACTIONS,
  resolveSpellingShortcut
} from "../training-shortcuts.mjs";

test("primary spelling shortcuts map to their required actions", () => {
  assert.equal(resolveSpellingShortcut({ key: "Tab" }), SPELLING_SHORTCUT_ACTIONS.PLAY_WORD);
  assert.equal(resolveSpellingShortcut({ key: " ", code: "Space" }), SPELLING_SHORTCUT_ACTIONS.PLAY_EXAMPLE);
  assert.equal(resolveSpellingShortcut({ key: "Enter" }), SPELLING_SHORTCUT_ACTIONS.SUBMIT);
  assert.equal(resolveSpellingShortcut({ key: "Enter", ctrlKey: true }), SPELLING_SHORTCUT_ACTIONS.SKIP);
});

test("manual correct flow maps Enter to continue", () => {
  assert.equal(
    resolveSpellingShortcut({ key: "Enter" }, { awaitingAdvance: true }),
    SPELLING_SHORTCUT_ACTIONS.CONTINUE
  );
});

test("phrase typing keeps an ordinary space available", () => {
  assert.equal(resolveSpellingShortcut({ key: " ", code: "Space" }, { isPhraseTyping: true }), "");
});

test("held playback shortcuts do not retrigger speech repeatedly", () => {
  assert.equal(resolveSpellingShortcut({ key: "Tab", repeat: true }), "");
  assert.equal(resolveSpellingShortcut({ key: " ", code: "Space", repeat: true }), "");
  assert.equal(resolveSpellingShortcut({ key: "Enter", repeat: true }), SPELLING_SHORTCUT_ACTIONS.SUBMIT);
});
