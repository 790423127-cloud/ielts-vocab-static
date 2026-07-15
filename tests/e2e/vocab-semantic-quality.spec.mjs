import { test, expect } from "@playwright/test";

test("word flashcard shows curated meaning detail without responsive overflow", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByText("词库面板", { exact: true })).toBeVisible();
  await page.getByText("词库面板", { exact: true }).click();
  await page.getByPlaceholder("搜索单词").fill("account");
  const accountItem = page.locator(".library-item").filter({ has: page.getByText("account", { exact: true }) }).first();
  await expect(accountItem).toBeVisible();
  await accountItem.click();

  await expect(page.locator(".word")).toHaveText("account");
  await expect(page.locator(".meaning-expanded")).toContainText("详细释义");
  await expect(page.locator(".meaning-expanded")).toContainText("银行");
  const senseCount = await page.locator(".meaning-senses li").count();
  expect(senseCount).toBeGreaterThanOrEqual(2);
  expect(senseCount).toBeLessThanOrEqual(3);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".meaning-expanded")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(consoleErrors).toEqual([]);
});
