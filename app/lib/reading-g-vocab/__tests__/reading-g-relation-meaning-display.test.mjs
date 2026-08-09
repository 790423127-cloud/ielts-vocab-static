import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("G reading relation meanings wrap fully in dynamic and static cards", () => {
  const dynamicCss = read("app/globals.css");
  const staticCss = read("public/assets/style.css");

  for (const [css, selector] of [
    [dynamicCss, ".page--word-flash .g-reading-relation-grid .zh"],
    [staticCss, "#relationBlocks .zh"]
  ]) {
    const start = css.indexOf(selector);
    const rule = css.slice(start, css.indexOf("}", start) + 1);

    assert.ok(start >= 0, `${selector} rule must exist`);
    assert.match(rule, /overflow:\s*visible/);
    assert.match(rule, /overflow-wrap:\s*anywhere/);
    assert.match(rule, /text-overflow:\s*clip/);
    assert.match(rule, /white-space:\s*normal/);
    assert.doesNotMatch(rule, /text-overflow:\s*ellipsis/);
    assert.doesNotMatch(rule, /white-space:\s*nowrap/);
  }

  assert.match(
    staticCss,
    /@media\(max-width:700px\)[\s\S]*?#relationBlocks \.zh\{flex:0 0 auto;width:100%;/,
    "mobile relation details must use their natural height"
  );
});
