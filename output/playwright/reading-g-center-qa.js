async (page) => {
  await page.goto("http://localhost:3000/reading-g");
  await page.evaluate(() => {
    localStorage.setItem(
      "ielts_reading_g_session_v3",
      JSON.stringify({
        wordKey: "weekend",
        filter: { type: "pathStage", value: "1" },
        index: 1459
      })
    );
    localStorage.setItem(
      "ielts_reading_g_positions_v3",
      JSON.stringify({ "pathStage:1": "weekend" })
    );
  });
  await page.setViewportSize({ width: 2048, height: 1024 });
  await page.reload();
  await page.locator(".word", { hasText: /^weekend$/ }).waitFor();

  const metrics = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        right: Math.round(box.right),
        width: Math.round(box.width),
        center: Math.round(box.left + box.width / 2)
      };
    };
    return {
      viewportCenter: innerWidth / 2,
      main: rect(".word-flash-shell > .main"),
      center: rect(".center"),
      example: rect(".example-box"),
      word: rect(".word"),
      meaning: rect(".meaning-block"),
      footer: rect(".footer-grid"),
      shellClass: document.querySelector(".word-flash-shell")?.className,
      overflowX: document.documentElement.scrollWidth > innerWidth
    };
  });

  await page.screenshot({
    path: "output/playwright/next-reading-g-weekend-centered-2048x1024.png",
    scale: "css"
  });
  return metrics;
}
