import assert from "node:assert/strict";
import test from "node:test";
import {
  WORD_STUDY_ORDER_MODE,
  orderStudyWordIndices,
  readWordStudyOrderPreferences,
  writeWordStudyOrderPreferences
} from "../word-study-ordering.mjs";

const WORDS = [
  { word: "create", wordFamily: [{ word: "creation" }, { word: "creative" }] },
  { word: "mail", meaning: "邮件" },
  { word: "salary", meaning: "工资" },
  { word: "creation", wordFamily: [{ word: "create" }] },
  { word: "surface mail", meaning: "平邮" },
  { word: "vacancy", meaning: "职位空缺", synonyms: [{ word: "opening" }] },
  { word: "creative", wordFamily: [{ word: "create" }] },
  { word: "airmail", meaning: "航空邮件" },
  { word: "opening", meaning: "空缺职位" }
];

test("current order is preserved without mutating the input", () => {
  const indices = WORDS.map((_, index) => index);
  const ordered = orderStudyWordIndices(indices, WORDS);
  assert.deepEqual(ordered, indices);
  assert.notEqual(ordered, indices);
});

test("random order is deterministic for the same round seed", () => {
  const indices = WORDS.map((_, index) => index);
  const first = orderStudyWordIndices(indices, WORDS, {
    mode: WORD_STUDY_ORDER_MODE.RANDOM,
    seed: 42
  });
  const second = orderStudyWordIndices(indices, WORDS, {
    mode: WORD_STUDY_ORDER_MODE.RANDOM,
    seed: 42
  });
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, indices);
});

test("family order keeps explicit family members together", () => {
  const ordered = orderStudyWordIndices(
    WORDS.map((_, index) => index),
    WORDS,
    { mode: WORD_STUDY_ORDER_MODE.FAMILY }
  );
  const positions = ["create", "creation", "creative"]
    .map((word) => ordered.indexOf(WORDS.findIndex((entry) => entry.word === word)))
    .sort((left, right) => left - right);
  assert.deepEqual(positions, [positions[0], positions[0] + 1, positions[0] + 2]);
});

test("association order joins expressions, synonyms and concrete scenes", () => {
  const ordered = orderStudyWordIndices(
    WORDS.map((_, index) => index),
    WORDS,
    { mode: WORD_STUDY_ORDER_MODE.ASSOCIATION }
  );
  const mailPositions = ["mail", "surface mail", "airmail"]
    .map((word) => ordered.indexOf(WORDS.findIndex((entry) => entry.word === word)))
    .sort((left, right) => left - right);
  const vacancyPositions = ["vacancy", "opening", "salary"]
    .map((word) => ordered.indexOf(WORDS.findIndex((entry) => entry.word === word)))
    .sort((left, right) => left - right);
  assert.deepEqual(mailPositions, [mailPositions[0], mailPositions[0] + 1, mailPositions[0] + 2]);
  assert.deepEqual(vacancyPositions, [vacancyPositions[0], vacancyPositions[0] + 1, vacancyPositions[0] + 2]);
});

test("order preferences use a separate entry for every learning range", () => {
  const storage = new Map();
  const preferences = {
    "difficulty:基础高频": { mode: "family", seed: 0 },
    "ielts:Reading": { mode: "association", seed: 0 }
  };
  assert.equal(
    writeWordStudyOrderPreferences(preferences, (key, value) => storage.set(key, value)),
    true
  );
  assert.deepEqual(
    readWordStudyOrderPreferences((key) => storage.get(key)),
    preferences
  );
});
