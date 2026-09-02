import { expect, test } from "@playwright/test";

const COLD_START_READY_BUDGET_MS = 12_000;

async function readCachedMeta(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const openRequest = indexedDB.open("ielts_vocab_big_store_v1", 1);
    openRequest.onerror = () => resolve(null);
    openRequest.onsuccess = () => {
      const db = openRequest.result;
      const request = db
        .transaction("kv", "readonly")
        .objectStore("kv")
        .get("words_meta_v2");
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    };
  }));
}

test("home reuses the persisted full lexicon after a cold start", async ({ page }) => {
  test.setTimeout(90_000);
  let vocabDataRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/vocab-data")) vocabDataRequests += 1;
  });

  await page.goto("/");
  const currentWord = page.locator(".word-flash-shell .word");
  await expect(currentWord).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.flash-mode-tab[role="tab"]').first()).toContainText(
    /\d{1,3}(?:,\d{3})+\s*词/,
    { timeout: 45_000 }
  );
  await expect(currentWord).not.toHaveText(/^(?:Loading|正在准备学习内容|正在读取词库|完成|—)$/);

  const coldStartReadyMs = await page.evaluate(() => Math.round(performance.now()));
  test.info().annotations.push({
    type: "cold-start-ready-ms",
    description: String(coldStartReadyMs)
  });
  expect(
    coldStartReadyMs,
    `cold lexicon startup must leave the preparation state within ${COLD_START_READY_BUDGET_MS}ms`
  ).toBeLessThan(COLD_START_READY_BUDGET_MS);
  expect(vocabDataRequests).toBe(1);

  await expect.poll(async () => {
    const meta = await readCachedMeta(page);
    return meta?.sourceCount && meta?.version ? meta : null;
  }, { timeout: 15_000 }).toBeTruthy();

  const requestsAfterColdStart = vocabDataRequests;
  await page.goto("/expressions");
  await page.goto("/");
  await expect(page.locator(".word-flash-shell .word")).toBeVisible({ timeout: 15_000 });

  expect(vocabDataRequests).toBe(requestsAfterColdStart);
});
