export const runtime = "nodejs";

import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";

import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "fs";
import path from "path";

function cacheDir() {
  const dir = path.join(process.cwd(), ".audio-cache");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function audioIndexPath() {
  return path.join(cacheDir(), "audio-index.json");
}

function readJson(file, fallback = {}) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf-8") || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export async function POST(req) {
  const guard = requireLocalAdmin(req);
  if (guard) return guard;

  try {
    const dir = cacheDir();

    const files = readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith(".mp3"))
      .map((name) => {
        const filepath = path.join(dir, name);
        const stat = statSync(filepath);

        return {
          name,
          filepath,
          size: stat.size
        };
      })
      .filter((item) => item.size > 0);

    const byHash = new Map();
    const deleted = [];
    const replacements = {};

    for (const file of files) {
      const hash = sha256File(file.filepath);
      const kept = byHash.get(hash);

      if (!kept) {
        byHash.set(hash, file);
        continue;
      }

      replacements[file.name] = kept.name;
      unlinkSync(file.filepath);
      deleted.push({
        deleted: file.name,
        kept: kept.name,
        size: file.size
      });
    }

    const audioIndex = readJson(audioIndexPath(), {});
    let updatedIndex = 0;

    Object.keys(audioIndex).forEach((key) => {
      const item = audioIndex[key];

      if (item?.filename && replacements[item.filename]) {
        audioIndex[key] = {
          ...item,
          filename: replacements[item.filename],
          dedupedAt: Date.now()
        };
        updatedIndex += 1;
      }
    });

    writeJson(audioIndexPath(), audioIndex);

    const afterFiles = readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".mp3")).length;

    return Response.json({
      ok: true,
      beforeFiles: files.length,
      afterFiles,
      removedFiles: deleted.length,
      updatedIndex,
      savedBytes: deleted.reduce((sum, item) => sum + item.size, 0),
      deleted
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "本地清理重复音频失败",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
