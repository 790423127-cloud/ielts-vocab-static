import { expect, test } from "@playwright/test";

async function waitForStudyWord(page) {
  const word = page.locator(".word-flash-shell .word");
  await expect(word).toBeVisible({ timeout: 45_000 });
  await expect(word).not.toHaveText(/^(正在读取词库|完成|—)?$/);
  return word;
}

test("home order controls keep horizontal arrows as word navigation and resume a fixed order", async ({ page }) => {
  await page.goto("/");
  const word = await waitForStudyWord(page);
  const order = page.locator(".word-order-select");
  const difficulty = page.locator(".word-difficulty-select");

  await order.selectOption("family");
  await expect(order).toHaveValue("family");
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");

  const before = (await word.textContent())?.trim();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await word.textContent())?.trim()).not.toBe(before);
  await expect(order).toHaveValue("family");
  const resumedWord = (await word.textContent())?.trim();

  const compactSnapshot = await page.evaluate(() => {
    const stored = JSON.parse(
      localStorage.getItem("ielts_vocab_word_order_modes_v1") || "{}"
    );
    const snapshot = stored?.all?.snapshots?.["family|default"];
    return {
      version: snapshot?.version,
      indexCount: snapshot?.indices?.length,
      hasLegacyKeys: Array.isArray(snapshot?.keys)
    };
  });
  expect(compactSnapshot.version).toBe(2);
  expect(compactSnapshot.indexCount).toBeGreaterThan(10_000);
  expect(compactSnapshot.hasLegacyKeys).toBe(false);

  await page.reload();
  await waitForStudyWord(page);
  await expect(order).toHaveValue("family");
  await expect(word).toHaveText(resumedWord || "");

  await difficulty.selectOption("hard-to-easy");
  await expect(difficulty).toHaveValue("hard-to-easy");
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");
  const beforeDifficultyArrow = (await word.textContent())?.trim();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await word.textContent())?.trim()).not.toBe(beforeDifficultyArrow);
  await expect(difficulty).toHaveValue("hard-to-easy");
  await order.selectOption("random");
  await expect(order).toHaveValue("random");
  await expect(difficulty).toBeDisabled();
  await expect(difficulty).toHaveValue("hard-to-easy");
  await order.selectOption("current");
  await expect(difficulty).toBeEnabled();
  await expect(difficulty).toHaveValue("hard-to-easy");
});

for (const route of ["/basic", "/reading-g", "/ielts-538"]) {
  test(`${route} isolates the order selector from horizontal word navigation`, async ({ page }) => {
    await page.goto(route);
    const word = await waitForStudyWord(page);
    const order = page.locator(".word-order-select");

    await order.selectOption("family");
    await expect(order).toHaveValue("family");
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");

    const before = (await word.textContent())?.trim();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await word.textContent())?.trim()).not.toBe(before);
    await expect(order).toHaveValue("family");
  });
}

test("deleting the third word in a fixed difficulty queue keeps position three", async ({ page }) => {
  await page.route("**/api/vocab-data", async (route) => {
    if (route.request().method() === "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });
  await page.route("**/api/export-cache", async (route) => {
    if (route.request().method() === "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        count: 13_353,
        version: "test-only"
      })
    });
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");
  const word = await waitForStudyWord(page);
  const order = page.locator(".word-order-select");
  const difficulty = page.locator(".word-difficulty-select");
  const progress = page.locator(".word-study-progress__count strong");

  await order.selectOption("association");
  await difficulty.selectOption("easy-to-hard");
  await expect(progress).toContainText("1 /");

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(progress).toContainText("3 /");

  await page.keyboard.press("ArrowRight");
  const expectedSuccessor = (await word.textContent())?.trim();
  await page.keyboard.press("ArrowLeft");
  await expect(progress).toContainText("3 /");

  await page.keyboard.press("Delete");
  await expect(word).toHaveText(expectedSuccessor || "");
  await expect(progress).toContainText("3 /");

  const activeSnapshot = await page.evaluate(() => {
    const stored = JSON.parse(
      localStorage.getItem("ielts_vocab_word_order_modes_v1") || "{}"
    );
    return stored?.all?.snapshots?.["association|easy-to-hard"] || null;
  });
  expect(activeSnapshot?.version).toBe(2);
  expect(activeSnapshot?.indices?.length).toBeGreaterThan(1_000);
});
