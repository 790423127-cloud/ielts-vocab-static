import { existsSync, fstatSync, openSync, readFileSync, readSync, closeSync } from "node:fs";
import path from "node:path";

const META_TAIL_BYTES = 1536;
const META_HEAD_BYTES = 1024;

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

    return {
      bytes: stat.size,
      version: head.match(/"version"\s*:\s*"([^"]+)"/)?.[1] || "",
      count: Number(tail.match(/"count"\s*:\s*(\d+)/)?.[1] || 0),
      savedAt: tail.match(/"savedAt"\s*:\s*"([^"]+)"/)?.[1] || "",
      lexiconHash: tail.match(/"lexiconHash"\s*:\s*"([^"]+)"/)?.[1] || "",
      integrityHash: tail.match(/"integrityHash"\s*:\s*"([^"]+)"/)?.[1] || ""
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