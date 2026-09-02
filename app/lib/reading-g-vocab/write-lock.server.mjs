import { atomicReplaceFileSync } from "./atomic-write.server.mjs";

let writeQueue = Promise.resolve();

export async function withReadingGVocabWriteLock(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

export function atomicWriteReadingGJson(filePath, value, { pretty = true } = {}) {
  atomicReplaceFileSync(filePath, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}
