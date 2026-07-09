import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhraseKey } from "../load-phrases.mjs";
import { PHRASE_STUDY_STATUS } from "../phrase-flashcard-utils.mjs";
import { migratePhraseStatusMap, normalizePhraseStatusValue } from "../phrase-flashcard-utils.mjs";
import { resolvePhraseStudyIndex } from "../phrase-flashcard-session.mjs";

const phrases = [
  { id: "p1", word: "be due to", status: "" },
  { id: "p2", word: "in terms of", status: "" },
  { id: "p3", word: "as a result", status: "" }
];

function buildStudyList(list, filter, statusMap) {
  return list
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .filter(({ entry }) => {
      const status = statusMap[normalizePhraseKey(entry)]?.status ?? entry.status ?? "";
      if (filter.type === "all") return status !== PHRASE_STUDY_STATUS.FAMILIAR;
      return true;
    });
}

test("normalizePhraseStatusValue migrates legacy mojibake", () => {
  assert.equal(normalizePhraseStatusValue("鐔熸倝"), PHRASE_STUDY_STATUS.FAMILIAR);
  assert.equal(normalizePhraseStatusValue("涓嶇啛"), PHRASE_STUDY_STATUS.UNFAMILIAR);
});

test("migratePhraseStatusMap rewrites stored legacy statuses", () => {
  const migrated = migratePhraseStatusMap({
    "be due to": { status: "鐔熸倝", favorite: false }
  });
  assert.equal(migrated["be due to"].status, PHRASE_STUDY_STATUS.FAMILIAR);
});

test("resolvePhraseStudyIndex prefers phraseKey and does not fallback to first", () => {
  const result = resolvePhraseStudyIndex(phrases, {
    session: { phraseKey: normalizePhraseKey(phrases[2]), index: 0, filter: { type: "all", value: "" } },
    entryPositions: {},
    filter: { type: "all", value: "" },
    statusMap: {},
    buildStudyList
  });

  assert.equal(result.index, 2);
  assert.equal(result.reason, "phraseKey");
});

test("resolvePhraseStudyIndex returns notFound instead of jumping to first", () => {
  const result = resolvePhraseStudyIndex(phrases, {
    session: { phraseKey: "missing", index: 99, filter: { type: "all", value: "" } },
    entryPositions: {},
    filter: { type: "all", value: "" },
    statusMap: {},
    buildStudyList
  });

  assert.equal(result.restored, false);
  assert.equal(result.index, -1);
  assert.equal(result.reason, "notFound");
});