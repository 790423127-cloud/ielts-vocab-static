import { expect, test } from "@playwright/test";

async function installReadingShortcutFixture(page) {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    window.__readingShortcutSpeech = [];
    class MockSpeechSynthesisUtterance {
      constructor(text) {
        this.text = String(text || "");
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockSpeechSynthesisUtterance
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {},
        speak(utterance) {
          window.__readingShortcutSpeech.push(utterance.text);
        }
      }
    });
    localStorage.setItem("ielts-personal-reading-words-v1", JSON.stringify({
      version: 1,
      updatedAt: now,
      words: [{
        id: "reading-keyboard-term",
        wordId: "reading-keyboard-term",
        word: "keyboardreadingterm",
        pos: "noun",
        meaning: "快捷键测试词",
        definition: "a deterministic keyboard shortcut fixture",
        example: "Keyboard shortcuts should play this example.",
        exampleCn: "快捷键应播放这个例句。",
        forms: [],
        formsReviewed: true,
        wordFamily: [],
        wordFamilyReviewed: true,
        synonyms: [],
        synonymsReviewed: true,
        importCount: 1,
        createdAt: now,
        updatedAt: now
      }]
    }));
  });
}

test("legacy reading words are backfilled into the formal lexicon and show synonym meanings", async ({ page }) => {
  let publishedWords = [];
  await page.route("**/api/export-cache", async (route) => {
    const body = route.request().postDataJSON();
    publishedWords = Array.isArray(body?.words) ? body.words : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        count: publishedWords.length,
        version: "e2e-reading-legacy-backfill",
        savedAt: new Date().toISOString()
      })
    });
  });
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem("ielts-personal-reading-words-v1", JSON.stringify({
      version: 1,
      updatedAt: now,
      words: [{
        id: "reading-legacy-term",
        wordId: "reading-legacy-term",
        word: "legacyreadingterm",
        pos: "adjective",
        meaning: "测试释义",
        definition: "used only for a deterministic browser test",
        example: "This is a legacy reading term.",
        exampleCn: "这是一个测试阅读词。",
        forms: [],
        formsReviewed: true,
        formsReviewSource: "reading-ai",
        wordFamily: [],
        wordFamilyReviewed: true,
        wordFamilyReviewSource: "reading-ai",
        synonyms: ["broad"],
        synonymsReviewed: true,
        synonymsReviewSource: "reading-ai",
        importCount: 1,
        createdAt: now,
        updatedAt: now
      }]
    }));
  });

  await page.goto("/reading-words");
  await expect(page.getByRole("button", { name: /legacyreadingterm.*主词库待分类/ })).toBeVisible({
    timeout: 45_000
  });
  await expect(page.getByRole("button", { name: /broad.*广泛的；宽的/ })).toBeVisible({
    timeout: 45_000
  });
  await expect.poll(
    () => publishedWords.some((entry) => entry?.word === "legacyreadingterm")
  ).toBe(true);
});

test("a complete-looking truncated reading word is corrected to the existing canonical headword", async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem("ielts-personal-reading-words-v1", JSON.stringify({
      version: 1,
      updatedAt: now,
      words: [{
        id: "reading-truncated-ancestors",
        wordId: "reading-truncated-ancestors",
        word: "ncestors",
        pos: "noun",
        meaning: "祖先",
        definition: "A person from whom one is descended.",
        example: "Many people trace their ancestors.",
        exampleCn: "许多人追溯自己的祖先。",
        forms: [],
        formsReviewed: true,
        wordFamily: [],
        wordFamilyReviewed: true,
        synonyms: [],
        synonymsReviewed: true,
        importCount: 1,
        createdAt: now,
        updatedAt: now
      }]
    }));
  });

  for (const path of ["/reading-words", "/reading-words.html"]) {
    await page.goto(path);
    await expect(page.getByText("ancestors", { exact: true }).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("ncestors", { exact: true })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
      const payload = JSON.parse(localStorage.getItem("ielts-personal-reading-words-v1") || "null");
      const word = Array.isArray(payload) ? payload[0] : payload?.words?.[0];
      return {
        word: word?.word,
        correctedFrom: word?.correctedFrom,
        mainWordId: word?.mainWordId
      };
    })).toEqual({
      word: "ancestors",
      correctedFrom: "ncestors",
      mainWordId: "word_excel_4c679af3eb0d"
    });
  }
});

