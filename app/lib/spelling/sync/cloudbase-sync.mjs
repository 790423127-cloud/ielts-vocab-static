import { mergeBatch } from "./merge-engine.mjs";

function withSyncMetadata(record, options = {}) {
  const now = Number(options.now || Date.now());

  return {
    ...record,
    deviceId: record.deviceId || options.deviceId || "",
    version: Number(record.version || options.version || 1),
    lastSyncAt: now,
    dirty: false
  };
}

async function pullRemote(client, options) {
  if (typeof client?.pull === "function") return client.pull(options);
  if (typeof client?.getRecords === "function") return client.getRecords(options);
  throw new Error("CloudBase spelling sync client must provide pull() or getRecords()");
}

async function pushRemote(client, records, options) {
  if (typeof client?.push === "function") return client.push(records, options);
  if (typeof client?.putRecords === "function") return client.putRecords(records, options);
  throw new Error("CloudBase spelling sync client must provide push() or putRecords()");
}

export async function syncSpellingProgress(options = {}) {
  const store = options.store;
  const client = options.client;
  const now = Number(options.now || Date.now());

  if (!store) throw new Error("syncSpellingProgress requires a local store");
  if (!client) throw new Error("syncSpellingProgress requires a CloudBase client adapter");

  if (store.open) await store.open();

  const localRecords = typeof store.getAllRecords === "function" ? await store.getAllRecords() : [];
  const remoteRecords = await pullRemote(client, options);
  const mergedRecords = mergeBatch([localRecords, remoteRecords]).map((record) => withSyncMetadata(record, {
    now,
    deviceId: options.deviceId,
    version: options.version
  }));

  for (const record of mergedRecords) {
    await store.putRecord(record);
  }

  await pushRemote(client, mergedRecords, options);

  return {
    pulledCount: Array.isArray(remoteRecords) ? remoteRecords.length : 0,
    localCount: Array.isArray(localRecords) ? localRecords.length : 0,
    mergedCount: mergedRecords.length,
    pushedCount: mergedRecords.length,
    records: mergedRecords
  };
}

export function createCloudBaseSpellingSync(options = {}) {
  return {
    pull: () => syncSpellingProgress(options),
    sync: (overrides = {}) => syncSpellingProgress({ ...options, ...overrides })
  };
}
