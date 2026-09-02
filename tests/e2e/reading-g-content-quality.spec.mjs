import { expect, test } from "@playwright/test";

async function installIncompleteReadingGFixture(page) {
  await page.route(/\/data\/reading-g-vocab\.json(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const sourceItems = Array.isArray(payload?.items) ? payload.items : [];
    const source = sourceItems.find((entry) => (
      (entry?.entryType || "word") === "word" && entry?.studyMode !== "reference"
    ));
    expect(source).toBeTruthy();

    const fixture = {
      ...source,
      id: "e2e_reading_g_content_incomplete",
      word: "e2e-incomplete-entry",
      normalizedKey: "e2e-incomplete-entry",
      phonetic: ""
    };
    await route.fulfill({
      response,
      json: {
        ...payload,
        count: 1,
        wordCount: 1,
        phraseCount: 0,
        activeCount: 1,
        referenceCount: 0,
        items: [fixture]
      }
    });
  });
}

async function openCompletionQueue(page, route, queueSelector, { staticPage = false } = {}) {
  await installIncompleteReadingGFixture(page);
  await page.goto(route);
  const word = page.locator(route.endsWith(".html") ? "#word" : ".word-flash-shell .word");
  await expect(word).toBeVisible({ timeout: 45_000 });
  await expect(word).not.toHaveText(/^(Loading|正在读取词库|—)$/);
  if (staticPage) {
    const toolsToggle = page.locator("#topToolsToggle");
    if (await toolsToggle.getAttribute("aria-expanded") === "false") {
      await toolsToggle.click();
    }
    await page.locator("#readingEntryBtn").click();
  }
  await expect(page.locator(queueSelector)).toBeVisible({ timeout: 45_000 });
  await page.locator(queueSelector).click();
}

test("dynamic G reading routes incomplete content to the completion queue", async ({ page }) => {
  await openCompletionQueue(page, "/reading-g", 'button:has-text("资料待修复")');

  await expect(page.locator('[aria-label^="资料完整度"]')).toBeVisible();
  await expect(page.locator(".example")).toContainText("已转入内容补全队列");
  await expect(page.locator(".example")).not.toContainText("暂无例句");
});

test("static G reading mirrors the completion queue and score", async ({ page }) => {
  await openCompletionQueue(
    page,
    "/reading-g.html",
    '#topicBar button:has-text("资料待修复")',
    { staticPage: true }
  );

  await expect(page.locator("#basic")).toContainText("已进入内容补全队列");
  await expect(page.locator("#example")).toContainText("已转入内容补全队列");
  await expect(page.locator("#loadInfo")).toContainText("资料完整度");
});
