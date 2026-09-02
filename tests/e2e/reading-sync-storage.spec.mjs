import { expect, test } from "@playwright/test";
import {
  READING_WORDS_ROLLBACK_KEY,
  READING_WORDS_STORAGE_KEY,
  buildReadingWordsRollback,
  compactReadingWordsForPersistence
} from "../../app/lib/reading-words/storage.mjs";
import {
  READING_PARAPHRASE_ROLLBACK_KEY,
  READING_PARAPHRASE_STORAGE_KEY,
  buildReadingParaphraseRollback,
  createReadingParaphraseState,
  mergeReadingParaphraseState
} from "../../app/lib/reading-paraphrases/storage.mjs";
import {
  mergeReadingCoachParaphrases,
  mergeReadingCoachWords
} from "../../app/lib/reading-sync/smart-sync.mjs";

const RECEIVER_ORIGIN = "http://127.0.0.1:3100";
const SOURCE_ORIGIN = "http://127.0.0.1:8001";

function currentWord(index) {
  const id = `current-${index}`;
  return {
    id,
    wordId: id,
    word: `currentword${index}`,
    meaning: "现有释义",
    definition: "x".repeat(700),
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z"
  };
}

function paraphrase(index) {
  return {
    id: `pair-${index}`,
    questionPhrase: `question phrase ${index}`,
    sourcePhrase: `source phrase ${index}`,
    sources: [{ id: `source-${index}`, evidence: "e".repeat(400) }]
  };
}

