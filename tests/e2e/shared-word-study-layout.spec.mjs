import { expect, test } from "@playwright/test";

const SATELLITE_ROUTES = [
  { route: "/basic", expectedWord: "hello", insightCount: 1 },
  { route: "/ielts-538", expectedWord: "resemble", insightCount: 1 },
  { route: "/reading-g", expectedWord: "ability", insightCount: 1 }
];

for (const { route, expectedWord, insightCount } of SATELLITE_ROUTES) {
  test(`${route} uses the shared word study workspace`, async ({ page }) => {
    await page.goto(route);

    await expect(page.locator(".word-flash-shell")).toHaveCount(1);
    await expect(page.locator(".word-study-layout")).toHaveCount(1);
    await expect(page.locator(".word-study-column")).toHaveCount(1);
    await expect(page.locator(".word-study-card")).toHaveCount(1);
    await expect(page.locator(".word-insight-panel")).toHaveCount(insightCount);
    await expect(page.locator(".word")).toContainText(expectedWord);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
}

test("basic and 538 share the same desktop workspace geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });

  async function readWorkspace(route) {
    await page.goto(route);
    await expect(page.locator(".word-insight-panel")).toBeVisible();
    return page.evaluate(() => {
      const layout = document.querySelector(".word-study-layout");
      const column = document.querySelector(".word-study-column");
      const card = document.querySelector(".word-study-card");
      const insight = document.querySelector(".word-insight-panel");
      const layoutStyle = getComputedStyle(layout);
      const layoutBox = layout.getBoundingClientRect();
      return {
        layoutDisplay: layoutStyle.display,
        layoutColumns: layoutStyle.gridTemplateColumns,
        layoutWidth: Math.round(layoutBox.width),
        layoutHeight: Math.round(layoutBox.height),
        columnDisplay: getComputedStyle(column).display,
        columnOverflow: getComputedStyle(column).overflow,
        cardOverflowY: getComputedStyle(card).overflowY,
        insightDisplay: getComputedStyle(insight).display
      };
    });
  }

  const basicWorkspace = await readWorkspace("/basic");
  const ielts538Workspace = await readWorkspace("/ielts-538");

  expect(ielts538Workspace).toEqual(basicWorkspace);
  expect(ielts538Workspace.layoutDisplay).toBe("grid");
  expect(ielts538Workspace.layoutColumns.split(" ")).toHaveLength(2);
  expect(ielts538Workspace.columnDisplay).toBe("grid");
  expect(ielts538Workspace.cardOverflowY).toBe("auto");
  await expect(page.locator(".ielts-538-paraphrase")).toHaveCount(1);
  await expect(page.locator(".ielts-538-related-grid")).toHaveCount(1);
});

test("538 entries render the selected reviewed contextual paraphrase", async ({ page }) => {
  await page.goto("/ielts-538");

  const card = page.locator(".ielts-538-paraphrase");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("be similar to");
  await expect(page.locator(".ielts-538-example-meta")).not.toContainText("Section");
  await expect(card.locator(".ielts-538-section-badge")).toContainText("Section 1");
  await expect(card.locator(".ielts-538-recommended-badge")).toContainText("最推荐");
  await expect(card).toContainText(
    "The room used for employee training has a design similar to the principal meeting area."
  );
});

test("538 reviewed alternatives switch the single example panel", async ({ page }) => {
  await page.goto("/ielts-538");

  const related = page.locator(".ielts-538-related-grid");
  const choices = related.locator(".ielts-538-related-choice");
  const primaryChoice = choices.filter({ hasText: "be similar to" });
  const sourceOnlyChoice = choices.filter({ hasText: /^like/ });
  const lookLikeChoice = choices.filter({ hasText: "look like" });

  await expect(related).toHaveCount(1);
  await expect(choices).toHaveCount(4);
  await expect(primaryChoice).toHaveAttribute("aria-pressed", "true");
  await expect(primaryChoice.locator(".ielts-538-section-badge")).toContainText("Section 1");
  await expect(primaryChoice).toContainText("已审核");
  await expect(related).toContainText("like");
  await expect(related).toContainText("look like");
  await expect(related).toContainText("be like");

  await sourceOnlyChoice.click();
  await expect(page.locator(".ielts-538-paraphrase")).toContainText("like");
  await expect(page.locator(".ielts-538-paraphrase__empty")).toContainText("暂无审核例句");
  await expect(sourceOnlyChoice).toContainText("暂无审核例句");
  await expect(sourceOnlyChoice).toHaveAttribute("aria-pressed", "true");

  await lookLikeChoice.click();
  await expect(page.locator(".ielts-538-paraphrase")).toHaveCount(1);
  await expect(page.locator(".ielts-538-paraphrase")).toContainText("look like");
  await expect(page.locator(".ielts-538-paraphrase")).toContainText(
    "The new room for staff instruction looks much like the main suite used for conferences."
  );
  await expect(lookLikeChoice).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".ielts-538-paraphrase .ielts-538-section-badge")).toContainText(
    "Section 1"
  );
  await expect(primaryChoice).toHaveAttribute("aria-pressed", "false");

  await expect(page.locator(".word-insight-panel")).toHaveCount(1);
  await expect(page.locator(".footer-grid:not(.ielts-538-related-grid)")).toHaveCount(0);
});

test("538 Section badges follow each synonym's own difficulty", async ({ page }) => {
  await page.goto("/ielts-538");
  const next = page.locator(".study-step-button--next");
  await next.click();
  await next.click();
  await expect(page.locator(".word")).toContainText("adjust");

  const choices = page.locator(".ielts-538-related-choice");
  const change = choices.filter({ hasText: /^change/ });
  const modify = choices.filter({ hasText: /^modify/ });
  const shift = choices.filter({ hasText: /^shift/ });
  const alter = choices.filter({ hasText: /^alter/ });

  await expect(change.locator(".ielts-538-section-badge")).toContainText("Section 1");
  await expect(modify.locator(".ielts-538-section-badge")).toContainText("Section 2");
  await expect(shift.locator(".ielts-538-section-badge")).toContainText("Section 2");
  await expect(alter.locator(".ielts-538-section-badge")).toContainText("Section 2");

  await change.click();
  await expect(page.locator(".ielts-538-paraphrase .ielts-538-section-badge")).toContainText(
    "Section 1"
  );
  await modify.click();
  await expect(page.locator(".ielts-538-paraphrase .ielts-538-section-badge")).toContainText(
    "Section 2"
  );
});
