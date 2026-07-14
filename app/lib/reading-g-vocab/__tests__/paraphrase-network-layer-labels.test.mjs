import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("network layer IDs stay stable while UI uses expression-recognition labels and units", () => {
  const page = fs.readFileSync("app/reading-g/page.jsx", "utf8");
  const loader = fs.readFileSync("app/lib/reading-g-vocab/load-reading-g.mjs", "utf8");
  const staticHtml = fs.readFileSync("public/reading-g.html", "utf8");
  assert.match(page, /表达识别核心/);
  assert.match(page, /表达识别扩展/);
  assert.match(page, /1006个表达/);
  assert.match(staticHtml, /500个表达/);
  assert.match(loader, /id: "paraCore600"/);
  assert.match(loader, /id: "paraExt500"/);
});
