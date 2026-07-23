export const runtime = "nodejs";

import { requireLocalAdmin, requireLocalRead } from "../../lib/api/local-admin-guard.mjs";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "fs";
import { createHash, randomUUID } from "node:crypto";
import path from "path";
import {
  LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES,
  computeIntegrityHash,
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

const DEFAULT_FILE_SYSTEM = {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
};

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function buildExportCachePayload({ words, version, savedAt }) {
  const payload = {
    version: String(version || "").trim(),
    words,
    count: words.length,
    savedAt,
    lexiconHash: computeLexiconHash(words),
    integrityHash: computeIntegrityHash(words)
  };
  const text = JSON.stringify(payload, null, 2);
  return { payload, text, fileHash: sha256(text) };
}

function validatePreparedPayload(text, expectedCount) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.words)) {
    throw new Error("待发布词库不是预期的words数组结构");
  }
  if (parsed.count !== expectedCount || parsed.words.length !== expectedCount) {
    throw new Error("待发布词库数量校验失败");
  }
  if (parsed.lexiconHash !== computeLexiconHash(parsed.words)) {
    throw new Error("待发布词库lexiconHash校验失败");
  }
  if (parsed.integrityHash !== computeIntegrityHash(parsed.words)) {
    throw new Error("待发布词库integrityHash校验失败");
  }
  return parsed;
}

export function publishLexiconPair({
  cacheFile,
  publicFile,
  payloadText,
  expectedCount,
  fsApi = DEFAULT_FILE_SYSTEM,
  transactionId = randomUUID()
}) {
  const cacheTemp = path.join(
    path.dirname(cacheFile),
    `.${path.basename(cacheFile)}.${transactionId}.tmp`
  );
  const publicTemp = path.join(
    path.dirname(publicFile),
    `.${path.basename(publicFile)}.${transactionId}.tmp`
  );
  const cacheRollback = `${cacheFile}.${transactionId}.rollback`;
  const publicRollback = `${publicFile}.${transactionId}.rollback`;
  const temporaryPaths = [cacheTemp, publicTemp];
  const rollbackPaths = [cacheRollback, publicRollback];
  let cacheBackedUp = false;
  let publicBackedUp = false;
  let cacheInstalled = false;
  let publicInstalled = false;
  let committed = false;

  const removeIfPresent = (filePath) => {
    if (fsApi.existsSync(filePath)) fsApi.rmSync(filePath, { force: true });
  };

  try {
    fsApi.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fsApi.mkdirSync(path.dirname(publicFile), { recursive: true });
    fsApi.writeFileSync(cacheTemp, payloadText, "utf8");
    fsApi.writeFileSync(publicTemp, payloadText, "utf8");

    if (!fsApi.existsSync(cacheTemp) || !fsApi.existsSync(publicTemp)) {
      throw new Error("待发布临时文件缺失");
    }
    const cachePrepared = fsApi.readFileSync(cacheTemp);
    const publicPrepared = fsApi.readFileSync(publicTemp);
    if (!Buffer.from(cachePrepared).equals(Buffer.from(publicPrepared))) {
      throw new Error("两份待发布临时文件字节不一致");
    }
    const preparedText = Buffer.from(cachePrepared).toString("utf8");
    validatePreparedPayload(preparedText, expectedCount);
    if (sha256(preparedText) !== sha256(payloadText)) {
      throw new Error("待发布临时文件hash与内存内容不一致");
    }

    if (fsApi.existsSync(cacheFile)) {
      fsApi.renameSync(cacheFile, cacheRollback);
      cacheBackedUp = true;
    }
    if (fsApi.existsSync(publicFile)) {
      fsApi.renameSync(publicFile, publicRollback);
      publicBackedUp = true;
    }

    fsApi.renameSync(cacheTemp, cacheFile);
    cacheInstalled = true;
    fsApi.renameSync(publicTemp, publicFile);
    publicInstalled = true;

    const finalCache = fsApi.readFileSync(cacheFile);
    const finalPublic = fsApi.readFileSync(publicFile);
    if (!Buffer.from(finalCache).equals(Buffer.from(finalPublic))) {
      throw new Error("正式词库发布后字节不一致");
    }
    validatePreparedPayload(Buffer.from(finalCache).toString("utf8"), expectedCount);
    committed = true;
  } catch (error) {
    const rollbackErrors = [];
    for (const [installed, target] of [
      [cacheInstalled, cacheFile],
      [publicInstalled, publicFile]
    ]) {
      if (!installed) continue;
      try {
        removeIfPresent(target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const [backedUp, rollbackFile, target] of [
      [cacheBackedUp, cacheRollback, cacheFile],
      [publicBackedUp, publicRollback, publicFile]
    ]) {
      if (!backedUp) continue;
      try {
        fsApi.renameSync(rollbackFile, target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      error.rollbackErrors = rollbackErrors;
      error.message = `${error.message}；回滚失败：${rollbackErrors.map((item) => item.message).join("；")}`;
    }
    throw error;
  } finally {
    for (const filePath of temporaryPaths) {
      try {
        removeIfPresent(filePath);
      } catch {}
    }
    if (committed) {
      for (const filePath of rollbackPaths) {
        try {
          removeIfPresent(filePath);
        } catch {}
      }
    }
  }

  return {
    ok: true,
    fileHash: sha256(payloadText),
    count: expectedCount
  };
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
    const publicWordsPath = path.join(process.cwd(), "public", "data", "words.json");
    const prepared = buildExportCachePayload({ words, version, savedAt });
    const published = publishLexiconPair({
      cacheFile: cachePath(),
      publicFile: publicWordsPath,
      payloadText: prepared.text,
      expectedCount: words.length
    });

    return Response.json({
      ok: true,
      count: words.length,
      savedAt,
      version,
      lexiconHash: prepared.payload.lexiconHash,
      integrityHash: prepared.payload.integrityHash,
      fileHash: published.fileHash
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
