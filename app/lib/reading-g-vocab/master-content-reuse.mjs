import { getReadingGContentIssues, isReadingGPlaceholderContent } from "./content-completeness.mjs";
import { normalizeReadingGForms, normalizeReadingGWordFamily } from "./morphology.mjs";
import { normalizeReadingGKey } from "./normalize.mjs";

const USER_STATE_FIELDS = Object.freeze([
  "status",
  "favorite",
  "srs",
  "reviewState",
  "learningState",
  "studyState",
  "progress"
]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function hasUsableText(value) {
  return Boolean(text(value) && !isReadingGPlaceholderContent(value));
}

function identity(entry) {
  return `${text(entry?.id)}::${text(entry?.word)}`;
}

function buildMasterIndex(masterWords) {
  const byId = new Map();
  const byKey = new Map();
  for (const entry of list(masterWords)) {
    const id = text(entry?.id || entry?.wordId);
    const key = normalizeReadingGKey(entry?.word);
    if (id) byId.set(id, entry);
    if (key) byKey.set(key, [...(byKey.get(key) || []), entry]);
  }
  return { byId, byKey };
}

function resolveMasterEntry(entry, index) {
  const entryKey = normalizeReadingGKey(entry?.word);
  const sourceWordId = text(entry?.sourceWordId);
  if (sourceWordId && index.byId.has(sourceWordId)) {
    const candidate = index.byId.get(sourceWordId);
    if (normalizeReadingGKey(candidate?.word) === entryKey) {
      return { entry: candidate, matchedBy: "sourceWordId" };
    }
  }
  const candidates = index.byKey.get(entryKey) || [];
  if (candidates.length === 1) return { entry: candidates[0], matchedBy: "headword" };
  return {
    entry: null,
    matchedBy: "",
    reason: candidates.length > 1 ? "ambiguous-headword" : "missing-headword"
  };
}

function copyScalar(next, source, targetField, sourceFields, validator = hasUsableText) {
  if (hasUsableText(next?.[targetField])) return false;
  const sourceValue = sourceFields.map((field) => source?.[field]).find(validator);
  if (!validator(sourceValue)) return false;
  next[targetField] = sourceValue;
  return true;
}

function copyExamplePair(next, source) {
  const sourceExample = text(source?.example);
  const sourceExampleZh = text(source?.exampleCn || source?.exampleZh);
  if (!hasUsableText(sourceExample) || !hasUsableText(sourceExampleZh)) return [];
  const fields = [];
  if (!hasUsableText(next?.example)) {
    next.example = sourceExample;
    fields.push("example");
  }
  if (!hasUsableText(next?.exampleCn || next?.exampleZh)) {
    next.exampleCn = sourceExampleZh;
    fields.push("exampleCn");
  }
  return fields;
}

function copyListIfEmpty(next, source, field, reviewedField = "") {
  if (list(next?.[field]).length || list(source?.[field]).length === 0) return false;
  next[field] = structuredClone(source[field]);
  if (reviewedField) next[reviewedField] = true;
  return true;
}

function copyReviewedEmptyState(next, source, field, reviewedField) {
  if (
    list(next?.[field]).length
    || next?.[reviewedField] === true
    || list(source?.[field]).length
    || source?.[reviewedField] !== true
  ) {
    return false;
  }
  next[reviewedField] = true;
  next[`${field}ReviewSource`] = "master-lexicon";
  return true;
}

function sourceSenseId(entryId, index) {
  return `${entryId || "reading_g"}_master_${String(index + 1).padStart(2, "0")}`;
}

function reusableMasterSenses(entry, master) {
  if (!getReadingGContentIssues(entry).includes("multiPosNeedsSplit")) return [];
  const senses = list(master?.senses).filter((sense) => (
    text(sense?.pos) && text(sense?.meaningZh || sense?.meaning)
  ));
  const posKinds = new Set(senses.map((sense) => text(sense.pos).toLowerCase()));
  if (senses.length < 2 || posKinds.size < 2) return [];
  return senses.map((sense, index) => ({
    ...structuredClone(sense),
    senseId: sourceSenseId(entry?.id, index),
    sourceFiles: unique([...list(sense?.sourceFiles), "public/data/words.json"])
  }));
}

function mergeOneEntry(entry, master) {
  const next = structuredClone(entry);
  const changedFields = [];
  if (!list(next.forms).length && list(master.forms).length) {
    next.forms = normalizeReadingGForms(master.forms, next.word);
    if (next.forms.length) changedFields.push("forms");
  }
  if (!list(next.wordFamily).length && list(master.wordFamily).length) {
    const formKeys = new Set(list(next.forms).map((row) => normalizeReadingGKey(row?.word)).filter(Boolean));
    next.wordFamily = normalizeReadingGWordFamily(master.wordFamily, next.word).filter(
      (row) => !formKeys.has(normalizeReadingGKey(row?.word))
    );
    if (next.wordFamily.length) changedFields.push("wordFamily");
  }
  if (copyReviewedEmptyState(next, master, "forms", "formsReviewed")) {
    changedFields.push("formsReviewed");
  }
  if (copyReviewedEmptyState(next, master, "wordFamily", "wordFamilyReviewed")) {
    changedFields.push("wordFamilyReviewed");
  }

  if (copyScalar(next, master, "phonetic", ["phonetic"])) changedFields.push("phonetic");
  if (copyScalar(next, master, "primaryPos", ["primaryPos", "pos"])) changedFields.push("primaryPos");
  if (copyScalar(next, master, "pos", ["pos", "primaryPos"])) changedFields.push("pos");

  const currentMeaning = text(next.primaryMeaningZh || next.meaningZh || next.meaning);
  const masterMeaning = text(master.primaryMeaningZh || master.meaningZh || master.meaning);
  if (!hasUsableText(currentMeaning) && hasUsableText(masterMeaning)) {
    next.primaryMeaningZh = masterMeaning;
    next.meaningZh = masterMeaning;
    next.meaning = masterMeaning;
    changedFields.push("meaning");
  }
  if (copyScalar(next, master, "definition", ["definition"])) changedFields.push("definition");
  if (copyScalar(next, master, "meaningDetailZh", ["meaningDetailZh", "meaningDetailedZh"])) {
    changedFields.push("meaningDetailZh");
  }
  changedFields.push(...copyExamplePair(next, master));

  if (copyListIfEmpty(next, master, "collocations", "collocationsReviewed")) changedFields.push("collocations");
  if (copyListIfEmpty(next, master, "phraseCollocations", "phraseCollocationsReviewed")) {
    changedFields.push("phraseCollocations");
  }

  const senses = reusableMasterSenses(next, master);
  if (senses.length) {
    next.senses = senses;
    changedFields.push("senses");
  }

  if (changedFields.length) {
    next.sourceFiles = unique([...list(next.sourceFiles), "public/data/words.json"]);
    next.qualityFlags = unique([...list(next.qualityFlags), "master_content_reused"]);
  }

  return { entry: next, changedFields: unique(changedFields) };
}

export function buildReadingGMasterReusePlan(vocabPayload, masterPayload) {
  const items = list(vocabPayload?.items);
  const masterWords = list(masterPayload?.words);
  if (!items.length || Number(vocabPayload?.count) !== items.length) {
    throw new Error("G 类词库 items/count 不一致，已停止复用。");
  }
  if (!masterWords.length || Number(masterPayload?.count) !== masterWords.length) {
    throw new Error("主词库 words/count 不一致，已停止复用。");
  }

  const index = buildMasterIndex(masterWords);
  const beforeIdentity = items.map(identity);
  const beforeState = items.map((entry) => USER_STATE_FIELDS.map((field) => entry?.[field]));
  const report = {
    totalEntries: items.length,
    wordEntries: 0,
    matchedBySourceWordId: 0,
    matchedByUniqueHeadword: 0,
    unmatched: 0,
    ambiguous: 0,
    changedEntries: 0,
    fieldCounts: {},
    stableIdsChanged: 0,
    userStateChanged: 0
  };

  const nextItems = items.map((entry) => {
    if ((entry?.entryType || "word") !== "word") return entry;
    report.wordEntries += 1;
    const resolved = resolveMasterEntry(entry, index);
    if (!resolved.entry) {
      if (resolved.reason === "ambiguous-headword") report.ambiguous += 1;
      else report.unmatched += 1;
      return entry;
    }
    if (resolved.matchedBy === "sourceWordId") report.matchedBySourceWordId += 1;
    else report.matchedByUniqueHeadword += 1;
    const merged = mergeOneEntry(entry, resolved.entry);
    if (!merged.changedFields.length) return entry;
    report.changedEntries += 1;
    for (const field of merged.changedFields) {
      report.fieldCounts[field] = (report.fieldCounts[field] || 0) + 1;
    }
    return merged.entry;
  });

  const afterIdentity = nextItems.map(identity);
  if (JSON.stringify(beforeIdentity) !== JSON.stringify(afterIdentity)) {
    report.stableIdsChanged = beforeIdentity.filter((value, index) => value !== afterIdentity[index]).length;
    throw new Error("复用尝试改变了 G 类词库数量、顺序、词头或稳定 ID，已停止写入。");
  }
  const afterState = nextItems.map((entry) => USER_STATE_FIELDS.map((field) => entry?.[field]));
  if (JSON.stringify(beforeState) !== JSON.stringify(afterState)) {
    report.userStateChanged = beforeState.filter((value, index) => (
      JSON.stringify(value) !== JSON.stringify(afterState[index])
    )).length;
    throw new Error("复用尝试改变了学习状态，已停止写入。");
  }

  return {
    changed: report.changedEntries > 0,
    payload: {
      ...vocabPayload,
      items: nextItems
    },
    report
  };
}
