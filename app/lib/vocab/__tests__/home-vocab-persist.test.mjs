import test from "node:test";
import assert from "node:assert/strict";
import { persistWordsWithLocalStore } from "../../../hooks/useHomeVocabBootstrap.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("persistWordsWithLocalStore returns a thenable that waits for storage completion", async () => {
  const transaction = deferred();
  let settled = false;
  const saving = persistWordsWithLocalStore([{ id: "a", word: "alpha" }], {
    isFullVocab: () => true,
    saveWords: () => transaction.promise,
    compactAndRetry: () => {
      throw new Error("retry should not run");
    }
  });

  assert.equal(typeof saving?.then, "function");
  saving.finally(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);

  transaction.resolve(true);
  const result = await saving;
  assert.equal(settled, true);
  assert.deepEqual(result, { ok: true, status: "local-saved", recovered: false });
});

test("persistWordsWithLocalStore rejects clearly after save and recovery both fail", async () => {
  const statuses = [];
  await assert.rejects(
    persistWordsWithLocalStore([{ id: "a", word: "alpha" }], {
      isFullVocab: () => true,
      saveWords: async () => {
        throw new Error("transaction failed");
      },
      compactAndRetry: async () => {
        throw new Error("retry failed");
      },
      onStatus: (message) => statuses.push(message)
    }),
    { code: "LOCAL_SAVE_FAILED", status: "local-save-failed" }
  );
  assert.match(statuses.at(-1), /本地保存失败/);
});

test("persistWordsWithLocalStore resolves only after a successful recovery save", async () => {
  const calls = [];
  const result = await persistWordsWithLocalStore([{ id: "a", word: "alpha" }], {
    isFullVocab: () => true,
    saveWords: async () => {
      calls.push("initial");
      throw new Error("quota");
    },
    compactAndRetry: async () => {
      calls.push("recovered");
    }
  });

  assert.deepEqual(calls, ["initial", "recovered"]);
  assert.deepEqual(result, { ok: true, status: "local-saved", recovered: true });
});

test("confirmed main deletion write is registered before a state update can autosave", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/hooks/useHomeLexiconAdmin.local.js"), "utf8");
  const deleteStart = source.indexOf("function deleteCurrentWord");
  const deleteEnd = source.indexOf("\n  return {", deleteStart);
  const deletion = source.slice(deleteStart, deleteEnd);

  assert.ok(deletion.indexOf("void persistConfirmedChange(next, sourceWords, \"delete-current-word\")") < deletion.indexOf("setWords(next)"));
});
