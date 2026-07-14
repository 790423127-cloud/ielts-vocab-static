import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PARA_SESSION_SIZE } from "../paraphrase-cycle.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("Next page no longer hard-caps quiz at Math.min(80)", () => {
  const page = fs.readFileSync(path.join(root, "app/reading-g/page.jsx"), "utf8");
  assert.doesNotMatch(page, /Math\.min\(\s*80\s*,/);
  assert.match(page, /takeNextParaphraseSession|PARA_SESSION_SIZE/);
  assert.match(page, /安全题库/);
});

test("static js uses 10/20/80 session sizes not hard 60", () => {
  const js = fs.readFileSync(path.join(root, "public/assets/reading-g.js"), "utf8");
  assert.doesNotMatch(js, /quizQueue\.length\s*<\s*60/);
  assert.match(js, /SESSION_SIZES/);
  assert.match(js, /guided:\s*10/);
  assert.match(js, /quick:\s*20/);
  assert.match(js, /full:\s*80/);
  assert.match(js, /ielts_reading_g_para_coverage_v1/);
});

test("session size constants shared concept", () => {
  assert.deepEqual(PARA_SESSION_SIZE, { guided: 10, quick: 20, full: 80 });
});
