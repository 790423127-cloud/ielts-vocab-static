async (page) => {
  const baseUrl = "https://ielts-vocab-d1gymoilc5746f67a-1441466606.tcloudbaseapp.com/beidanci";
  const routes = ["/index.html", "/basic.html", "/reading-g.html", "/meaning.html", "/spelling.html"];
  const results = [];

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      const consoleErrors = [];
      const failedResponses = [];
      const onConsole = (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      };
      const onResponse = (response) => {
        if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
      };
      page.on("console", onConsole);
      page.on("response", onResponse);
      await page.goto(`${baseUrl}${route}?verify=d27-${viewport.name}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      results.push(await page.evaluate(({ route, viewportName, consoleErrors, failedResponses }) => ({
        viewport: viewportName,
        route,
        version: document.querySelector('link[rel="stylesheet"]')?.href || "",
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        bodyTextLength: document.body.innerText.trim().length,
        consoleErrors,
        failedResponses
      }), { route, viewportName: viewport.name, consoleErrors, failedResponses }));
      page.off("console", onConsole);
      page.off("response", onResponse);
    }
  }

  await page.setViewportSize({ width: 2048, height: 1024 });
  await page.goto(`${baseUrl}/reading-g.html?verify=d27-wide`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const dock = await page.locator(".bottom").evaluate((element) => {
    const measure = (selector) => {
      const node = element.querySelector(selector);
      const rect = node.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height), fontSize: getComputedStyle(node).fontSize };
    };
    return {
      known: measure(".status.known"),
      unknown: measure(".status.unknown"),
      progress: measure(".progress"),
      count: measure(".count")
    };
  });
  results.push({ viewport: "wide", route: "/reading-g.html", dock });
  await page.screenshot({ path: "output/playwright/cloud-d27-reading-g-2048.png", fullPage: false });
  return results;
}
