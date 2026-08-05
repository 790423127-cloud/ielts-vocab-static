import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("network layer IDs stay stable while UI uses expression-recognition labels and units", () => {
  const page = fs.readFileSync("app/reading-g/page.jsx", "utf8");
  const loader = fs.readFileSync("app/lib/reading-g-vocab/load-reading-g.mjs", "utf8");
  const staticHtml = fs.readFileSync("public/reading-g.html", "utf8");
  assert.match(page, /LAYER_META/);
  assert.match(loader, /id: "paraCore600"/);
  assert.match(loader, /id: "paraExt500"/);
  assert.match(loader, /label: "表达识别核心"/);
  assert.match(loader, /label: "表达识别扩展"/);
  assert.match(staticHtml, /表达识别核心\d+个表达、扩展\d+个表达/);
});