test("smart sync migrates the reading notebook to IndexedDB and succeeds despite localStorage quota", async ({ context, page }) => {
  const currentWords = compactReadingWordsForPersistence(
    Array.from({ length: 140 }, (_, index) => currentWord(index)),
    { now: "2026-08-14T00:00:00.000Z" }
  );
  const paraphrases = Array.from({ length: 60 }, (_, index) => paraphrase(index));
  const previousParaphrases = mergeReadingParaphraseState(
    createReadingParaphraseState(),
    paraphrases,
    1
  ).state;
  const incomingWords = Array.from({ length: 30 }, (_, index) => ({
    id: `incoming-${index}`,
    fingerprint: index.toString(16).padStart(64, "0"),
    word: `incomingword${index}`,
    meaning: "新释义",
    note: "",
    status: "learning",
    occurrenceCount: 1,
    createdAt: "2026-08-14T01:00:00.000Z",
    updatedAt: "2026-08-14T01:00:00.000Z",
    sources: [{
      id: `incoming-source-${index}`,
      sentence: `This is the reading sentence for incomingword${index}. ${"s".repeat(700)}`
    }]
  }));
  const wordResult = mergeReadingCoachWords(currentWords, incomingWords, {
    now: "2026-08-14T01:00:00.000Z"
  });
  const paraphraseResult = mergeReadingCoachParaphrases(previousParaphrases, [], 2);
  const wordState = JSON.stringify({ version: 1, words: currentWords });
  const nextWordState = JSON.stringify({
    version: 1,
    updatedAt: "2026-08-14T01:00:00.000Z",
    words: wordResult.words
  });
  const oldSmallWordBackup = JSON.stringify({ version: 1, words: currentWords.slice(0, 20) });
  const paraphraseState = JSON.stringify(previousParaphrases);
  const wordDelta = JSON.stringify(buildReadingWordsRollback(wordResult.words, currentWords, {
    now: "2026-08-14T01:00:00.000Z"
  }));
  const paraphraseDelta = JSON.stringify(buildReadingParaphraseRollback(
    paraphraseResult.state,
    previousParaphrases,
    2
  ));
  const itemSize = (key, value) => key.length + value.length;
  const successfulSize = itemSize(READING_WORDS_STORAGE_KEY, nextWordState)
    + itemSize(READING_WORDS_ROLLBACK_KEY, wordDelta)
    + itemSize(READING_PARAPHRASE_STORAGE_KEY, paraphraseState)
    + itemSize(READING_PARAPHRASE_ROLLBACK_KEY, paraphraseDelta);
  const initialSize = itemSize(READING_WORDS_STORAGE_KEY, wordState)
    + itemSize(READING_WORDS_ROLLBACK_KEY, oldSmallWordBackup)
    + itemSize(READING_PARAPHRASE_STORAGE_KEY, paraphraseState)
    + itemSize(READING_PARAPHRASE_ROLLBACK_KEY, paraphraseState);
  const legacyFullWordBackup = JSON.stringify({ version: 1, words: currentWords });
  const legacyPeakSize = itemSize(READING_WORDS_STORAGE_KEY, wordState)
    + itemSize(READING_WORDS_ROLLBACK_KEY, legacyFullWordBackup)
    + itemSize(READING_PARAPHRASE_STORAGE_KEY, paraphraseState)
    + itemSize(READING_PARAPHRASE_ROLLBACK_KEY, paraphraseState);
  const storageLimit = Math.max(initialSize, successfulSize) + 5_000;
  expect(legacyPeakSize).toBeGreaterThan(storageLimit);

  await context.addInitScript(({ limit, receiverOrigin }) => {
    if (location.origin !== receiverOrigin) return;
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItemWithTestQuota(key, value) {
      if (this === window.localStorage) {
        let size = 0;
        for (let index = 0; index < this.length; index += 1) {
          const storedKey = this.key(index);
          if (storedKey === String(key)) continue;
          size += storedKey.length + (this.getItem(storedKey) || "").length;
        }
        size += String(key).length + String(value).length;
        if (size > limit) throw new DOMException("quota reached", "QuotaExceededError");
      }
      return nativeSetItem.call(this, key, value);
    };
  }, { limit: storageLimit, receiverOrigin: RECEIVER_ORIGIN });

  await page.goto(`${RECEIVER_ORIGIN}/reading-sync`);
  const seededSize = await page.evaluate(({ wordState, oldSmallWordBackup, paraphraseState }) => {
    localStorage.setItem("ielts-personal-reading-words-v1", wordState);
    localStorage.setItem("ielts-personal-reading-words-rollback-v1", oldSmallWordBackup);
    localStorage.setItem("ielts_reading_paraphrases_v1", paraphraseState);
    localStorage.setItem("ielts_reading_paraphrases_rollback_v1", paraphraseState);
    return Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return key.length + (localStorage.getItem(key) || "").length;
    }).reduce((sum, size) => sum + size, 0);
  }, { wordState, oldSmallWordBackup, paraphraseState });
  expect(seededSize).toBeLessThan(storageLimit);
  const syncPackage = {
    type: "ielts-reading-coach-smart-sync",
    schemaVersion: 1,
    source: "ielts-reading-coach",
    transferId: "quota-regression-transfer",
    preparedAt: "2026-08-14T01:00:00.000Z",
    words: incomingWords,
    paraphrases: []
  };

  await context.route(`${SOURCE_ORIGIN}/sync-test-source`, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><meta charset="utf-8"><button id="sync">sync</button><pre id="result"></pre>
      <script>
        const receiverOrigin = ${JSON.stringify(RECEIVER_ORIGIN)};
        const sourceOrigin = ${JSON.stringify(SOURCE_ORIGIN)};
        const payload = ${JSON.stringify(syncPackage)};
        let popup;
        addEventListener("message", (event) => {
          if (event.origin !== receiverOrigin || event.source !== popup) return;
          if (event.data?.type === "ielts-reading-coach-smart-sync-ready") {
            popup.postMessage(payload, receiverOrigin);
          }
          if (event.data?.type === "ielts-reading-coach-smart-sync-result") {
            document.querySelector("#result").textContent = JSON.stringify(event.data);
          }
        });
        document.querySelector("#sync").addEventListener("click", () => {
          popup = open(receiverOrigin + "/reading-sync?sourceOrigin=" + encodeURIComponent(sourceOrigin));
        });
      </script>`
  }));

  await page.goto(`${SOURCE_ORIGIN}/sync-test-source`);
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "sync" }).click();
  const popup = await popupPromise;
  await expect(popup.getByText("传输完成，阅读系统已收到成功回执。")).toBeVisible();
  await expect(page.locator("#result")).toContainText('"status":"ok"');

  const stored = await popup.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("ielts-personal-reading-words-v1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction("notebook", "readonly");
      const store = transaction.objectStore("notebook");
      const [snapshot, rollback] = await Promise.all([
        new Promise((resolve, reject) => {
          const request = store.get("snapshot");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }),
        new Promise((resolve, reject) => {
          const request = store.get("rollback");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        })
      ]);
      return {
        wordCount: snapshot.words.length,
        wordRollbackKind: rollback.kind,
        legacyWordCount: JSON.parse(localStorage.getItem("ielts-personal-reading-words-v1")).words.length,
        paraphraseRollbackKind: JSON.parse(
          localStorage.getItem("ielts_reading_paraphrases_rollback_v1")
        ).kind
      };
    } finally {
      database.close();
    }
  });
  expect(stored).toEqual({
    wordCount: 170,
    wordRollbackKind: "delta",
    legacyWordCount: 140,
    paraphraseRollbackKind: "delta"
  });
});
