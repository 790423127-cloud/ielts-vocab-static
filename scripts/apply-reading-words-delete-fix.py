from pathlib import Path
import subprocess

BASE_BEFORE_WRONG_DELETE = "c8c359a9075019d6bb722b09da3b1df465a7d5a9"


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


page_path = Path("app/reading-words/page.jsx")
page = page_path.read_text(encoding="utf-8")

page = replace_once(
    page,
    'import { useEffect, useMemo, useRef, useState } from "react";',
    'import { useCallback, useEffect, useMemo, useRef, useState } from "react";',
    "React hook import",
)
page = replace_once(
    page,
    '  Star,\n  Upload,\n  Volume2,',
    '  Star,\n  Trash2,\n  Upload,\n  Volume2,',
    "Trash icon import",
)
page = replace_once(
    page,
    '} from "../lib/reading-words/storage.mjs";\n',
    '} from "../lib/reading-words/storage.mjs";\nimport {\n  removeReadingWordEntry,\n  shouldHandleReadingWordDeleteShortcut\n} from "../lib/reading-words/delete.mjs";\n',
    "reading delete helper import",
)

patch_block = '''  const patchSelectedWord = (patch) => {
    if (!selectedWord) return;
    setWords(words.map((word) => (
      word.id === selectedWord.id
        ? { ...word, ...patch, updatedAt: new Date().toISOString() }
        : word
    )));
  };
'''
delete_block = patch_block + '''
  const deleteSelectedWord = useCallback(() => {
    if (!selectedWord || aiRunning || mainWriteBusy) return;
    const confirmed = window.confirm(
      `确定从阅读生词栏删除“${selectedWord.word}”吗？\\n\\n` +
      "只会删除阅读生词记录，不会删除主词库中的单词。"
    );
    if (!confirmed) return;

    const result = removeReadingWordEntry(words, selectedWord.id, visibleWords);
    if (!result.removed) {
      setNotice("当前阅读生词已不存在，无需重复删除。");
      return;
    }
    if (!writeReadingWordsWithBackup(result.words, words)) {
      setStorageError("阅读生词删除失败，原数据未改变。请先导出备份并检查浏览器存储空间。");
      return;
    }

    setWords(result.words);
    setSelectedId(result.nextSelectedId);
    setRollbackAvailable(true);
    setStorageError("");
    setNotice(`已从阅读生词栏删除：${result.removed.word}；主词库未改变。`);
  }, [aiRunning, mainWriteBusy, selectedWord, visibleWords, words]);

  useEffect(() => {
    function handleReadingWordDeleteShortcut(event) {
      if (!shouldHandleReadingWordDeleteShortcut(event)) return;
      if (!selectedWord || aiRunning || mainWriteBusy) return;
      event.preventDefault();
      event.stopPropagation();
      deleteSelectedWord();
    }

    window.addEventListener("keydown", handleReadingWordDeleteShortcut);
    return () => window.removeEventListener("keydown", handleReadingWordDeleteShortcut);
  }, [aiRunning, deleteSelectedWord, mainWriteBusy, selectedWord]);
'''
page = replace_once(page, patch_block, delete_block, "reading delete callback")

bookmark_block = '''                <button
                  type="button"
                  className={`word-canvas-icon${selectedWord.favorite ? " is-active" : ""}`}
                  onClick={() => patchSelectedWord({ favorite: !selectedWord.favorite })}
                  aria-pressed={selectedWord.favorite}
                  aria-label={selectedWord.favorite ? "取消收藏" : "收藏"}
                >
                  <Bookmark aria-hidden="true" />
                </button>
'''
bookmark_with_delete = bookmark_block + '''                <button
                  type="button"
                  className="word-canvas-icon"
                  onClick={deleteSelectedWord}
                  disabled={aiRunning || mainWriteBusy}
                  aria-label="从阅读生词栏删除"
                  title="只从阅读生词栏删除（D / Delete）"
                  data-testid="reading-word-delete"
                >
                  <Trash2 aria-hidden="true" />
                </button>
'''
page = replace_once(page, bookmark_block, bookmark_with_delete, "reading delete button")
page_path.write_text(page, encoding="utf-8")

delete_helper = '''function normalizeId(value) {
  return String(value || "").trim();
}

function entryId(entry = {}) {
  return normalizeId(entry.id || entry.wordId);
}

export function removeReadingWordEntry(words = [], selectedId = "", visibleWords = words) {
  const list = Array.isArray(words) ? words : [];
  const visible = Array.isArray(visibleWords) ? visibleWords : [];
  const targetId = normalizeId(selectedId);
  const removedIndex = list.findIndex((entry) => entryId(entry) === targetId);
  if (!targetId || removedIndex < 0) {
    return { words: list, removed: null, nextSelectedId: "" };
  }

  const visibleIndex = visible.findIndex((entry) => entryId(entry) === targetId);
  const nextVisible = visible[visibleIndex + 1] || visible[visibleIndex - 1] || null;
  return {
    words: list.filter((entry) => entryId(entry) !== targetId),
    removed: list[removedIndex],
    nextSelectedId: entryId(nextVisible)
  };
}

export function shouldHandleReadingWordDeleteShortcut(event = {}) {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  const tag = String(target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return false;
  const key = String(event.key || "").toLowerCase();
  const code = String(event.code || "");
  return key === "d" || key === "delete" || code === "Delete";
}
'''
Path("app/lib/reading-words/delete.mjs").write_text(delete_helper, encoding="utf-8")

