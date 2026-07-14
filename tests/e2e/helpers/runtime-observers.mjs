import { expect } from "@playwright/test";

export const PERFORMANCE_BUDGETS = Object.freeze({
  home: {
    domNodes: 1_000,
    longTaskCount: 15,
    longTaskTotalMs: 2_500,
    interactionMs: 1_000,
    heapBytes: 160 * 1024 * 1024
  },
  spelling: {
    domNodes: 1_200,
    longTaskCount: 20,
    longTaskTotalMs: 2_500,
    interactionMs: 750,
    heapBytes: 192 * 1024 * 1024
  }
});

export async function installRuntimeObservers(page) {
  await page.addInitScript(() => {
    window.__e2eLongTasks = [];
    if (typeof PerformanceObserver !== "function") return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__e2eLongTasks.push({
            startTime: entry.startTime,
            duration: entry.duration
          });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      window.__e2eLongTaskObserver = observer;
    } catch {
      // Long Tasks are not exposed by every browser engine.
    }
  });
}

export async function mockExternalSpeechGeneration(page) {
  await page.route("**/api/edge-tts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "X-Audio-Cache": "test",
        "X-Audio-Source": "e2e-offline",
        "X-Audio-Provider": "playwright",
        "X-Audio-Cache-Token": "e2e"
      },
      body: JSON.stringify({ ok: true, source: "e2e-offline" })
    });
  });
}

export async function startInteractionTimer(page) {
  await page.evaluate(() => {
    window.__e2eInteractionStartedAt = performance.now();
  });
}

export async function collectRuntimeMetrics(page) {
  return page.evaluate(() => {
    const longTasks = Array.isArray(window.__e2eLongTasks) ? window.__e2eLongTasks : [];
    const heapBytes = Number(performance.memory?.usedJSHeapSize);
    return {
      domNodes: document.getElementsByTagName("*").length,
      longTaskCount: longTasks.length,
      longTaskTotalMs: Math.round(longTasks.reduce((total, task) => total + task.duration, 0)),
      interactionMs: window.__e2eInteractionStartedAt == null
        ? null
        : Math.round(performance.now() - window.__e2eInteractionStartedAt),
      heapBytes: Number.isFinite(heapBytes) && heapBytes > 0 ? heapBytes : null
    };
  });
}

export function expectWithinPerformanceBudget(metrics, budget, label) {
  expect(metrics.domNodes, `${label} DOM node budget`).toBeLessThanOrEqual(budget.domNodes);
  expect(metrics.longTaskCount, `${label} long-task count budget`).toBeLessThanOrEqual(budget.longTaskCount);
  expect(metrics.longTaskTotalMs, `${label} long-task duration budget`).toBeLessThanOrEqual(budget.longTaskTotalMs);
  expect(metrics.interactionMs, `${label} interaction latency budget`).toBeLessThanOrEqual(budget.interactionMs);

  if (metrics.heapBytes != null) {
    expect(metrics.heapBytes, `${label} JavaScript heap budget`).toBeLessThanOrEqual(budget.heapBytes);
  }
}

export function reportRuntimeMetrics(label, metrics) {
  console.info(`[performance] ${label} ${JSON.stringify(metrics)}`);
}
