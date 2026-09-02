import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLexiconRetirementPayload,
  buildLexiconDeletionIntent,
  formalLexiconWords,
  rebaseConfirmedCurrentWordDeletion,
  validateLexiconDeletionIntent
} from "../lexicon-delete-intent.mjs";

const official = [
  { id: "word-a", wordId: "word-a", word: "alpha" },
  { id: "word-b", wordId: "word-b", word: "beta" }
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("reading additions enter formal publish while wrong-book supplements stay browser-only", () => {
  const words = [
    ...official,
    { id: "reading-x", word: "xylophone", source: "personal-reading", addedFromReadingWords: true },
    { id: "wrong-y", word: "yonder", source: "personal_wrong_book", addedFromPersonalWrongBook: true }
  ];
  assert.deepEqual(formalLexiconWords(words).map((entry) => entry.id), ["word-a", "word-b", "reading-x"]);
});

test("formal deletion requires an exact confirmed stable-id list", () => {
  const next = [official[1]];
  assert.equal(validateLexiconDeletionIntent(official, next, null).ok, false);

  const intent = buildLexiconDeletionIntent(official, next, {
    action: "delete-current-word",
    confirmed: true
  });
  assert.deepEqual(intent.removed, [{ id: "word-a", word: "alpha" }]);
  assert.equal(validateLexiconDeletionIntent(official, next, intent).ok, true);

  const wrongIntent = {
    ...intent,
    removed: [{ id: "word-b", word: "beta" }]
  };
  assert.equal(validateLexiconDeletionIntent(official, next, wrongIntent).ok, false);
});

test("removing a reading addition requires formal deletion intent after it joins the main lexicon", () => {
  const supplement = {
    id: "reading-x",
    word: "xylophone",
    source: "personal-reading",
    addedFromReadingWords: true
  };
  assert.equal(validateLexiconDeletionIntent([...official, supplement], official, null).ok, false);
  assert.deepEqual(
    buildLexiconDeletionIntent([...official, supplement], official, {
      action: "delete-current-word",
      confirmed: true
    }).removed,
    [{ id: "reading-x", word: "xylophone" }]
  );
});

test("confirmed formal deletions are persisted as deduplicated retirement entries", () => {
  const current = {
    version: "v-old",
    generatedAt: "2026-07-28T00:00:00.000Z",
    count: 1,
    entries: [{ id: "word-old", word: "old", reason: "user-curated-removal" }]
  };
  const payload = buildLexiconRetirementPayload(
    current,
    [
      { id: "word-a", word: "alpha" },
      { id: "word-a", word: "alpha" },
      { id: "word-old-copy", word: "OLD" }
    ],
    {
      version: "v-new",
      savedAt: "2026-07-29T00:00:00.000Z"
    }
  );

  assert.equal(payload.version, "v-new");
  assert.equal(payload.generatedAt, "2026-07-29T00:00:00.000Z");
  assert.equal(payload.count, 2);
  assert.deepEqual(payload.entries.map((entry) => entry.word), ["old", "alpha"]);
});

test("quick delete keeps the native confirmation and the server writes a persistent backup", () => {
  const quickDelete = fs.readFileSync(
    path.join(root, "app/components/QuickDeleteCurrentWordButton.jsx"),
    "utf8"
  );
  const exportRoute = fs.readFileSync(
    path.join(root, "app/api/export-cache/route.js"),
    "utf8"
  );
  assert.doesNotMatch(quickDelete, /window\.confirm\s*=/);
  assert.match(exportRoute, /validateLexiconDeletionIntent/);
  assert.match(exportRoute, /words\.before-delete-/);
  assert.match(exportRoute, /deletionBackup/);
  assert.match(exportRoute, /buildLexiconRetirementPayload/);
  assert.match(exportRoute, /retirementFile/);
});

test("stale direct deletion rebases only the confirmed stable IDs on the current lexicon", () => {
  const current = [
    { id: "a", word: "alpha" },
    { id: "b", word: "beta" },
    { id: "c", word: "gamma" }
  ];
  const result = rebaseConfirmedCurrentWordDeletion(current, {
    action: "delete-current-word",
    confirmed: true,
    expectedBeforeCount: 2,
    expectedAfterCount: 1,
    removed: [{ id: "b", word: "beta" }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.rebased, true);
  assert.deepEqual(result.words.map((entry) => entry.id), ["a", "c"]);
  assert.deepEqual(result.removed, [{ id: "b", word: "beta" }]);
});

test("stale direct deletion refuses an ID that is no longer in the current lexicon", () => {
  const result = rebaseConfirmedCurrentWordDeletion(
    [{ id: "a", word: "alpha" }],
    {
      action: "delete-current-word",
      confirmed: true,
      expectedBeforeCount: 2,
      expectedAfterCount: 1,
      removed: [{ id: "b", word: "beta" }]
    }
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /目标已变化/);
});
