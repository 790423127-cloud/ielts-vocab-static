import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMeaningCoverageReview,
  applyMeaningCoverageCacheHint,
  describeMeaningCoverageProfileIssue,
  isMeaningCoveragePending,
  isMeaningCoverageProfileUsable,
  markMeaningCoveragePending,
  needsMeaningCoverageReview
} from "../meaning-coverage-audit.mjs";

function profile() {
  return {
    word: "record",
    phonetic: "/ˈrekɔːd/",
    pos: "noun",
    meaning: "记录",
    meaningDetailZh: "作名词时，指保存下来的书面、电子或音视频信息，也可指某项活动留下的正式记载。",
    definition: "a written or stored account of facts or events",
    example: "Keep a record of all your expenses.",
    exampleCn: "请记录所有开支。",
    otherMeanings: [{
      pos: "verb",
      meaningZh: "记录；录制",
      definitionEn: "to write down or store information so that it can be used later",
      example: "The device records the temperature every minute.",
      exampleCn: "该设备每分钟记录一次温度。"
    }],
    forms: [],
    wordFamily: [],
    synonyms: [],
    collocations: [{ phrase: "keep a record", chinese: "保存记录" }],
    phraseCollocations: [{ phrase: "on record", chinese: "有记录在案" }],
    ieltsUse: ["Reading"],
    topics: ["Daily life"],
    difficulty: "中级核心",
    aiContentProfile: "main-meaning-detailed-senses-v3"
  };
}

test("template-level details enter the semantic review queue", () => {
  const entry = { word: "record", meaning: "记录", meaningDetailZh: "“record”常见含义为：记录。", otherMeanings: [] };
  assert.equal(needsMeaningCoverageReview(entry), true);
  assert.equal(isMeaningCoveragePending(markMeaningCoveragePending(entry)), true);
});

test("an old reviewed flag cannot approve a repetitive or form-only detail", () => {
  assert.equal(needsMeaningCoverageReview({
    word: "modifications",
    meaning: "修改；变更；改进",
    meaningDetailZh: "modifications: 修改；变更；改进；“modification”的复数；",
    meaningCoverageReviewed: true,
    meaningCoverageAuditStatus: "reviewed"
  }), true);
});

test("cache review upgrades only shallow explanation and merges distinct common senses", () => {
  const entry = {
    id: "word-record",
    word: "record",
    meaning: "记录",
    meaningDetailZh: "记录",
    otherMeanings: [{
      pos: "noun",
      meaningZh: "唱片",
      definitionEn: "a disc with recorded music",
      example: "He bought a record.",
      exampleCn: "他买了一张唱片。"
    }],
    status: "不熟"
  };
  assert.equal(isMeaningCoverageProfileUsable(profile(), "record"), true);
  const next = applyMeaningCoverageReview(entry, profile(), { reviewedAt: "2026-08-10T00:00:00.000Z" });
  assert.equal(next.id, entry.id);
  assert.equal(next.status, "不熟");
  assert.match(next.meaningDetailZh, /书面/);
  assert.deepEqual(next.otherMeanings.map((sense) => sense.meaningZh), ["唱片", "记录；录制"]);
  assert.equal(next.meaningCoverageAuditStatus, "reviewed");
});

test("a reviewed additional sense needs definitions, not its own bilingual example", () => {
  const noSenseExample = profile();
  delete noSenseExample.otherMeanings[0].example;
  delete noSenseExample.otherMeanings[0].exampleCn;

  assert.equal(isMeaningCoverageProfileUsable(noSenseExample, "record"), true);
  const entry = markMeaningCoveragePending({
    word: "record",
    meaning: "记录",
    meaningDetailZh: "记录"
  });
  const next = applyMeaningCoverageReview(entry, noSenseExample, {
    reviewedAt: "2026-08-10T00:00:00.000Z"
  });
  assert.equal(next.otherMeanings[0].example, "");
  assert.equal(next.otherMeanings[0].exampleCn, "");
});

test("an older cache hint improves the primary explanation but keeps the semantic queue", () => {
  const entry = markMeaningCoveragePending({
    word: "accommodate",
    meaning: "容纳",
    meaningDetailZh: "容纳",
    otherMeanings: []
  });
  const cachedHint = {
    word: "accommodate",
    meaning: "容纳",
    meaningDetailZh: "提供空间或场所，使某人或某物能够被安置。",
    otherMeanings: ["适应"]
  };
  const next = applyMeaningCoverageCacheHint(entry, cachedHint);
  assert.match(next.meaningDetailZh, /提供空间/);
  assert.deepEqual(next.otherMeanings, []);
  assert.equal(isMeaningCoveragePending(next), true);
});

test("semantic review reports a mode-specific reason and clears a prior failure after approval", () => {
  const shortProfile = {
    word: "record",
    meaning: "记录",
    meaningDetailZh: "记录",
    otherMeanings: []
  };
  assert.equal(
    describeMeaningCoverageProfileIssue(shortProfile, "record"),
    "主释义详解过短，或只是重复单词、词性和中文短释义"
  );

  const next = applyMeaningCoverageReview({
    word: "record",
    meaning: "记录",
    meaningDetailZh: "记录",
    meaningCoverageLastFailure: { reason: "旧失败原因" }
  }, profile());
  assert.equal("meaningCoverageLastFailure" in next, false);
});

test("G review may replace a contextual old primary with the generated common primary", () => {
  const next = applyMeaningCoverageReview({
    word: "sensation",
    pos: "noun",
    primaryPos: "noun",
    meaning: "轰动",
    meaningZh: "轰动",
    primaryMeaningZh: "轰动",
    meaningDetailZh: "新闻引起了轰动。",
    definition: "a person or event that causes widespread excitement",
    otherMeanings: []
  }, {
    ...profile(),
    word: "sensation",
    meaning: "感觉；感受",
    meaningDetailZh: "首先指由感官或身心产生的感觉、感受；也可指身体某个部位的知觉。",
    definition: "a physical feeling or an experience produced by the senses",
    otherMeanings: [{
      pos: "noun",
      meaningZh: "轰动的人或事",
      definitionEn: "a person or event that causes widespread excitement"
    }]
  }, {
    replacePrimaryMeaning: true,
    reviewedAt: "2026-08-11T00:00:00.000Z"
  });

  assert.equal(next.meaning, "感觉；感受");
  assert.equal(next.primaryMeaningZh, "感觉；感受");
  assert.match(next.meaningDetailZh, /感官/);
  assert.match(next.definition, /physical feeling/);
  assert.deepEqual(next.otherMeanings.map((sense) => sense.meaningZh), ["轰动的人或事"]);
});
