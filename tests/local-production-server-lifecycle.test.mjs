import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Windows launcher detaches the production server from its console", () => {
  const launcher = read("start-windows.bat");
  const serverManager = read("scripts/local-production-server.mjs");

  assert.match(launcher, /local-production-server\.mjs" --start/);
  assert.doesNotMatch(launcher, /call npm\.cmd start/);
  assert.doesNotMatch(launcher, /taskkill \/PID/);
  assert.match(serverManager, /detached: true/);
  assert.match(serverManager, /ielts538-server\$\{suffix\}\.stderr\.log/);
  assert.match(serverManager, /const restartDelaysMs = \[1_000, 3_000, 10_000\]/);
});

test("production build completes in staging before the running server is stopped", () => {
  const buildScript = read("scripts/build-with-running-server-restart.mjs");
  const buildIndex = buildScript.indexOf("const buildExitCode = runStagedNextBuild()");
  const stopIndex = buildScript.indexOf("await stopLocalProductionServer", buildIndex);

  assert.ok(buildIndex >= 0);
  assert.ok(stopIndex > buildIndex);
  assert.match(buildScript, /NEXT_DIST_DIR: "\.next-build-staging"/);
  assert.match(buildScript, /if \(buildExitCode !== 0 \|\| !stagedBuildIsComplete\(\)\)/);
  assert.match(buildScript, /restorePreviousBuild\(\)/);
  assert.match(buildScript, /已恢复上一份可用服务/);
  assert.match(
    buildScript,
    /!existsSync\(path\.join\(activeBuildDirectory, "BUILD_ID"\)\)[\s\S]*?removeManagedBuildDirectory\(activeBuildDirectory\);[\s\S]*?renameSync\(previousBuildDirectory, activeBuildDirectory\)/
  );
});

test("manual restart entry uses the same background server manager", () => {
  const restartScript = read("restart-vocab-service.ps1");
  const setupScript = read("setup-windows-fixed.bat");

  assert.match(restartScript, /local-production-server\.mjs", "--start"/);
  assert.doesNotMatch(restartScript, /taskkill \/PID/);
  assert.doesNotMatch(restartScript, /Start-Process[\s\S]*npm\.cmd start/);
  assert.match(restartScript, /previous successful build was preserved/);
  assert.match(setupScript, /local-production-server\.mjs" --stop/);
});
