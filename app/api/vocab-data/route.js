export const runtime = "nodejs";

import { readFile, stat } from "fs/promises";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { requireLocalRead } from "../../lib/api/local-admin-guard.mjs";
import { buildVocabDataPayload } from "../../lib/vocab/vocab-data-meta.mjs";
import { listVocabWordsFileCandidates, resolveVocabWordsFile } from "../../lib/vocab/vocab-file-meta.mjs";

let cachedSignature = "";
let cachedPayload = null;
let cachedJson = "";
let cachedBrotliPromise = null;
let cachedGzipPromise = null;

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);

async function resolveReadableWordsFile() {
  const preferred = resolveVocabWordsFile();
  const candidates = [preferred, ...listVocabWordsFileCandidates()];
  for (const file of candidates) {
    try {
      const stats = await stat(file);
      return { file, stats };
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function readCachedPayload() {
  const resolved = await resolveReadableWordsFile();
  if (!resolved) {
    cachedSignature = "";
    cachedPayload = buildVocabDataPayload("{}");
    cachedJson = JSON.stringify(cachedPayload);
    cachedBrotliPromise = null;
    cachedGzipPromise = null;
    return cachedPayload;
  }

  const { file, stats } = resolved;
  const signature = `${file}:${stats.size}:${stats.mtimeMs}`;
  if (cachedPayload && cachedSignature === signature) return cachedPayload;

  const raw = await readFile(file, "utf-8");
  cachedPayload = buildVocabDataPayload(raw || "{}");
  cachedJson = JSON.stringify(cachedPayload);
  cachedBrotliPromise = null;
  cachedGzipPromise = null;
  cachedSignature = signature;
  return cachedPayload;
}

async function encodePayload(encoding) {
  const input = Buffer.from(cachedJson, "utf8");

  if (encoding === "br") {
    if (!cachedBrotliPromise) {
      // Quality 4 is much faster to produce for ~30MB JSON while still
      // shrinking transfer size enough for local LAN / loopback.
      cachedBrotliPromise = compressBrotli(input, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 4 }
      });
    }
    return cachedBrotliPromise;
  }

  if (!cachedGzipPromise) {
    cachedGzipPromise = compressGzip(input, { level: 4 });
  }
  return cachedGzipPromise;
}

export async function GET(req) {
  const guard = requireLocalRead(req);
  if (guard) return guard;

  try {
    const payload = await readCachedPayload();
    const accepted = req.headers.get("accept-encoding") || "";
    const encoding = /\bbr\b/i.test(accepted)
      ? "br"
      : /\bgzip\b/i.test(accepted)
        ? "gzip"
        : "";

    if (!encoding) {
      return new Response(cachedJson || JSON.stringify(payload), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
          "Vary": "Accept-Encoding"
        }
      });
    }

    const body = await encodePayload(encoding);
    return new Response(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Encoding": encoding,
        "Content-Length": String(body.byteLength),
        "Content-Type": "application/json; charset=utf-8",
        "Vary": "Accept-Encoding"
      }
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error), words: [] }, { status: 500 });
  }
}
