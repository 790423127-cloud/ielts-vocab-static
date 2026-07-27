function uniqueWordIds(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
}

export function getErrorBankRecordIds(candidate = {}) {
  const source = candidate?.sourceWord || candidate;
  const marked = uniqueWordIds(source?.__errorBankRecordIds);
  if (marked.length) return marked;
  return [];
}

export function isErrorBankCandidate(candidate = {}) {
  return getErrorBankRecordIds(candidate).length > 0;
}

export function resolveErrorBankDeleteShortcut(event = {}, options = {}) {
  if (!options.hasErrorBankCandidate) return false;
  if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;

  const key = String(event.key || "");
  const code = String(event.code || "");
  const isDelete = key === "Delete" || code === "Delete" || event.keyCode === 46 || event.which === 46;
  if (isDelete) return true;

  const isD = key.toLowerCase() === "d" || code === "KeyD";
  return isD && options.editableTarget !== true;
}

export async function dismissErrorBankCandidate(store, candidate = {}, options = {}) {
  if (!store?.getRecord || !store?.putRecord || !store?.deleteErrorBankRecord) {
    throw new Error("错词本存储不可用");
  }

  const wordIds = getErrorBankRecordIds(candidate);
  if (!wordIds.length) return { removed: 0, wordIds: [] };

  const now = Number(options.now || Date.now());
  for (const wordId of wordIds) {
    const record = await store.getRecord(wordId);
    if (!record) {
      await store.deleteErrorBankRecord(wordId);
      continue;
    }

    await store.putRecord({
      ...record,
      errorBank: {
        ...(record.errorBank || {}),
        everWrong: false,
        active: false,
        dismissedAt: now
      },
      updatedAt: now,
      revision: Number(record.revision || 0) + 1,
      dirty: true
    });
  }

  return { removed: wordIds.length, wordIds };
}
