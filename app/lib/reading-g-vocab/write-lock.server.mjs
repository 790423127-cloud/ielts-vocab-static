import fs from "node:fs";

let writeQueue = Promise.resolve();

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export async function withReadingGVocabWriteLock(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

export function atomicWriteReadingGJson(filePath, value, { pretty = true } = {}) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.renameSync(temporaryPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 4 && error?.code === "EPERM") pause(60 * (attempt + 1));
      else break;
    }
  }
  try {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  } catch {}
  throw lastError;
}
