export const runtime = "nodejs";

import { open } from "fs/promises";
import path from "path";

const HEAD_BYTES = 8192;

async function readHead(filePath, bytes = HEAD_BYTES) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function readJsonCount(relativePath) {
  const filePath = path.join(process.cwd(), "public", "data", relativePath);
  const head = await readHead(filePath);
  const match = head.match(/"count"\s*:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

export async function GET() {
  try {
    const [phraseCount, lrSynonymCount] = await Promise.all([
      readJsonCount("phrases.json"),
      readJsonCount("listening-reading-synonyms.json")
    ]);

    return Response.json(
      {
        ok: true,
        phraseCount,
        lrSynonymCount,
        sources: {
          phrases: "/data/phrases.json",
          lrSynonyms: "/data/listening-reading-synonyms.json"
        }
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
