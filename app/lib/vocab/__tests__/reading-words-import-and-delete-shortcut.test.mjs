import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseReadingWordsPlainLine,
  parseReadingWordsTable
} from "../../reading-words/storage.mjs";
import {
  removeLinkedMainEntry,
  removeReadingWordEntry,
  shouldHandleReadingWordDeleteShortcut
} from "../../reading-words/delete.mjs";
import { getStudyKeyboardAction } from "../study-keyboard-shortcuts.mjs";

const FIXED_OPTIONS = {
  idFactory: (() => {
    let index = 0;
    return () => `reading-test-${++index}`;
  })(),
  now: "2026-07-28T00:00:00.000Z"
};

test("reading words imports generated vocabulary-book rows", () => {
  const rows = parseReadingWordsTable([
    "acquisition /ˌækwɪˈzɪʃn/ noun 收购；获得",
    "amenity /əˈmiːnəti/ noun 生活福利设施；便利设施",
    "application /ˌæplɪˈkeɪʃn/ noun 应用；申请"
  ].join("\n"), FIXED_OPTIONS);

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map(({ word, phonetic, pos, meaning }) => ({ word, phonetic, pos, meaning })),
    [
      { word: "acquisition", phonetic: "/ˌækwɪˈzɪʃn/", pos: "noun", meaning: "收购；获得" },
      { word: "amenity", phonetic: "/əˈmiːnəti/", pos: "noun", meaning: "生活福利设施；便利设施" },
      { word: "application", phonetic: "/ˌæplɪˈkeɪʃn/", pos: "noun", meaning: "应用；申请" }
    ]
  );
});

test("reading words plain-line parser keeps simple words and parses abbreviations", () => {
  assert.deepEqual(parseReadingWordsPlainLine("brochure"), { word: "brochure" });
  assert.deepEqual(
    parseReadingWordsPlainLine("1. accessible /əkˈsesəbl/ adj. 可到达的；易使用的"),
    {
      word: "accessible",
      phonetic: "/əkˈsesəbl/",
      pos: "adjective",
      meaning: "可到达的；易使用的"
    }
  );
});

test("reading word delete removes only the selected reading record and selects the next visible word", () => {
  const words = [
    { id: "reading-a", word: "acquisition" },
    { id: "reading-b", word: "brochure" },
    { id: "reading-c", word: "congestion" }
  ];
  const result = removeReadingWordEntry(words, "reading-b", words);

  assert.deepEqual(result.words.map((entry) => entry.id), ["reading-a", "reading-c"]);
  assert.equal(result.removed.word, "brochure");
  assert.equal(result.nextSelectedId, "reading-c");
  assert.deepEqual(words.map((entry) => entry.id), ["reading-a", "reading-b", "reading-c"]);
});

test("reading word delete selects the previous visible word when deleting the final item", () => {
  const words = [
    { id: "reading-a", word: "acquisition" },
    { id: "reading-b", word: "brochure" }
  ];
  const result = removeReadingWordEntry(words, "reading-b", words);
  assert.equal(result.nextSelectedId, "reading-a");
});

test("reading word delete removes its stable linked master entry", () => {
  const masterWords = [
    { id: "word-brochure", word: "brochure" },
    { id: "word-other", word: "other" }
  ];
  const result = removeLinkedMainEntry(masterWords, masterWords[0]);

  assert.deepEqual(result.words.map((entry) => entry.id), ["word-other"]);
  assert.equal(result.removed[0].id, "word-brochure");
});

test("reading delete shortcut accepts D and Delete outside editors only", () => {
  assert.equal(shouldHandleReadingWordDeleteShortcut({ key: "d", target: { tagName: "BODY" } }), true);
  assert.equal(shouldHandleReadingWordDeleteShortcut({ key: "D", target: { tagName: "DIV" } }), true);
  assert.equal(shouldHandleReadingWordDeleteShortcut({ key: "Delete", code: "Delete", target: { tagName: "BODY" } }), true);
  assert.equal(shouldHandleReadingWordDeleteShortcut({ key: "d", target: { tagName: "INPUT" } }), false);
  assert.equal(shouldHandleReadingWordDeleteShortcut({ key: "Delete", target: { tagName: "TEXTAREA" } }), false);
  assert.equal(shouldHandleReadingWordDeleteShortcut({ key: "d", ctrlKey: true, target: { tagName: "BODY" } }), false);
});

test("reading word study shortcuts match the main flashcard outside editors", () => {
  const body = { tagName: "BODY" };
  const range = { tagName: "INPUT", type: "range" };
  const select = { tagName: "SELECT" };
  assert.equal(getStudyKeyboardAction({ key: "Tab", target: body }), "word-audio");
  assert.equal(getStudyKeyboardAction({ key: " ", code: "Space", target: body }), "example-audio");
  assert.equal(getStudyKeyboardAction({ key: "ArrowLeft", target: body }), "previous");
  assert.equal(getStudyKeyboardAction({ key: "ArrowRight", target: body }), "next");
  assert.equal(getStudyKeyboardAction({ key: "1", code: "Digit1", target: body }), "known");
  assert.equal(getStudyKeyboardAction({ key: "2", code: "Digit2", target: body }), "blurry");
  assert.equal(getStudyKeyboardAction({ key: "3", code: "Digit3", target: body }), "unknown");
  assert.equal(getStudyKeyboardAction({ key: "Tab", target: { tagName: "INPUT" } }), "word-audio");
  assert.equal(getStudyKeyboardAction({ key: "Tab", shiftKey: true, target: { tagName: "INPUT" } }), "");
  assert.equal(getStudyKeyboardAction({ key: " ", code: "Space", target: { tagName: "INPUT" } }), "");
  assert.equal(getStudyKeyboardAction({ key: "Tab", target: select }), "word-audio");
  assert.equal(getStudyKeyboardAction({ key: " ", code: "Space", target: select }), "example-audio");
  assert.equal(getStudyKeyboardAction({ key: "Tab", target: range }), "word-audio");
  assert.equal(getStudyKeyboardAction({ key: " ", code: "Space", target: range }), "example-audio");
  assert.equal(getStudyKeyboardAction({ key: "ArrowRight", target: range }), "next");
  assert.equal(getStudyKeyboardAction({ key: "3", code: "Digit3", target: range }), "unknown");
  assert.equal(getStudyKeyboardAction({ key: "Tab", repeat: true, target: body }), "");
});

test("the shortcut and button are wired only into the reading words page", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const readingPage = fs.readFileSync(path.join(root, "app/reading-words/page.jsx"), "utf8");
  const spellingCard = fs.readFileSync(path.join(root, "app/components/SpellingFocusCard.jsx"), "utf8");

  assert.match(readingPage, /data-testid="reading-word-delete"/);
  assert.match(readingPage, /removeLinkedMainEntry\(previousMainWords/);
  assert.match(readingPage, /confirmedDeletion: true/);
  assert.match(readingPage, /DELETE_CURRENT_WORD_EVENT/);
  assert.match(readingPage, /主词库同步删除/);
  assert.doesNotMatch(readingPage, /只会删除阅读生词记录，不会删除主词库中的单词/);
  assert.doesNotMatch(spellingCard, /移出错词本/);
});
