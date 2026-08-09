import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("static cloud sync lets supported modules restore in place", async () => {
  const [sync, basic, ielts538, readingG, meaning, spelling] = await Promise.all([
    source("public/assets/static-cloud-sync.js"),
    source("public/assets/basic.js"),
    source("public/assets/ielts-538.js"),
    source("public/assets/reading-g.js"),
    source("public/assets/meaning-static.js"),
    source("public/assets/spelling.js")
  ]);

  assert.match(sync, /module\.onMerged\(\)/);
  assert.match(sync, /function register\(moduleId, keys, options\)/);
  assert.match(basic, /function applyMergedCloudProgress\(\)/);
  assert.match(basic, /onMerged: applyMergedCloudProgress/);
  assert.match(ielts538, /function applyMergedCloudProgress\(\)/);
  assert.match(ielts538, /onMerged: applyMergedCloudProgress/);
  assert.match(readingG, /function applyMergedCloudProgress\(\)/);
  assert.match(readingG, /onMerged: applyMergedCloudProgress/);
  assert.match(meaning, /function applyMergedCloudProgress\(\)/);
  assert.match(meaning, /onMerged: applyMergedCloudProgress/);
  assert.match(spelling, /function applyMergedCloudProgress\(\)/);
  assert.match(spelling, /onMerged: applyMergedCloudProgress/);
});
