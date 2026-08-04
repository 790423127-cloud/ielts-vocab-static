import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const launcherPath = process.argv[2];

if (!launcherPath) {
  console.error("The Windows launcher path was not provided.");
  process.exit(1);
}

const projectDirectory = path.dirname(path.resolve(launcherPath));
const launcherFileName = path.basename(launcherPath);
const pipeName = "\\\\.\\pipe\\ielts-vocab-deepseek-edge-tts-start";
const lockServer = net.createServer();

const lockAcquired = await new Promise((resolve, reject) => {
  lockServer.once("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      resolve(false);
      return;
    }

    reject(error);
  });

  lockServer.listen(pipeName, () => resolve(true));
});

if (!lockAcquired) {
  process.exit(0);
}

const commandShell = process.env.ComSpec || "cmd.exe";
const launcher = spawn(
  commandShell,
  ["/d", "/c", launcherFileName, "--single-instance-active"],
  {
    cwd: projectDirectory,
    stdio: "inherit",
    windowsHide: false,
  },
);

const exitCode = await new Promise((resolve) => {
  launcher.once("error", (error) => {
    console.error(`Unable to start the Windows launcher: ${error.message}`);
    resolve(1);
  });
  launcher.once("exit", (code) => resolve(code ?? 1));
});

await new Promise((resolve) => lockServer.close(resolve));
process.exit(exitCode);
