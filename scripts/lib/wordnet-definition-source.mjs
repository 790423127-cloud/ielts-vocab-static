import fs from "node:fs";
import path from "node:path";
import wordnetDb from "wordnet-db";

const POS_FILES = ["noun", "verb", "adj", "adv"];
const indexCache = new Map();
const dataCache = new Map();

function readIndex(pos) {
  if (indexCache.has(pos)) return indexCache.get(pos);
  const entries = new Map();
  const source = fs.readFileSync(path.join(wordnetDb.path, `index.${pos}`), "utf8");

  for (const line of source.split(/\r?\n/)) {
    if (!line || /^\s/.test(line)) continue;
    const fields = line.trim().split(/\s+/);
    const lemma = fields[0];
    const synsetCount = Number(fields[2]);
    const pointerCount = Number(fields[3]);
    const offsetStart = 6 + pointerCount;
    entries.set(lemma, fields.slice(offsetStart, offsetStart + synsetCount));
  }

  indexCache.set(pos, entries);
  return entries;
}

function readData(pos) {
  if (dataCache.has(pos)) return dataCache.get(pos);
  const entries = new Map();
  const source = fs.readFileSync(path.join(wordnetDb.path, `data.${pos}`), "utf8");

  for (const line of source.split(/\r?\n/)) {
    if (!line || /^\s/.test(line)) continue;
    const separator = line.indexOf("|");
    if (separator < 0) continue;
    const offset = line.slice(0, 8);
    const gloss = line.slice(separator + 1).trim().replace(/;\s*".*$/u, "").trim();
    if (gloss) entries.set(offset, gloss);
  }

  dataCache.set(pos, entries);
  return entries;
}

function positionCandidates(value = "") {
  const pos = String(value).toLowerCase();
  const matches = [];
  if (/noun|(^|[\s/.,])n([\s/.,]|$)/.test(pos)) matches.push("noun");
  if (/verb|(^|[\s/.,])v([\s/.,]|$)/.test(pos)) matches.push("verb");
  if (/adjective|(^|[\s/.,])adj([\s/.,]|$)/.test(pos)) matches.push("adj");
  if (/adverb|(^|[\s/.,])adv([\s/.,]|$)/.test(pos)) matches.push("adv");
  return matches.length ? matches : POS_FILES;
}

function lemmaCandidates(value = "") {
  const word = String(value).trim().toLowerCase();
  return [...new Set([
    word,
    word.replace(/[ -]+/g, "_"),
    word.replace(/[ -]+/g, ""),
    word.replace(/-/g, "_")
  ].filter(Boolean))];
}

export function getWordNetDefinition(word, pos = "") {
  const definitions = [];

  for (const position of positionCandidates(pos)) {
    const index = readIndex(position);
    const data = readData(position);
    let offsets;
    for (const lemma of lemmaCandidates(word)) {
      offsets = index.get(lemma);
      if (offsets?.length) break;
    }
    if (!offsets?.length) continue;
    const gloss = data.get(offsets[0]);
    if (gloss && !definitions.includes(gloss)) definitions.push(gloss);
    if (definitions.length >= 2) break;
  }

  return definitions.join("; ");
}

export function resetWordNetCachesForTests() {
  indexCache.clear();
  dataCache.clear();
}
