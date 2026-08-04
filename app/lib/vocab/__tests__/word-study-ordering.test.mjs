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
  remapWordStudyOrderSnapshotsAfterDeletion,
  reconcileWordStudyOrderSnapshot,
  updateWordStudyOrderSnapshotCursor,
  writeWordStudyOrderCursors,
  writeWordStudyOrderPreferences,
  wordStudyOrderSnapshotKey
} from "../word-study-ordering.mjs";
import {
  WORD_STUDY_DIFFICULTY_MODE,
  createWordInternalDifficultyProfile,
  wordInternalDifficultyScore,
  wordInternalDifficultySortKey,
  wordIntrinsicDifficultyScore
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

test("family order joins members that share a root outside the active entry", () => {
  const words = [
    { word: "continuity", familyRoot: "continu" },
    { word: "unrelated" },
    { word: "continuous", familyRoot: "continu" }
  ];
  const ordered = orderStudyWordIndices([0, 1, 2], words, {
    mode: WORD_STUDY_ORDER_MODE.FAMILY
  });
  const positions = [0, 2]
    .map((index) => ordered.indexOf(index))
    .sort((left, right) => left - right);

  assert.deepEqual(positions, [positions[0], positions[0] + 1]);
});

test("family order keeps standalone form relations next to their headword", () => {
  const words = [
    { word: "unrelated" },
    {
      word: "fit",
      forms: [
        { word: "fitted", relation: "merged-independent-entry" },
        { word: "fitting", relation: "merged-independent-entry" }
      ],
      mergedEntries: [{ key: "fitting", relationType: "form" }]
    },
    { word: "another" },
    { word: "fitting", forms: [{ word: "fittings", type: "plural" }] }
  ];
  const ordered = orderStudyWordIndices([0, 1, 2, 3], words, {
    mode: WORD_STUDY_ORDER_MODE.FAMILY
  });
  const fitPosition = ordered.indexOf(1);
  const fittingPosition = ordered.indexOf(3);

  assert.equal(Math.abs(fitPosition - fittingPosition), 1);
  assert.ok(fitPosition < fittingPosition);
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

test("association order keeps explicit links together when difficulty is also active", () => {
  const words = [
    { word: "alpha", synonyms: [{ word: "beta" }], studyDifficultyScore: 10 },
    { word: "unrelated", studyDifficultyScore: 50 },
    { word: "beta", studyDifficultyScore: 90 }
  ];
  const ordered = orderStudyWordIndices([0, 1, 2], words, {
    mode: WORD_STUDY_ORDER_MODE.ASSOCIATION,
    difficultyMode: WORD_STUDY_DIFFICULTY_MODE.EASY_TO_HARD
  });
  const positions = [0, 2]
    .map((index) => ordered.indexOf(index))
    .sort((left, right) => left - right);

  assert.deepEqual(positions, [positions[0], positions[0] + 1]);
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

test("easy-to-hard ignores formal labels when word-derived scores tie", () => {
  const words = [
    { word: "gamma", difficulty: "高级加分", studyDifficultyScore: 40 },
    { word: "alpha", difficulty: "基础高频", studyDifficultyScore: 40 },
    { word: "beta phrase", difficulty: "基础高频", studyDifficultyScore: 40 },
    { word: "delta", difficulty: "中级核心", studyDifficultyScore: 40 },
    { word: "epsilon", difficulty: "基础高频", studyDifficultyScore: 50 }
  ];
  const ordered = orderStudyWordIndices([0, 1, 2, 3, 4], words, {
    difficultyMode: WORD_STUDY_DIFFICULTY_MODE.EASY_TO_HARD
  }).map((index) => words[index].word);

  // Intrinsic word shape owns the high-order key. A compact single word stays
  // ahead of the longer phrase even when its serialized correction is higher.
  assert.deepEqual([...ordered.slice(0, 3)].sort(), ["alpha", "delta", "gamma"]);
  assert.equal(ordered[3], "epsilon");
  assert.equal(ordered[4], "beta phrase");

  const reverse = orderStudyWordIndices([0, 1, 2, 3, 4], words, {
    difficultyMode: WORD_STUDY_DIFFICULTY_MODE.HARD_TO_EASY
  }).map((index) => words[index].word);
  assert.equal(reverse[0], "beta phrase");
  assert.equal(reverse[1], "epsilon");

  const relabelled = words.map((word, index) => ({
    ...word,
    difficulty: ["低频认识即可", "高级加分", "中级核心", "基础高频"][index % 4]
  }));
  assert.deepEqual(
    orderStudyWordIndices([0, 1, 2, 3, 4], relabelled, {
      difficultyMode: WORD_STUDY_DIFFICULTY_MODE.EASY_TO_HARD
    }),
    orderStudyWordIndices([0, 1, 2, 3, 4], words, {
      difficultyMode: WORD_STUDY_DIFFICULTY_MODE.EASY_TO_HARD
    })
  );
});

test("serialized static scores cannot replace intrinsic word shape as the sort axis", () => {
  const words = [
    { word: "methodological", studyDifficultyScore: 1, difficulty: "基础高频" },
    { word: "cat", studyDifficultyScore: 99, difficulty: "低频认识即可" }
  ];
  const ordered = orderStudyWordIndices([0, 1], words, {
    difficultyMode: WORD_STUDY_DIFFICULTY_MODE.EASY_TO_HARD
  });

  assert.deepEqual(ordered, [1, 0]);
});

test("family order does not connect unrelated entries through a shared absent relation", () => {
  const words = [
    { word: "alpha", wordFamily: [{ word: "missing-bridge" }] },
    { word: "standalone" },
    { word: "omega", wordFamily: [{ word: "missing-bridge" }] }
  ];
  const ordered = orderStudyWordIndices([0, 1, 2], words, {
    mode: WORD_STUDY_ORDER_MODE.FAMILY
  });

  assert.deepEqual(ordered, [0, 1, 2]);
});

test("intrinsic spelling complexity puts visibly simpler words first", () => {
  assert.ok(wordIntrinsicDifficultyScore({ word: "cat" }) < wordIntrinsicDifficultyScore({ word: "catalogue" }));
  assert.ok(wordIntrinsicDifficultyScore({ word: "plane" }) < wordIntrinsicDifficultyScore({ word: "queue" }));
  assert.ok(wordIntrinsicDifficultyScore({ word: "mail" }) < wordIntrinsicDifficultyScore({ word: "surface mail" }));
  assert.ok(wordIntrinsicDifficultyScore({ word: "method" }) < wordIntrinsicDifficultyScore({ word: "methodological" }));
  assert.ok(wordInternalDifficultyScore({ word: "news" }) < wordInternalDifficultyScore({ word: "general" }));
  assert.ok(wordInternalDifficultySortKey({ word: "simple" }) < wordInternalDifficultySortKey({ word: "method" }));
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

test("relative tier filters stay inside the active entry and random shuffles within the band", () => {
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
  assert.equal(randomDefault.length, words.length);
  assert.deepEqual([...randomWithDifficulty].sort((a, b) => a - b), harderOnly);
  assert.notDeepEqual(randomWithDifficulty, harderOnly);
});

test("a precomputed difficulty profile produces the same relative tier queue", () => {
  const words = [10, 20, 30, 40, 50, 60, 70, 80, 90].map((score, index) => ({
    word: `cached-${index}`,
    studyDifficultyScore: score
  }));
  const indices = words.map((_, index) => index);
  const profile = createWordInternalDifficultyProfile(words);
  const expected = orderStudyWordIndices(indices, words, {
    difficultyMode: WORD_STUDY_DIFFICULTY_MODE.STANDARD_ONLY
  });
  const actual = orderStudyWordIndices(indices, words, {
    difficultyMode: WORD_STUDY_DIFFICULTY_MODE.STANDARD_ONLY,
    difficultyProfile: profile
  });

  assert.deepEqual(actual, expected);
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

test("fixed snapshots keep indices plus stable keys for deletion remaps", () => {
  const indices = WORDS.map((_, index) => index);
  const snapshot = createWordStudyOrderSnapshot(indices, WORDS);

  assert.equal(snapshot.version, 4);
  assert.deepEqual(snapshot.indices, indices);
  assert.equal(Array.isArray(snapshot.keys), true);
  assert.equal(snapshot.keys.length, indices.length);
  assert.ok(snapshot.keys.every((key) => String(key).startsWith("word:") || String(key).startsWith("id:")));
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

test("compact snapshots remap by stable keys when the physical pool changes", () => {
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

  // Prior order was beta, alpha; survivors keep that order, then append new.
  assert.deepEqual(reconciled.indices, [2, 1, 0]);
  assert.equal(reconciled.changed, true);
});

test("version 2 difficulty snapshots keep order via stable keys and upgrade to current version", () => {
  const legacySnapshot = {
    ...createWordStudyOrderSnapshot([2, 1, 0], WORDS, { cursorIndex: 1 }),
    version: 2
  };
  const reconciled = reconcileWordStudyOrderSnapshot(
    legacySnapshot,
    [0, 1, 2],
    WORDS,
    { fallbackOrder: [0, 1, 2] }
  );

  // Keys preserve the prior easy/hard sequence instead of regenerating.
  assert.deepEqual(reconciled.indices, [2, 1, 0]);
  assert.equal(reconciled.cursorIndex, 1);
  assert.equal(reconciled.snapshot.cursorKey, legacySnapshot.cursorKey);
  assert.equal(reconciled.snapshot.version, 4);
  assert.equal(reconciled.changed, true);
});

test("compact snapshots preserve their first order when words are appended", () => {
  const initialPool = [
    { id: "word-a", word: "alpha" },
    { id: "word-b", word: "beta" }
  ];
  const snapshot = createWordStudyOrderSnapshot([1, 0], initialPool);
  const appendedPool = [
    ...initialPool,
    { id: "word-c", word: "gamma" }
  ];
  const reconciled = reconcileWordStudyOrderSnapshot(
    snapshot,
    [0, 1, 2],
    appendedPool,
    { fallbackOrder: [0, 1, 2] }
  );

  assert.deepEqual(reconciled.indices, [1, 0, 2]);
  assert.equal(reconciled.changed, true);
});

test("deletion remaps every saved fixed order without regenerating its sequence", () => {
  const previousPool = [
    { id: "word-a", word: "alpha" },
    { id: "word-b", word: "beta" },
    { id: "word-c", word: "gamma" },
    { id: "word-d", word: "delta" }
  ];
  const snapshots = {
    "family|easy-to-hard": createWordStudyOrderSnapshot(
      [2, 1, 3, 0],
      previousPool,
      { cursorIndex: 1 }
    ),
    "association|hard-to-easy": createWordStudyOrderSnapshot(
      [3, 0, 2, 1],
      previousPool,
      { cursorIndex: 3 }
    )
  };
  const nextPool = [previousPool[0], previousPool[2], previousPool[3]];
  const remapped = remapWordStudyOrderSnapshotsAfterDeletion(
    snapshots,
    previousPool,
    nextPool
  );

  assert.deepEqual(remapped["family|easy-to-hard"].indices, [1, 2, 0]);
  assert.equal(remapped["family|easy-to-hard"].cursorKey, "id:word-c");
  assert.deepEqual(remapped["association|hard-to-easy"].indices, [2, 0, 1]);
  assert.equal(remapped["association|hard-to-easy"].cursorKey, "id:word-d");
});

test("legacy stable-id snapshots migrate without losing their previous order", () => {
  const shiftedPool = [
    { id: "word-new", word: "new" },
    { id: "word-a", word: "alpha" },
    { id: "word-b", word: "beta" }
  ];
  const legacySnapshot = {
    version: 1,
    keys: ["id:word-b", "id:word-a"],
    cursorKey: "id:word-b"
  };
  const reconciled = reconcileWordStudyOrderSnapshot(
    legacySnapshot,
    [0, 1, 2],
    shiftedPool,
    { fallbackOrder: [0, 1, 2] }
  );

  assert.deepEqual(reconciled.indices, [2, 1, 0]);
  assert.equal(reconciled.cursorIndex, 2);
  assert.equal(reconciled.snapshot.version, 4);
});
