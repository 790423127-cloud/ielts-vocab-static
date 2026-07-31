import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localPort = 3000;

function findListeningPid(port) {
  if (process.platform !== "win32") return null;
  const result = spawnSync("netstat.exe", ["-ano"], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) return null;

  for (const line of String(result.stdout || "").split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    const match = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
    if (match && Number(match[1]) === port) return Number(match[2]);
  }
  return null;
}

function readWindowsCommandLine(pid) {
  if (process.platform !== "win32" || !Number.isInteger(pid)) return "";
  const command = [
    `$targetPid=${pid}`,
    "$process=Get-CimInstance Win32_Process -Filter \"ProcessId=$targetPid\"",
    "if($process){[Console]::Out.Write($process.CommandLine)}"
  ].join(";");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    { cwd: projectRoot, encoding: "utf8", windowsHide: true }
  );
  return result.status === 0 ? String(result.stdout || "") : "";
}

function isThisProjectServer(pid) {
  const commandLine = readWindowsCommandLine(pid).toLocaleLowerCase("en-US");
  const root = projectRoot.toLocaleLowerCase("en-US");
  return commandLine.includes(root)
    && commandLine.includes("next")
    && commandLine.includes("start")
    && commandLine.includes(String(localPort));
}

function stopRunningServer(pid) {
  const result = spawnSync(
    "taskkill.exe",
    ["/PID", String(pid), "/T", "/F"],
    { cwd: projectRoot, stdio: "ignore", windowsHide: true }
  );
  if (result.status !== 0) {
    throw new Error(`无法停止占用 ${localPort} 端口的旧版词库服务（PID ${pid}）`);
  }
}

function runNextBuild() {
  const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  const result = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

async function waitForServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function restartServer() {
  const buildId = readFileSync(path.join(projectRoot, ".next", "BUILD_ID"), "utf8").trim();
  writeFileSync(path.join(projectRoot, ".next", ".running-build-id"), `${buildId}\n`, "utf8");

  const child = spawn(
    "cmd.exe",
    ["/d", "/s", "/c", "npm.cmd start"],
    {
      cwd: projectRoot,
      detached: true,
      env: process.env,
      stdio: "ignore",
      windowsHide: true
    }
  );
  child.unref();

  const ready = await waitForServer(`http://127.0.0.1:${localPort}/`);
  if (!ready) {
    throw new Error("新版已构建，但本地服务未能在 15 秒内恢复；请运行 start-windows.bat");
  }
  console.log(`本地词库服务已自动重启：http://127.0.0.1:${localPort}`);
}

const listeningPid = findListeningPid(localPort);
const shouldRestart = Boolean(listeningPid && isThisProjectServer(listeningPid));

if (shouldRestart) {
  console.log(`检测到正在运行的旧版词库服务（PID ${listeningPid}），先安全停止再构建。`);
  stopRunningServer(listeningPid);
} else if (listeningPid) {
  console.warn(`端口 ${localPort} 被其他程序占用，本次不会停止或重启该程序。`);
}

runNextBuild();

if (shouldRestart) {
  await restartServer();
}
