import { existsSync, readFileSync } from "fs";
import path from "path";
import { audioIndexPath, cacheDir, normalizeAudioKey, readJson } from "../app/lib/vocab-audio-source.mjs";

const root = process.cwd();
const payload = JSON.parse(readFileSync(path.join(root, ".static-export-cache/words.json"), "utf8"));
const words = payload.words;

function isSimple(w) {
  return /^[A-Za-z][A-Za-z'-]*$/.test(String(w || "").trim());
}
function nw(w) {
  return String(w || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
    .replace(/\s+/g, " ");
}

const map = new Map();
function add(text, kind) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean || clean === "完成") return;
  const key = nw(clean);
  if (!key || map.has(key)) return;
  map.set(key, { text: clean, kind });
}

for (const w of words) {
  add(w.word, isSimple(w.word) ? "word" : "phrase");
  add(w.example, "sentence");
}

const index = readJson(audioIndexPath(), {});
let edge = 0;
let realOnly = 0;
let miss = 0;
for (const t of map.values()) {
  const e = index[normalizeAudioKey(t.text)];
  if (e?.hasAudio && e?.filename && !e.realAudio && existsSync(path.join(cacheDir(), e.filename))) edge += 1;
  else if (e?.realAudio && e?.filename && existsSync(path.join(cacheDir(), e.filename))) realOnly += 1;
  else miss += 1;
}

const byKind = { word: 0, phrase: 0, sentence: 0 };
for (const t of map.values()) byKind[t.kind] = (byKind[t.kind] || 0) + 1;

console.log(JSON.stringify({ words: words.length, targets: map.size, byKind, edgeCached: edge, realOnlyNoEdge: realOnly, needGenerate: miss }, null, 2));
