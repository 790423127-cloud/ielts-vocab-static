import test from "node:test";
import assert from "node:assert/strict";

import nextConfig from "../../../../next.config.mjs";
import { patchStaticZipResponse } from "../../static-export-response.mjs";
import {
  createStoredZip,
  readStoredZipEntries,
  STATIC_RESPONSIVE_VERSION,
  STATIC_SWIPE_FIX_MARKER
} from "../../static-export-responsive.mjs";

test("the public export endpoint is rewritten through the final artifact route", async () => {
  const rewrites = await nextConfig.rewrites();
  assert.deepEqual(rewrites.beforeFiles, [
    { source: "/api/export-static", destination: "/api/export-static-final" }
  ]);
});

test("the final export response contains the real mobile swipe and cache version", async () => {
  const rawZip = createStoredZip([
    {
      name: "assets/app.js",
      data: Buffer.from('const APP_VERSION="old";let sx=0,sy=0,st=0;els.swipeArea.addEventListener("touchcancel",stopHoldStep,{passive:true});')
    },
    {
      name: "assets/style.css",
      data: Buffer.from(".hero{overflow:visible}")
    },
    {
      name: "index.html",
      data: Buffer.from('<script src="./assets/app.js?v=old"></script>')
    },
    {
      name: "sw.js",
      data: Buffer.from('const CACHE_NAME="static_vocab_shell_old";')
    }
  ]);
  const response = new Response(rawZip, {
    status: 200,
    headers: { "Content-Type": "application/zip" }
  });

  const patchedResponse = await patchStaticZipResponse(response);
  const entries = new Map(
    readStoredZipEntries(Buffer.from(await patchedResponse.arrayBuffer()))
      .map((entry) => [entry.name, entry.data.toString("utf8")])
  );

  assert.equal(patchedResponse.headers.get("x-static-export-version"), STATIC_RESPONSIVE_VERSION);
  assert.match(entries.get("assets/app.js"), new RegExp(STATIC_SWIPE_FIX_MARKER));
  assert.match(entries.get("assets/app.js"), /pointerdown/);
  assert.match(entries.get("assets/style.css"), /touch-action:pan-y/);
  assert.match(entries.get("index.html"), new RegExp(`v=${STATIC_RESPONSIVE_VERSION}`));
  assert.match(entries.get("sw.js"), new RegExp(`static_vocab_shell_${STATIC_RESPONSIVE_VERSION}`));
});
