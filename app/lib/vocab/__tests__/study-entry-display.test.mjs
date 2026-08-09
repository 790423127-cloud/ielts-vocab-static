import test from "node:test";
import assert from "node:assert/strict";

import { getStudyEntryDisplay } from "../study-entry-display.mjs";

test("explicit primary sense drives POS, meaning and example consistently", () => {
  const display = getStudyEntryDisplay({
    word: "record",
    pos: "noun/verb",
    meaning: "记录；录制",
    example: "legacy example",
    senses: [
      { pos: "noun", meaningZh: "记录", example: "Keep a record." },
      { pos: "verb", meaningZh: "录制", example: "They record the interview.", isPrimary: true }
    ]
  });

  assert.equal(display.pos, "verb");
  assert.equal(display.meaning, "录制");
  assert.equal(display.example, "They record the interview.");
  assert.deepEqual(display.supplementalSenses.map((sense) => sense.meaning), ["记录"]);
  assert.equal(display.needsSenseSplit, false);
});

test("legacy otherMeanings and meaningsZh share one deduplicated supplemental list", () => {
  const display = getStudyEntryDisplay({
    word: "account",
    pos: "noun",
    meaning: "账户",
    otherMeanings: [{ pos: "noun", meaningZh: "说明" }],
    meaningsZh: [
      { gloss: "账户", confidence: "high" },
      { gloss: "说明", confidence: "high" },
      { gloss: "叙述", confidence: "high" },
      { gloss: "低可信内容", confidence: "low" }
    ]
  });

  assert.deepEqual(display.supplementalSenses.map((sense) => sense.meaning), ["说明", "叙述"]);
});

test("supplemental meanings keep only information not already present in the primary meaning", () => {
  const display = getStudyEntryDisplay({
    word: "antenatal",
    pos: "adjective",
    meaning: "产前的",
    senses: [
      { pos: "adjective", meaningZh: "产前的" },
      { pos: "adjective", meaningZh: "产前的；孕期的" },
      { pos: "adjective", meaningZh: "孕期的；围产期的" }
    ]
  });

  assert.deepEqual(display.supplementalSenses.map((sense) => sense.meaning), ["孕期的", "围产期的"]);
});

test("combined multi-POS legacy rows are reported until senses are truly split", () => {
  const unsplit = getStudyEntryDisplay({
    word: "publishing",
    pos: "noun/verb",
    meaning: "出版；发行",
    senses: [{ pos: "noun/verb", meaningZh: "出版；发行" }]
  });
  const split = getStudyEntryDisplay({
    word: "record",
    pos: "noun/verb",
    meaning: "记录；录制",
    senses: [
      { pos: "noun", meaningZh: "记录" },
      { pos: "verb", meaningZh: "录制" }
    ]
  });

  assert.equal(unsplit.needsSenseSplit, true);
  assert.equal(split.needsSenseSplit, false);
});
