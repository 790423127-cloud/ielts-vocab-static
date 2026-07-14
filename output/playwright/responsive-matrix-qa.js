async (page) => {
  const pages = [
    ["next-home", "http://localhost:3000/"],
    ["next-reading-g", "http://localhost:3000/reading-g"],
    ["next-spelling", "http://localhost:3000/spelling-words"],
    ["next-meaning", "http://localhost:3000/meaning"],
    ["static-home", "http://127.0.0.1:4173/index.html"],
    ["static-reading-g", "http://127.0.0.1:4173/reading-g.html"],
    ["static-spelling", "http://127.0.0.1:4173/spelling.html"],
    ["static-meaning", "http://127.0.0.1:4173/meaning.html"]
  ];
  const viewports = [
    [390, 844, "mobile"],
    [800, 1000, "tablet"],
    [2048, 1024, "wide"]
  ];
  const results = [];

  for (const [name, url] of pages) {
    for (const [width, height, viewport] of viewports) {
      await page.setViewportSize({ width, height });
      const response = await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      results.push(await page.evaluate(({ name, viewport, status }) => {
        const root = document.documentElement;
        const visibleAsideWidths = [...document.querySelectorAll("aside")]
          .filter((element) => element.offsetParent)
          .map((element) => Math.round(element.getBoundingClientRect().width));
        const visibleSummaries = [...document.querySelectorAll("summary")]
          .filter((element) => element.offsetParent)
          .map((element) => element.textContent.replace(/\s+/g, " ").trim())
          .slice(0, 5);
        return {
          name,
          viewport,
          status,
          width: innerWidth,
          scrollWidth: root.scrollWidth,
          scrollHeight: root.scrollHeight,
          overflowX: root.scrollWidth > innerWidth,
          mainWidth: Math.round(document.querySelector("main")?.getBoundingClientRect().width || 0),
          visibleAsideWidths,
          visibleSummaries
        };
      }, { name, viewport, status: response?.status() || 0 }));

      if ((viewport === "mobile" || viewport === "wide") && name !== "next-reading-g" && name !== "static-reading-g") {
        await page.screenshot({
          path: `output/playwright/${name}-${width}x${height}.png`,
          scale: "css"
        });
      }
    }
  }

  return results;
}
