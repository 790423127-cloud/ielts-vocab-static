import test from "node:test";
import assert from "node:assert/strict";
import { validateExportCacheWrite } from "../lexicon-guard.mjs";

const stuart = { id: "word_reading_g_00bbdefa", word: "stuart" };
const commonWord = { id: "word_common", word: "benefit" };

test("允许保存正式词库中已存在的确定人名词条", () => {
  const result = validateExportCacheWrite(
    { words: [stuart, commonWord] },
    { words: [stuart, commonWord] }
  );

  assert.deepEqual(result, { ok: true });
});

test("拒绝重新加入已从正式词库删除的确定人名", () => {
  const result = validateExportCacheWrite(
    { words: [stuart, commonWord] },
    { words: [commonWord] }
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /重新加入/);
  assert.match(result.detail, /stuart/);
});

test("拒绝用新稳定 ID 伪装重加已删除的确定人名", () => {
  const result = validateExportCacheWrite(
    { words: [{ id: "new-stuart", word: "stuart" }, commonWord] },
    { words: [stuart, commonWord] }
  );

  assert.equal(result.ok, false);
  assert.match(result.detail, /stuart/);
});
