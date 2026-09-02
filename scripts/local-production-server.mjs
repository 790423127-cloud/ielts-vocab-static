import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const outputDirectory = path.join(projectRoot, "outputs");
const defaultPort = 3000;
const restartDelaysMs = [1_000, 3_000, 10_000];
const maxLogBytes = 10 * 1024 * 1024;

function normalizeCommandLine(value) {
  return String(value || "").toLocaleLowerCase("en-US");
}

function pathsForPort(port) {
  const suffix = port === defaultPort ? "" : `-${port}`;
  return {
    pid: path.join(outputDirectory, `ielts538-server${suffix}.pid.json`),
    stdout: path.join(outputDirectory, `ielts538-server${suffix}.stdout.log`),
    stderr: path.join(outputDirectory, `ielts538-server${suffix}.stderr.log`)
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function findListeningPid(port) {
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

export function readWindowsCommandLine(pid) {
  if (process.platform !== "win32" || !Number.isInteger(pid)) return "";
  const command = [
    `$targetPid=${pid}`,
    "$target=Get-CimInstance Win32_Process -Filter \"ProcessId=$targetPid\"",
    "if($target){[Console]::Out.Write($target.CommandLine)}"
  ].join(";");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    { cwd: projectRoot, encoding: "utf8", windowsHide: true }
  );
  return result.status === 0 ? String(result.stdout || "") : "";
}

export function isThisProjectServer(pid, port = defaultPort) {
  const commandLine = normalizeCommandLine(readWindowsCommandLine(pid));
  const root = normalizeCommandLine(projectRoot);
  return commandLine.includes(root)
    && commandLine.includes("next")
    && commandLine.includes("start")
    && commandLine.includes(String(port));
}

export function isThisProjectSupervisor(pid, port = defaultPort) {
  const commandLine = normalizeCommandLine(readWindowsCommandLine(pid));
  const expectedScript = normalizeCommandLine(scriptPath);
  return commandLine.includes(expectedScript)
    && commandLine.includes("--supervise")
    && commandLine.includes(String(port));
}

function readPidState(port) {
  const statePath = pathsForPort(port).pid;
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

function removePidState(port) {
  const statePath = pathsForPort(port).pid;
  try {
    unlinkSync(statePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function killProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      cwd: projectRoot,
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function waitForPortToClose(port, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!findListeningPid(port)) return true;
    await sleep(200);
  }
  return false;
}

export async function waitForServer(port, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { cache: "no-store" });
      if (response.ok) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

export async function stopLocalProductionServer({ port = defaultPort } = {}) {
  const state = readPidState(port);
  const supervisorPid = Number(state?.supervisorPid);
  if (Number.isInteger(supervisorPid) && isThisProjectSupervisor(supervisorPid, port)) {
    killProcessTree(supervisorPid);
  }

  const listenerPid = findListeningPid(port);
  if (listenerPid) {
    if (!isThisProjectServer(listenerPid, port)) {
      throw new Error(`端口 ${port} 被其他程序占用，本次不会结束该程序（PID ${listenerPid}）`);
    }
    killProcessTree(listenerPid);
  }

  removePidState(port);
  if (!(await waitForPortToClose(port))) {
    throw new Error(`本地词库服务未能在 10 秒内释放端口 ${port}`);
  }
}

function rotateLog(logPath) {
  if (!existsSync(logPath) || statSync(logPath).size < maxLogBytes) return;
  const previousPath = `${logPath}.previous`;
  rmSync(previousPath, { force: true });
  renameSync(logPath, previousPath);
}

function openSupervisorLogs(port) {
  mkdirSync(outputDirectory, { recursive: true });
  const paths = pathsForPort(port);
  rotateLog(paths.stdout);
  rotateLog(paths.stderr);
  const banner = `\n[${new Date().toISOString()}] Starting local production supervisor on port ${port}.\n`;
  writeFileSync(paths.stdout, banner, { flag: "a" });
  return {
    paths,
    stdoutFd: openSync(paths.stdout, "a"),
    stderrFd: openSync(paths.stderr, "a")
  };
}

export async function startLocalProductionServer({ port = defaultPort } = {}) {
  const buildIdPath = path.join(projectRoot, ".next", "BUILD_ID");
  if (!existsSync(buildIdPath)) {
    throw new Error("没有可用的生产构建，请先运行 npm run build");
  }

  const listenerPid = findListeningPid(port);
  if (listenerPid) {
    if (!isThisProjectServer(listenerPid, port)) {
      throw new Error(`端口 ${port} 被其他程序占用（PID ${listenerPid}）`);
    }
    const state = readPidState(port);
    const supervisorPid = Number(state?.supervisorPid);
    const alreadySupervised = Number(state?.serverPid) === listenerPid
      && Number.isInteger(supervisorPid)
      && isThisProjectSupervisor(supervisorPid, port);
    if (alreadySupervised && await waitForServer(port, 3_000)) return;

    console.log(`正在把端口 ${port} 上的旧服务迁移到后台管理进程。`);
    await stopLocalProductionServer({ port });
  }

  const { paths, stdoutFd, stderrFd } = openSupervisorLogs(port);
  const supervisor = spawn(
    process.execPath,
    [scriptPath, "--supervise", "--port", String(port)],
    {
      cwd: projectRoot,
      detached: true,
      env: process.env,
      stdio: ["ignore", stdoutFd, stderrFd],
      windowsHide: true
    }
  );
  supervisor.unref();
  closeSync(stdoutFd);
  closeSync(stderrFd);

  if (!(await waitForServer(port))) {
    await stopLocalProductionServer({ port });
    throw new Error(
      `本地词库服务未能在 20 秒内启动，请查看 ${path.relative(projectRoot, paths.stderr)}`
    );
  }

  const buildId = readFileSync(buildIdPath, "utf8").trim();
  writeFileSync(path.join(projectRoot, ".next", ".running-build-id"), `${buildId}\n`, "utf8");
}

async function supervise(port) {
  mkdirSync(outputDirectory, { recursive: true });
  const statePath = pathsForPort(port).pid;
  const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  let lastExitCode = 1;

  for (let attempt = 0; attempt <= restartDelaysMs.length; attempt += 1) {
    const server = spawn(
      process.execPath,
      [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)],
      {
        cwd: projectRoot,
        env: process.env,
        stdio: "inherit",
        windowsHide: true
      }
    );

    writeFileSync(
      statePath,
      `${JSON.stringify({ supervisorPid: process.pid, serverPid: server.pid, port, startedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8"
    );

    lastExitCode = await new Promise((resolve) => {
      server.once("error", (error) => {
        console.error(`[supervisor] Unable to start Next.js: ${error.message}`);
        resolve(1);
      });
      server.once("exit", (code) => resolve(code ?? 1));
    });

    if (attempt >= restartDelaysMs.length) break;
    const delayMs = restartDelaysMs[attempt];
    console.error(
      `[supervisor] Next.js stopped with exit code ${lastExitCode}; restarting in ${delayMs} ms (${attempt + 1}/${restartDelaysMs.length}).`
    );
    await sleep(delayMs);
  }

  const state = readPidState(port);
  if (Number(state?.supervisorPid) === process.pid) removePidState(port);
  console.error(`[supervisor] Next.js could not stay running after ${restartDelaysMs.length} retries.`);
  process.exit(lastExitCode || 1);
}

function readPortArgument(argv) {
  const index = argv.indexOf("--port");
  if (index < 0) return defaultPort;
  const port = Number.parseInt(argv[index + 1], 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("--port 必须是 1 到 65535 之间的整数");
  }
  return port;
}

async function main() {
  const port = readPortArgument(process.argv.slice(2));
  if (process.argv.includes("--supervise")) {
    await supervise(port);
    return;
  }
  if (process.argv.includes("--stop")) {
    await stopLocalProductionServer({ port });
    console.log(`本地词库服务已停止：端口 ${port}`);
    return;
  }
  if (!process.argv.includes("--start")) {
    throw new Error("请使用 --start、--stop 或 --supervise");
  }
  await startLocalProductionServer({ port });
  console.log(`本地词库服务已在后台启动：http://127.0.0.1:${port}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
