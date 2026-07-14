import { existsSync, readFileSync } from "fs";
import path from "path";
import { audioIndexPath, cacheDir, normalizeAudioKey, readJson } from "../app/lib/vocab-audio-source.mjs";

const payload = JSON.parse(readFileSync(path.join(process.cwd(), ".static-export-cache/words.json"), "utf8"));
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
const edge = { word: 0, phrase: 0, sentence: 0 };
const realOnly = { word: 0, phrase: 0, sentence: 0 };
const miss = { word: 0, phrase: 0, sentence: 0 };

for (const t of map.values()) {
  const e = index[normalizeAudioKey(t.text)];
  const hasEdge = e?.hasAudio && e?.filename && !e.realAudio && existsSync(path.join(cacheDir(), e.filename));
  const hasReal = e?.realAudio && e?.filename && existsSync(path.join(cacheDir(), e.filename));
  if (hasEdge) edge[t.kind] += 1;
  else if (hasReal) realOnly[t.kind] += 1;
  else miss[t.kind] += 1;
}

const needWord = miss.word + realOnly.word;
const needSentence = miss.sentence + realOnly.sentence;
const needAll = needWord + needSentence + miss.phrase + realOnly.phrase;

console.log(JSON.stringify({
  libraryWords: words.length,
  uniqueTargets: map.size,
  edgeCached: edge,
  realOnlyNeedEdge: realOnly,
  completelyMissing: miss,
  stillNeedEdgeGenerate: {
    word: needWord,
    sentence: needSentence,
    total: needAll
  },
  alreadyEdgeOk: {
    word: edge.word,
    sentence: edge.sentence,
    total: edge.word + edge.phrase + edge.sentence
  }
}, null, 2));
