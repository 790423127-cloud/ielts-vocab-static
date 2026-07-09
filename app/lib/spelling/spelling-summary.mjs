import { buildSpellingCandidates } from "./candidate-builder.mjs";
import { SpellingIndexedDbStore } from "./indexeddb-store.mjs";
import { loadSpellingLexicon } from "./load-spelling-lexicon.mjs";
import { normalizeSpellingScope, resolveSpellingScope } from "./spelling-scope.mjs";
import { getTodayStats } from "./stats.mjs";

function toRecordMap(records = []) {
  const map = {};

  for (const record of Array.isArray(records) ? records : []) {
    if (record?.wordId) map[record.wordId] = record;
  }

  return map;
}

export async function getSpellingEntrySummary(options = {}) {
  const scope = normalizeSpellingScope(options.scope || "word");
  const scopeConfig = resolveSpellingScope(scope);
  const lexicon = await loadSpellingLexicon(options);
  const entries = scope === "phrase" ? lexicon.phrases : lexicon.headwords;
  const candidates = buildSpellingCandidates(entries, {}, {
    entryMode: scopeConfig.entryMode,
    scope,
    excludeFamiliarFlashcards: false
  });
  const candidateWordIds = candidates.map((candidate) => candidate.wordId).filter(Boolean);

  let records = {};

  if (typeof indexedDB !== "undefined") {
    const store = new SpellingIndexedDbStore({ scope });
    await store.open();
    records = toRecordMap(await store.getAllRecords());
  }

  const stats = getTodayStats(records, { candidateWordIds, now: Date.now() });
  const pending = Number(stats.todaySpellingRemainingCount || 0) + Number(stats.todayRepairPendingCount || 0);

  return {
    scope,
    pending,
    stats,
    counts: scope === "phrase"
      ? { phrases: lexicon.counts.phrases }
      : { headwords: lexicon.counts.headwords },
    lexiconVersion: lexicon.lexiconVersion,
    lexiconHash: lexicon.lexiconHash
  };
}