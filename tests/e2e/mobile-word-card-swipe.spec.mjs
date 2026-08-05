import { expect, test } from "@playwright/test";

async function swipeStudyCard(page, { fromX, toX, pointerId }) {
  await page.locator(".word-study-card").evaluate((card, gesture) => {
    const target = card.querySelector(".word-study-content") || card;
    target.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      pointerId: gesture.pointerId,
      pointerType: "touch",
      buttons: 1,
      clientX: gesture.fromX,
      clientY: 300
    }));
    target.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      pointerId: gesture.pointerId,
      pointerType: "touch",
      buttons: 0,
      clientX: gesture.toX,
      clientY: 304
    }));
  }, { fromX, toX, pointerId });
}

async function expectSwipeNavigation(page, route) {
  await page.goto(route);
  const word = page.locator(".word-study-card .word").first();
  await expect(word).toBeVisible({ timeout: 45_000 });
  const initialWord = (await word.textContent())?.trim();
  expect(initialWord).toBeTruthy();

  await swipeStudyCard(page, { fromX: 330, toX: 80, pointerId: 41 });
  await expect.poll(async () => (await word.textContent())?.trim()).not.toBe(initialWord);
  const nextWord = (await word.textContent())?.trim();

  await swipeStudyCard(page, { fromX: 80, toX: 330, pointerId: 42 });
  await expect.poll(async () => (await word.textContent())?.trim()).not.toBe(nextWord);
  await expect(word).toHaveText(initialWord || "");
}

test("mobile swipes navigate dynamic main and G-reading cards", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  try {
    await expectSwipeNavigation(page, "/");
    await expectSwipeNavigation(page, "/reading-g");
  } finally {
    await context.close();
  }
});
