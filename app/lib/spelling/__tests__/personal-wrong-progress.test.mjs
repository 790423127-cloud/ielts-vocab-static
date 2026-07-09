import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPersonalWrongBookCandidates,
  mergePersonalWrongBookRecords,
  parsePersonalWrongBookInput
} from "../personal-wrong-book.mjs";
import {
  computePersonalWrongBatchProgress,
  extractPersonalWrongWordUnits,
  resolvePersonalWrongUnitProgress,
  selectNextPersonalWrongWrite
} from "../personal-wrong-progress.mjs";
import { REPAIR_STATES } from "../repair-progress.mjs";

test("resolvePersonalWrongUnitProgress reports base and plural sub-progress", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("vacancy"));
  const candidates = buildPersonalWrongBookCandidates(records, [], { scope: "word" });
  const [unit] = extractPersonalWrongWordUnits(candidates);
  const progressRecords = {};

  for (const write of unit.writes.slice(0, 2)) {
    progressRecords[write.wordId] = {
      today: { repairState: REPAIR_STATES.MASTERED, completedToday: true }
    };
  }

  const progress = resolvePersonalWrongUnitProgress(unit, progressRecords, unit.writes[2].wordId);
  assert.equal(progress.masteredWrites, 2);
  assert.equal(progress.baseMastered, 2);
  assert.equal(progress.pluralMastered, 0);
  assert.match(progress.label, /本词 2\/4/);
  assert.match(progress.label, /原形 2\/2/);
  assert.match(progress.label, /复数 0\/2/);
});

test("computePersonalWrongBatchProgress keeps main progress at zero until first word is fully mastered", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("vacancy"));
  const candidates = buildPersonalWrongBookCandidates(records, [], { scope: "word" });
  const wordUnits = extractPersonalWrongWordUnits(candidates);
  const progressRecords = {};

  for (const write of wordUnits[0].writes.slice(0, 3)) {
    progressRecords[write.wordId] = {
      today: { repairState: REPAIR_STATES.MASTERED, completedToday: true }
    };
  }

  const progress = computePersonalWrongBatchProgress(
    progressRecords,
    wordUnits,
    wordUnits[0].writes[3].wordId
  );

  assert.equal(progress.completedCount, 0);
  assert.equal(progress.sessionTotal, 1);
  assert.equal(progress.currentNumber, 1);
});
