async (page) => {
  await page.addInitScript(() => {
    window.__audioStartTimes = [];
    const Context = window.AudioContext || window.webkitAudioContext;
    if (Context && !Context.prototype.__qaAudioPatched) {
      Context.prototype.__qaAudioPatched = true;
      const originalCreate = Context.prototype.createBufferSource;
      Context.prototype.createBufferSource = function (...args) {
        const source = originalCreate.apply(this, args);
        const originalStart = source.start;
        source.start = function (...startArgs) {
          window.__audioStartTimes.push({ at: performance.now(), path: "web-audio" });
          return originalStart.apply(this, startArgs);
        };
        return source;
      };
    }

    if (!HTMLMediaElement.prototype.__qaAudioPatched) {
      HTMLMediaElement.prototype.__qaAudioPatched = true;
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        window.__audioStartTimes.push({ at: performance.now(), path: "html-audio" });
        return originalPlay.apply(this, args);
      };
    }
  });

  await page.goto("http://localhost:3000/reading-g");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);

  const measure = async (buttonName) => {
    const before = await page.evaluate(() => performance.now());
    await page.getByRole("button", { name: buttonName }).click();
    await page.waitForFunction(
      (threshold) => (window.__audioStartTimes || []).some((value) => value.at >= threshold),
      before,
      { timeout: 5000 }
    ).catch(() => null);
    const started = await page.evaluate(
      (threshold) => (window.__audioStartTimes || []).find((value) => value.at >= threshold) || null,
      before
    );
    if (!started) return { ms: null, path: "not-captured" };
    return { ms: Math.round((started.at - before) * 10) / 10, path: started.path };
  };

  const wordFirstMs = await measure("播放单词发音，快捷键 Tab");
  await page.waitForTimeout(100);
  const wordDecodedCacheMs = await measure("播放单词发音，快捷键 Tab");
  await page.waitForTimeout(100);
  const sentenceMs = await measure("播放例句发音，快捷键空格");

  return { wordFirstMs, wordDecodedCacheMs, sentenceMs };
}
