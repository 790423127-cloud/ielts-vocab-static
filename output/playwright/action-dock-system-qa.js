async (page) => {
  const baseUrl = "http://localhost:3000";
  const routes = [
    "/",
    "/basic",
    "/reading-g",
    "/spelling-words",
    "/spelling-phrases",
    "/meaning",
    "/meaning-en",
    "/expressions"
  ];
  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 }
  ];
  const results = [];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of routes) {
      const consoleErrors = [];
      const onConsole = (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      };
      page.on("console", onConsole);
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const metrics = await page.evaluate(() => ({
        title: document.title,
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        bodyTextLength: document.body.innerText.trim().length,
        hasVisibleMain: Boolean(Array.from(document.querySelectorAll("main")).find((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }))
      }));
      page.off("console", onConsole);
      results.push({ viewport: viewport.name, route, ...metrics, consoleErrors });
    }
  }

  for (const route of ["/", "/basic", "/reading-g"]) {
    await page.setViewportSize({ width: 2048, height: 1024 });
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    const dock = page.locator(".bottom.bottombar");
    const known = dock.locator(".status.known");
    const unknown = dock.locator(".status.unknown");
    const progress = dock.locator(".progress");
    const count = dock.locator(".count");
    const dockMetrics = await dock.evaluate((element) => {
      const rectOf = (selector) => {
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
        known: rectOf(".status.known"),
        unknown: rectOf(".status.unknown"),
        progress: rectOf(".progress"),
        count: rectOf(".count")
      };
    });
    results.push({ viewport: "wide", route, dockMetrics });
    await page.screenshot({
      path: `output/playwright/action-dock-${route === "/" ? "home" : route.slice(1)}-2048.png`,
      fullPage: false
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const mobileDockMetrics = await dock.evaluate((element) => {
      const pick = (selector) => {
        const node = element.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      };
      return {
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        known: pick(".status.known"),
        unknown: pick(".status.unknown"),
        progress: pick(".progress")
      };
    });
    results.push({ viewport: "mobileDock", route, dockMetrics: mobileDockMetrics });
  }

  return results;
}
