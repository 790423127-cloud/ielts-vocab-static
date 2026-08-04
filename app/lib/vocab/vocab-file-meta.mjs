import { existsSync, fstatSync, openSync, readFileSync, readSync, closeSync } from "node:fs";
import path from "node:path";

const META_TAIL_BYTES = 1536;
const META_HEAD_BYTES = 8192;

function lastMatchedValue(text, pattern, fallback = "") {
  const matches = [...String(text || "").matchAll(pattern)];
  return matches.at(-1)?.[1] ?? fallback;
}

export function resolveVocabWordsFile(cwd = process.cwd()) {
  const cachePath = path.join(cwd, ".static-export-cache", "words.json");
  const publicPath = path.join(cwd, "public", "data", "words.json");
  if (existsSync(cachePath)) return cachePath;
  if (existsSync(publicPath)) return publicPath;
  return cachePath;
}

export function listVocabWordsFileCandidates(cwd = process.cwd()) {
  return [
    path.join(cwd, ".static-export-cache", "words.json"),
    path.join(cwd, "public", "data", "words.json")
  ];
}

export function readVocabFileMetaFast(filePath = resolveVocabWordsFile()) {
  if (!existsSync(filePath)) {
    return null;
  }

  const fd = openSync(filePath, "r");

  try {
    const stat = fstatSync(fd);
    const headSize = Math.min(META_HEAD_BYTES, stat.size);
    const tailSize = Math.min(META_TAIL_BYTES, stat.size);
    const headBuf = Buffer.alloc(headSize);
    const tailBuf = Buffer.alloc(tailSize);

    readSync(fd, headBuf, 0, headSize, 0);
    readSync(fd, tailBuf, 0, tailSize, Math.max(0, stat.size - tailSize));

    const head = headBuf.toString("utf8");
    const tail = tailBuf.toString("utf8");
    // The file may start with nested audit objects that have their own
    // `version`. The formal lexicon version is the top-level value directly
    // before the `words` array, not the first `version` token in the file.
    const rootVersion = head.match(
      /"version"\s*:\s*"([^"]+)"\s*,\s*"words"\s*:/s
    )?.[1] || "";

    return {
      bytes: stat.size,
      version: rootVersion,
      count: Number(lastMatchedValue(tail, /"count"\s*:\s*(\d+)/g, 0)),
      savedAt: lastMatchedValue(tail, /"savedAt"\s*:\s*"([^"]+)"/g),
      lexiconHash: lastMatchedValue(tail, /"lexiconHash"\s*:\s*"([^"]+)"/g),
      integrityHash: lastMatchedValue(tail, /"integrityHash"\s*:\s*"([^"]+)"/g)
    };
  } finally {
    closeSync(fd);
  }
}

export function readVocabFileMeta(filePath = resolveVocabWordsFile()) {
  const fast = readVocabFileMetaFast(filePath);
  if (fast?.version && fast?.count && fast?.lexiconHash) {
    return fast;
  }

  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const words = Array.isArray(parsed?.words) ? parsed.words : Array.isArray(parsed) ? parsed : [];

  return {
    bytes: Buffer.byteLength(raw, "utf8"),
    version: String(parsed?.version || ""),
    count: Number(parsed?.count || words.length),
    savedAt: String(parsed?.savedAt || ""),
    lexiconHash: String(parsed?.lexiconHash || ""),
    integrityHash: String(parsed?.integrityHash || "")
  };
}
