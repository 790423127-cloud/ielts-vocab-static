import { expect, test } from "@playwright/test";

const MAIN_LEXICON_DELAY_MS = 6_000;

test.use({ serviceWorkers: "block" });

test("主词库核对期间不把可复用资料误标为待补全", async ({ page }) => {
  const completeMainEntry = {
    id: "main-completeness-fixture",
    wordId: "main-completeness-fixture",
    word: "completenessfixture",
    pos: "noun",
    phonetic: "/kəmˈpliːtnəs/",
    meaning: "完整度测试词",
    meaningDetailZh: "用于验证正式主词库资料到达前后的状态展示。",
    definition: "a complete entry used to verify hydration status",
    example: "The fixture has every reading field.",
    exampleCn: "这个测试词包含全部阅读字段。",
    forms: [],
    formsReviewed: true,
    wordFamily: [],
    wordFamilyReviewed: true,
    synonyms: [],
    synonymsReviewed: true,
    topics: ["测试"],
    ieltsUse: ["Reading"],
    difficulty: "中级核心"
  };

  await page.route("**/api/vocab-meta", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ count: 1, version: "reading-completeness-fixture" })
  }));
  await page.route("**/api/vocab-data", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, MAIN_LEXICON_DELAY_MS));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        version: "reading-completeness-fixture",
        words: [completeMainEntry]
      })
    });
  });
  await page.route("**/data/personal-reading-words.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      transfer: {
        type: "ielts-reading-words-transfer",
        version: 1,
        readingWords: [{
          id: "reading-completeness-fixture",
          wordId: "main-completeness-fixture",
          word: "completenessfixture",
          importCount: 1
        }],
        linkedMainEntries: []
      }
    })
  }));

  await page.goto("/reading-words");

  const row = page
    .getByRole("complementary", { name: "阅读生词列表" })
    .getByRole("button", { name: /completenessfixture/ });
  const incompleteButton = page.getByRole("button", { name: "待补全 —" });
  await expect(row).toContainText("核对", { timeout: 45_000 });
  await expect(row).not.toContainText("待补");
  await expect(row).not.toContainText("完整");
  await expect(incompleteButton).toBeDisabled();

  await expect(row).toContainText("完整", { timeout: 45_000 });
  await expect(row).not.toContainText("核对");
  await expect(page.getByRole("button", { name: /待补全/ })).toBeEnabled();
});

test("待补全为零时保持当前列表并说明没有可筛选的单词", async ({ page }) => {
  await page.route("**/api/export-cache", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, count: 1, version: "reading-filter-fixture" })
  }));
  await page.route("**/data/personal-reading-words.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      transfer: {
        type: "ielts-reading-words-transfer",
        version: 1,
        readingWords: [{
          id: "reading-complete-filter-fixture",
          wordId: "reading-complete-filter-fixture",
          word: "completefixture",
          pos: "noun",
          meaning: "完整测试词",
          meaningDetailZh: "指资料字段齐全、可直接用于验证筛选行为的测试词条。",
          definition: "a complete reading-word fixture",
          example: "This reading word is complete.",
          exampleCn: "这个阅读生词资料完整。",
          forms: [],
          formsReviewed: true,
          wordFamily: [],
          wordFamilyReviewed: true,
          synonyms: [],
          synonymsReviewed: true,
          synonymDetails: [],
          importCount: 1
        }],
        linkedMainEntries: []
      }
    })
  }));

  await page.goto("/reading-words");

  const incompleteButton = page.getByRole("button", { name: "待补全 0" });
  await expect(incompleteButton).toBeVisible({ timeout: 45_000 });
  await incompleteButton.click();

  await expect(incompleteButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("status").filter({ hasText: "没有待补全的阅读生词。" })).toBeVisible();
  await expect(page.getByText("completefixture", { exact: true }).first()).toBeVisible();
});
