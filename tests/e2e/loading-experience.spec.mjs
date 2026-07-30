import { expect, test } from "@playwright/test";

const SLOW_ROUTE_DELAY_MS = 1_500;

test.use({ serviceWorkers: "block" });

const nextScenarios = [
  { route: "/", dataPattern: "**/api/vocab-data*" },
  { route: "/basic", dataPattern: "**/data/basic-words.json*" },
  { route: "/reading-g", dataPattern: "**/data/reading-g-vocab.json*" },
  { route: "/expressions", dataPattern: "**/data/speaking-writing-phrases-700.json*" },
  { route: "/meaning", dataPattern: "**/data/meaning-6000.json*" },
  { route: "/meaning-en", dataPattern: "**/data/meaning-6000.json*" },
  {
    route: "/spelling-words",
    dataPattern: "**/api/vocab-data*",
    loadingSelector: ".spelling-focus-stack--preparing"
  },
  {
    route: "/spelling-phrases",
    dataPattern: "**/data/phrases.json*",
    loadingSelector: ".spelling-focus-stack--preparing"
  }
];

const staticScenarios = [
  { route: "/basic.html", dataPattern: "**/data/basic-words.json*" },
  { route: "/reading-g.html", dataPattern: "**/data/reading-g-vocab.json*" },
  { route: "/meaning.html", dataPattern: "**/data/meaning-6000.json*" },
  { route: "/spelling.html", dataPattern: "**/data/words.json*" }
];

function captureRuntimeErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

async function delayRequest(page, pattern) {
  await page.route(pattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_ROUTE_DELAY_MS));
    await route.continue();
  });
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth
  }));
  expect(overflow.page).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function startSpellingPlaceholderWatch(page) {
  await page.evaluate(() => {
    window.__spellingPreparingPanelPainted = false;
    window.__spellingPreparingPanelWatch = window.setInterval(() => {
      const panel = document.querySelector('[class*="spellingPreparingPanel"]');
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        window.__spellingPreparingPanelPainted = true;
      }
    }, 16);
  });
}

async function stopSpellingPlaceholderWatch(page) {
  return page.evaluate(() => {
    window.clearInterval(window.__spellingPreparingPanelWatch);
    return window.__spellingPreparingPanelPainted === true;
  });
}

for (const scenario of nextScenarios) {
  test(`${scenario.route} uses the stable loading experience`, async ({ page }) => {
    const runtimeErrors = captureRuntimeErrors(page);
    await delayRequest(page, scenario.dataPattern);
    await page.goto(scenario.route);

    const loadingState = page.locator(scenario.loadingSelector || ".system-loading-state").first();
    await expect(loadingState).toBeVisible({ timeout: 10_000 });
    await expect(loadingState).not.toContainText(/\d+\s*%/);
    if (!scenario.loadingSelector) {
      await expect(loadingState.locator("h1")).toHaveCSS("font-size", /^(2[0-8]|1\d)px$/);
    }
    await expectNoHorizontalOverflow(page);

    await expect(loadingState).toBeHidden({ timeout: 45_000 });
    await expect(page.locator("main").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });
}

for (const scenario of staticScenarios) {
  test(`${scenario.route} keeps a stable static loading label`, async ({ page }) => {
    const runtimeErrors = captureRuntimeErrors(page);
    await delayRequest(page, scenario.dataPattern);
    await page.goto(scenario.route);

    const body = page.locator("body");
    await expect(body).toContainText(/正在准备/);
    await expect(body).not.toContainText(/下载词库\s*\d+\s*%/);
    await expectNoHorizontalOverflow(page);

    await page.waitForTimeout(SLOW_ROUTE_DELAY_MS + 1_000);
    await expectNoHorizontalOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });
}

test("home navigation enters spelling without flashing the short-lived preparation panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".word-flash-shell .word")).toBeVisible({ timeout: 45_000 });

  await startSpellingPlaceholderWatch(page);
  await page.getByRole("link", { name: "拼写训练" }).first().click();
  await expect(page.getByTestId("spelling-input")).toBeEnabled({ timeout: 15_000 });
  expect(await stopSpellingPlaceholderWatch(page)).toBe(false);

  await page.getByRole("link", { name: "选义训练" }).first().click();
  await expect(page).toHaveURL(/\/meaning$/);

  await startSpellingPlaceholderWatch(page);
  await page.getByRole("link", { name: "拼写训练" }).first().click();
  await expect(page.getByTestId("spelling-input")).toBeEnabled({ timeout: 15_000 });
  expect(await stopSpellingPlaceholderWatch(page)).toBe(false);
});

test("saved stats sidebar preference does not shift the spelling preparation panel", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "ielts-vocab:spelling-ux:word",
      JSON.stringify({ statsSidebarOpen: true })
    );
  });
  await delayRequest(page, "**/api/vocab-data*");
  await page.goto("/spelling-words");

  const loadingPanel = page.locator('[class*="spellingPreparingPanel"]');
  const layout = page.locator(".spelling-page-layout");
  await expect(loadingPanel).toBeVisible({ timeout: 10_000 });

  const initialCenter = await loadingPanel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left + (rect.width / 2);
  });
  await page.waitForTimeout(250);
  const hydratedCenter = await loadingPanel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left + (rect.width / 2);
  });

  await expect(layout).not.toHaveClass(/is-sidebar-open/);
  expect(Math.abs(hydratedCenter - initialCenter)).toBeLessThanOrEqual(1);

  await expect(page.getByTestId("spelling-input")).toBeEnabled({ timeout: 45_000 });
  await expect(layout).toHaveClass(/is-sidebar-open/);
});

test("all learning routes fit a phone viewport after loading", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const { route } of [...nextScenarios, ...staticScenarios]) {
    await page.goto(route);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});
