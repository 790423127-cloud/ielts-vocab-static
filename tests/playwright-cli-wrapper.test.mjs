import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildPlaywrightCliArguments,
  PINNED_PLAYWRIGHT_CLI_PACKAGE,
  resolveNpxLauncher,
  writePlaywrightCliConfig
} from "../scripts/playwright-cli.mjs";

test("Playwright CLI open always uses the pinned CLI and project Chromium config", () => {
  const configPath = path.join("output", "playwright", "cli", "playwright-cli.json");
  const args = buildPlaywrightCliArguments(
    ["-s=project-browser", "open", "http://127.0.0.1:3000", "--headed"],
    { configPath }
  );

  assert.deepEqual(args.slice(0, 4), [
    "--yes",
    "--package",
    PINNED_PLAYWRIGHT_CLI_PACKAGE,
    "playwright-cli"
  ]);
  assert.ok(args.includes("--browser=chromium"));
  assert.ok(args.includes(`--config=${configPath}`));
  assert.doesNotMatch(args.join(" "), /@playwright\/cli@latest/);
});

test("Playwright CLI follow-up commands preserve their session arguments", () => {
  const args = buildPlaywrightCliArguments(["-s=project-browser", "snapshot"]);
  assert.deepEqual(args.slice(-2), ["-s=project-browser", "snapshot"]);
  assert.equal(args.some((arg) => arg.startsWith("--config=")), false);
});

test("Playwright CLI project entry rejects system Chrome and custom config drift", () => {
  assert.throws(
    () => buildPlaywrightCliArguments(["open", "http://127.0.0.1:3000", "--browser=chrome"]),
    /只使用项目 Chromium/
  );
  assert.throws(
    () => buildPlaywrightCliArguments(["open", "http://127.0.0.1:3000", "--config=custom.json"]),
    /自动生成/
  );
});

test("generated Playwright CLI config points at the supplied executable", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ielts-playwright-cli-"));
  try {
    const executablePath = path.join(tempRoot, "chromium.exe");
    const configPath = path.join(tempRoot, "output", "playwright-cli.json");
    fs.writeFileSync(executablePath, "test executable", "utf8");

    writePlaywrightCliConfig(configPath, executablePath);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(config.browser.launchOptions.executablePath, executablePath);
  } finally {
    const resolvedTemp = path.resolve(tempRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    assert.ok(resolvedTemp.startsWith(`${resolvedSystemTemp}${path.sep}`));
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
});

test("Windows launches npx through its JavaScript entry instead of npx.cmd", () => {
  const launcher = resolveNpxLauncher();
  if (process.platform !== "win32") {
    assert.deepEqual(launcher, { command: "npx", argumentPrefix: [] });
    return;
  }
  assert.equal(launcher.command, process.execPath);
  assert.equal(path.basename(launcher.argumentPrefix[0]), "npx-cli.js");
  assert.equal(fs.existsSync(launcher.argumentPrefix[0]), true);
});
