import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detailSource = readFileSync(
  new URL("../../../components/WordDetailGrid.jsx", import.meta.url),
  "utf8"
);
const globalCss = readFileSync(
  new URL("../../../globals.css", import.meta.url),
  "utf8"
);

test("dictionary rows constrain long terms instead of overlapping their meanings", () => {
  assert.match(detailSource, /word-dictionary-row__term/);
  assert.match(globalCss, /\.word-dictionary-row button\s*\{[^}]*width:\s*100%/s);
  assert.match(globalCss, /\.word-dictionary-row__term\s*\{[^}]*text-overflow:\s*ellipsis/s);
  assert.match(globalCss, /@container \(max-width:\s*360px\)/);
  assert.match(globalCss, /grid-template-columns:\s*72px minmax\(0,\s*1fr\)/);
});
