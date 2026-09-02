import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { atomicReplaceFileSync } from "../atomic-write.server.mjs";

function createFakeFileSystem(renameFailures = []) {
  const calls = {
    write: [],
    rename: [],
    unlink: []
  };
  let temporaryExists = false;
  return {
    calls,
    fileSystem: {
      writeFileSync(filePath, content) {
        calls.write.push([filePath, content]);
        temporaryExists = true;
      },
      renameSync(from, to) {
        calls.rename.push([from, to]);
        const failure = renameFailures[calls.rename.length - 1];
        if (failure) throw failure;
        temporaryExists = false;
      },
      existsSync() {
        return temporaryExists;
      },
      unlinkSync(filePath) {
        calls.unlink.push(filePath);
        temporaryExists = false;
      }
    }
  };
}

function fileError(code) {
  return Object.assign(new Error(`simulated ${code}`), { code });
}

test("retries transient Windows rename failures and then succeeds", () => {
  const fake = createFakeFileSystem([fileError("EPERM"), fileError("EBUSY")]);
  const waits = [];

  atomicReplaceFileSync("words.json", "next", {
    fileSystem: fake.fileSystem,
    temporaryPath: "words.json.tmp-test",
    maxAttempts: 5,
    retryDelayMs: 10,
    wait: (milliseconds) => waits.push(milliseconds)
  });

  assert.equal(fake.calls.write.length, 1);
  assert.equal(fake.calls.rename.length, 3);
  assert.deepEqual(waits, [10, 20]);
  assert.equal(fake.calls.unlink.length, 0);
});

test("cleans its own temporary file after retry exhaustion", () => {
  const fake = createFakeFileSystem([
    fileError("EPERM"),
    fileError("EPERM"),
    fileError("EPERM")
  ]);
  const waits = [];

  assert.throws(
    () => atomicReplaceFileSync("words.json", "next", {
      fileSystem: fake.fileSystem,
      temporaryPath: "words.json.tmp-test",
      maxAttempts: 3,
      retryDelayMs: 5,
      wait: (milliseconds) => waits.push(milliseconds)
    }),
    (error) => error.code === "EPERM" && /已自动尝试 3 次/.test(error.message)
  );

  assert.equal(fake.calls.rename.length, 3);
  assert.deepEqual(waits, [5, 10]);
  assert.deepEqual(fake.calls.unlink, ["words.json.tmp-test"]);
});

test("does not retry a non-transient rename error", () => {
  const fake = createFakeFileSystem([fileError("EINVAL")]);

  assert.throws(
    () => atomicReplaceFileSync("words.json", "next", {
      fileSystem: fake.fileSystem,
      temporaryPath: "words.json.tmp-test",
      maxAttempts: 8,
      wait: () => assert.fail("non-transient errors must not wait")
    }),
    (error) => error.code === "EINVAL"
  );

  assert.equal(fake.calls.rename.length, 1);
  assert.deepEqual(fake.calls.unlink, ["words.json.tmp-test"]);
});

test("replaces an existing file atomically in an isolated temporary directory", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ielts-atomic-write-"));
  const target = path.join(directory, "words.json");
  try {
    fs.writeFileSync(target, "before", "utf8");
    atomicReplaceFileSync(target, "after");
    assert.equal(fs.readFileSync(target, "utf8"), "after");
    assert.deepEqual(fs.readdirSync(directory), ["words.json"]);
  } finally {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    fs.rmdirSync(directory);
  }
});
