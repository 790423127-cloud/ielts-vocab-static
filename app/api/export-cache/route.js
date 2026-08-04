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
import {
  buildLexiconRetirementPayload,
  validateLexiconDeletionIntent
} from "../../lib/vocab/lexicon-delete-intent.mjs";
import { writeMasterLexiconBaseline } from "../../lib/vocab/master-lexicon-baseline-io.mjs";
import { stripWordUserState } from "../../lib/vocab/word-cache-meta.mjs";

function cacheDir() {
  return path.join(process.cwd(), ".static-export-cache");
}

function cachePath() {
  return path.join(cacheDir(), "words.json");
}

function retirementPath() {
  return path.join(process.cwd(), "app", "lib", "vocab", "master-lexicon-retirements.json");
}

function readCache() {
  try {
    if (!existsSync(cachePath())) return null;
    return JSON.parse(readFileSync(cachePath(), "utf-8") || "null");
  } catch {
    return null;
  }
}

function readRetirements() {
  try {
    if (!existsSync(retirementPath())) return { count: 0, entries: [] };
    return JSON.parse(readFileSync(retirementPath(), "utf-8") || "null");
  } catch {
    return null;
  }
}

function writeDeletionBackup(current, deletion, savedAt) {
  if (!deletion?.removed?.length || !current?.words?.length) return null;
  mkdirSync(cacheDir(), { recursive: true });
  const timestamp = String(savedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  const backupName = `words.before-delete-${timestamp}-${randomUUID()}.backup`;
  const backupPath = path.join(cacheDir(), backupName);
  const metadataPath = `${backupPath}.meta.backup`;
  writeFileSync(backupPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  writeFileSync(metadataPath, `${JSON.stringify({
    createdAt: savedAt,
    action: deletion.action,
    beforeCount: deletion.beforeCount,
    afterCount: deletion.afterCount,
    removed: deletion.removed
  }, null, 2)}\n`, "utf8");
  return {
    file: backupName,
    metadataFile: path.basename(metadataPath)
  };
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

export function buildExportCachePayload({ words, version, savedAt, metadata = {} }) {
  const preservedMetadata = { ...(metadata || {}) };
  for (const field of ["words", "count", "version", "savedAt", "lexiconHash", "integrityHash"]) {
    delete preservedMetadata[field];
  }
  const payload = {
    ...preservedMetadata,
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
  retirementFile = "",
  retirementText = "",
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
  const hasRetirementUpdate = Boolean(retirementFile && retirementText);
  const retirementTemp = hasRetirementUpdate
    ? path.join(path.dirname(retirementFile), `.${path.basename(retirementFile)}.${transactionId}.tmp`)
    : "";
  const retirementRollback = hasRetirementUpdate
    ? `${retirementFile}.${transactionId}.rollback`
    : "";
  const temporaryPaths = [cacheTemp, publicTemp, retirementTemp].filter(Boolean);
  const rollbackPaths = [cacheRollback, publicRollback, retirementRollback].filter(Boolean);
  let cacheBackedUp = false;
  let publicBackedUp = false;
  let retirementBackedUp = false;
  let cacheInstalled = false;
  let publicInstalled = false;
  let retirementInstalled = false;
  let committed = false;

  const removeIfPresent = (filePath) => {
    if (fsApi.existsSync(filePath)) fsApi.rmSync(filePath, { force: true });
  };

  try {
    fsApi.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fsApi.mkdirSync(path.dirname(publicFile), { recursive: true });
    if (hasRetirementUpdate) fsApi.mkdirSync(path.dirname(retirementFile), { recursive: true });
    fsApi.writeFileSync(cacheTemp, payloadText, "utf8");
    fsApi.writeFileSync(publicTemp, payloadText, "utf8");
    if (hasRetirementUpdate) fsApi.writeFileSync(retirementTemp, retirementText, "utf8");

    if (
      !fsApi.existsSync(cacheTemp) ||
      !fsApi.existsSync(publicTemp) ||
      (hasRetirementUpdate && !fsApi.existsSync(retirementTemp))
    ) {
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

    if (hasRetirementUpdate) {
      const preparedRetirements = fsApi.readFileSync(retirementTemp, "utf8");
      const parsedRetirements = JSON.parse(preparedRetirements);
      if (
        !Array.isArray(parsedRetirements?.entries) ||
        Number(parsedRetirements?.count) !== parsedRetirements.entries.length ||
        sha256(preparedRetirements) !== sha256(retirementText)
      ) {
        throw new Error("待发布退役记录校验失败");
      }
    }

    if (fsApi.existsSync(cacheFile)) {
      fsApi.renameSync(cacheFile, cacheRollback);
      cacheBackedUp = true;
    }
    if (fsApi.existsSync(publicFile)) {
      fsApi.renameSync(publicFile, publicRollback);
      publicBackedUp = true;
    }
    if (hasRetirementUpdate && fsApi.existsSync(retirementFile)) {
      fsApi.renameSync(retirementFile, retirementRollback);
      retirementBackedUp = true;
    }

    fsApi.renameSync(cacheTemp, cacheFile);
    cacheInstalled = true;
    fsApi.renameSync(publicTemp, publicFile);
    publicInstalled = true;
    if (hasRetirementUpdate) {
      fsApi.renameSync(retirementTemp, retirementFile);
      retirementInstalled = true;
    }

    const finalCache = fsApi.readFileSync(cacheFile);
    const finalPublic = fsApi.readFileSync(publicFile);
    if (!Buffer.from(finalCache).equals(Buffer.from(finalPublic))) {
      throw new Error("正式词库发布后字节不一致");
    }
    validatePreparedPayload(Buffer.from(finalCache).toString("utf8"), expectedCount);
    if (hasRetirementUpdate) {
      const finalRetirements = fsApi.readFileSync(retirementFile, "utf8");
      if (sha256(finalRetirements) !== sha256(retirementText)) {
        throw new Error("退役记录发布后内容不一致");
      }
    }
    committed = true;
  } catch (error) {
    const rollbackErrors = [];
    for (const [installed, target] of [
      [cacheInstalled, cacheFile],
      [publicInstalled, publicFile],
      [retirementInstalled, retirementFile]
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
      [publicBackedUp, publicRollback, publicFile],
      [retirementBackedUp, retirementRollback, retirementFile]
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
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
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
    const deletionValidation = validateLexiconDeletionIntent(
      current?.words || [],
      words,
      body.deletionIntent
    );
    if (!deletionValidation.ok) {
      return Response.json(
        {
          ok: false,
          error: deletionValidation.error,
          detail: deletionValidation.detail || ""
        },
        { status: deletionValidation.status || 409 }
      );
    }

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
    const prepared = buildExportCachePayload({
      words,
      version,
      savedAt,
      metadata: current || {}
    });
    const currentRetirements = readRetirements();
    if (deletionValidation.removed.length && !currentRetirements) {
      return Response.json(
        {
          ok: false,
          error: "无法读取主词库退役记录",
          detail: "为了避免已删除单词被后续同步重新加入，本次写入已停止。"
        },
        { status: 409 }
      );
    }
    const retirementPayload = deletionValidation.removed.length
      ? buildLexiconRetirementPayload(currentRetirements, deletionValidation.removed, {
          version,
          savedAt
        })
      : null;
    const retirementText = retirementPayload
      ? `${JSON.stringify(retirementPayload, null, 2)}\n`
      : "";
    const deletionBackup = writeDeletionBackup(current, deletionValidation, savedAt);
    const published = publishLexiconPair({
      cacheFile: cachePath(),
      publicFile: publicWordsPath,
      payloadText: prepared.text,
      expectedCount: words.length,
      retirementFile: retirementPayload ? retirementPath() : "",
      retirementText
    });

    // Keep master-lexicon-baseline.mjs in lockstep after local deletes/edits so
    // lexicon:check / start-windows.bat do not fail with a stale expected count.
    let baselineUpdated = false;
    try {
      writeMasterLexiconBaseline({
        count: words.length,
        version,
        fileHash: published.fileHash
      });
      baselineUpdated = true;
    } catch (baselineError) {
      console.error(
        "[export-cache] lexicon published, but baseline update failed:",
        baselineError instanceof Error ? baselineError.message : baselineError
      );
    }

    return Response.json({
      ok: true,
      count: words.length,
      savedAt,
      version,
      lexiconHash: prepared.payload.lexiconHash,
      integrityHash: prepared.payload.integrityHash,
      fileHash: published.fileHash,
      deletionBackup,
      baselineUpdated
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
