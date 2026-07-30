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

function putSpellingRecord(transaction, stores, record) {
  put(transaction.objectStore(stores.spellingProgress), record);

  if (record.errorBank?.everWrong) {
    put(transaction.objectStore(stores.errorBank), {
      wordId: record.wordId,
      ...record.errorBank,
      updatedAt: record.updatedAt,
      revision: record.revision,
      deviceId: record.deviceId,
      version: record.version,
      lastSyncAt: record.lastSyncAt
    });
  } else {
    transaction.objectStore(stores.errorBank).delete(record.wordId);
  }

  if (
    record.today?.repairState === "in_repair"
    || ["must_repair", "waiting_second"].includes(record.today?.repairState)
  ) {
    put(transaction.objectStore(stores.todayRepairQueue), {
      wordId: record.wordId,
      repairState: record.today.repairState,
      sessionDate: record.today.sessionDate,
      nextEligibleAt: record.today.nextEligibleAt,
      minOtherWordsBeforeNext: record.today.minOtherWordsBeforeNext,
      lastSeenSequence: record.today.lastSeenSequence,
      updatedAt: record.updatedAt,
      deviceId: record.deviceId,
      version: record.version,
      lastSyncAt: record.lastSyncAt
    });
  } else {
    transaction.objectStore(stores.todayRepairQueue).delete(record.wordId);
  }

  if (record.srs?.nextReviewAt > 0) {
    put(transaction.objectStore(stores.srsReviewQueue), {
      wordId: record.wordId,
      stage: record.srs.stage,
      nextReviewAt: record.srs.nextReviewAt,
      lastReviewedAt: record.srs.lastReviewedAt,
      updatedAt: record.updatedAt,
      deviceId: record.deviceId,
      version: record.version,
      lastSyncAt: record.lastSyncAt
    });
  } else {
    transaction.objectStore(stores.srsReviewQueue).delete(record.wordId);
  }
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

    const pending = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.dbName, this.version);
      let settled = false;
      const timeout = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("拼写进度库打开超时，可能被其他标签页占用"));
      }, 5000);
      const finish = (callback) => {
        if (settled) return false;
        settled = true;
        globalThis.clearTimeout(timeout);
        callback();
        return true;
      };

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

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        if (!finish(() => resolve(db))) db.close();
      };
      request.onerror = () => finish(() => reject(request.error || new Error("IndexedDB open failed")));
      request.onblocked = () => finish(() => reject(new Error("拼写进度库被其他标签页占用")));
    });
    this.dbPromise = pending.catch((error) => {
      this.dbPromise = null;
      throw error;
    });

    return this.dbPromise;
  }

  async getRecord(wordId) {
    const db = await this.open();
    const tx = db.transaction(this.stores.spellingProgress, "readonly");
    return requestToPromise(tx.objectStore(this.stores.spellingProgress).get(wordId));
  }

  async putRecord(record) {
    const [nextRecord] = await this.putRecords([record]);
    return nextRecord;
  }

  async putRecords(records = []) {
    const sourceRecords = Array.isArray(records) ? records.filter(Boolean) : [];
    if (!sourceRecords.length) return [];

    const db = await this.open();
    const tx = db.transaction(Object.values(this.stores), "readwrite");
    const nextRecords = sourceRecords.map((record) => {
      const nextRecord = withSpellingSyncMetadata(record, {
        deviceId: this.deviceId,
        version: this.recordVersion,
        dirty: record.dirty
      });
      putSpellingRecord(tx, this.stores, nextRecord);
      return nextRecord;
    });

    await transactionDone(tx);
    return nextRecords;
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
