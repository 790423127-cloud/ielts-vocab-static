/**
 * Cross-platform wide unit test runner.
 * Usage: node scripts/run-wide-tests.mjs
 */
import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIB_ROOT = path.join(ROOT, "app", "lib");

function collectTests(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectTests(full, out);
      continue;
    }
    if (name.endsWith(".test.mjs") || name.endsWith(".test.js") || name.endsWith(".test.cjs")) {
      out.push(full);
    }
  }
  return out;
}

const files = collectTests(LIB_ROOT).sort();
if (!files.length) {
  console.error("No test files found under app/lib");
  process.exit(1);
}

console.log(`Running ${files.length} test files...`);
const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env
});

process.exit(result.status ?? 1);
