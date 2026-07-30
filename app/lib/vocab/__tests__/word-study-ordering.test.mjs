import assert from "node:assert/strict";
import test from "node:test";
import {
  WORD_STUDY_ORDER_MODE,
  createWordStudyOrderSnapshot,
  hasWordStudyInternalDifficulty,
  isFixedWordStudyOrderMode,
  orderStudyWordIndices,
  readWordStudyOrderCursors,
  readWordStudyOrderPreferences,
  reconcileWordStudyOrderSnapshot,
  updateWordStudyOrderSnapshotCursor,
  writeWordStudyOrderCursors,
  writeWordStudyOrderPreferences,
  wordStudyOrderSnapshotKey
} from "../word-study-ordering.mjs";
import {
  WORD_STUDY_DIFFICULTY_MODE
} from "../word-internal-difficulty.mjs";

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

test("difficulty order is relative inside one entry instead of sorting formal categories", () => {
  const words = [15, 25, 35, 45, 55, 65, 75].map((score, index) => ({
    word: `core-${index}`,
    difficulty: "中级核心",
    studyDifficultyScore: score
  }));
  const indices = words.map((_, index) => index);

  assert.deepEqual(
    orderStudyWordIndices(indices.reverse(), words, {
      difficultyMode: WORD_STUDY_DIFFICULTY_MODE.EASY_TO_HARD
    }),
    [0, 1, 2, 3, 4, 5, 6]
  );
  assert.deepEqual(
    orderStudyWordIndices(indices, words, {
      difficultyMode: WORD_STUDY_DIFFICULTY_MODE.HARD_TO_EASY
    }),
    [6, 5, 4, 3, 2, 1, 0]
  );
});

test("internal difficulty enables within one formal category and uses a separate fixed dimension", () => {
  assert.equal(
    hasWordStudyInternalDifficulty(
      [0, 1, 2, 3, 4, 5],
      [10, 20, 30, 40, 50, 60].map((score, index) => ({
        word: `basic-${index}`,
        difficulty: "基础高频",
        studyDifficultyScore: score
      }))
    ),
    true
  );
  assert.equal(
    hasWordStudyInternalDifficulty(
      [0, 1],
      [
        { word: "one", studyDifficultyScore: 10 },
        { word: "two", studyDifficultyScore: 90 }
      ]
    ),
    false
  );
  assert.equal(
    isFixedWordStudyOrderMode(
      WORD_STUDY_ORDER_MODE.CURRENT,
      WORD_STUDY_DIFFICULTY_MODE.EASY_TO_HARD
    ),
    true
  );
  assert.equal(
    wordStudyOrderSnapshotKey(
      WORD_STUDY_ORDER_MODE.FAMILY,
      WORD_STUDY_DIFFICULTY_MODE.HARDER_ONLY
    ),
    "family|harder-only"
  );
});

test("relative tier filters stay inside the active entry and random ignores difficulty", () => {
  const words = [10, 20, 30, 40, 50, 60, 70, 80, 90].map((score, index) => ({
    word: `entry-${index}`,
    difficulty: "基础高频",
    studyDifficultyScore: score
  }));
  const indices = words.map((_, index) => index);
  const harderOnly = orderStudyWordIndices(indices, words, {
    difficultyMode: WORD_STUDY_DIFFICULTY_MODE.HARDER_ONLY
  });
  assert.deepEqual(harderOnly, [5, 6, 7, 8]);

  const randomDefault = orderStudyWordIndices(indices, words, {
    mode: WORD_STUDY_ORDER_MODE.RANDOM,
    seed: 42
  });
  const randomWithDifficulty = orderStudyWordIndices(indices, words, {
    mode: WORD_STUDY_ORDER_MODE.RANDOM,
    difficultyMode: WORD_STUDY_DIFFICULTY_MODE.HARDER_ONLY,
    seed: 42
  });
  assert.deepEqual(randomWithDifficulty, randomDefault);
  assert.equal(randomWithDifficulty.length, words.length);
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

test("cursor storage stays separate from the large fixed order snapshot", () => {
  const storage = new Map();
  const cursors = {
    "difficulty:基础高频": {
      family: "word:create",
      association: "word:vacancy"
    }
  };

  assert.equal(
    writeWordStudyOrderCursors(cursors, (key, value) => storage.set(key, value)),
    true
  );
  assert.deepEqual(
    readWordStudyOrderCursors((key) => storage.get(key)),
    cursors
  );
});

test("fixed family and association snapshots keep their first generated order", () => {
  const initialOrder = [5, 8, 2, 0, 1];
  const snapshot = createWordStudyOrderSnapshot(initialOrder, WORDS, {
    cursorIndex: initialOrder[0]
  });
  const freshButDifferentOrder = [0, 1, 2, 5, 8];
  const reconciled = reconcileWordStudyOrderSnapshot(
    snapshot,
    freshButDifferentOrder,
    WORDS,
    { fallbackOrder: freshButDifferentOrder }
  );

  assert.deepEqual(reconciled.indices, initialOrder);
  assert.equal(reconciled.cursorIndex, initialOrder[0]);
  assert.equal(reconciled.changed, false);
});

test("fixed snapshots resume their cursor and append newly eligible words", () => {
  const initialOrder = [5, 8, 2];
  const initial = createWordStudyOrderSnapshot(initialOrder, WORDS, {
    cursorIndex: 5
  });
  const moved = updateWordStudyOrderSnapshotCursor(initial, WORDS[8], 8);
  const reconciled = reconcileWordStudyOrderSnapshot(
    moved,
    [8, 2, 0],
    WORDS,
    { fallbackOrder: [0, 2, 8] }
  );

  assert.deepEqual(reconciled.indices, [8, 2, 0]);
  assert.equal(reconciled.cursorIndex, 8);
  assert.equal(reconciled.snapshot.cursorKey, "word:opening");
});

test("stable ids preserve a fixed order when physical indices move", () => {
  const initialPool = [
    { id: "word-a", word: "alpha" },
    { id: "word-b", word: "beta" }
  ];
  const snapshot = createWordStudyOrderSnapshot([1, 0], initialPool);
  const shiftedPool = [
    { id: "word-new", word: "new" },
    { id: "word-a", word: "alpha" },
    { id: "word-b", word: "beta" }
  ];
  const reconciled = reconcileWordStudyOrderSnapshot(
    snapshot,
    [0, 1, 2],
    shiftedPool,
    { fallbackOrder: [0, 1, 2] }
  );

  assert.deepEqual(reconciled.indices, [2, 1, 0]);
});
