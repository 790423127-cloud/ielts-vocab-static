import test from "node:test";
import assert from "node:assert/strict";

import {
  createStoredZip,
  patchStaticAppJs,
  patchStaticCss,
  patchStaticExportZip,
  readStoredZipEntries,
  STATIC_RESPONSIVE_MARKER,
  STATIC_RESPONSIVE_VERSION
} from "../../static-export-responsive.mjs";

const LOCKED_RULE =
  ".app{height:calc(100svh - var(--workspace-header));min-height:calc(100svh - var(--workspace-header));overflow:hidden}";

test("static CSS unlocks desktop height and adds compact laptop layout", () => {
  const patched = patchStaticCss(`body{margin:0}@media(min-width:901px){${LOCKED_RULE}}`);

  assert.equal(patched.includes(LOCKED_RULE), false);
  assert.match(patched, /\.app\{height:auto;min-height:calc\(100svh - var\(--workspace-header\)\);overflow:visible\}/);
  assert.match(patched, /max-height:900px/);
  assert.match(patched, /\.example-card\{order:0/);
  assert.match(patched, /max-height:720px/);
  assert.equal(patchStaticCss(patched), patched, "responsive CSS patch must be idempotent");
});

test("static app collapses tools by default on short laptop screens", () => {
  const source = `const APP_VERSION="old";
function topToolsViewportKey(){
  return window.matchMedia&&window.matchMedia("(max-width: 900px)").matches?"mobile":"desktop";
}
topToolsCollapsed=saved===null?viewport==="mobile":saved==="1";`;
  const patched = patchStaticAppJs(source);

  assert.match(patched, new RegExp(`APP_VERSION="${STATIC_RESPONSIVE_VERSION}"`));
  assert.match(patched, /max-height: 900px/);
  assert.match(patched, /compact-desktop/);
  assert.match(patched, /viewport==="mobile"\|\|viewport==="compact-desktop"/);
});

test("ZIP transformer patches CSS, app JS, HTML and service worker", () => {
  const originalZip = createStoredZip([
    {
      name: "assets/style.css",
      data: Buffer.from(`@media(min-width:901px){${LOCKED_RULE}}`)
    },
    {
      name: "assets/app.js",
      data: Buffer.from(`const APP_VERSION="old";\nfunction topToolsViewportKey(){\n  return window.matchMedia&&window.matchMedia("(max-width: 900px)").matches?"mobile":"desktop";\n}\ntopToolsCollapsed=saved===null?viewport==="mobile":saved==="1";`)
    },
    {
      name: "index.html",
      data: Buffer.from('<link rel="stylesheet" href="./assets/style.css?v=old" />')
    },
    {
      name: "sw.js",
      data: Buffer.from('const CACHE_NAME="static_vocab_shell_old";const A="./assets/style.css?v=old";')
    },
    {
      name: "data/words.json",
      data: Buffer.from('{"words":[]}')
    }
  ]);

  const patchedZip = patchStaticExportZip(originalZip);
  const entries = new Map(
    readStoredZipEntries(patchedZip).map((entry) => [entry.name, entry.data.toString("utf8")])
  );

  assert.match(entries.get("assets/style.css"), new RegExp(STATIC_RESPONSIVE_MARKER));
  assert.match(entries.get("assets/app.js"), /compact-desktop/);
  assert.match(entries.get("index.html"), new RegExp(`v=${STATIC_RESPONSIVE_VERSION}`));
  assert.match(entries.get("sw.js"), new RegExp(`static_vocab_shell_${STATIC_RESPONSIVE_VERSION}`));
  assert.equal(entries.get("data/words.json"), '{"words":[]}');
});
