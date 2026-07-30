import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildExportCachePayload,
  publishLexiconPair,
  POST
} from "../../../api/export-cache/route.js";
import {
  computeIntegrityHash,
  computeLexiconHash
} from "../lexicon-guard.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "export-cache-atomic-"));
  const cacheFile = path.join(root, "cache", "words.json");
  const publicFile = path.join(root, "public", "data", "words.json");
  const retirementFile = path.join(root, "app", "lib", "vocab", "master-lexicon-retirements.json");
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.mkdirSync(path.dirname(publicFile), { recursive: true });
  fs.mkdirSync(path.dirname(retirementFile), { recursive: true });
  fs.writeFileSync(cacheFile, "old-cache", "utf8");
  fs.writeFileSync(publicFile, "old-public", "utf8");
  fs.writeFileSync(retirementFile, "old-retirements", "utf8");
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
    retirementFile,
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
  assert.equal(fs.readFileSync(testFixture.retirementFile, "utf8"), "old-retirements");
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

test("production export-cache accepts localhost but still blocks remote writes", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousToken = process.env.LOCAL_ADMIN_TOKEN;
  process.env.NODE_ENV = "production";
  delete process.env.LOCAL_ADMIN_TOKEN;

  try {
    const localResponse = await POST(new Request("http://localhost:3000/api/export-cache", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Host": "localhost:3000"
      },
      body: JSON.stringify({ words: [] })
    }));
    assert.equal(localResponse.status, 400);

    const remoteResponse = await POST(new Request("https://example.com/api/export-cache", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Host": "example.com"
      },
      body: JSON.stringify({ words: [] })
    }));
    assert.equal(remoteResponse.status, 403);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousToken === undefined) delete process.env.LOCAL_ADMIN_TOKEN;
    else process.env.LOCAL_ADMIN_TOKEN = previousToken;
  }
});

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

test("retirement replacement failure rolls both official word files back", () => {
  const current = fixture();
  const retirementText = `${JSON.stringify({
    version: "v-test",
    generatedAt: "2026-07-29T00:00:00.000Z",
    count: 1,
    entries: [{ id: "a", word: "alpha", reason: "user-curated-removal" }]
  }, null, 2)}\n`;
  let injected = false;
  try {
    assert.throws(() => publishLexiconPair({
      cacheFile: current.cacheFile,
      publicFile: current.publicFile,
      payloadText: current.prepared.text,
      expectedCount: current.words.length,
      retirementFile: current.retirementFile,
      retirementText,
      transactionId: "retirement-replacement-failure",
      fsApi: {
        ...fs,
        renameSync(from, to) {
          if (!injected && from.endsWith(".tmp") && to === current.retirementFile) {
            injected = true;
            throw new Error("retirement replacement failed");
          }
          return fs.renameSync(from, to);
        }
      }
    }), /retirement replacement failed/);
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

test("payload rebuild preserves audited top-level metadata without preserving stale hashes", () => {
  const prepared = buildExportCachePayload({
    words: [{ id: "a", word: "alpha" }],
    version: "v-new",
    savedAt: "2026-07-29T00:00:00.000Z",
    metadata: {
      version: "v-old",
      count: 999,
      savedAt: "old",
      lexiconHash: "old-lexicon-hash",
      integrityHash: "old-integrity-hash",
      morphologyAudit: {
        version: "manual-morphology-audit-v5-20260728",
        rawSuffixHeadwordsReviewed: 3889
      }
    }
  });

  assert.equal(prepared.payload.version, "v-new");
  assert.equal(prepared.payload.count, 1);
  assert.equal(prepared.payload.morphologyAudit.rawSuffixHeadwordsReviewed, 3889);
  assert.notEqual(prepared.payload.lexiconHash, "old-lexicon-hash");
  assert.notEqual(prepared.payload.integrityHash, "old-integrity-hash");
});
