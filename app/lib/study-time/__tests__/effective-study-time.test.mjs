import assert from "node:assert/strict";
import test from "node:test";

import {
  EFFECTIVE_STUDY_TIME_STORAGE_KEY,
  addEffectiveStudyDuration,
  addEffectiveStudyInterval,
  calculateEffectiveStudyStreak,
  formatEffectiveStudyTime,
  getEffectiveStudyModule,
  getEffectiveStudyIntensity,
  getEffectiveStudyModuleMs,
  migrateLegacySpellingActiveTime,
  readEffectiveStudyHistory,
  resolveEffectiveStudyModule,
  toEffectiveStudyDayKey
} from "../effective-study-time.mjs";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    dump(key) {
      return values.get(key);
    }
  };
}

test("routes resolve to independent current learning modules", () => {
  assert.equal(resolveEffectiveStudyModule("/")?.key, "main");
  assert.equal(getEffectiveStudyModule("main-phrases")?.label, "主词库词组刷词");
  assert.equal(getEffectiveStudyModule("main-paraphrases")?.label, "听力阅读同义替换");
  assert.equal(resolveEffectiveStudyModule("/reading-g")?.label, "G 类阅读提升");
  assert.equal(resolveEffectiveStudyModule("/spelling-words")?.key, "spelling-words");
  assert.equal(resolveEffectiveStudyModule("/spelling-phrases")?.key, "spelling-phrases");
  assert.equal(resolveEffectiveStudyModule("/unknown"), null);
});

test("daily durations stay separated by module and date", () => {
  const storage = createMemoryStorage();
  const dayOne = new Date(2026, 7, 13, 12).getTime();
  const dayTwo = new Date(2026, 7, 14, 12).getTime();
  addEffectiveStudyDuration("main", 60_000, { storage, now: dayOne });
  addEffectiveStudyDuration("reading-g", 30_000, { storage, now: dayOne });
  addEffectiveStudyDuration("main", 120_000, { storage, now: dayTwo });

  const history = readEffectiveStudyHistory(storage);
  assert.equal(getEffectiveStudyModuleMs(history, "main", toEffectiveStudyDayKey(dayOne)), 60_000);
  assert.equal(getEffectiveStudyModuleMs(history, "reading-g", toEffectiveStudyDayKey(dayOne)), 30_000);
  assert.equal(getEffectiveStudyModuleMs(history, "main", toEffectiveStudyDayKey(dayTwo)), 120_000);
  assert.equal(getEffectiveStudyModuleMs(history, "reading-g", toEffectiveStudyDayKey(dayTwo)), 0);
});

test("an interval crossing local midnight is split into the correct days", () => {
  const storage = createMemoryStorage();
  const startedAt = new Date(2026, 7, 13, 23, 59, 59, 500).getTime();
  const endedAt = new Date(2026, 7, 14, 0, 0, 0, 500).getTime();
  addEffectiveStudyInterval("basic", startedAt, endedAt, { storage });

  const history = readEffectiveStudyHistory(storage);
  assert.equal(getEffectiveStudyModuleMs(history, "basic", "2026-08-13"), 500);
  assert.equal(getEffectiveStudyModuleMs(history, "basic", "2026-08-14"), 500);
});

test("legacy spelling active time imports once into separate spelling modules", () => {
  const now = new Date(2026, 7, 14, 10).getTime();
  const storage = createMemoryStorage({
    "ielts-vocab:spelling-daily-stats:word": JSON.stringify({ date: "2026-08-14", activeMs: 65_000 }),
    "ielts-vocab:spelling-daily-stats:phrase": JSON.stringify({ date: "2026-08-14", activeMs: 25_000 })
  });
  migrateLegacySpellingActiveTime(storage, now);
  migrateLegacySpellingActiveTime(storage, now);

  const history = readEffectiveStudyHistory(storage);
  assert.equal(getEffectiveStudyModuleMs(history, "spelling-words", "2026-08-14"), 65_000);
  assert.equal(getEffectiveStudyModuleMs(history, "spelling-phrases", "2026-08-14"), 25_000);
  assert.ok(storage.dump(EFFECTIVE_STUDY_TIME_STORAGE_KEY));
});

test("display helpers format time, intensity and module streak", () => {
  const storage = createMemoryStorage();
  const now = new Date(2026, 7, 14, 12).getTime();
  addEffectiveStudyDuration("main", 70 * 60_000, { storage, now });
  addEffectiveStudyDuration("main", 12 * 60_000, { storage, now: new Date(2026, 7, 13, 12).getTime() });
  const history = readEffectiveStudyHistory(storage);

  assert.equal(formatEffectiveStudyTime(0), "0 分钟");
  assert.equal(formatEffectiveStudyTime(5_000), "5 秒");
  assert.equal(formatEffectiveStudyTime(70 * 60_000), "1 小时 10 分");
  assert.equal(formatEffectiveStudyTime(70 * 60_000, { compact: true }), "1时10分");
  assert.equal(getEffectiveStudyIntensity(0), 0);
  assert.equal(getEffectiveStudyIntensity(9 * 60_000), 1);
  assert.equal(getEffectiveStudyIntensity(70 * 60_000), 4);
  assert.equal(calculateEffectiveStudyStreak(history, "main", now), 2);
  assert.equal(calculateEffectiveStudyStreak(history, "reading-g", now), 0);
});
