function cleanText(value) {
  return String(value || "").trim();
}

function stableId(entry = {}) {
  return cleanText(entry.id || entry.wordId);
}

function normalizedWord(entry = {}) {
  return cleanText(entry.word).normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
}

export function isBrowserOnlyLexiconSupplement(entry = {}) {
  return (
    entry.addedFromPersonalWrongBook === true ||
    entry.source === "personal_wrong_book"
  );
}

export function formalLexiconWords(words = []) {
  return (Array.isArray(words) ? words : []).filter((entry) => !isBrowserOnlyLexiconSupplement(entry));
}

function deletionRows(beforeWords = [], nextWords = []) {
  const before = formalLexiconWords(beforeWords);
  const next = formalLexiconWords(nextWords);
  const nextIds = new Set(next.map(stableId).filter(Boolean));
  const removed = before
    .filter((entry) => {
      const id = stableId(entry);
      return id && !nextIds.has(id);
    })
    .map((entry) => ({
      id: stableId(entry),
      word: cleanText(entry.word)
    }));
  return { before, next, removed };
}

export function buildLexiconDeletionIntent(
  beforeWords = [],
  nextWords = [],
  { action = "", confirmed = false } = {}
) {
  const comparison = deletionRows(beforeWords, nextWords);
  if (!comparison.removed.length) return null;
  return {
    action: cleanText(action),
    confirmed: confirmed === true,
    expectedBeforeCount: comparison.before.length,
    expectedAfterCount: comparison.next.length,
    removed: comparison.removed
  };
}

export function validateLexiconDeletionIntent(currentWords = [], nextWords = [], intent = null) {
  const comparison = deletionRows(currentWords, nextWords);
  if (!comparison.removed.length) {
    return {
      ok: true,
      removed: [],
      beforeCount: comparison.before.length,
      afterCount: comparison.next.length
    };
  }

  if (!intent || intent.confirmed !== true || !cleanText(intent.action)) {
    return {
      ok: false,
      status: 409,
      error: "正式词库删除缺少明确确认",
      detail: `检测到将删除 ${comparison.removed.length} 条正式词，但请求没有携带确认过的删除清单。`
    };
  }

  if (
    Number(intent.expectedBeforeCount) !== comparison.before.length ||
    Number(intent.expectedAfterCount) !== comparison.next.length
  ) {
    return {
      ok: false,
      status: 409,
      error: "正式词库删除数量已变化",
      detail: "删除确认时的词库数量与当前写回内容不一致，请刷新后重新确认。"
    };
  }

  const expectedIds = comparison.removed.map((entry) => entry.id).sort();
  const declaredRows = Array.isArray(intent.removed) ? intent.removed : [];
  const declaredIds = declaredRows.map((entry) => cleanText(entry?.id)).filter(Boolean).sort();
  if (
    declaredIds.length !== expectedIds.length ||
    declaredIds.some((id, index) => id !== expectedIds[index])
  ) {
    return {
      ok: false,
      status: 409,
      error: "正式词库删除目标不一致",
      detail: "服务器计算出的删除 ID 与用户确认的删除清单不一致，已拒绝写回。"
    };
  }

  const currentIds = new Set(comparison.before.map(stableId).filter(Boolean));
  if (currentIds.size !== comparison.before.length) {
    return {
      ok: false,
      status: 409,
      error: "正式词库稳定 ID 异常",
      detail: "当前正式词库存在缺失或重复 ID，不能执行删除。"
    };
  }

  return {
    ok: true,
    removed: comparison.removed,
    beforeCount: comparison.before.length,
    afterCount: comparison.next.length,
    action: cleanText(intent.action)
  };
}

/**
 * A direct "delete current word" request contains an explicit stable-ID list.
 * When its browser cache is stale, rebuilding the complete browser snapshot
 * would accidentally delete every entry that the stale cache does not know.
 * Rebase only that confirmed deletion on the authoritative current lexicon.
 */
export function rebaseConfirmedCurrentWordDeletion(currentWords = [], intent = null) {
  const before = formalLexiconWords(currentWords);
  const declaredRows = Array.isArray(intent?.removed) ? intent.removed : [];
  const declaredIds = declaredRows
    .map((entry) => cleanText(entry?.id))
    .filter(Boolean);
  const uniqueDeclaredIds = [...new Set(declaredIds)];

  if (
    intent?.confirmed !== true ||
    cleanText(intent?.action) !== "delete-current-word" ||
    !uniqueDeclaredIds.length ||
    uniqueDeclaredIds.length !== declaredIds.length
  ) {
    return {
      ok: false,
      status: 409,
      error: "正式词库删除缺少明确确认",
      detail: "当前词删除必须携带一次确认过的、无重复的稳定 ID 清单。"
    };
  }

  const currentById = new Map();
  for (const entry of before) {
    const id = stableId(entry);
    if (!id || currentById.has(id)) {
      return {
        ok: false,
        status: 409,
        error: "正式词库稳定 ID 异常",
        detail: "当前正式词库存在缺失或重复 ID，不能执行删除。"
      };
    }
    currentById.set(id, entry);
  }

  const missingIds = uniqueDeclaredIds.filter((id) => !currentById.has(id));
  if (missingIds.length) {
    return {
      ok: false,
      status: 409,
      error: "正式词库删除目标已变化",
      detail: "已确认的词条已不在当前正式词库中，请刷新后再操作。"
    };
  }

  const removedIdSet = new Set(uniqueDeclaredIds);
  const words = before.filter((entry) => !removedIdSet.has(stableId(entry)));
  const removed = uniqueDeclaredIds.map((id) => {
    const entry = currentById.get(id);
    return { id, word: cleanText(entry?.word) };
  });
  const expectedBeforeCount = Number(intent?.expectedBeforeCount);
  const expectedAfterCount = Number(intent?.expectedAfterCount);

  return {
    ok: true,
    words,
    removed,
    beforeCount: before.length,
    afterCount: words.length,
    action: cleanText(intent.action),
    rebased:
      expectedBeforeCount !== before.length ||
      expectedAfterCount !== words.length
  };
}

export function buildLexiconRetirementPayload(
  currentData = {},
  removedEntries = [],
  { version = "", savedAt = "" } = {}
) {
  const entries = Array.isArray(currentData?.entries) ? [...currentData.entries] : [];
  const seenIds = new Set(entries.map(stableId).filter(Boolean));
  const seenWords = new Set(entries.map(normalizedWord).filter(Boolean));

  for (const removed of Array.isArray(removedEntries) ? removedEntries : []) {
    const id = stableId(removed);
    const word = cleanText(removed?.word);
    const wordKey = normalizedWord(removed);
    if ((!id && !wordKey) || (id && seenIds.has(id)) || (wordKey && seenWords.has(wordKey))) {
      continue;
    }
    entries.push({
      ...(id ? { id } : {}),
      word,
      reason: "user-curated-removal"
    });
    if (id) seenIds.add(id);
    if (wordKey) seenWords.add(wordKey);
  }

  return {
    ...currentData,
    version: cleanText(version) || cleanText(currentData?.version),
    generatedAt: cleanText(savedAt) || cleanText(currentData?.generatedAt),
    count: entries.length,
    entries
  };
}
