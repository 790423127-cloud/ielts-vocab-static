function text(value) {
  return String(value || "").trim();
}

function collectAliasIds(entry) {
  const ids = new Set();
  for (const relation of [
    ...(Array.isArray(entry?.mergedAliases) ? entry.mergedAliases : []),
    ...(Array.isArray(entry?.mergedEntries) ? entry.mergedEntries : []),
    ...(Array.isArray(entry?.forms) ? entry.forms : [])
  ]) {
    const id = text(relation?.id || relation?.entryId);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Resolve a browser AI queue against the current on-disk G vocabulary.
 *
 * The browser can stay open while a maintenance script merges an independent
 * inflection into its canonical headword.  In that case the queue still holds
 * the old id (for example rg_word_affairs), while the current entry stores that
 * id in mergedAliases/forms.  Resolve that alias instead of failing the whole
 * paid batch.  Entries that were removed, already completed, or are no longer
 * eligible are skipped before any AI request is made.
 */
export function resolveReadingGAiTargets(vocab, requestedIds, options = {}) {
  const items = Array.isArray(vocab?.items) ? vocab.items : [];
  const isEligible = typeof options.isEligible === "function"
    ? options.isEligible
    : () => true;
  const maxTargets = Math.max(1, Number(options.maxTargets) || 120);
  const ids = [...new Set(
    (Array.isArray(requestedIds) ? requestedIds : [])
      .map(text)
      .filter(Boolean)
  )].slice(0, maxTargets);

  const byId = new Map();
  const byHistoricId = new Map();
  for (const entry of items) {
    const id = text(entry?.id);
    if (id) byId.set(id, entry);
    for (const aliasId of collectAliasIds(entry)) {
      if (!byHistoricId.has(aliasId)) byHistoricId.set(aliasId, entry);
    }
  }

  const targets = [];
  const targetIds = new Set();
  const remapped = [];
  const skipped = [];

  for (const requestedId of ids) {
    const direct = byId.get(requestedId);
    const entry = direct || byHistoricId.get(requestedId);
    if (!entry) {
      skipped.push({
        requestedId,
        reason: "missing-from-current-vocabulary"
      });
      continue;
    }

    const targetId = text(entry.id);
    if (!isEligible(entry)) {
      skipped.push({
        requestedId,
        targetId,
        word: text(entry.word),
        reason: direct ? "already-complete-or-excluded" : "merged-target-already-complete-or-excluded"
      });
      continue;
    }

    if (targetIds.has(targetId)) {
      skipped.push({
        requestedId,
        targetId,
        word: text(entry.word),
        reason: "duplicate-current-target"
      });
      continue;
    }

    targetIds.add(targetId);
    targets.push(entry);
    if (!direct) {
      remapped.push({
        requestedId,
        targetId,
        word: text(entry.word),
        reason: "merged-alias"
      });
    }
  }

  return {
    requestedIds: ids,
    targets,
    remapped,
    skipped
  };
}
