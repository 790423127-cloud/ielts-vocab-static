export const runtime = "nodejs";

import { readVocabFileMeta } from "../../lib/vocab/vocab-file-meta.mjs";

export async function GET() {
  try {
    const meta = readVocabFileMeta();

    if (!meta?.count) {
      return Response.json({ ok: false, error: "Vocabulary file not found" }, { status: 404 });
    }

    return Response.json(
      {
        ok: true,
        count: meta.count,
        version: meta.version,
        savedAt: meta.savedAt,
        lexiconHash: meta.lexiconHash,
        integrityHash: meta.integrityHash || "",
        bytes: meta.bytes || 0
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}