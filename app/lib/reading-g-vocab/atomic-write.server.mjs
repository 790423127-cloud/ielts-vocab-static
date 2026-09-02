import fs from "node:fs";

export const ATOMIC_WRITE_MAX_ATTEMPTS = 8;
export const ATOMIC_WRITE_RETRY_DELAY_MS = 100;

const RETRYABLE_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function removeOwnTemporaryFile(fileSystem, temporaryPath) {
  try {
    if (fileSystem.existsSync(temporaryPath)) fileSystem.unlinkSync(temporaryPath);
    return null;
  } catch (error) {
    return error;
  }
}

function createAtomicWriteError(filePath, lastError, attempts, cleanupError) {
  const code = String(lastError?.code || "");
  const retrySummary = RETRYABLE_RENAME_CODES.has(code)
    ? `文件被系统占用或拒绝访问，已自动尝试 ${attempts} 次`
    : "无法安全替换正式文件";
  const cleanupSummary = cleanupError
    ? `；本次临时文件清理失败：${cleanupError.message}`
    : "";
  const error = new Error(
    `${retrySummary}：${filePath}${cleanupSummary}。${lastError?.message || "未知文件错误"}`,
    { cause: lastError }
  );
  error.code = code || "ATOMIC_WRITE_FAILED";
  return error;
}

export function atomicReplaceFileSync(filePath, content, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const maxAttempts = Math.max(
    1,
    Math.trunc(Number(options.maxAttempts) || ATOMIC_WRITE_MAX_ATTEMPTS)
  );
  const retryDelayMs = Math.max(
    0,
    Number(options.retryDelayMs ?? ATOMIC_WRITE_RETRY_DELAY_MS)
  );
  const wait = options.wait || pause;
  const temporaryPath = options.temporaryPath
    || `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    fileSystem.writeFileSync(temporaryPath, content, options.encoding || "utf8");
  } catch (error) {
    const cleanupError = removeOwnTemporaryFile(fileSystem, temporaryPath);
    throw createAtomicWriteError(filePath, error, 1, cleanupError);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fileSystem.renameSync(temporaryPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      const shouldRetry = RETRYABLE_RENAME_CODES.has(String(error?.code || ""));
      if (!shouldRetry || attempt >= maxAttempts) break;
      wait(retryDelayMs * attempt);
    }
  }

  const cleanupError = removeOwnTemporaryFile(fileSystem, temporaryPath);
  throw createAtomicWriteError(filePath, lastError, maxAttempts, cleanupError);
}
