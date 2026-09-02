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
      {
        pos: "verb",
        meaningZh: "录制",
        example: "They record the interview.",
        exampleCn: "他们录制了这场访谈。",
        isPrimary: true
      }
    ]
  });

  assert.equal(display.pos, "verb");
  assert.equal(display.meaning, "录制");
  assert.equal(display.example, "They record the interview.");
  assert.deepEqual(display.supplementalSenses.map((sense) => sense.meaning), ["记录"]);
  assert.equal(display.needsSenseSplit, false);
});

test("an explicit top-level primary POS selects its matching sense", () => {
  const display = getStudyEntryDisplay({
    word: "forecast",
    pos: "noun / verb",
    primaryPos: "noun",
    senses: [
      { pos: "verb", meaningZh: "预测", readingCommon: true },
      { pos: "noun", meaningZh: "预报；预测" }
    ]
  });

  assert.equal(display.pos, "noun");
  assert.equal(display.meaning, "预报；预测");
});

test("untranslated source sentence cannot borrow another example's Chinese translation", () => {
  const display = getStudyEntryDisplay({
    word: "entrant",
    primaryPos: "noun",
    primaryMeaningZh: "参赛者",
    example: "There were over 500 entrants in the marathon.",
    exampleCn: "马拉松比赛有500多名参赛者。",
    senses: [
      {
        pos: "noun",
        meaningZh: "参赛者；新加入者",
        example: "Writers only submit one entry each."
      }
    ]
  });

  assert.equal(display.example, "There were over 500 entrants in the marathon.");
  assert.equal(display.exampleCn, "马拉松比赛有500多名参赛者。");
});

test("an entry without a complete bilingual example does not display a mismatched pair", () => {
  const display = getStudyEntryDisplay({
    word: "draft",
    example: "The committee discussed the draft.",
    senses: [{ pos: "noun", meaningZh: "草案", example: "The committee discussed the draft." }]
  });

  assert.equal(display.example, "");
  assert.equal(display.exampleCn, "");
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

test("same Chinese gloss remains visible when noun and verb senses differ", () => {
  const display = getStudyEntryDisplay({
    word: "hope",
    primaryPos: "verb",
    primaryMeaningZh: "希望；期望",
    senses: [
      { pos: "verb", meaningZh: "希望；期望", isPrimary: true },
      { pos: "noun", meaningZh: "希望；期望" }
    ],
    otherMeanings: [
      { pos: "noun", meaningZh: "希望；期望", definitionEn: "a feeling of expectation" }
    ]
  });

  assert.equal(display.pos, "verb");
  assert.deepEqual(
    display.supplementalSenses.map((sense) => ({ pos: sense.pos, meaning: sense.meaning })),
    [{ pos: "noun", meaning: "希望；期望" }]
  );
});

test("completed G-reading entries never expose a retired pending marker as a supplemental sense", () => {
  const display = getStudyEntryDisplay({
    word: "boar",
    primaryPos: "noun",
    primaryMeaningZh: "野猪",
    meaning: "野猪",
    senses: [
      { pos: "", meaningZh: "全题库阅读词汇（总词库待补）" },
      { pos: "noun", meaningZh: "野猪" },
      { pos: "noun", meaningZh: "公猪（未阉割的雄性家猪）" }
    ]
  });

  assert.equal(display.meaning, "野猪");
  assert.deepEqual(
    display.supplementalSenses.map((sense) => sense.meaning),
    ["公猪（未阉割的雄性家猪）"]
  );
});
