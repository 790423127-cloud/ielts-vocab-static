export const runtime = "nodejs";

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "fs";
import path from "path";
import { requireLocalAdmin } from "../../../lib/api/local-admin-guard.mjs";
import {
  buildStaticReadingWordsPublishSnapshot,
  wouldErasePublishedReadingWords
} from "../../../lib/reading-words/static-publish.mjs";
import { enrichReadingWordsSynonymDetails } from "../../../lib/reading-words/synonym-details.mjs";

function publishPath() {
  return path.join(process.cwd(), "public", "data", "personal-reading-words.json");
}

function backupPath(timestamp = Date.now()) {
  return path.join(
    process.cwd(),
    ".static-export-cache",
    "reading-words-static-publish",
    `personal-reading-words.previous-${timestamp}.json`
  );
}

function synonymCompletionPath() {
  return path.join(process.cwd(), "public", "data", "reading-g-synonym-completions.json");
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function atomicWriteJson(filePath, payload) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, filePath);
}

export async function POST(request) {
  const guard = requireLocalAdmin(request, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    const body = await request.json();
    const completionPayload = readJson(synonymCompletionPath());
    const enrichedReadingWords = enrichReadingWordsSynonymDetails(
      body?.transfer?.readingWords,
      { completionEntries: completionPayload?.entries }
    ).words;
    const enrichedTransfer = {
      ...(body?.transfer || {}),
      readingWords: enrichedReadingWords
    };
    const snapshot = buildStaticReadingWordsPublishSnapshot(enrichedTransfer, {
      sourceUpdatedAt: body?.sourceUpdatedAt
    });
    const synonymDetails = snapshot.transfer.readingWords
      .filter((entry) => Array.isArray(entry?.synonymDetails) && entry.synonymDetails.length)
      .map((entry) => ({
        id: entry.id,
        wordId: entry.wordId,
        word: entry.word,
        synonymDetails: entry.synonymDetails
      }));
    const targetPath = publishPath();
    const previous = existsSync(targetPath) ? readJson(targetPath) : null;

    if (wouldErasePublishedReadingWords(previous, snapshot)) {
      return Response.json(
        {
          ok: false,
          error: "空浏览器词库不能覆盖已有静态阅读生词。请先恢复或导入生词后再发布。"
        },
        { status: 409 }
      );
    }

    if (previous?.revision === snapshot.revision) {
      return Response.json({
        ok: true,
        changed: false,
        revision: snapshot.revision,
        wordCount: snapshot.wordCount,
        synonymDetails
      });
    }

    mkdirSync(path.dirname(targetPath), { recursive: true });
    const previousBackupPath = backupPath();
    mkdirSync(path.dirname(previousBackupPath), { recursive: true });
    if (existsSync(targetPath)) copyFileSync(targetPath, previousBackupPath);
    atomicWriteJson(targetPath, snapshot);

    return Response.json({
      ok: true,
      changed: true,
      revision: snapshot.revision,
      wordCount: snapshot.wordCount,
      synonymDetails
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || String(error) },
      { status: 400 }
    );
  }
}
