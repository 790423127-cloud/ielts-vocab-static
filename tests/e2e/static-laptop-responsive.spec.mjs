import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const laptopViewports = [
  { width: 1707, height: 700 },
  { width: 1707, height: 768 },
  { width: 2048, height: 768 },
  { width: 2048, height: 1024 }
];

async function waitForStaticWord(page) {
  await page.waitForFunction(() => {
    const text = document.querySelector("#word")?.textContent?.trim();
    return Boolean(text && text !== "Loading");
  });
}

for (const viewport of laptopViewports) {
  test(`reading-g word is unobstructed at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/reading-g.html?v=laptop-${viewport.width}-${viewport.height}`);
    await waitForStaticWord(page);

    const layout = await page.evaluate(() => {
      const box = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left } : null;
      };
      const app = document.querySelector(".app");
      const controls = document.querySelector("#readingControls");

      return {
        viewportHeight: window.innerHeight,
        word: box("#word"),
        dock: box(".bottom"),
        controlsHead: box(".reading-controls-head"),
        controlsCollapsed: controls?.classList.contains("is-collapsed"),
        appOverflow: app ? getComputedStyle(app).overflow : null
      };
    });

    expect(layout.word).not.toBeNull();
    expect(layout.dock).not.toBeNull();
    expect(layout.word.top).toBeGreaterThanOrEqual(0);
    expect(layout.word.bottom).toBeLessThanOrEqual(layout.viewportHeight);
    expect(layout.word.bottom).toBeLessThanOrEqual(layout.dock.top);
    expect(layout.appOverflow).toBe("visible");

    if (viewport.height <= 900) {
      expect(layout.controlsCollapsed).toBe(true);
      expect(layout.controlsHead.bottom - layout.controlsHead.top).toBeGreaterThan(0);
    }
  });
}

test("shared static flashcard CSS keeps the basic word above its action dock", async ({ page }) => {
  await page.setViewportSize({ width: 1707, height: 700 });
  await page.goto("/basic.html?v=laptop-shared-css");
  await waitForStaticWord(page);

  const overlap = await page.evaluate(() => {
    const word = document.querySelector("#word")?.getBoundingClientRect();
    const dock = document.querySelector(".bottom")?.getBoundingClientRect();
    return word && dock ? word.bottom - dock.top : Number.POSITIVE_INFINITY;
  });

  expect(overlap).toBeLessThanOrEqual(0);
});
