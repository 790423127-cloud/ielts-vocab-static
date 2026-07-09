export const runtime = "nodejs";

import { requireLocalAdmin, requireLocalRead } from "../../lib/api/local-admin-guard.mjs";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES,
  computeLexiconHash,
  validateExportCacheWrite
} from "../../lib/vocab/lexicon-guard.mjs";
import { stripWordUserState } from "../../lib/vocab/word-cache-meta.mjs";

function cacheDir() {
  return path.join(process.cwd(), ".static-export-cache");
}

function cachePath() {
  return path.join(cacheDir(), "words.json");
}

function readCache() {
  try {
    if (!existsSync(cachePath())) return null;
    return JSON.parse(readFileSync(cachePath(), "utf-8") || "null");
  } catch {
    return null;
  }
}

export async function POST(req) {
  const guard = requireLocalAdmin(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    const words = Array.isArray(body.words) ? body.words.map(stripWordUserState) : [];

    if (!words.length) {
      return Response.json(
        { ok: false, error: "没有可缓存的词库" },
        { status: 400 }
      );
    }

    if (words.length < 1000 && !body.allowSmall) {
      return Response.json(
        {
          ok: false,
          error: "拒绝用少量词覆盖发布缓存",
          detail: `当前只有 ${words.length} 个词，疑似词库尚未恢复。`
        },
        { status: 409 }
      );
    }

    const current = readCache();
    const validation = validateExportCacheWrite({ ...body, words }, current);
    if (!validation.ok) {
      console.error("[export-cache] rejected write:", validation.error, validation.detail || "");
      return Response.json(
        {
          ok: false,
          error: validation.error,
          detail: validation.detail || ""
        },
        { status: validation.status || 409 }
      );
    }

    const savedAt = new Date().toISOString();
    const version = String(
      body.version ||
        current?.version ||
        LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES
    ).trim();
    const lexiconHash = computeLexiconHash(words);

    mkdirSync(cacheDir(), { recursive: true });

    const payloadText = JSON.stringify(
      {
        version,
        words,
        count: words.length,
        savedAt,
        lexiconHash,
        integrityHash: current?.integrityHash || ""
      },
      null,
      2
    );

    writeFileSync(cachePath(), payloadText, "utf-8");

    // Keep static public path aligned so browser /data/words.json fallback stays fresh.
    const publicWordsPath = path.join(process.cwd(), "public", "data", "words.json");
    mkdirSync(path.dirname(publicWordsPath), { recursive: true });
    writeFileSync(publicWordsPath, payloadText, "utf-8");

    return Response.json({
      ok: true,
      count: words.length,
      savedAt,
      version,
      lexiconHash
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "保存发布缓存失败",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  const guard = requireLocalRead(req);
  if (guard) return guard;

  const cached = readCache();

  if (!cached || !Array.isArray(cached.words) || !cached.words.length) {
    return Response.json(
      {
        ok: false,
        error: "还没有发布缓存",
        detail: "请先打开 http://localhost:3000 一次，让网页自动把词库保存到发布缓存。"
      },
      { status: 404 }
    );
  }

  return Response.json({
    ok: true,
    count: cached.words.length,
    savedAt: cached.savedAt || "",
    version: cached.version || "",
    lexiconHash: cached.lexiconHash || ""
  });
}
