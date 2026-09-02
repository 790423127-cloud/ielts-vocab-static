import { expect, test } from "@playwright/test";

async function stubStaticReadingPublish(page) {
  await page.route("**/api/reading-words/publish-static", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, wordCount: 0 })
  }));
}

async function stubPublishedReadingWords(page, readingWords = []) {
  await page.route("**/data/personal-reading-words.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      revision: "e2e-reading-words-published-fixture",
      transfer: {
        type: "ielts-reading-words-transfer",
        version: 1,
        readingWords,
        linkedMainEntries: []
      }
    })
  }));
}

async function readIndexedDbReadingWords(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("ielts-personal-reading-words-v1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const snapshot = await new Promise((resolve, reject) => {
        const transaction = database.transaction("notebook", "readonly");
        const request = transaction.objectStore("notebook").get("snapshot");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return Array.isArray(snapshot?.words) ? snapshot.words : [];
    } finally {
      database.close();
    }
  });
}

async function addReadingWord(page, word) {
  const manager = page.locator("[data-reading-words-manager]");
  await expect(manager).toHaveCount(1, { timeout: 45_000 });
  if (!await manager.evaluate((element) => element.open)) {
    await manager.locator("summary.top-pill").click();
  }
  const addButton = manager.getByRole("button", { name: "单个添加", exact: true });
  await expect(addButton).toBeVisible({ timeout: 45_000 });
  await addButton.click();
  await page.getByLabel("单词 *").fill(word);
  await page.getByRole("button", { name: "加入阅读生词本" }).click();
}

test.beforeEach(async ({ page }) => {
  await stubStaticReadingPublish(page);
  await stubPublishedReadingWords(page);
});

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
        meaningDetailZh: "用于验证学习卡快捷键响应的测试词条。",
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
        meaningDetailZh: "用于验证旧阅读生词回填和同义词展示的测试词条。",
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
  const synonymRegion = page.getByRole("region", { name: "同义替换", exact: true });
  await expect(synonymRegion).toContainText("broad", { timeout: 45_000 });
  await expect(synonymRegion).toContainText("广泛的；宽的");
  await expect.poll(
    () => publishedWords.some((entry) => entry?.word === "legacyreadingterm")
  ).toBe(true);
});

