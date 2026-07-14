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
  { route: "/spelling-words", dataPattern: "**/api/vocab-data*" },
  { route: "/spelling-phrases", dataPattern: "**/data/phrases.json*" }
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

for (const scenario of nextScenarios) {
  test(`${scenario.route} uses the stable loading experience`, async ({ page }) => {
    const runtimeErrors = captureRuntimeErrors(page);
    await delayRequest(page, scenario.dataPattern);
    await page.goto(scenario.route);

    const loadingState = page.locator(".system-loading-state").first();
    await expect(loadingState).toBeVisible({ timeout: 10_000 });
    await expect(loadingState).not.toContainText(/\d+\s*%/);
    await expect(loadingState.locator("h1")).toHaveCSS("font-size", /^(2[0-8]|1\d)px$/);
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
