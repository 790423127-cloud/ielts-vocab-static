import { existsSync, renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  findListeningPid,
  isThisProjectServer,
  startLocalProductionServer,
  stopLocalProductionServer
} from "./local-production-server.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localPort = 3000;
const activeBuildDirectory = path.join(projectRoot, ".next");
const stagedBuildDirectory = path.join(projectRoot, ".next-build-staging");
const previousBuildDirectory = path.join(projectRoot, ".next-previous");
const managedBuildDirectories = new Set([
  activeBuildDirectory,
  stagedBuildDirectory,
  previousBuildDirectory
]);

function assertManagedBuildDirectory(directoryPath) {
  const resolved = path.resolve(directoryPath);
  if (!managedBuildDirectories.has(resolved) || path.dirname(resolved) !== projectRoot) {
    throw new Error(`拒绝操作未受管理的构建目录：${resolved}`);
  }
  return resolved;
}

function removeManagedBuildDirectory(directoryPath) {
  const resolved = assertManagedBuildDirectory(directoryPath);
  rmSync(resolved, { recursive: true, force: true });
}

function runStagedNextBuild() {
  const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  return spawnSync(process.execPath, [nextBin, "build"], {
    cwd: projectRoot,
    env: { ...process.env, NEXT_DIST_DIR: ".next-build-staging" },
    stdio: "inherit",
    windowsHide: true
  }).status ?? 1;
}

function stagedBuildIsComplete() {
  return existsSync(path.join(stagedBuildDirectory, "BUILD_ID"));
}

function prepareBuildDirectories() {
  removeManagedBuildDirectory(stagedBuildDirectory);
  if (!existsSync(path.join(activeBuildDirectory, "BUILD_ID"))
      && existsSync(path.join(previousBuildDirectory, "BUILD_ID"))) {
    // A prior interrupted swap can leave an incomplete .next directory in
    // place.  Windows cannot rename the known-good fallback over that target.
    // This directory is only a generated build artifact and has no BUILD_ID,
    // so remove it before restoring the last complete build.
    removeManagedBuildDirectory(activeBuildDirectory);
    renameSync(previousBuildDirectory, activeBuildDirectory);
  }
  if (existsSync(path.join(activeBuildDirectory, "BUILD_ID"))) {
    removeManagedBuildDirectory(previousBuildDirectory);
  }
}

function swapInStagedBuild() {
  removeManagedBuildDirectory(previousBuildDirectory);
  if (existsSync(activeBuildDirectory)) {
    renameSync(activeBuildDirectory, previousBuildDirectory);
  }

  try {
    renameSync(stagedBuildDirectory, activeBuildDirectory);
  } catch (error) {
    if (existsSync(previousBuildDirectory) && !existsSync(activeBuildDirectory)) {
      renameSync(previousBuildDirectory, activeBuildDirectory);
    }
    throw error;
  }
}

function restorePreviousBuild() {
  if (!existsSync(previousBuildDirectory)) return false;
  removeManagedBuildDirectory(activeBuildDirectory);
  renameSync(previousBuildDirectory, activeBuildDirectory);
  return true;
}

async function restartWithRollback() {
  try {
    await startLocalProductionServer({ port: localPort });
  } catch (newBuildError) {
    await stopLocalProductionServer({ port: localPort }).catch(() => {});
    if (!restorePreviousBuild()) throw newBuildError;

    try {
      await startLocalProductionServer({ port: localPort });
    } catch (rollbackError) {
      throw new Error(
        `新构建启动失败，上一份构建也未能恢复。新构建错误：${newBuildError.message}；恢复错误：${rollbackError.message}`
      );
    }
    throw new Error(`新构建启动失败，已恢复上一份可用服务：${newBuildError.message}`);
  }
}

async function main() {
  prepareBuildDirectories();

  console.log("正在隔离目录中构建新版；当前 3000 服务会继续运行到构建成功。");
  const buildExitCode = runStagedNextBuild();
  if (buildExitCode !== 0 || !stagedBuildIsComplete()) {
    removeManagedBuildDirectory(stagedBuildDirectory);
    console.error("新版构建失败；当前 3000 服务和上一份构建均未改动。");
    process.exitCode = buildExitCode || 1;
    return;
  }

  const listeningPid = findListeningPid(localPort);
  const shouldRestart = Boolean(listeningPid && isThisProjectServer(listeningPid, localPort));
  if (listeningPid && !shouldRestart) {
    console.warn(`端口 ${localPort} 被其他程序占用，本次不会停止该程序。`);
  }

  if (shouldRestart) {
    console.log(`新版构建成功，正在切换本地词库服务（PID ${listeningPid}）。`);
    await stopLocalProductionServer({ port: localPort });
  }

  try {
    swapInStagedBuild();
  } catch (error) {
    if (shouldRestart) await startLocalProductionServer({ port: localPort }).catch(() => {});
    throw new Error(`新版构建完成，但切换构建目录失败：${error.message}`);
  }

  if (shouldRestart) {
    await restartWithRollback();
    console.log(`本地词库服务已切换到新版：http://127.0.0.1:${localPort}`);
  } else {
    console.log("新版生产构建已准备完成。");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
