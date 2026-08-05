import { expect, test } from "@playwright/test";

async function openCompletionQueue(page, route, queueSelector) {
  await page.goto(route);
  const word = page.locator(route.endsWith(".html") ? "#word" : ".word-flash-shell .word");
  await expect(word).toBeVisible({ timeout: 45_000 });
  await expect(word).not.toHaveText(/^(Loading|正在读取词库|完成|—)$/);
  const controlsToggle = page.locator("#readingControlsToggle");
  if (await controlsToggle.count()) {
    await expect(controlsToggle).toBeVisible({ timeout: 45_000 });
    if (await controlsToggle.getAttribute("aria-expanded") === "false") {
      await controlsToggle.click();
    }
  }
  await expect(page.locator(queueSelector)).toBeVisible({ timeout: 45_000 });
  await page.locator(queueSelector).click();
}

test("dynamic G reading routes incomplete content to the completion queue", async ({ page }) => {
  await openCompletionQueue(page, "/reading-g", 'button:has-text("内容补全队列")');

  await expect(page.locator('[aria-label^="资料完整度"]')).toBeVisible();
  await expect(page.locator(".example")).toContainText("已转入内容补全队列");
  await expect(page.locator(".example")).not.toContainText("暂无例句");
});

test("static G reading mirrors the completion queue and score", async ({ page }) => {
  await openCompletionQueue(page, "/reading-g.html", '#topicBar button:has-text("内容待补")');

  await expect(page.locator("#basic")).toContainText("已进入内容补全队列");
  await expect(page.locator("#example")).toContainText("已转入内容补全队列");
  await expect(page.locator("#loadInfo")).toContainText("资料完整度");
});
