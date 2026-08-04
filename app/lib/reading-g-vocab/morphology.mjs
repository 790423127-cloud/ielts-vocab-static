import { normalizeReadingGKey } from "./normalize.mjs";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function relationWord(value) {
  return typeof value === "string"
    ? text(value)
    : text(value?.word || value?.form || value?.value);
}

function mergeMissingFields(primary, secondary) {
  const merged = { ...primary };
  for (const [field, value] of Object.entries(secondary || {})) {
    if (
      (merged[field] === undefined || merged[field] === null || merged[field] === "")
      && value !== undefined
      && value !== null
      && value !== ""
    ) {
      merged[field] = value;
    }
  }
  return merged;
}

function normalizeRelationRows(values, { headword = "", kind = "family" } = {}) {
  const headwordKey = normalizeReadingGKey(headword);
  const rows = new Map();
  let selfLinksRemoved = 0;
  let duplicateRowsMerged = 0;

  for (const value of asArray(values)) {
    const word = relationWord(value);
    const key = normalizeReadingGKey(word);
    if (!key) continue;
    if (headwordKey && key === headwordKey) {
      selfLinksRemoved += 1;
      continue;
    }

    const source = value && typeof value === "object" ? structuredClone(value) : {};
    const row = { ...source, word };
    delete row.form;
    delete row.value;
    if (kind === "form") row.type = text(source.type) || "form";
    for (const field of ["id", "type", "note", "source", "pos", "meaning", "relation"]) {
      if (Object.prototype.hasOwnProperty.call(row, field)) row[field] = text(row[field]);
    }

    if (!rows.has(key)) {
      rows.set(key, row);
      continue;
    }
    rows.set(key, mergeMissingFields(rows.get(key), row));
    duplicateRowsMerged += 1;
  }

  return { rows: [...rows.values()], selfLinksRemoved, duplicateRowsMerged };
}

export function normalizeReadingGForms(values, headword = "") {
  return normalizeRelationRows(values, { headword, kind: "form" }).rows;
}

export function normalizeReadingGWordFamily(values, headword = "") {
  return normalizeRelationRows(values, { headword, kind: "family" }).rows;
}

function relationKeys(values) {
  return new Set(asArray(values).map((entry) => normalizeReadingGKey(entry?.word)).filter(Boolean));
}

function mergeRows(primary, secondary, kind, headword) {
  return normalizeRelationRows([...asArray(primary), ...asArray(secondary)], { kind, headword });
}

