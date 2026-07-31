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