test("a rejected legacy backfill keeps the formal lexicon available for read-through display", async ({ page }) => {
  let exportAttempts = 0;
  let vocabDataRequests = 0;
  let requestedAiItems = [];
  await page.route("**/api/vocab-data", (route) => {
    vocabDataRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
      count: 1,
      version: "e2e-reading-readthrough",
      words: [{
        id: "main-proactive",
        wordId: "main-proactive",
        word: "proactive",
        pos: "adjective",
        phonetic: "/prəʊˈæktɪv/",
        meaning: "积极主动的；主动采取行动的",
        definition: "taking action before a problem occurs",
        example: "Employers should take a proactive approach to workplace safety.",
        exampleCn: "雇主应主动采取措施保障工作场所安全。",
        forms: [],
        formsReviewed: true,
        wordFamily: [],
        wordFamilyReviewed: true,
        synonyms: [],
        synonymsReviewed: true,
        topics: ["工作与管理"],
        ieltsUse: ["Reading"],
        difficulty: "中级核心"
        }]
      })
    });
  });
  await page.route("**/api/export-cache", (route) => {
    exportAttempts += 1;
    return route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: "拒绝写入：测试中的正式词库保护规则"
      })
    });
  });
  await page.route("**/api/generate-words", async (route) => {
    const request = route.request().postDataJSON();
    requestedAiItems = Array.isArray(request?.items) ? request.items : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: requestedAiItems.map((item) => ({
          inputId: item.inputId,
          word: item.word,
          pos: item.existingPos || "noun",
          meaning: item.existingMeaning || "AI 补充释义",
          meaningDetailZh: "该释义已经结合常见用法完成核查，并说明了词义范围和实际使用方式。",
          definition: "a locally cached completion used by the browser test",
          example: "This cached profile completes the remaining fields.",
          exampleCn: "这份缓存资料补齐其余字段。",
          otherMeanings: [],
          forms: [],
          wordFamily: [],
          synonyms: [],
          synonymDetails: [],
          ieltsUse: ["Reading"],
          topics: ["测试"],
          difficulty: "中级核心",
          aiGenerated: true,
          source: "ai-cache"
        })),
        stats: {
          cacheHit: requestedAiItems.length,
          deepseek: 0,
          invalid: 0,
          requested: 0
        }
      })
    });
  });
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem("ielts-personal-reading-words-v1", JSON.stringify({
      version: 1,
      updatedAt: now,
      words: [
        {
          id: "reading-proactive",
          wordId: "reading-proactive",
          word: "proactive",
          importCount: 1,
          createdAt: now,
          updatedAt: now
        },
        {
          id: "reading-legacy-missing",
          wordId: "reading-legacy-missing",
          word: "legacyreadthroughmissing",
          meaning: "仅用于触发旧数据回填",
          importCount: 1,
          createdAt: now,
          updatedAt: now
        }
      ]
    }));
  });

  await page.goto("/reading-words");

  const proactiveRow = page.getByRole("button", { name: /proactive.*积极主动的/ });
  await expect(proactiveRow).toBeVisible({ timeout: 45_000 });
  expect(vocabDataRequests).toBe(1);
  await expect(proactiveRow).toContainText("阅读资料 4 项待补");
  await expect(proactiveRow).not.toContainText("阅读资料 9 项待补");
  await proactiveRow.click();
  await expect(page.getByRole("button", {
    name: /Employers should take a proactive approach to workplace safety/
  })).toBeVisible();
  await expect(page.getByText(/已连接正式主词库 1 词并用于补全显示/)).toBeVisible();
  await expect(page.getByText(/主词库读取失败/)).toHaveCount(0);

  await expect.poll(() => page.evaluate(() => {
    const payload = JSON.parse(localStorage.getItem("ielts-personal-reading-words-v1") || "null");
    const readingWord = payload?.words?.find((word) => word?.id === "reading-proactive");
    return readingWord?.meaning || "";
  })).toBe("");

  await page.getByRole("button", { name: "AI 工具", exact: true }).click();
  await page.getByLabel(/我确认只补全上述阅读生词/).check();
  await page.getByRole("button", { name: /开始处理 2 个词/ }).click();
  await expect(page.getByRole("status").filter({
    hasText: /正式主词库当前只读，本次结果仅保存到当前浏览器的阅读生词本/
  }).first()).toBeVisible({ timeout: 45_000 });

  expect(requestedAiItems.find((item) => item.word === "proactive")).toMatchObject({
    existingMeaning: "积极主动的；主动采取行动的",
    existingPos: "adjective"
  });
  expect(exportAttempts).toBe(1);
  await expect.poll(async () => {
    const words = await readIndexedDbReadingWords(page);
    const readingWord = words.find((word) => word?.id === "reading-proactive");
    return {
      meaning: readingWord?.meaning || "",
      definition: readingWord?.definition || "",
      formsReviewed: readingWord?.formsReviewed === true
    };
  }).toEqual({
    meaning: "积极主动的；主动采取行动的",
    definition: "taking action before a problem occurs",
    formsReviewed: true
  });

  // The same read-through rule must also apply to words added after the page
  // entered read-only mode, not only to the notebook records present on load.
  await addReadingWord(page, "proactive");
  await addReadingWord(page, "futurelocalword");
  await expect(page.getByRole("button", { name: /futurelocalword.*暂无释义/ })).toBeVisible();
  expect(exportAttempts).toBe(1);
  await expect.poll(async () => {
    const words = await readIndexedDbReadingWords(page);
    const proactive = words.find((word) => word?.word === "proactive");
    const future = words.find((word) => word?.word === "futurelocalword");
    return {
      proactiveImportCount: proactive?.importCount || 0,
      proactiveMeaning: proactive?.meaning || "",
      futureExists: Boolean(future),
      futureMainWordId: future?.mainWordId || ""
    };
  }).toEqual({
    proactiveImportCount: 2,
    proactiveMeaning: "积极主动的；主动采取行动的",
    futureExists: true,
    futureMainWordId: ""
  });
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
        meaningDetailZh: "指家族或物种中较早的、后代所由来的个体或群体。",
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
    await expect.poll(async () => {
      const words = path === "/reading-words"
        ? await readIndexedDbReadingWords(page)
        : await page.evaluate(() => {
          const payload = JSON.parse(localStorage.getItem("ielts-personal-reading-words-v1") || "null");
          return Array.isArray(payload) ? payload : payload?.words || [];
        });
      const word = words.find((entry) => entry?.id === "reading-truncated-ancestors");
      return {
        word: word?.word,
        correctedFrom: word?.correctedFrom,
        mainWordId: word?.mainWordId
      };
    }).toEqual({
      word: "ancestors",
      correctedFrom: "ncestors",
      mainWordId: "word_excel_4c679af3eb0d"
    });
  }
});

test("reading words reuse main data and count repeated imports", async ({ page }) => {
  await page.route("**/api/export-cache", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, version: "e2e-reading-words", savedAt: new Date().toISOString() })
  }));
  await page.goto(`/reading-words?e2eRun=${Date.now()}`);

  await addReadingWord(page, "retain");
  await addReadingWord(page, "retain");

  await expect(page.getByRole("button", { name: /retain 保留/ })).toContainText("高频 ×2");
  await expect(page.getByText("verb 动词", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "同义替换" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "常见搭配" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "短语搭配" })).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "跨设备导出" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^阅读生词-跨设备迁移包-.*\.json$/);
  expect(await download.path()).toBeTruthy();
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
    // Reproduce normal study use: a toolbar selector or progress slider often
    // retains focus. Tab/Space must still play audio instead of being taken
    // over by that control.
    await page.locator('select, input[type="range"]').first().focus();

    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await expect.poll(() => page.evaluate(() => window.__readingShortcutSpeech)).toEqual([
      "keyboardreadingterm",
      "Keyboard shortcuts should play this example."
    ]);

    await page.keyboard.press("Digit3");
    await expect.poll(async () => {
      const words = path === "/reading-words"
        ? await readIndexedDbReadingWords(page)
        : await page.evaluate(() => {
          const payload = JSON.parse(localStorage.getItem("ielts-personal-reading-words-v1") || "null");
          return Array.isArray(payload) ? payload : payload?.words || [];
        });
      return words.find((word) => word?.word === "keyboardreadingterm")?.status || "";
    }).toBe("不熟");
  }
});

test("zoomed-out word view keeps populated dictionary modules aligned without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1000 });
  await page.goto("/");

  const dictionaryModules = page.locator(".word-dictionary-module:visible");
  await expect(dictionaryModules.first()).toBeVisible({ timeout: 45_000 });
  expect(await dictionaryModules.count()).toBeLessThanOrEqual(4);
  await expect(page.locator("#word-dictionary-collocations-panel")).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const modules = [...document.querySelectorAll(".word-dictionary-module")]
      .filter((element) => element.getClientRects().length > 0);
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
