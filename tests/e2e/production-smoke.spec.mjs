import { expect, test } from "@playwright/test";

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

  const wordMode = page.getByRole("tab", { name: /单词刷词/ });
  await expect(wordMode).toContainText("13,808 词", { timeout: 45_000 });

  const currentWord = page.locator(".word-flash-shell .word");
  await expect(currentWord).toBeVisible();
  await expect(currentWord).not.toHaveText(/^(正在读取词库|完成|—)$/);
  const firstWord = (await currentWord.textContent())?.trim();
  expect(firstWord).toBeTruthy();

  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await currentWord.textContent())?.trim()).not.toBe(firstWord);

  const phraseMode = page.getByRole("tab", { name: /词组刷词/ });
  await phraseMode.click();
  await expect(phraseMode).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".phrase-text")).toBeVisible({ timeout: 30_000 });
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
