import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const routes = [
  "app/api/categorize-words/route.js",
  "app/api/clean-words/route.js",
  "app/api/dedupe-words/route.js",
  "app/api/generate-word/route.js",
  "app/api/generate-words/route.js",
  "app/api/repair-word-symbol/route.js"
];
const sharedProfileRoutes = new Set([
  "app/api/generate-word/route.js",
  "app/api/generate-words/route.js"
]);

test("every DeepSeek route has the shared timeout contract", () => {
  for (const route of routes) {
    const source = fs.readFileSync(path.join(root, route), "utf8");
    if (sharedProfileRoutes.has(route)) {
      assert.match(source, /requestDeepseekProfiles/, route);
      assert.match(source, /timeoutMs: (?:60000|75000)/, route);
      continue;
    }
    assert.match(source, /const DEEPSEEK_TIMEOUT_MS = 45000/, route);
    assert.match(source, /signal: AbortSignal\.timeout\(DEEPSEEK_TIMEOUT_MS\)/, route);
    assert.match(source, /error: "DeepSeek API request timed out"/, route);
    assert.match(source, /\{ status: 504 \}/, route);
  }

  const sharedSource = fs.readFileSync(
    path.join(root, "app/lib/ai/deepseek-word-profile.server.mjs"),
    "utf8"
  );
  assert.match(sharedSource, /signal: AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(sharedSource, /DeepSeek API request timed out/);
  assert.match(sharedSource, /status: 504/);
});
