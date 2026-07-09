import { SPELLING_DB_CONFIG } from "./config.mjs";
import { resolveSpellingScope } from "./spelling-scope.mjs";

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

function put(store, value) {
  store.put(value);
}

function ensureIndex(store, name, keyPath) {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, { unique: false });
  }
}

export function ensureSpellingStoreIndexes(store, storeName) {
  if (storeName.endsWith("today-repair-queue")) {
    ensureIndex(store, "repairState", "repairState");
    ensureIndex(store, "sessionDate", "sessionDate");
  }

  if (storeName.endsWith("-srs")) {
    ensureIndex(store, "nextReviewAt", "nextReviewAt");
  }
}

export function withSpellingSyncMetadata(record, options = {}) {
  return {
    ...record,
    deviceId: record.deviceId || options.deviceId || "",
    version: Number(record.version || options.version || 1),
    lastSyncAt: Number(record.lastSyncAt || 0),
    dirty: options.dirty ?? record.dirty ?? false
  };
}

export class SpellingIndexedDbStore {
  constructor(options = {}) {
    this.indexedDB = options.indexedDB || globalThis.indexedDB;
    this.dbName = options.dbName || SPELLING_DB_CONFIG.dbName;
    this.version = options.version || SPELLING_DB_CONFIG.version;
    this.recordVersion = options.recordVersion || 1;
    this.deviceId = options.deviceId || "";
    this.scopeConfig = resolveSpellingScope(options.scope || "word");
    this.scope = this.scopeConfig.scope;
    this.stores = this.scopeConfig.stores;
    this.IDBKeyRange = options.IDBKeyRange || globalThis.IDBKeyRange;
    this.dbPromise = null;
  }

  async open() {
    if (!this.indexedDB) {
      throw new Error("IndexedDB is not available for spelling storage");
    }

    if (this.dbPromise) return this.dbPromise;

    const allStoreNames = Object.values(SPELLING_DB_CONFIG.stores);

    this.dbPromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = () => {
        const db = request.result;
        const upgradeTransaction = request.transaction;

        for (const storeName of allStoreNames) {
          let store;
          if (!db.objectStoreNames.contains(storeName)) {
            store = db.createObjectStore(storeName, { keyPath: "wordId" });
          } else if (upgradeTransaction) {
            store = upgradeTransaction.objectStore(storeName);
          }

          if (store) ensureSpellingStoreIndexes(store, storeName);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });

    return this.dbPromise;
  }

  async getRecord(wordId) {
    const db = await this.open();
    const tx = db.transaction(this.stores.spellingProgress, "readonly");
    return requestToPromise(tx.objectStore(this.stores.spellingProgress).get(wordId));
  }

  async putRecord(record) {
    const db = await this.open();
    const tx = db.transaction(Object.values(this.stores), "readwrite");
    const nextRecord = withSpellingSyncMetadata(record, {
      deviceId: this.deviceId,
      version: this.recordVersion,
      dirty: record.dirty
    });

    put(tx.objectStore(this.stores.spellingProgress), nextRecord);

    if (nextRecord.errorBank?.everWrong) {
      put(tx.objectStore(this.stores.errorBank), {
        wordId: nextRecord.wordId,
        ...nextRecord.errorBank,
        updatedAt: nextRecord.updatedAt,
        revision: nextRecord.revision,
        deviceId: nextRecord.deviceId,
        version: nextRecord.version,
        lastSyncAt: nextRecord.lastSyncAt
      });
    } else {
      tx.objectStore(this.stores.errorBank).delete(nextRecord.wordId);
    }

    if (nextRecord.today?.repairState === "in_repair"
      || ["must_repair", "waiting_second"].includes(nextRecord.today?.repairState)) {
      put(tx.objectStore(this.stores.todayRepairQueue), {
        wordId: nextRecord.wordId,
        repairState: nextRecord.today.repairState,
        sessionDate: nextRecord.today.sessionDate,
        nextEligibleAt: nextRecord.today.nextEligibleAt,
        minOtherWordsBeforeNext: nextRecord.today.minOtherWordsBeforeNext,
        lastSeenSequence: nextRecord.today.lastSeenSequence,
        updatedAt: nextRecord.updatedAt,
        deviceId: nextRecord.deviceId,
        version: nextRecord.version,
        lastSyncAt: nextRecord.lastSyncAt
      });
    } else {
      tx.objectStore(this.stores.todayRepairQueue).delete(nextRecord.wordId);
    }

    if (nextRecord.srs?.nextReviewAt > 0) {
      put(tx.objectStore(this.stores.srsReviewQueue), {
        wordId: nextRecord.wordId,
        stage: nextRecord.srs.stage,
        nextReviewAt: nextRecord.srs.nextReviewAt,
        lastReviewedAt: nextRecord.srs.lastReviewedAt,
        updatedAt: nextRecord.updatedAt,
        deviceId: nextRecord.deviceId,
        version: nextRecord.version,
        lastSyncAt: nextRecord.lastSyncAt
      });
    } else {
      tx.objectStore(this.stores.srsReviewQueue).delete(nextRecord.wordId);
    }

    await transactionDone(tx);
    return nextRecord;
  }

  async getAllRecords() {
    const db = await this.open();
    const tx = db.transaction(this.stores.spellingProgress, "readonly");
    return requestToPromise(tx.objectStore(this.stores.spellingProgress).getAll());
  }

  async getAllErrorBankRecords() {
    const db = await this.open();
    const tx = db.transaction(this.stores.errorBank, "readonly");
    return requestToPromise(tx.objectStore(this.stores.errorBank).getAll());
  }

  async deleteErrorBankRecord(wordId) {
    if (!wordId) return;
    const db = await this.open();
    const tx = db.transaction(this.stores.errorBank, "readwrite");
    tx.objectStore(this.stores.errorBank).delete(wordId);
    await transactionDone(tx);
  }

  async deleteRecord(wordId) {
    if (!wordId) return;
    const db = await this.open();
    const tx = db.transaction(Object.values(this.stores), "readwrite");
    tx.objectStore(this.stores.spellingProgress).delete(wordId);
    tx.objectStore(this.stores.errorBank).delete(wordId);
    tx.objectStore(this.stores.todayRepairQueue).delete(wordId);
    tx.objectStore(this.stores.srsReviewQueue).delete(wordId);
    await transactionDone(tx);
  }

  async getDueSrsReviews(now = Date.now()) {
    const db = await this.open();
    const tx = db.transaction(this.stores.srsReviewQueue, "readonly");
    const store = tx.objectStore(this.stores.srsReviewQueue);
    const currentTime = Number(now || Date.now());

    if (
      currentTime > 0
      && this.IDBKeyRange
      && store.indexNames.contains("nextReviewAt")
    ) {
      const dueRange = this.IDBKeyRange.bound(0, currentTime, true, false);
      return requestToPromise(store.index("nextReviewAt").getAll(dueRange));
    }

    const all = await requestToPromise(store.getAll());
    return all.filter((item) => item.nextReviewAt > 0 && item.nextReviewAt <= currentTime);
  }

  async getTodayRepairQueue(sessionDate) {
    const db = await this.open();
    const tx = db.transaction(this.stores.todayRepairQueue, "readonly");
    const all = await requestToPromise(tx.objectStore(this.stores.todayRepairQueue).getAll());
    return all.filter((item) => !sessionDate || item.sessionDate === sessionDate);
  }
}
