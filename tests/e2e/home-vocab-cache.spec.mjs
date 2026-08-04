import { expect, test } from "@playwright/test";

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
  await expect(page.locator(".word-flash-shell .word")).toBeVisible({ timeout: 45_000 });
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