test("reading words reuse main data, count repeated imports, and migrate to another device profile", async ({ page, browser }) => {
  await page.route("**/api/export-cache", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, version: "e2e-reading-words", savedAt: new Date().toISOString() })
  }));
  await page.goto("/reading-words");
  await expect(page.getByRole("status")).toContainText("已连接正式主词库", {
    timeout: 45_000
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole("button", { name: "单个添加" }).click();
    await page.getByLabel("单词 *").fill("retain");
    await page.getByRole("button", { name: "加入阅读生词本" }).click();
  }

  await expect(page.getByRole("button", { name: /retain 保留/ })).toContainText("高频 ×2");
  await expect(page.getByText("verb 动词", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "同义替换" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "常见搭配" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "短语搭配" })).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "跨设备导出" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^阅读生词-跨设备迁移包-.*\.json$/);

  const transferPath = await download.path();
  expect(transferPath).toBeTruthy();
  const secondDevice = await browser.newContext();
  const secondPage = await secondDevice.newPage();
  await secondPage.route("**/api/export-cache", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, version: "e2e-reading-words", savedAt: new Date().toISOString() })
  }));
  await secondPage.goto("/reading-words");
  await expect(secondPage.getByRole("status")).toContainText("已连接正式主词库", {
    timeout: 45_000
  });
  await secondPage.getByLabel("跨设备导入").setInputFiles(transferPath);
  await expect(secondPage.getByRole("button", { name: /retain 保留/ })).toContainText("高频 ×2");
  await secondDevice.close();
});

test("reading words share flashcard audio and status keyboard shortcuts in Next and static pages", async ({ page }) => {
  await installReadingShortcutFixture(page);
  await page.route("**/api/export-cache", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, version: "e2e-reading-keyboard", savedAt: new Date().toISOString() })
  }));
  await page.route("**/data/words.json*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ words: [] })
  }));

  for (const path of ["/reading-words", "/reading-words.html"]) {
    await page.goto(path);
    await expect(page.getByText("keyboardreadingterm", { exact: true }).first()).toBeVisible({
      timeout: 45_000
    });
    await page.evaluate(() => document.activeElement?.blur());

    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await expect.poll(() => page.evaluate(() => window.__readingShortcutSpeech)).toEqual([
      "keyboardreadingterm",
      "Keyboard shortcuts should play this example."
    ]);

    await page.keyboard.press("Digit3");
    await expect(page.getByRole("button", { name: "不熟" })).toHaveClass(/active|is-selected/);
  }
});

test("zoomed-out word view keeps all four dictionary modules aligned without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1000 });
  await page.goto("/");

  const dictionaryModules = page.locator(".word-dictionary-module");
  await expect(dictionaryModules).toHaveCount(4, { timeout: 45_000 });
  await expect(page.locator("#word-dictionary-forms-panel")).toBeVisible();
  await expect(page.locator("#word-dictionary-family-panel")).toBeVisible();
  await expect(page.locator("#word-dictionary-collocations-panel")).toBeVisible();
  await expect(page.locator("#word-dictionary-phrases-panel")).toBeVisible();

  const layout = await page.evaluate(() => {
    const modules = [...document.querySelectorAll(".word-dictionary-module")];
    return {
      moduleTops: modules.map((element) => Math.round(element.getBoundingClientRect().top)),
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    };
  });
  expect(new Set(layout.moduleTops).size).toBe(1);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
});

test("spelling training leaves preparation state and exposes an enabled input", async ({ page }) => {
  await page.goto("/spelling-words");

  await expect(page.getByText("正在准备本轮训练")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("spelling-input")).toBeEnabled();
});
