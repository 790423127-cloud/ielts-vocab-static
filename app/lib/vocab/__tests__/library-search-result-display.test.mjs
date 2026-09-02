import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../../..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("word-library search results show concise meanings instead of source locations", () => {
  const component = read("app/components/SatelliteLexiconFlashcard.jsx");
  const css = read("app/globals.css");

  assert.match(
    component,
    /const libraryMeaning = fallback\(\s*getStudyEntryDisplay\(word\)\.meaning,\s*"释义待补"\s*\)/
  );
  assert.match(component, /<div className="library-meta">\s*\{libraryMeaning\}\s*<\/div>/);
  assert.doesNotMatch(component, /const metaBits = \[\]/);
  assert.match(css, /\.library-word\s*\{[^}]*text-overflow:\s*ellipsis;/s);
  assert.match(css, /\.library-meta\s*\{[^}]*text-overflow:\s*ellipsis;/s);
});

test("global header search renders inline results without opening the library panel", () => {
  const header = read("app/components/GlobalStudyHeader.jsx");
  const satellite = read("app/components/SatelliteLexiconFlashcard.jsx");
  const wordFlash = read("app/components/WordFlashcardView.jsx");
  const css = read("app/globals.css");

  assert.match(header, /className="study-global-search-results"/);
  assert.match(header, /CURRENT_SYSTEM_SEARCH_SELECT_EVENT/);
  assert.match(satellite, /CURRENT_SYSTEM_SEARCH_RESULTS_EVENT/);
  assert.match(wordFlash, /CURRENT_SYSTEM_SEARCH_RESULTS_EVENT/);
  assert.doesNotMatch(satellite, /setSearch\(query\);\s*if \(libraryMenuRef\.current\)/);
  assert.doesNotMatch(wordFlash, /CURRENT_SYSTEM_SEARCH_REQUEST_EVENT, handleSearch/);
  assert.match(css, /\.study-global-search-results\s*\{[^}]*position:\s*absolute;/s);
});
