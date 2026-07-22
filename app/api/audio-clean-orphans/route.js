export const runtime = "nodejs";

import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";

import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import path from "path";

function normalizeWord(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf-8") || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function collectAllowedAudioKeys(words) {
  const keys = new Set();

  ensureArray(words).forEach((word) => {
    const mainWord = normalizeWord(word?.word);
    if (!mainWord) return;

    keys.add(mainWord);

    ensureArray(word?.collocations).forEach((item) => {
      const text = normalizeWord(item?.phrase || item?.word || item?.collocation || item?.text || item);
      if (text) keys.add(text);
    });

    ensureArray(word?.phraseCollocations).forEach((item) => {
      const text = normalizeWord(item?.phrase || item?.word || item?.collocation || item?.text || item);
      if (text) keys.add(text);
    });

    ensureArray(word?.forms).forEach((item) => {
      const text = normalizeWord(item?.word || item?.form || item?.text || item);
      if (text) keys.add(text);
    });

    ensureArray(word?.wordFamily).forEach((item) => {
      const text = normalizeWord(item?.word || item?.form || item?.text || item);
      if (text) keys.add(text);
    });
  });

  return keys;
}

function pathFromIndexEntry(entry) {
  if (!entry) return "";

  if (typeof entry === "string") return entry;

  return entry.file || entry.filePath || entry.path || entry.audioPath || "";
}

function likelyWordKeyFromFileName(file) {
  const base = path.basename(file).replace(/\.(mp3|wav|ogg|m4a)$/i, "");
  return normalizeWord(base.replace(/_/g, " "));
}

function fileExistsInsideAudioCache(audioDir, value) {
  const raw = String(value || "");
  if (!raw) return "";

  const candidates = [
    path.isAbsolute(raw) ? raw : path.join(audioDir, raw),
    path.join(process.cwd(), raw.replace(/^\/+/, "")),
    path.join(audioDir, path.basename(raw))
  ];

  return candidates.find((file) => existsSync(file)) || "";
}

export async function POST(req) {
  const guard = requireLocalAdmin(req);
  if (guard) return guard;

  try {
    const body = await req.json().catch(() => ({}));
    const words = ensureArray(body.words);
    // Destructive cleanup requires an explicit opt-in. A missing flag is preview-only.
    const dryRun = body.dryRun !== false;

    if (!words.length) {
      return Response.json(
        { ok: false, error: "缺少当前词库 words，无法判断哪些音频无关" },
        { status: 400 }
      );
    }

    const audioDir = path.join(process.cwd(), ".audio-cache");
    const indexFile = path.join(audioDir, "audio-index.json");

    if (!existsSync(audioDir)) {
      return Response.json({
        ok: true,
        dryRun,
        message: ".audio-cache 不存在，无需清理",
        checkedFiles: 0,
        orphanFiles: 0,
        removedFiles: 0,
        savedBytes: 0,
        removedIndexKeys: 0,
        samples: []
      });
    }

    const allowedKeys = collectAllowedAudioKeys(words);
    const index = readJson(indexFile, {});
    const orphanFiles = new Set();
    const removedIndexKeys = [];
    const samples = [];

    Object.entries(index || {}).forEach(([key, entry]) => {
      const normalizedKey = normalizeWord(key);
      const file = fileExistsInsideAudioCache(audioDir, pathFromIndexEntry(entry));

      if (!normalizedKey || allowedKeys.has(normalizedKey)) return;

      removedIndexKeys.push(key);

      if (file) {
        orphanFiles.add(file);
        if (samples.length < 20) samples.push({ key, file: path.relative(process.cwd(), file) });
      } else if (samples.length < 20) {
        samples.push({ key, file: "" });
      }
    });

    const allMp3Files = [];

    function walk(dir) {
      let entries = [];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      entries.forEach((entry) => {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(full);
          return;
        }

        if (/\.(mp3|wav|ogg|m4a)$/i.test(entry.name)) {
          allMp3Files.push(full);
        }
      });
    }

    walk(audioDir);

    allMp3Files.forEach((file) => {
      const guessedKey = likelyWordKeyFromFileName(file);

      if (!guessedKey) return;

      // 只清理非常明确的“文件名能反推出词条、但词库里不存在”的音频。
      // audio-index.json 里已经命中的文件上面会处理。
      if (!allowedKeys.has(guessedKey)) {
        orphanFiles.add(file);
        if (samples.length < 20) {
          samples.push({ key: guessedKey, file: path.relative(process.cwd(), file) });
        }
      }
    });

    let savedBytes = 0;
    let removedFiles = 0;

    if (!dryRun) {
      orphanFiles.forEach((file) => {
        try {
          const size = statSync(file).size || 0;
          rmSync(file, { force: true });
          savedBytes += size;
          removedFiles += 1;
        } catch {}
      });

      if (index && typeof index === "object") {
        removedIndexKeys.forEach((key) => {
          delete index[key];
        });

        if (existsSync(indexFile)) writeJson(indexFile, index);
      }
    } else {
      orphanFiles.forEach((file) => {
        try {
          savedBytes += statSync(file).size || 0;
        } catch {}
      });
    }

    return Response.json({
      ok: true,
      dryRun,
      checkedFiles: allMp3Files.length,
      allowedKeys: allowedKeys.size,
      orphanFiles: orphanFiles.size,
      removedFiles,
      savedBytes,
      removedIndexKeys: removedIndexKeys.length,
      samples
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "清理无关音频失败",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
