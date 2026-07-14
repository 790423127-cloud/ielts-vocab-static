async (page) => {
  const baseUrl = "http://127.0.0.1:4174";
  const routes = ["/index.html", "/basic.html", "/reading-g.html", "/meaning.html", "/spelling.html"];
  const results = [];

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      const consoleErrors = [];
      const onConsole = (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      };
      page.on("console", onConsole);
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      results.push(await page.evaluate(({ route, viewportName, consoleErrors }) => ({
        viewport: viewportName,
        route,
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        bodyTextLength: document.body.innerText.trim().length,
        hasVisibleContent: document.body.getBoundingClientRect().height > 0,
        consoleErrors
      }), { route, viewportName: viewport.name, consoleErrors }));
      page.off("console", onConsole);
    }
  }

  for (const route of ["/index.html", "/basic.html", "/reading-g.html"]) {
    await page.setViewportSize({ width: 2048, height: 1024 });
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    const dock = page.locator(".bottom");
    const dockMetrics = await dock.evaluate((element) => {
      const pick = (selector) => {
        const node = element.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          fontSize: style.fontSize,
          color: style.color,
          background: style.backgroundColor
        };
      };
      const rect = element.getBoundingClientRect();
      return {
        dock: { width: Math.round(rect.width), height: Math.round(rect.height) },
        known: pick(".status.known"),
        unknown: pick(".status.unknown"),
        progress: pick(".progress"),
        count: pick(".count")
      };
    });
    results.push({ viewport: "wide", route, dockMetrics });
    await page.screenshot({
      path: `output/playwright/static-action-dock-${route.replaceAll("/", "").replace(".html", "")}-2048.png`,
      fullPage: false
    });
  }

  return results;
}
