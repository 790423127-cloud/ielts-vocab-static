import { expect, test } from "@playwright/test";

import {
  PERFORMANCE_BUDGETS,
  collectRuntimeMetrics,
  expectWithinPerformanceBudget,
  installRuntimeObservers,
  mockExternalSpeechGeneration,
  reportRuntimeMetrics,
  startInteractionTimer
} from "./helpers/runtime-observers.mjs";

test.beforeEach(async ({ page }) => {
  await installRuntimeObservers(page);
  await mockExternalSpeechGeneration(page);
});

test("home stays within production runtime budgets", async ({ page }) => {
  await page.goto("/");

  const vocabResponse = await page.request.get("/data/words.json");
  expect(vocabResponse.ok()).toBeTruthy();
  const vocabPayload = await vocabResponse.json();
  const expectedCount = Number(vocabPayload?.count || vocabPayload?.words?.length || 0);
  expect(expectedCount).toBeGreaterThan(10_000);

  await expect(page.getByRole("tab", { name: /单词刷词/ })).toContainText(
    `${expectedCount.toLocaleString("en-US")} 词`,
    { timeout: 45_000 }
  );

  const currentWord = page.locator(".word-flash-shell .word");
  await expect(currentWord).toBeVisible();
  const before = (await currentWord.textContent())?.trim();

  await startInteractionTimer(page);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await currentWord.textContent())?.trim()).not.toBe(before);

  const metrics = await collectRuntimeMetrics(page);
  reportRuntimeMetrics("home", metrics);
  expectWithinPerformanceBudget(metrics, PERFORMANCE_BUDGETS.home, "home");

  const vocabTransfer = await page.evaluate(() => {
    const entry = performance.getEntriesByType("resource")
      .find((resource) => resource.name.includes("/api/vocab-data"));
    return entry?.transferSize || 0;
  });
  expect(vocabTransfer, "compressed vocab transfer").toBeLessThan(4 * 1024 * 1024);
});

test("word spelling stays within production runtime budgets", async ({ page }) => {
  await page.goto("/spelling-words");
  const input = page.getByTestId("spelling-input");
  await expect(input).toBeEnabled({ timeout: 45_000 });

  const progress = page.getByLabel("当前批次进度");
  const before = (await progress.textContent())?.trim();
  await startInteractionTimer(page);
  await page.getByRole("button", { name: "下一个", exact: true }).click();
  await expect.poll(async () => (await progress.textContent())?.trim()).not.toBe(before);

  const metrics = await collectRuntimeMetrics(page);
  reportRuntimeMetrics("spelling-words", metrics);
  expectWithinPerformanceBudget(metrics, PERFORMANCE_BUDGETS.spelling, "spelling-words");
});

test("meaning defers heavy semantic indexes until practice starts", async ({ page }) => {
  await page.goto("/meaning");
  const start = page.getByRole("button", { name: "开始练习" });
  await expect(start).toBeVisible({ timeout: 15_000 });

  const initialScriptBytes = await page.evaluate(() => performance
    .getEntriesByType("resource")
    .filter((entry) => entry.initiatorType === "script")
    .reduce((total, entry) => total + (entry.transferSize || 0), 0));
  expect(initialScriptBytes, "meaning initial script transfer").toBeLessThan(700 * 1024);

  await start.click();
  await expect(page.locator('[class*="optionsGrid"] > button')).toHaveCount(4, { timeout: 30_000 });
});

test("global navigation does not prefetch unrelated training routes", async ({ page }) => {
  await page.goto("/expressions");
  await expect(page.getByRole("button", { name: "开始本轮" })).toBeVisible();
  await page.waitForTimeout(1_000);

  const scripts = await page.evaluate(() => performance
    .getEntriesByType("resource")
    .filter((entry) => entry.initiatorType === "script")
    .map((entry) => entry.name));
  expect(scripts.some((url) => url.includes("/app/page-"))).toBe(false);
  expect(scripts.some((url) => url.includes("/app/reading-g/page-"))).toBe(false);
});
