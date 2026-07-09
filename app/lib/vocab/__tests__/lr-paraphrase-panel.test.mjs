import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const panelPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../components/LrParaphrasePanel.jsx");
const panelSource = fs.readFileSync(panelPath, "utf8");

test("LrParaphrasePanel keeps per-tab positions instead of resetting to zero", () => {
  assert.match(panelSource, /viewPositionsRef/);
  assert.match(panelSource, /positions:\s*viewPositionsRef\.current/);
  assert.doesNotMatch(panelSource, /setIndex\(0\);\s*\}, \[viewMode, studyItems\.length\]\)/);
});

test("LrParaphrasePanel uses IndexedDB cache loader", () => {
  assert.match(panelSource, /loadParaphrasesWithCache/);
  assert.match(panelSource, /loadLrSynonyms/);
});

test("LrParaphrasePanel debounces session persist and supports TTS", () => {
  assert.match(panelSource, /SESSION_PERSIST_DEBOUNCE_MS/);
  assert.match(panelSource, /queueSessionPersist/);
  assert.match(panelSource, /pagehide/);
  assert.match(panelSource, /fetchSpeechAudioResult/);
  assert.match(panelSource, /speakBaseWord/);
});