test_text = '''import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseReadingWordsPlainLine,
  parseReadingWordsTable
} from "../../reading-words/storage.mjs";
import {
  removeReadingWordEntry,
  shouldHandleReadingWordDeleteShortcut
} from "../../reading-words/delete.mjs";

const FIXED_OPTIONS = {
  idFactory: (() => {
    let index = 0;
    return () => `reading-test-${++index}`;
  })(),
  now: "2026-07-28T00:00:00.000Z"
};

test("reading words imports generated vocabulary-book rows", () => {
  const rows = parseReadingWordsTable([
    "acquisition /ˌækwɪˈzɪʃn/ noun 收购；获得",
    "amenity /əˈmiːnəti/ noun 生活福利设施；便利设施",
    "application /ˌæplɪˈkeɪʃn/ noun 应用；申请"
  ].join("\\n"), FIXED_OPTIONS);

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map(({ word, phonetic, pos, meaning }) => ({ word, phonetic, pos, meaning })),
    [
      { word: "acquisition", phonetic: "/ˌækwɪˈzɪʃn/", pos: "noun", meaning: "收购；获得" },
      { word: "amenity", phonetic: "/əˈmiːnəti/", pos: "noun", meaning: "生活福利设施；便利设施" },
      { word: "application", phonetic: "/ˌæplɪˈkeɪʃn/", pos: "noun", meaning: "应用；申请" }
    ]
  );
});

test("reading words plain-line parser keeps simple words and parses abbreviations", () => {
  assert.deepEqual(parseReadingWordsPlainLine("brochure"), { word: "brochure" });
  assert.deepEqual(
    parseReadingWordsPlainLine("1. accessible /əkˈsesəbl/ adj. 可到达的；易使用的"),
    {
      word: "accessible",
      phonetic: "/əkˈsesəbl/",
      pos: "adjective",
      meaning: "可到达的；易使用的"
    }
  );
});

test("reading word delete removes only the selected reading record and selects the next visible word", () => {
  const words = [
    { id: "reading-a", word: "acquisition" },
    { id: "reading-b", word: "brochure" },
    { id: "reading-c", word: "congestion" }
  ];
  const result = removeReadingWordEntry(words, "reading-b", words);

  assert.deepEqual(result.words.map((entry) => entry.id), ["reading-a", "reading-c"]);
  assert.equal(result.removed.word, "brochure");
  assert.equal(result.nextSelectedId, "reading-c");
  assert.deepEqual(words.map((entry) => entry.id), ["reading-a", "reading-b", "reading-c"]);
});

test("reading word delete selects the previous visible word when deleting the final item", () => {
  const words = [
    { id: "reading-a", word: "acquisition" },
    { id: "reading-b", word: "brochure" }
  ];
  const result = removeReadingWordEntry(words, "reading-b", words);
  assert.equal(result.nextSelectedId, "reading-a");
});

test("reading delete shortcut accepts D and Delete outside editors only", () => {
  assert.equal(shouldHandleReadingWordDeleteShortcut({ key: "d", target: { tagName: "BODY" } }), true);
  assert.equal(shouldHandleReadingWordDeleteShortcut({ key: "D", target: { tagName: "DIV" } }), true);
  assert.equal(shouldHandleReadingWordDeleteShortcut({ key: "Delete", code: "Delete", target: { tagName: "BODY" } }), true);
  assert.equal(shouldHandleReadingWordDeleteShortcut({ key: "d", target: { tagName: "INPUT" } }), false);
  assert.equal(shouldHandleReadingWordDeleteShortcut({ key: "Delete", target: { tagName: "TEXTAREA" } }), false);
  assert.equal(shouldHandleReadingWordDeleteShortcut({ key: "d", ctrlKey: true, target: { tagName: "BODY" } }), false);
});

test("the shortcut and button are wired only into the reading words page", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const readingPage = fs.readFileSync(path.join(root, "app/reading-words/page.jsx"), "utf8");
  const spellingCard = fs.readFileSync(path.join(root, "app/components/SpellingFocusCard.jsx"), "utf8");

  assert.match(readingPage, /data-testid="reading-word-delete"/);
  assert.match(readingPage, /writeReadingWordsWithBackup\(result\.words, words\)/);
  assert.match(readingPage, /主词库未改变/);
  assert.doesNotMatch(spellingCard, /移出错词本/);
});
'''
Path("app/lib/vocab/__tests__/reading-words-import-and-delete-shortcut.test.mjs").write_text(test_text, encoding="utf-8")

subprocess.run([
    "git", "checkout", BASE_BEFORE_WRONG_DELETE, "--",
    "app/components/SpellingFocusCard.jsx",
    "app/hooks/useSpellingErrorBank.js",
    "app/hooks/useSpellingTrainingControls.js",
    "app/lib/spelling/error-bank.mjs"
], check=True)
for wrong_path in [
    Path("app/lib/spelling/error-bank-dismiss.mjs"),
    Path("app/lib/spelling/__tests__/error-bank-dismiss.test.mjs")
]:
    if wrong_path.exists():
        wrong_path.unlink()

package_path = Path("package.json")
package_text = package_path.read_text(encoding="utf-8")
package_text = package_text.replace(" app/lib/spelling/__tests__/error-bank-dismiss.test.mjs", "")
package_path.write_text(package_text, encoding="utf-8")

subprocess.run(["git", "checkout", "origin/main", "--", ".github/workflows/ci.yml"], check=True)
for temporary_path in [
    Path(".github/workflows/apply-reading-words-delete-fix.yml"),
    Path("scripts/apply-reading-words-delete-fix.py")
]:
    if temporary_path.exists():
        temporary_path.unlink()
