import test from "node:test";
import assert from "node:assert/strict";

import {
  parseReadingWordsPlainLine,
  parseReadingWordsTable
} from "../../reading-words/storage.mjs";

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