export function organizeReadingGEntryMorphology(entry, masterEntry = null) {
  const headword = text(entry?.word);
  const existingFormsResult = normalizeRelationRows(entry?.forms, { headword, kind: "form" });
  const existingFamilyResult = normalizeRelationRows(entry?.wordFamily, { headword, kind: "family" });
  const masterFormsResult = normalizeRelationRows(masterEntry?.forms, { headword, kind: "form" });
  const masterFamilyResult = normalizeRelationRows(masterEntry?.wordFamily, { headword, kind: "family" });

  const existingForms = existingFormsResult.rows;
  const existingFamily = existingFamilyResult.rows;
  const masterForms = masterFormsResult.rows;
  const masterFamily = masterFamilyResult.rows;
  const masterFormKeys = relationKeys(masterForms);
  const masterFamilyKeys = relationKeys(masterFamily);
  const existingFormKeys = relationKeys(existingForms);
  const existingFamilyKeys = relationKeys(existingFamily);

  const familyRowsMovedToForms = existingFamily.filter((row) => masterFormKeys.has(normalizeReadingGKey(row.word)));
  const formRowsMovedToFamily = existingForms.filter((row) => (
    masterFamilyKeys.has(normalizeReadingGKey(row.word))
    && !masterFormKeys.has(normalizeReadingGKey(row.word))
  ));
  const retainedExistingForms = existingForms.filter((row) => !masterFamilyKeys.has(normalizeReadingGKey(row.word)) || masterFormKeys.has(normalizeReadingGKey(row.word)));

  const formsResult = mergeRows(masterForms, [...retainedExistingForms, ...familyRowsMovedToForms], "form", headword);
  const formKeys = relationKeys(formsResult.rows);
  const familyResult = mergeRows(masterFamily, [...existingFamily, ...formRowsMovedToFamily], "family", headword);
  const wordFamily = familyResult.rows.filter((row) => !formKeys.has(normalizeReadingGKey(row.word)));
  const crossCategoryDuplicatesRemoved = familyResult.rows.length - wordFamily.length;
  const hasMasterMorphology = masterForms.length > 0 || masterFamily.length > 0;
  const sourceFiles = hasMasterMorphology
    ? [...new Set([...asArray(entry?.sourceFiles).map(text).filter(Boolean), "public/data/words.json"])]
    : asArray(entry?.sourceFiles);
  const qualityFlags = hasMasterMorphology
    ? [...new Set([...asArray(entry?.qualityFlags).map(text).filter(Boolean), "master_morphology_merged"])]
    : asArray(entry?.qualityFlags);

  const next = {
    ...entry,
    forms: formsResult.rows,
    wordFamily,
    sourceFiles,
    qualityFlags
  };
  const changed = JSON.stringify({
    forms: entry?.forms || [],
    wordFamily: entry?.wordFamily || [],
    sourceFiles: entry?.sourceFiles || [],
    qualityFlags: entry?.qualityFlags || []
  }) !== JSON.stringify({
    forms: next.forms,
    wordFamily: next.wordFamily,
    sourceFiles: next.sourceFiles,
    qualityFlags: next.qualityFlags
  });

  return {
    entry: next,
    changed,
    stats: {
      masterMatched: Boolean(masterEntry),
      hasMasterMorphology,
      masterFormsAdded: masterForms.filter((row) => !existingFormKeys.has(normalizeReadingGKey(row.word)) && !existingFamilyKeys.has(normalizeReadingGKey(row.word))).length,
      masterFamilyAdded: masterFamily.filter((row) => !existingFormKeys.has(normalizeReadingGKey(row.word)) && !existingFamilyKeys.has(normalizeReadingGKey(row.word))).length,
      familyRowsMovedToForms: familyRowsMovedToForms.length,
      formRowsMovedToFamily: formRowsMovedToFamily.length,
      crossCategoryDuplicatesRemoved,
      selfLinksRemoved:
        existingFormsResult.selfLinksRemoved
        + existingFamilyResult.selfLinksRemoved
        + masterFormsResult.selfLinksRemoved
        + masterFamilyResult.selfLinksRemoved,
      duplicateRowsMerged:
        existingFormsResult.duplicateRowsMerged
        + existingFamilyResult.duplicateRowsMerged
        + formsResult.duplicateRowsMerged
        + familyResult.duplicateRowsMerged
    }
  };
}

export function organizeReadingGMorphology(items, masterByKey = new Map()) {
  const stats = {
    wordEntries: 0,
    exactMasterMatches: 0,
    entriesWithMasterMorphology: 0,
    entriesChanged: 0,
    masterFormsAdded: 0,
    masterFamilyAdded: 0,
    familyRowsMovedToForms: 0,
    formRowsMovedToFamily: 0,
    crossCategoryDuplicatesRemoved: 0,
    selfLinksRemoved: 0,
    duplicateRowsMerged: 0,
    entriesWithForms: 0,
    entriesWithWordFamily: 0,
    formRows: 0,
    wordFamilyRows: 0
  };

  const organizedItems = asArray(items).map((entry) => {
    if ((entry?.entryType || "word") !== "word") return entry;
    stats.wordEntries += 1;
    const masterEntry = masterByKey.get(normalizeReadingGKey(entry?.normalizedKey || entry?.word)) || null;
    const result = organizeReadingGEntryMorphology(entry, masterEntry);
    if (result.stats.masterMatched) stats.exactMasterMatches += 1;
    if (result.stats.hasMasterMorphology) stats.entriesWithMasterMorphology += 1;
    if (result.changed) stats.entriesChanged += 1;
    for (const field of [
      "masterFormsAdded",
      "masterFamilyAdded",
      "familyRowsMovedToForms",
      "formRowsMovedToFamily",
      "crossCategoryDuplicatesRemoved",
      "selfLinksRemoved",
      "duplicateRowsMerged"
    ]) {
      stats[field] += result.stats[field];
    }
    if (result.entry.forms.length) stats.entriesWithForms += 1;
    if (result.entry.wordFamily.length) stats.entriesWithWordFamily += 1;
    stats.formRows += result.entry.forms.length;
    stats.wordFamilyRows += result.entry.wordFamily.length;
    return result.entry;
  });

  return { items: organizedItems, stats };
}
