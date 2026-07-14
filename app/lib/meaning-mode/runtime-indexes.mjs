/**
 * Lazy-loaded meaning runtime indexes (v2026-07-10.4).
 * Heavy generated modules are only pulled when ensureMeaningRuntimeIndexes() runs —
 * typically via createEngine() on the meaning page (already a dynamic import).
 */

const WORD_BANK_INDEX_CACHE = new WeakMap();

let ready = false;
let readyPromise = null;
let SEMANTIC_INDEX = [];
let MEANING_POS_INDEX = Object.create(null);
let _relationIndex = new Map();
export let _semanticByWordId = new Map();
let defaultDistractorPool = null;

/**
 * Load heavy generated indexes once. Safe to call repeatedly.
 */
export async function ensureMeaningRuntimeIndexes() {
  if (ready) return true;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const [semanticMod, posMod, relationMod] = await Promise.all([
      import("./semantic-distractor-index.mjs"),
      import("./meaning-pos-index.generated.mjs"),
      import("./sense-relation-engine.mjs")
    ]);

    SEMANTIC_INDEX = semanticMod.SEMANTIC_INDEX || [];
    MEANING_POS_INDEX = posMod.MEANING_POS_INDEX || Object.create(null);
    _relationIndex = relationMod._relationIndex || new Map();
    _semanticByWordId = new Map(SEMANTIC_INDEX.map((entry) => [entry.wordId, entry]));
    defaultDistractorPool = null;
    ready = true;
    return true;
  })();

  try {
    return await readyPromise;
  } catch (error) {
    readyPromise = null;
    throw error;
  }
}

export function isMeaningRuntimeIndexesReady() {
  return ready;
}

function assertReady() {
  if (!ready) {
    throw new Error(
      "Meaning runtime indexes not loaded. Await ensureMeaningRuntimeIndexes() or createEngine() first."
    );
  }
}

export function hydrateMeaningWordBank(wordBank) {
  assertReady();
  for (const item of wordBank) {
    item._posFamily = MEANING_POS_INDEX[item.wordId] || item._posFamily || item.posFamily || "unknown";

    const semantic = _semanticByWordId.get(item.wordId);
    if (semantic) {
      item._semanticGroups = semantic._semanticGroups;
      item._confidence = semantic._confidence;
    } else if (!item._semanticGroups) {
      item._semanticGroups = ["general"];
      item._confidence = "low";
    }

    const relation = _relationIndex.get(item.wordId);
    if (relation) {
      item._conceptAxis = relation.conceptAxis;
      item._conceptValue = relation.conceptValue;
      item._relationFamily = relation.relationFamily;
    }
  }
  return wordBank;
}

export function getDefaultDistractorPool() {
  assertReady();
  if (!defaultDistractorPool) {
    defaultDistractorPool = hydrateMeaningWordBank([...SEMANTIC_INDEX]);
  }
  return defaultDistractorPool;
}

export function getWordBankIndex(wordBank) {
  if (!Array.isArray(wordBank)) {
    return { byWordId: new Map(), byPosFamily: new Map() };
  }

  const cached = WORD_BANK_INDEX_CACHE.get(wordBank);
  if (cached) return cached;

  const byWordId = new Map();
  const byPosFamily = new Map();

  for (const item of wordBank) {
    if (!item?.wordId) continue;
    byWordId.set(item.wordId, item);
    const family = item._posFamily || item.posFamily || "unknown";
    if (!byPosFamily.has(family)) byPosFamily.set(family, []);
    byPosFamily.get(family).push(item);
  }

  const index = { byWordId, byPosFamily };
  WORD_BANK_INDEX_CACHE.set(wordBank, index);
  return index;
}
