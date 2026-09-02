import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveAdaptiveShell,
  resolveFontScaleLevel
} from "../font-scale.mjs";

test("font scale exposes stable semantic levels", () => {
  assert.equal(resolveFontScaleLevel(0.8), "small");
  assert.equal(resolveFontScaleLevel(1), "normal");
  assert.equal(resolveFontScaleLevel(1.25), "large");
  assert.equal(resolveFontScaleLevel(1.6), "xlarge");
});

test("desktop shell switches when enlarged text reduces effective width", () => {
  assert.equal(resolveAdaptiveShell(1600, 1), "desktop");
  assert.equal(resolveAdaptiveShell(1366, 1.4), "compact");
  assert.equal(resolveAdaptiveShell(1024, 1.4), "compact");
  assert.equal(resolveAdaptiveShell(901, 1), "compact");
  assert.equal(resolveAdaptiveShell(900, 1.6), "native");
});

test("root bootstrap and CSS both implement the font-aware shell", () => {
  const layout = readFileSync(new URL("../../../layout.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../../globals.css", import.meta.url), "utf8");
  assert.match(layout, /dataset\.adaptiveShell/);
  assert.match(css, /data-adaptive-shell="compact"/);
  assert.match(css, /\.topbar \.top-actions[\s\S]*flex-wrap: nowrap/);
});

test("reading study surfaces keep every font step monotonic and remove the 538 inner scrollbar override", () => {
  const readingCss = readFileSync(new URL("../../../reading-words/reading-words.module.css", import.meta.url), "utf8");
  const globalCss = readFileSync(new URL("../../../globals.css", import.meta.url), "utf8");

  assert.doesNotMatch(readingCss, /data-font-scale-level=/);
  assert.match(readingCss, /font-size:\s*calc\(clamp\(46px, 4vw, 62px\) \* var\(--font-scale\)\)/);
  assert.match(readingCss, /\.page\s*\{[\s\S]*?display:\s*flex;/);
  assert.doesNotMatch(globalCss, /\.ielts-538-study \.word-study-card\s*\{\s*scrollbar-width:\s*thin/);
  assert.match(globalCss, /\.ielts-538-study \.word-study-card,[\s\S]*?overflow:\s*hidden;[\s\S]*?scrollbar-width:\s*none;/);
});
