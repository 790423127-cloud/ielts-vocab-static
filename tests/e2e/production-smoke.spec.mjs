import { expect, test } from "@playwright/test";
import { isBrushableWord } from "../../app/lib/vocab/word-study-eligibility.mjs";

const browserErrorsByPage = new WeakMap();

function captureBrowserErrors(page) {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      const source = location.url
        ? ` (${location.url}:${location.lineNumber + 1}:${location.columnNumber + 1})`
        : "";
      errors.push(`console.error: ${message.text()}${source}`);
    }
  });

  return errors;
}

test.beforeEach(async ({ page }) => {
  browserErrorsByPage.set(page, captureBrowserErrors(page));
});

test.afterEach(async ({ page }) => {
  const errors = browserErrorsByPage.get(page) || [];
  expect(errors, errors.join("\n")).toEqual([]);
});

test("home loads the full lexicon, changes word, and switches to phrases", async ({ page }) => {
  await page.goto("/");

  const vocabResponse = await page.request.get("/data/words.json");
  expect(vocabResponse.ok()).toBeTruthy();
  const vocabPayload = await vocabResponse.json();
  const expectedCount = Array.isArray(vocabPayload?.words)
    ? vocabPayload.words.filter(isBrushableWord).length
    : 0;
  expect(expectedCount).toBeGreaterThan(10_000);

  const wordMode = page.getByRole("tab", { name: /单词刷词/ });
  await expect(wordMode).toContainText(`${expectedCount.toLocaleString("en-US")} 词`, { timeout: 45_000 });

  const currentWord = page.locator(".word-flash-shell .word");
  await expect(currentWord).toBeVisible();
  await expect(currentWord).not.toHaveText(/^(正在读取词库|完成|—)$/);
  for (const sectionName of ["变形", "词族", "常见搭配", "短语搭配"]) {
    await expect(page.getByRole("region", { name: sectionName, exact: true })).toBeVisible();
  }
  const firstWord = (await currentWord.textContent())?.trim();
  expect(firstWord).toBeTruthy();

  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await currentWord.textContent())?.trim()).not.toBe(firstWord);

  const phraseMode = page.getByRole("tab", { name: /词组刷词/ });
  await phraseMode.click();
  await expect(phraseMode).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".phrase-text")).toBeVisible({ timeout: 30_000 });
});

test("plural-reference searches open the base card without double plurals", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /单词刷词/ })).toContainText("12,324 词", { timeout: 45_000 });

  await page.locator("summary.top-pill").filter({ hasText: "词库管理" }).click();
  const search = page.getByPlaceholder("搜索单词并跳转");
  const currentWord = page.locator(".word-flash-shell .word");

  for (const [plural, base] of [["forces", "force"], ["questions", "question"]]) {
    await search.fill(plural);
    const result = page.locator(".word-search-result");
    await expect(result).toContainText(`${plural} 是词形参考，将进入基词 ${base}`);
    await result.getByRole("button", { name: `跳转到 ${base}` }).click();
    await expect(currentWord).toHaveText(base);
    await expect(page.getByText(`${plural}es`, { exact: true })).toHaveCount(0);
  }
});

test("meaning practice starts with four answers", async ({ page }) => {
  await page.goto("/meaning");

  await page.getByRole("button", { name: "开始练习" }).click();

  const answers = page.locator('[class*="optionsGrid"] > button');
  await expect(answers).toHaveCount(4, { timeout: 30_000 });
  for (const answer of await answers.all()) {
    await expect(answer).toBeVisible();
    await expect(answer).not.toHaveText("");
  }
});

for (const scenario of [
  { route: "/spelling-words", placeholder: "输入英文拼写" },
  { route: "/spelling-phrases", placeholder: "输入完整词组" }
]) {
  test(`${scenario.route} can move to the next question`, async ({ page }) => {
    await page.goto(scenario.route);

    const input = page.getByTestId("spelling-input");
    await expect(input).toBeEnabled({ timeout: 45_000 });
    await expect(input).toHaveAttribute("placeholder", scenario.placeholder);

    const progress = page.getByLabel("当前批次进度");
    const before = (await progress.textContent())?.trim();
    expect(before).toBeTruthy();

    const nextButton = page.getByRole("button", { name: "下一个", exact: true });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await expect.poll(async () => (await progress.textContent())?.trim()).not.toBe(before);
    await expect(input).toBeEnabled();
  });
}

test("legacy spelling page shows its deprecation warning", async ({ page }) => {
  await page.goto("/spelling.html");

  const warning = page.getByRole("status");
  await expect(warning).toContainText("遗留静态页（已废弃主维护）");
  await expect(warning.getByRole("link", { name: /spelling-words/ })).toBeVisible();
  await expect(warning.getByRole("link", { name: /spelling-phrases/ })).toBeVisible();
});
