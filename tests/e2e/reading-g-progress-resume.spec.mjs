import { expect, test } from "@playwright/test";

async function verifyRefreshResume(page, route, selector, readyText) {
  await page.goto(route);
  await expect(page.locator(selector)).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(selector)).not.toHaveText(readyText);

  const before = (await page.locator(selector).textContent())?.trim();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await page.locator(selector).textContent())?.trim()).not.toBe(before);
  const advanced = (await page.locator(selector).textContent())?.trim();

  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator(selector)).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(selector)).toHaveText(advanced || "");
}

test("G reading resumes the dynamic study card after refresh", async ({ page }) => {
  await verifyRefreshResume(page, "/reading-g", ".word-flash-shell .word", /^(正在读取词库|完成|—)$/);
});

test("G reading resumes the static study card after refresh", async ({ page }) => {
  await verifyRefreshResume(page, "/reading-g.html", "#word", /^(Loading|)$/);
});
