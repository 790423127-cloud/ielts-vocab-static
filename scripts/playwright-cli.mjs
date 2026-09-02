import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

export const PINNED_PLAYWRIGHT_CLI_PACKAGE = "@playwright/cli@0.1.18";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const generatedConfigPath = path.join(
  projectRoot,
  "output",
  "playwright",
  "cli",
  "playwright-cli.json"
);

function readOption(args, optionName) {
  const inlinePrefix = `${optionName}=`;
  const inline = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = args.indexOf(optionName);
  if (index < 0) return null;
  return args[index + 1] || "";
}

export function resolveProjectChromiumExecutable() {
  const executablePath = chromium.executablePath();
  if (!existsSync(executablePath)) {
    throw new Error(
      `项目 Playwright 对应的 Chromium 尚未安装：${executablePath}\n` +
      "请先在项目目录运行：npx playwright install chromium"
    );
  }
  return executablePath;
}

export function writePlaywrightCliConfig(configPath, executablePath) {
  if (!existsSync(executablePath)) {
    throw new Error(`不能生成 Playwright CLI 配置，浏览器文件不存在：${executablePath}`);
  }
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    `${JSON.stringify({
      browser: {
        launchOptions: { executablePath }
      }
    }, null, 2)}\n`,
    "utf8"
  );
  return configPath;
}

export function buildPlaywrightCliArguments(userArgs, {
  configPath = generatedConfigPath,
  packageSpecifier = PINNED_PLAYWRIGHT_CLI_PACKAGE
} = {}) {
  const forwardedArgs = [...userArgs];
  if (forwardedArgs.includes("open")) {
    const requestedBrowser = readOption(forwardedArgs, "--browser");
    if (requestedBrowser && requestedBrowser !== "chromium") {
      throw new Error(
        `项目统一入口只使用项目 Chromium，不能使用 --browser=${requestedBrowser}。`
      );
    }
    if (readOption(forwardedArgs, "--config") !== null) {
      throw new Error("--config 由项目统一入口自动生成，请删除手动传入的 --config 参数。");
    }
    if (!requestedBrowser) forwardedArgs.push("--browser=chromium");
    forwardedArgs.push(`--config=${configPath}`);
  }
  return ["--yes", "--package", packageSpecifier, "playwright-cli", ...forwardedArgs];
}

export function resolveNpxLauncher() {
  if (process.platform !== "win32") {
    return { command: "npx", argumentPrefix: [] };
  }

  const candidates = [
    process.env.npm_execpath
      ? path.join(path.dirname(process.env.npm_execpath), "npx-cli.js")
      : "",
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js")
  ].filter(Boolean);
  const npxCliPath = candidates.find((candidate) => existsSync(candidate));
  if (!npxCliPath) {
    throw new Error(
      `找不到 npm 自带的 npx-cli.js，已检查：${candidates.join("；")}`
    );
  }
  return { command: process.execPath, argumentPrefix: [npxCliPath] };
}

export function runPlaywrightCli(userArgs, {
  cliPackage = PINNED_PLAYWRIGHT_CLI_PACKAGE,
  configPath = generatedConfigPath
} = {}) {
  if (!userArgs.length) {
    throw new Error(
      "缺少 Playwright CLI 命令。示例：npm run browser:cli -- -s=ielts open http://127.0.0.1:3000 --headed"
    );
  }

  if (userArgs.includes("open")) {
    const executablePath = resolveProjectChromiumExecutable();
    writePlaywrightCliConfig(configPath, executablePath);
    console.log(`[playwright-cli] 使用项目 Chromium：${executablePath}`);
    console.log(`[playwright-cli] 固定 CLI：${cliPackage}`);
  }

  const artifactDirectory = path.dirname(configPath);
  mkdirSync(artifactDirectory, { recursive: true });

  const npxLauncher = resolveNpxLauncher();
  const result = spawnSync(
    npxLauncher.command,
    [
      ...npxLauncher.argumentPrefix,
      ...buildPlaywrightCliArguments(userArgs, {
        configPath,
        packageSpecifier: cliPackage
      })
    ],
    {
      cwd: artifactDirectory,
      env: process.env,
      stdio: "inherit",
      shell: false
    }
  );

  if (result.error) throw result.error;
  return Number.isInteger(result.status) ? result.status : 1;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    process.exitCode = runPlaywrightCli(process.argv.slice(2));
  } catch (error) {
    console.error(`[playwright-cli] ${error?.message || String(error)}`);
    process.exitCode = 1;
  }
}
