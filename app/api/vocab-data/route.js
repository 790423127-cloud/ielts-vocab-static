export const runtime = "nodejs";

import { readFile, stat } from "fs/promises";
import { requireLocalRead } from "../../lib/api/local-admin-guard.mjs";
import { buildVocabDataPayload } from "../../lib/vocab/vocab-data-meta.mjs";
import { listVocabWordsFileCandidates, resolveVocabWordsFile } from "../../lib/vocab/vocab-file-meta.mjs";

let cachedSignature = "";
let cachedPayload = null;

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
    cachedPayload = null;
    return buildVocabDataPayload("{}");
  }

  const { file, stats } = resolved;
  const signature = `${file}:${stats.size}:${stats.mtimeMs}`;
  if (cachedPayload && cachedSignature === signature) return cachedPayload;

  const raw = await readFile(file, "utf-8");
  cachedPayload = buildVocabDataPayload(raw || "{}");
  cachedSignature = signature;
  return cachedPayload;
}

export async function GET(req) {
  const guard = requireLocalRead(req);
  if (guard) return guard;

  try {
    return Response.json(await readCachedPayload(), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error), words: [] }, { status: 500 });
  }
}
