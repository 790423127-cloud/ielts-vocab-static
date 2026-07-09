export const runtime = "nodejs";

import { requireLocalRead } from "../../lib/api/local-admin-guard.mjs";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";

function readJson(file) {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf-8") || "null");
  } catch {
    return null;
  }
}

function extractWords(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.words)) return data.words;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function candidateFiles() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, ".static-export-cache", "words.json"),
    path.join(cwd, "out", "data", "words.json"),
    path.join(cwd, "out", "words.json"),
    path.join(cwd, "dist", "data", "words.json"),
    path.join(cwd, "dist", "words.json"),
    path.join(cwd, "public", "data", "words.json"),
    path.join(cwd, "public", "words.json"),
    path.join(cwd, "export", "data", "words.json"),
    path.join(cwd, "export", "words.json")
  ];

  try {
    const outDir = path.join(cwd, "out");
    if (existsSync(outDir)) {
      const children = readdirSync(outDir);
      children.forEach((name) => {
        candidates.push(path.join(outDir, name, "data", "words.json"));
        candidates.push(path.join(outDir, name, "words.json"));
      });
    }
  } catch {}

  return [...new Set(candidates)];
}

export async function GET(req) {
  const guard = requireLocalRead(req);
  if (guard) return guard;

  const results = [];

  for (const file of candidateFiles()) {
    const data = readJson(file);
    const words = extractWords(data);

    if (!words.length) continue;

    let size = 0;
    try {
      size = statSync(file).size;
    } catch {}

    results.push({
      file,
      count: words.length,
      size,
      savedAt: data?.savedAt || data?.updatedAt || ""
    });
  }

  results.sort((a, b) => b.count - a.count || b.size - a.size);

  if (!results.length) {
    return Response.json(
      {
        ok: false,
        error: "没有找到可恢复的本地词库文件",
        checked: candidateFiles()
      },
      { status: 404 }
    );
  }

  const best = results[0];
  const data = readJson(best.file);
  const words = extractWords(data);

  return Response.json({
    ok: true,
    source: best.file,
    count: words.length,
    results,
    words
  });
}
