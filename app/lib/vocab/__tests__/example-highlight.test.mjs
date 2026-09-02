import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import {
  getExampleHighlightTargets,
  splitExampleForHighlight
} from "../example-highlight.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function compactSegments(segments) {
  return segments.map((segment) => [segment.text, segment.highlighted]);
}

test("highlights the holder headword and its listed forms as complete words", () => {
  const item = {
    word: "holder",
    forms: [{ word: "holder's" }, { word: "holders" }]
  };
  const targets = getExampleHighlightTargets(item);

  assert.deepEqual(
    compactSegments(splitExampleForHighlight("The holder and holders entered the stakeholder meeting.", targets)),
    [
      ["The ", false],
      ["holder", true],
      [" and ", false],
      ["holders", true],
      [" entered the stakeholder meeting.", false]
    ]
  );
});

test("supports phrases, flexible spaces, and straight or curly apostrophes", () => {
  const phraseTargets = getExampleHighlightTargets({ word: "be responsible for" });
  assert.deepEqual(
    compactSegments(splitExampleForHighlight("You may be  responsible for the account.", phraseTargets)),
    [["You may ", false], ["be  responsible for", true], [" the account.", false]]
  );

  const possessiveTargets = getExampleHighlightTargets({
    word: "holder",
    forms: [{ word: "holder's" }]
  });
  assert.deepEqual(
    compactSegments(splitExampleForHighlight("The holder’s name is required.", possessiveTargets)),
    [["The ", false], ["holder’s", true], [" name is required.", false]]
  );
});

test("infers safe grammatical forms used by the sentence", () => {
  const resembleTargets = getExampleHighlightTargets({ word: "resemble" });
  assert.deepEqual(
    compactSegments(splitExampleForHighlight("The new room resembles the old one.", resembleTargets)),
    [["The new room ", false], ["resembles", true], [" the old one.", false]]
  );

  const goTargets = getExampleHighlightTargets({ word: "go" });
  assert.deepEqual(
    compactSegments(splitExampleForHighlight("She went home and has gone to bed.", goTargets)),
    [["She ", false], ["went", true], [" home and has ", false], ["gone", true], [" to bed.", false]]
  );

  const feeTargets = getExampleHighlightTargets({ word: "fee" });
  assert.deepEqual(
    compactSegments(splitExampleForHighlight("The fee will feed the service.", feeTargets)),
    [["The ", false], ["fee", true], [" will feed the service.", false]]
  );
});

test("standalone static pages use the same matching results and load the shared renderer first", () => {
  const context = { window: {} };
  vm.runInNewContext(read("public/assets/example-highlight.js"), context);
  context.window.IeltsExampleHighlight.setMorphology({
    isDirectSurfaceInflection(base, candidate) {
      return base === "resemble" && candidate === "resembles";
    }
  });
  const item = { word: "holder", forms: [{ word: "holders" }] };
  const sentence = "The holder and holders entered.";
  const appResult = splitExampleForHighlight(sentence, getExampleHighlightTargets(item));
  const staticResult = context.window.IeltsExampleHighlight.segments(
    sentence,
    context.window.IeltsExampleHighlight.targetsForItem(item)
  );
  assert.equal(JSON.stringify(staticResult), JSON.stringify(appResult));
  assert.equal(
    JSON.stringify(context.window.IeltsExampleHighlight.segments("It resembles the sample.", ["resemble"])),
    JSON.stringify(splitExampleForHighlight("It resembles the sample.", ["resemble"]))
  );

  const staticSurfaces = [
    ["public/basic.html", "assets/basic.js"],
    ["public/reading-g.html", "assets/reading-g.js"],
    ["public/reading-words.html", "assets/reading-words.js"],
    ["public/ielts-538.html", "assets/ielts-538.js"]
  ];
  staticSurfaces.forEach(([htmlPath, appAsset]) => {
    const html = read(htmlPath);
    assert.ok(html.indexOf("assets/example-highlight.js") < html.indexOf(appAsset), htmlPath);
  });

  ["basic.js", "reading-g.js", "reading-words.js", "ielts-538.js"].forEach((name) => {
    assert.match(read(`public/assets/${name}`), /IeltsExampleHighlight\.render/);
  });

  const exportRoute = read("app/api/export-static/route.js");
  assert.match(exportRoute, /name: "assets\/example-highlight\.js"/);
  assert.match(exportRoute, /assets\/example-highlight\.js\?v=\$\{STATIC_EXPORT_VERSION\}/);
  assert.match(exportRoute, /IeltsExampleHighlight\.render\(els\.example/);
});
