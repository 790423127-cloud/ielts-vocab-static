import { expect, test } from "@playwright/test";
import { isBrushableWord } from "../../app/lib/vocab/word-study-eligibility.mjs";

const PERSONAL_WRONG_WORD = "codexpersistprobe";
const FONT_SCALE_STORAGE_KEY = "ielts-vocab-font-scale";

async function waitForFullWordLexicon(page) {
  const response = await page.request.get("/data/words.json");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const expectedCount = Array.isArray(payload?.words)
    ? payload.words.filter(isBrushableWord).length
    : 0;
  expect(expectedCount).toBeGreaterThan(10_000);

  await expect(page.getByRole("tab", { name: /单词刷词/ })).toContainText(
    `${expectedCount.toLocaleString("en-US")} 词`,
    { timeout: 45_000 }
  );
}

async function readWordUserState(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("ielts_vocab_big_store_v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("kv", "readonly");
      const getRequest = transaction.objectStore("kv").get("word_user_state_v1");
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => resolve(getRequest.result || {});
      transaction.oncomplete = () => db.close();
    };
  }));
}

async function setFontScale(page, scale) {
  await page.evaluate(({ key, nextScale }) => {
    localStorage.setItem(key, String(nextScale));
    window.dispatchEvent(new CustomEvent("ielts-vocab-font-scale-change", {
      detail: { scale: nextScale }
    }));
    window.dispatchEvent(new StorageEvent("storage", {
      key,
      newValue: String(nextScale)
    }));
  }, { key: FONT_SCALE_STORAGE_KEY, nextScale: scale });

  await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.fontScale)))
    .toBe(scale);
}

test("personal wrong book persists an added word across reload", async ({ page }) => {
  await page.goto("/spelling-words");
  await expect(page.getByTestId("spelling-input")).toBeEnabled({ timeout: 45_000 });

  await page.getByRole("button", { name: "做题错词本" }).click();
  const wrongBook = page.getByRole("region", { name: "做题错词本管理" });
  await expect(wrongBook).toBeVisible();
  await wrongBook.getByRole("textbox").fill(`${PERSONAL_WRONG_WORD} | 持久化测试词`);
  await wrongBook.getByRole("button", { name: "加入做题错词本" }).click();
  await expect(wrongBook).toContainText(PERSONAL_WRONG_WORD, { timeout: 30_000 });

  await page.reload();
  await expect(page.getByTestId("spelling-input")).toBeEnabled({ timeout: 45_000 });
  await page.getByRole("button", { name: "做题错词本" }).click();
  await expect(page.getByRole("region", { name: "做题错词本管理" })).toContainText(PERSONAL_WRONG_WORD);
});

test("SRS review is reachable and renders its empty state", async ({ page }) => {
  await page.goto("/spelling-words");
  await expect(page.getByTestId("spelling-input")).toBeEnabled({ timeout: 45_000 });

  await page.getByRole("button", { name: "统计/设置" }).click();
  await page.getByRole("button", { name: "展开设置" }).click();
  const srsReviewButton = page.getByRole("button", { name: /SRS 复习/ });
  await expect(srsReviewButton).toBeVisible();
  await srsReviewButton.scrollIntoViewIfNeeded();
  await expect(srsReviewButton).toBeInViewport();
  await expect.poll(async () => srsReviewButton.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2));
      return target === button || button.contains(target);
    })).toBe(true);
  await srsReviewButton.click();

  await expect(page.getByLabel("训练状态")).toContainText("SRS 复习", { timeout: 30_000 });
  await expect(page.getByLabel("训练状态")).toContainText("SRS 0");
  await expect(page.getByTestId("spelling-input")).toHaveCount(0);
  await expect(page.getByLabel("当前批次进度")).toContainText("进度：0 / 0");
});

test("spelling settings remain tappable at every supported font scale", async ({ page }) => {
  test.setTimeout(120_000);

  const scenarios = [
    { name: "桌面", width: 1366, height: 768 },
    { name: "手机", width: 390, height: 844 }
  ];

  for (const scenario of scenarios) {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });

    for (const scale of [0.8, 1, 1.25, 1.6]) {
      await page.goto("/spelling-words", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("spelling-input")).toBeEnabled({ timeout: 45_000 });
      await setFontScale(page, scale);

      const settingsSidebar = page.getByRole("complementary", { name: "统计与设置" });
      if (!await settingsSidebar.isVisible()) {
        await page.getByRole("button", { name: "统计/设置" }).click();
      }

      const settingsToggle = page.getByRole("button", { name: /展开设置|收起设置/ });
      if (await settingsToggle.getAttribute("aria-expanded") === "false") {
        await settingsToggle.click();
      }

      const srsReviewButton = page.getByRole("button", { name: /SRS 复习/ });
      await srsReviewButton.scrollIntoViewIfNeeded();
      await expect(srsReviewButton).toBeInViewport();
      const receivesPointer = await srsReviewButton.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2));
        return target === button || button.contains(target);
      });
      expect(receivesPointer, `${scenario.name} ${Math.round(scale * 100)}% SRS button must receive the pointer`).toBe(true);

      await srsReviewButton.click();
      await expect(page.getByLabel("训练状态")).toContainText("SRS 复习", { timeout: 30_000 });

      await page.getByRole("button", { name: "词库分类" }).click();
      await expect(page.getByTestId("spelling-input")).toBeEnabled({ timeout: 30_000 });
    }
  }
});

test("audio cache endpoint reports an explicit local cache miss", async ({ request }) => {
  const response = await request.head(
    "/api/audio-file?text=codex-e2e-cache-probe-never-generate-71f9&kind=word&preferReal=0"
  );

  expect(response.status()).toBe(204);
  expect(response.headers()["x-audio-cache"]).toBe("miss");
});

test("home learning status survives reload through IndexedDB", async ({ page }) => {
  await page.goto("/");
  await waitForFullWordLexicon(page);

  const currentWord = page.locator(".word-flash-shell .word");
  await expect(currentWord).toBeVisible();
  const markedWord = (await currentWord.textContent())?.trim();
  expect(markedWord).toBeTruthy();

  await page.locator(".bottombar").getByRole("button", { name: "不熟", exact: true }).click();
  await expect.poll(async () => {
    const state = await readWordUserState(page);
    return Object.values(state).some((entry) => entry?.status === "不熟");
  }, { timeout: 15_000 }).toBe(true);

  await page.reload();
  await waitForFullWordLexicon(page);
  await page.locator("summary.top-pill").filter({ hasText: "词库管理" }).click();
  await page.locator("header.topbar").getByRole("button", { name: "不熟", exact: true }).click();

  await expect(currentWord).toHaveText(markedWord, { timeout: 30_000 });
  await expect(page.getByText("当前词标记为不熟，复习时会优先出现")).toBeVisible();
});
