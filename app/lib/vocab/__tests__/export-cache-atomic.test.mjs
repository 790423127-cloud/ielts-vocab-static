import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildExportCachePayload,
  publishLexiconPair
} from "../../../api/export-cache/route.js";
import {
  computeIntegrityHash,
  computeLexiconHash
} from "../lexicon-guard.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "export-cache-atomic-"));
  const cacheFile = path.join(root, "cache", "words.json");
  const publicFile = path.join(root, "public", "data", "words.json");
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.mkdirSync(path.dirname(publicFile), { recursive: true });
  fs.writeFileSync(cacheFile, "old-cache", "utf8");
  fs.writeFileSync(publicFile, "old-public", "utf8");
  const words = [
    { id: "a", word: "alpha", meaning: "甲" },
    { id: "b", word: "beta", meaning: "乙" }
  ];
  const prepared = buildExportCachePayload({
    words,
    version: "v-test",
    savedAt: "2026-07-23T00:00:00.000Z"
  });
  return {
    root,
    cacheFile,
    publicFile,
    words,
    prepared,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

function assertOriginalFiles(testFixture) {
  assert.equal(fs.readFileSync(testFixture.cacheFile, "utf8"), "old-cache");
  assert.equal(fs.readFileSync(testFixture.publicFile, "utf8"), "old-public");
}

function assertNoTransactionFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else files.push(entry.name);
    }
  }
  walk(root);
  assert.equal(files.some((name) => name.endsWith(".tmp") || name.endsWith(".rollback")), false);
}

test("first temporary write failure leaves both official files unchanged", () => {
  const current = fixture();
  let writeCount = 0;
  try {
    assert.throws(() => publishLexiconPair({
      cacheFile: current.cacheFile,
      publicFile: current.publicFile,
      payloadText: current.prepared.text,
      expectedCount: current.words.length,
      transactionId: "first-write-failure",
      fsApi: {
        ...fs,
        writeFileSync(...args) {
          writeCount += 1;
          if (writeCount === 1) throw new Error("first temp write failed");
          return fs.writeFileSync(...args);
        }
      }
    }), /first temp write failed/);
    assertOriginalFiles(current);
    assertNoTransactionFiles(current.root);
  } finally {
    current.cleanup();
  }
});

test("second temporary write failure leaves both official files unchanged", () => {
  const current = fixture();
  let writeCount = 0;
  try {
    assert.throws(() => publishLexiconPair({
      cacheFile: current.cacheFile,
      publicFile: current.publicFile,
      payloadText: current.prepared.text,
      expectedCount: current.words.length,
      transactionId: "second-write-failure",
      fsApi: {
        ...fs,
        writeFileSync(...args) {
          writeCount += 1;
          if (writeCount === 2) throw new Error("second temp write failed");
          return fs.writeFileSync(...args);
        }
      }
    }), /second temp write failed/);
    assertOriginalFiles(current);
    assertNoTransactionFiles(current.root);
  } finally {
    current.cleanup();
  }
});

test("second official replacement failure rolls the first replacement back", () => {
  const current = fixture();
  let injected = false;
  try {
    assert.throws(() => publishLexiconPair({
      cacheFile: current.cacheFile,
      publicFile: current.publicFile,
      payloadText: current.prepared.text,
      expectedCount: current.words.length,
      transactionId: "replacement-failure",
      fsApi: {
        ...fs,
        renameSync(from, to) {
          if (!injected && from.endsWith(".tmp") && to === current.publicFile) {
            injected = true;
            throw new Error("second replacement failed");
          }
          return fs.renameSync(from, to);
        }
      }
    }), /second replacement failed/);
    assertOriginalFiles(current);
    assertNoTransactionFiles(current.root);
  } finally {
    current.cleanup();
  }
});

test("invalid temporary JSON or hash never replaces official files", () => {
  const current = fixture();
  let writeCount = 0;
  try {
    assert.throws(() => publishLexiconPair({
      cacheFile: current.cacheFile,
      publicFile: current.publicFile,
      payloadText: current.prepared.text,
      expectedCount: current.words.length,
      transactionId: "validation-failure",
      fsApi: {
        ...fs,
        writeFileSync(filePath, content, encoding) {
          writeCount += 1;
          return fs.writeFileSync(
            filePath,
            writeCount === 2 ? JSON.stringify({ words: [], count: 0 }) : content,
            encoding
          );
        }
      }
    }), /字节不一致|校验失败/);
    assertOriginalFiles(current);
    assertNoTransactionFiles(current.root);
  } finally {
    current.cleanup();
  }
});

test("successful publish writes byte-identical files and fresh content hashes", () => {
  const current = fixture();
  try {
    const result = publishLexiconPair({
      cacheFile: current.cacheFile,
      publicFile: current.publicFile,
      payloadText: current.prepared.text,
      expectedCount: current.words.length,
      transactionId: "success"
    });
    const cacheText = fs.readFileSync(current.cacheFile, "utf8");
    const publicText = fs.readFileSync(current.publicFile, "utf8");
    const payload = JSON.parse(cacheText);

    assert.equal(cacheText, publicText);
    assert.equal(payload.count, current.words.length);
    assert.equal(payload.lexiconHash, computeLexiconHash(current.words));
    assert.equal(payload.integrityHash, computeIntegrityHash(current.words));
    assert.equal(result.fileHash, current.prepared.fileHash);
    assertNoTransactionFiles(current.root);
  } finally {
    current.cleanup();
  }
});
