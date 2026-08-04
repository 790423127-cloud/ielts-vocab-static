/**
 * Session-level JSON / payload cache for large public datasets.
 * Survives client-side navigations so re-opening a module is near-instant.
 */

const rawCache = new Map();
const rawInflight = new Map();
const valueCache = new Map();
const valueInflight = new Map();

export function getSessionJson(url) {
  return rawCache.has(url) ? rawCache.get(url) : null;
}

export function setSessionJson(url, data) {
  rawCache.set(url, data);
}

export function clearSessionJson(url) {
  rawCache.delete(url);
  rawInflight.delete(url);
}

export function clearSessionValue(key) {
  valueCache.delete(key);
  valueInflight.delete(key);
}

export async function loadSessionJson(url, fetchImpl = fetch, init = { cache: "force-cache" }) {
  if (rawCache.has(url)) return rawCache.get(url);
  if (rawInflight.has(url)) return rawInflight.get(url);

  const task = Promise.resolve()
    .then(() => fetchImpl(url, init))
    .then(async (response) => {
      if (!response?.ok) {
        throw new Error(`HTTP ${response?.status || "unknown"} for ${url}`);
      }
      const data = await response.json();
      rawCache.set(url, data);
      return data;
    })
    .finally(() => {
      rawInflight.delete(url);
    });

  rawInflight.set(url, task);
  return task;
}

/**
 * Cache a derived/normalized payload under a stable key (e.g. "basic-words").
 * Only used for the default global fetch path so unit tests with mock fetch stay pure.
 */
export async function loadSessionValue(key, factory, { useMemory = true } = {}) {
  if (useMemory && valueCache.has(key)) return valueCache.get(key);
  if (useMemory && valueInflight.has(key)) return valueInflight.get(key);

  const task = Promise.resolve()
    .then(factory)
    .then((value) => {
      if (useMemory) valueCache.set(key, value);
      return value;
    })
    .finally(() => {
      valueInflight.delete(key);
    });

  if (useMemory) valueInflight.set(key, task);
  return task;
}

export function clearSessionDataCaches() {
  rawCache.clear();
  rawInflight.clear();
  valueCache.clear();
  valueInflight.clear();
}
