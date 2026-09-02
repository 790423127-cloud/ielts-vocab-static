import { normalizeReadingGKey } from "./normalize.mjs";

export const READING_G_COMPACTION_SOURCE = "public/data/reading-g-word-family-compaction.json";
export const READING_G_COMPACTION_VERSION = "reading-g-internal-family-compaction-v1";

const WEAK_FORM_TYPES = new Set(["", "form", "corpus-observed-form", "adverbial form"]);
const PLACEHOLDER_MARKERS = ["待补", "词汇"];
const EXCEL_SOURCE_HEADWORD_RELATION = "excel-source-headword";
const IRREGULAR_COMPARISON_FORMS = new Map([
  ["good", new Set(["better", "best"])],
  ["well", new Set(["better", "best"])],
  ["bad", new Set(["worse", "worst"])],
  ["many", new Set(["more", "most"])],
  ["much", new Set(["more", "most"])],
  ["little", new Set(["less", "least"])],
  ["far", new Set(["farther", "farthest", "further", "furthest"])]
]);

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

function uniqueText(values) {
  return [...new Set(asArray(values).map(text).filter(Boolean))];
}

function chineseText(value) {
  return (text(value).match(/[\u3400-\u9fff]/g) || []).join("");
}

function primaryMeaning(entry) {
  return text(entry?.primaryMeaningZh || entry?.meaning || entry?.meaningZh);
}

function senseMeaning(value) {
  if (typeof value === "string") return text(value);
  return text(
    value?.meaningZh
    || value?.meaning_zh
    || value?.gloss
    || value?.quizMeaningZh
    || value?.meaning
    || value?.chinese
  );
}

function stripRelatedFormMeaning(entry, value = primaryMeaning(entry)) {
  const headword = text(entry?.word);
  let meaning = text(value);
  const prefixes = [`${headword}（相关词形）`, `${headword}(相关词形)`];
  const relatedFormPrefix = prefixes.find((prefix) => (
    headword && meaning.toLowerCase().startsWith(prefix.toLowerCase())
  ));
  if (relatedFormPrefix) {
    meaning = meaning.slice(relatedFormPrefix.length).replace(/^[：:]\s*/u, "");
  }
  return meaning;
}

function comparableMeaning(entry, value = primaryMeaning(entry)) {
  return stripRelatedFormMeaning(entry, value)
    .toLowerCase()
    .replace(/[，,]/gu, "；")
    .replace(/[。.!！?？\s]/gu, "")
    .replace(/[；;]{2,}/gu, "；");
}

function explicitMeaningKeys(entry) {
  return [
    ...asArray(entry?.senses),
    ...asArray(entry?.otherMeanings),
    ...asArray(entry?.meaningsZh),
    ...asArray(entry?.alternateMeanings)
  ].map((value) => comparableMeaning(entry, senseMeaning(value))).filter(Boolean);
}

function inspectExcelSourcePlural(alias, base, relation) {
  const relationType = text(relation?.relation || relation?.type).toLowerCase();
  if (relationType !== EXCEL_SOURCE_HEADWORD_RELATION) return { recognized: false, safe: false };

  const aliasKey = normalizeReadingGKey(alias?.normalizedKey || alias?.word);
  const baseKey = normalizeReadingGKey(base?.normalizedKey || base?.word);
  const aliasMeaning = comparableMeaning(alias);
  const baseMeaning = comparableMeaning(base);
  const isRegularNounPlural = coarsePos(alias) === "noun"
    && coarsePos(base) === "noun"
    && regularForms(baseKey, "plural", "noun").has(aliasKey);
  const hasIndependentMeaning = explicitMeaningKeys(alias).some((meaning) => meaning !== aliasMeaning);

  return {
    recognized: true,
    safe: Boolean(
      aliasKey
      && baseKey
      && aliasKey !== baseKey
      && alias?.pluralOnly !== true
      && isRegularNounPlural
      && aliasMeaning
      && aliasMeaning === baseMeaning
      && !hasIndependentMeaning
    )
  };
}

/**
 * Find imported plural surface forms that accidentally survived as their own
 * flashcards.  The relation, noun morphology and meaning must all agree; this
 * deliberately excludes lexicalised plurals and entries with another sense.
 */
export function findReadingGRedundantPluralAliases(items) {
  const wordEntries = asArray(items).filter((entry) => (entry?.entryType || "word") === "word");
  const byKey = new Map(
    wordEntries.map((entry) => [normalizeReadingGKey(entry.normalizedKey || entry.word), entry])
  );
  const found = new Map();

  for (const alias of wordEntries) {
    const aliasKey = normalizeReadingGKey(alias.normalizedKey || alias.word);
    for (const relation of asArray(alias.wordFamily)) {
      const baseKey = normalizeReadingGKey(relationWord(relation));
      const base = byKey.get(baseKey);
      if (!aliasKey || !base || aliasKey === baseKey) continue;
      const inspection = inspectExcelSourcePlural(alias, base, relation);
      if (!inspection.safe) continue;
      found.set(aliasKey, {
        canonicalKey: baseKey,
        canonicalId: text(base.id),
        canonicalWord: text(base.word),
        aliasKey,
        aliasId: text(alias.id),
        aliasWord: text(alias.word),
        relationType: "form"
      });
    }
  }

  return [...found.values()].sort((left, right) => left.aliasKey.localeCompare(right.aliasKey));
}

export function isPlaceholderMeaning(value) {
  const source = text(value);
  return !source || PLACEHOLDER_MARKERS.some((marker) => source.includes(marker));
}

export function buildChineseCharacterFrequency(entries) {
  const frequency = new Map();
  for (const entry of entries) {
    const chars = new Set(chineseText(primaryMeaning(entry)));
    for (const char of chars) frequency.set(char, (frequency.get(char) || 0) + 1);
  }
  return frequency;
}

export function meaningsAreCompatible(left, right, characterFrequency) {
  const leftText = chineseText(primaryMeaning(left));
  const rightText = chineseText(primaryMeaning(right));
  if (
    !leftText
    || !rightText
    || isPlaceholderMeaning(primaryMeaning(left))
    || isPlaceholderMeaning(primaryMeaning(right))
  ) {
    return false;
  }

  for (let index = 0; index < leftText.length - 1; index += 1) {
    if (rightText.includes(leftText.slice(index, index + 2))) return true;
  }
  for (const char of new Set(leftText)) {
    if (rightText.includes(char) && (characterFrequency.get(char) || Number.MAX_SAFE_INTEGER) <= 28) {
      return true;
    }
  }
  return false;
}

function longestCommonSubstringLength(left, right) {
  let longest = 0;
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      let length = 0;
      while (
        left[leftIndex + length]
        && left[leftIndex + length] === right[rightIndex + length]
      ) {
        length += 1;
      }
      longest = Math.max(longest, length);
    }
  }
  return longest;
}

export function hasFamilyShape(left, right) {
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  const commonLength = longestCommonSubstringLength(left, right);
  if (commonLength >= 4 && commonLength / Math.min(left.length, right.length) >= 0.55) return true;
  if (shorter.length === 3 && longer.includes(shorter)) return true;
  return ["in", "un", "re", "dis"].some((prefix) => longer.startsWith(`${prefix}${shorter}`));
}

export function coarsePos(entry) {
  const value = text(entry?.primaryPos || entry?.pos).toLowerCase();
  if (/(^|\/)v(\/|$)|verb/.test(value)) return "verb";
  if (/(^|\/)n(\/|$)|noun/.test(value)) return "noun";
  if (/adj/.test(value)) return "adjective";
  if (/adv/.test(value)) return "adverb";
  return "";
}

function posSet(entry) {
  const value = text(entry?.primaryPos || entry?.pos).toLowerCase();
  const result = new Set();
  if (/(^|\/)v(\/|$)|verb/.test(value)) result.add("verb");
  if (/(^|\/)n(\/|$)|noun/.test(value)) result.add("noun");
  if (/adj/.test(value)) result.add("adjective");
  if (/adv/.test(value)) result.add("adverb");
  return result;
}

function posOverlaps(left, right) {
  const leftSet = posSet(left);
  const rightSet = posSet(right);
  if (!leftSet.size || !rightSet.size) return false;
  return [...leftSet].some((value) => rightSet.has(value));
}

export function looksDerivational(word) {
  return /(tion|sion|ment|ness|ity|ship|ism|ist|ance|ence|ive|ous|able|ible|ally|er|or|ings|tions|sions|ments|nesses|ities|ists)$/i.test(word);
}

export function regularForms(headword, type, pos) {
  const forms = new Set();
  const add = (value) => value && forms.add(value);
  const generic = WEAK_FORM_TYPES.has(type);
  const noun = pos === "noun" || !pos;
  const verb = pos === "verb" || !pos;
  const adjective = pos === "adjective" || !pos;

  if ((generic || /plural|third-person/.test(type)) && (noun || verb)) {
    add(`${headword}s`);
    add(`${headword}es`);
    if (headword.endsWith("y")) add(`${headword.slice(0, -1)}ies`);
    if (headword.endsWith("f")) add(`${headword.slice(0, -1)}ves`);
    if (headword.endsWith("fe")) add(`${headword.slice(0, -2)}ves`);
  }
  if ((generic || /present participle|gerund/.test(type)) && verb) {
    add(`${headword}ing`);
    if (headword.endsWith("e")) add(`${headword.slice(0, -1)}ing`);
    if (headword.endsWith("ie")) add(`${headword.slice(0, -2)}ying`);
    if (headword.length > 2) add(`${headword}${headword.at(-1)}ing`);
  }
  if ((generic || /past tense|past participle/.test(type)) && verb) {
    add(`${headword}ed`);
    if (headword.endsWith("e")) add(`${headword}d`);
    if (headword.endsWith("y")) add(`${headword.slice(0, -1)}ied`);
    if (headword.length > 2) add(`${headword}${headword.at(-1)}ed`);
  }
  if ((generic || type === "comparative") && adjective) {
    add(`${headword}er`);
    if (headword.endsWith("y")) add(`${headword.slice(0, -1)}ier`);
    add(`${headword}${headword.at(-1)}er`);
  }
  if ((generic || type === "superlative") && adjective) {
    add(`${headword}est`);
    if (headword.endsWith("y")) add(`${headword.slice(0, -1)}iest`);
    add(`${headword}${headword.at(-1)}est`);
  }
  return forms;
}

function acceptedRelationEdges(entries) {
  const wordEntries = entries.filter((entry) => (entry?.entryType || "word") === "word");
  const byKey = new Map(
    wordEntries.map((entry) => [normalizeReadingGKey(entry.normalizedKey || entry.word), entry])
  );
  const characterFrequency = buildChineseCharacterFrequency(wordEntries);
  const edges = [];
  const rejected = [];

  for (const entry of wordEntries) {
    const from = normalizeReadingGKey(entry.normalizedKey || entry.word);
    for (const relation of asArray(entry.forms)) {
      const to = normalizeReadingGKey(relationWord(relation));
      const target = byKey.get(to);
      if (!from || !target || from === to) continue;
      const type = text(relation?.type).toLowerCase();
      const regular = regularForms(from, type, coarsePos(entry)).has(to);
      const semantic = meaningsAreCompatible(entry, target, characterFrequency);
      const edge = {
        from,
        to,
        kind: "form",
        type,
        confidence: regular ? "regular_form" : semantic ? "meaning_confirmed_form" : "rejected"
      };
      if (regular || semantic) edges.push(edge);
      else rejected.push(edge);
    }

    for (const relation of asArray(entry.wordFamily)) {
      const to = normalizeReadingGKey(relationWord(relation));
      const target = byKey.get(to);
      if (!from || !target || from === to) continue;
      const sourcePlural = inspectExcelSourcePlural(entry, target, relation);
      if (sourcePlural.recognized) {
        const edge = sourcePlural.safe
          ? {
            from: to,
            to: from,
            kind: "form",
            type: "plural",
            confidence: "regular_form"
          }
          : {
            from,
            to,
            kind: "form",
            type: "plural",
            confidence: "rejected_source_plural"
          };
        if (sourcePlural.safe) edges.push(edge);
        else rejected.push(edge);
        continue;
      }
      const semantic = meaningsAreCompatible(entry, target, characterFrequency);
      const shape = hasFamilyShape(from, to);
      const edge = {
        from,
        to,
        kind: "family",
        type: "word_family",
        confidence: semantic && shape ? "meaning_and_shape_confirmed_family" : "rejected"
      };
      if (semantic && shape) edges.push(edge);
      else rejected.push(edge);
    }
  }
  return { edges, rejected, byKey };
}

function buildComponents(edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    for (const [from, to] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      if (!adjacency.has(from)) adjacency.set(from, []);
      adjacency.get(from).push({ key: to, edge });
    }
  }
  const seen = new Set();
  const components = [];
  for (const key of adjacency.keys()) {
    if (seen.has(key)) continue;
    const queue = [key];
    const keys = [];
    seen.add(key);
    while (queue.length) {
      const current = queue.shift();
      keys.push(current);
      for (const relation of adjacency.get(current) || []) {
        if (seen.has(relation.key)) continue;
        seen.add(relation.key);
        queue.push(relation.key);
      }
    }
    if (keys.length > 1) components.push({ keys, adjacency });
  }
  return components;
}

function canonicalScore(key, component, edges, byKey) {
  const entry = byKey.get(key);
  const componentSet = new Set(component.keys);
  const outgoing = edges.filter((edge) => edge.from === key && componentSet.has(edge.to));
  const regularOutgoing = outgoing.filter((edge) => edge.confidence === "regular_form").length;
  const confirmedFormOutgoing = outgoing.filter((edge) => (
    edge.kind === "form" && edge.confidence !== "regular_form"
  )).length;
  const familyOutgoing = outgoing.filter((edge) => edge.kind === "family").length;
  const rootCoverage = component.keys.filter((other) => (
    other !== key
    && key.length >= 3
    && other.includes(key)
  )).length;
  const originalCore = !asArray(entry?.qualityFlags).includes("question_bank_5262_expansion");
  const masterBacked = asArray(entry?.qualityFlags).includes("master_morphology_merged")
    || asArray(entry?.qualityFlags).includes("master_lexicon_reused");
  const placeholder = isPlaceholderMeaning(primaryMeaning(entry));
  const entryPos = coarsePos(entry);
  const posScore = entryPos === "verb"
    ? 55
    : entryPos === "noun"
      ? 25
      : entryPos === "adjective"
        ? 15
        : entryPos === "adverb"
          ? -40
          : 0;
  const suffixPenalty = /ly$/.test(key)
    ? 140
    : /(ing|ed|tions|sions|ments|nesses|ities)$/.test(key)
      ? 70
      : looksDerivational(key)
        ? 35
        : 0;
  const abbreviationPenalty = /缩写/.test(primaryMeaning(entry)) ? 500 : 0;
  return (
    regularOutgoing * 210
    + confirmedFormOutgoing * 45
    + familyOutgoing * 12
    + rootCoverage * 22
    + (originalCore ? 20 : 0)
    + (masterBacked ? 35 : 0)
    + (placeholder ? -20 : 5)
    + posScore
    - suffixPenalty
    - abbreviationPenalty
    - key.length * 2
  );
}

function chooseCanonical(component, edges, byKey) {
  return component.keys.slice().sort((left, right) => {
    const scoreDifference = canonicalScore(right, component, edges, byKey)
      - canonicalScore(left, component, edges, byKey);
    if (scoreDifference) return scoreDifference;
    if (left.length !== right.length) return left.length - right.length;
    return left.localeCompare(right);
  })[0];
}

function findPath(component, canonicalKey, aliasKey) {
  const queue = [{ key: canonicalKey, path: [] }];
  const seen = new Set([canonicalKey]);
  while (queue.length) {
    const current = queue.shift();
    if (current.key === aliasKey) return current.path;
    for (const relation of component.adjacency.get(current.key) || []) {
      if (seen.has(relation.key)) continue;
      seen.add(relation.key);
      queue.push({ key: relation.key, path: [...current.path, relation.edge] });
    }
  }
  return [];
}

function aliasRelationType(canonicalKey, aliasKey, component, byKey) {
  const path = findPath(component, canonicalKey, aliasKey);
  const canonical = byKey.get(canonicalKey);
  const alias = byKey.get(aliasKey);
  const direct = path.length === 1 ? path[0] : null;
  if (direct?.kind === "family") return "family";
  const directType = direct?.type || "";
  const surfaceRegular = regularForms(canonicalKey, directType, coarsePos(canonical)).has(aliasKey)
    || regularForms(canonicalKey, directType, "verb").has(aliasKey)
    || regularForms(canonicalKey, directType, "noun").has(aliasKey)
    || IRREGULAR_COMPARISON_FORMS.get(canonicalKey)?.has(aliasKey);
  if (looksDerivational(aliasKey) && !surfaceRegular) return "family";
  if (
    direct?.kind === "form"
    && (
      surfaceRegular
      || direct.confidence === "regular_form"
      || posOverlaps(canonical, alias)
    )
    && !(looksDerivational(aliasKey) && !surfaceRegular)
  ) {
    return "form";
  }
  if (path.some((edge) => edge.kind === "family")) return "family";
  if (coarsePos(canonical) && coarsePos(alias) && coarsePos(canonical) !== coarsePos(alias)) {
    return "family";
  }
  return "form";
}

export function buildReadingGCompactionPlan(items, { generatedAt = new Date().toISOString() } = {}) {
  const wordEntries = asArray(items).filter((entry) => (entry?.entryType || "word") === "word");
  const { edges, rejected, byKey } = acceptedRelationEdges(wordEntries);
  const components = buildComponents(edges);
  const rules = components.map((component) => {
    const canonicalKey = chooseCanonical(component, edges, byKey);
    const canonical = byKey.get(canonicalKey);
    const aliases = component.keys
      .filter((key) => key !== canonicalKey)
      .map((key) => {
        const alias = byKey.get(key);
        return {
          key,
          id: text(alias?.id),
          word: text(alias?.word),
          relationType: aliasRelationType(canonicalKey, key, component, byKey)
        };
      })
      .sort((left, right) => left.key.localeCompare(right.key));
    return {
      canonicalKey,
      canonicalId: text(canonical?.id),
      canonicalWord: text(canonical?.word),
      aliases
    };
  }).sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey));
  const aliasCount = rules.reduce((sum, rule) => sum + rule.aliases.length, 0);
  return {
    version: READING_G_COMPACTION_VERSION,
    generatedAt,
    scope: "existing-reading-g-independent-words-only",
    sourceWordCount: wordEntries.length,
    resultingWordCount: wordEntries.length - aliasCount,
    rules,
    stats: {
      acceptedRelationRows: edges.length,
      rejectedUnsafeRelationRows: rejected.length,
      familyCount: rules.length,
      aliasCount
    }
  };
}

export function normalizeReadingGCompactionPlan(payload = {}) {
  const seenAliases = new Set();
  const rules = [];
  for (const rawRule of asArray(payload.rules)) {
    const canonicalKey = normalizeReadingGKey(rawRule?.canonicalKey || rawRule?.canonicalWord);
    if (!canonicalKey) continue;
    const aliases = [];
    for (const rawAlias of asArray(rawRule?.aliases)) {
      const key = normalizeReadingGKey(rawAlias?.key || rawAlias?.word);
      if (!key || key === canonicalKey || seenAliases.has(key)) continue;
      seenAliases.add(key);
      aliases.push({
        key,
        id: text(rawAlias?.id),
        word: text(rawAlias?.word || key),
        relationType: rawAlias?.relationType === "family" ? "family" : "form"
      });
    }
    if (aliases.length) rules.push({
      canonicalKey,
      canonicalId: text(rawRule?.canonicalId),
      canonicalWord: text(rawRule?.canonicalWord || canonicalKey),
      aliases
    });
  }
  return { version: text(payload.version || READING_G_COMPACTION_VERSION), rules };
}

function aliasSnapshot(entry, relationType) {
  return {
    key: normalizeReadingGKey(entry?.normalizedKey || entry?.word),
    id: text(entry?.id),
    word: text(entry?.word),
    relationType,
    phonetic: text(entry?.phonetic),
    pos: text(entry?.primaryPos || entry?.pos),
    meaning: stripRelatedFormMeaning(entry),
    definition: text(entry?.definition),
    example: text(entry?.example),
    exampleZh: text(entry?.exampleZh || entry?.exampleCn),
    layers: uniqueText(entry?.layers),
    sourceFiles: uniqueText(entry?.sourceFiles),
    qualityFlags: uniqueText(entry?.qualityFlags)
  };
}

function relationRow(snapshot, canonical) {
  const canonicalKey = normalizeReadingGKey(canonical?.normalizedKey || canonical?.word);
  const isNounPlural = snapshot.relationType === "form"
    && coarsePos(canonical) === "noun"
    && regularForms(canonicalKey, "plural", "noun").has(snapshot.key);
  return {
    word: snapshot.word,
    type: snapshot.relationType === "form" ? (isNounPlural ? "plural" : "merged-form") : undefined,
    pos: snapshot.pos,
    meaning: snapshot.meaning,
    phonetic: snapshot.phonetic,
    entryId: snapshot.id,
    relation: "merged-independent-entry"
  };
}

function uniqueRelations(values, headword) {
  const headwordKey = normalizeReadingGKey(headword);
  const rows = new Map();
  for (const value of asArray(values)) {
    const word = relationWord(value);
    const key = normalizeReadingGKey(word);
    if (!key || key === headwordKey) continue;
    const row = value && typeof value === "object" ? { ...value, word } : { word };
    if (!rows.has(key)) rows.set(key, row);
    else {
      const current = rows.get(key);
      rows.set(key, Object.fromEntries(
        [...new Set([...Object.keys(current), ...Object.keys(row)])].map((field) => [
          field,
          current[field] ?? row[field]
        ])
      ));
    }
  }
  return [...rows.values()].map((row) => {
    const next = { ...row };
    for (const field of Object.keys(next)) {
      if (next[field] === undefined || next[field] === "") delete next[field];
    }
    return next;
  });
}

function mergeCanonicalEntry(canonical, aliases) {
  const aliasKeys = new Set(aliases.map(({ entry }) => normalizeReadingGKey(entry.word)));
  const forms = asArray(canonical.forms).filter(
    (row) => !aliasKeys.has(normalizeReadingGKey(relationWord(row)))
  );
  const family = asArray(canonical.wordFamily).filter(
    (row) => !aliasKeys.has(normalizeReadingGKey(relationWord(row)))
  );
  const snapshots = aliases.map(({ entry, relationType, id, key, word }) => {
    const snapshot = aliasSnapshot(entry, relationType);
    return {
      ...snapshot,
      key: normalizeReadingGKey(key || snapshot.key),
      // The persistent plan records the id of the independent entry that was
      // actually shown to learners. A rebuild may materialize the same surface
      // form from another source with a different id, but progress migration
      // must continue to recognise the original id.
      id: text(id) || snapshot.id,
      word: text(word) || snapshot.word
    };
  });

  // Preserve aliases already compacted into an intermediate canonical.  They
  // may no longer have an independent row, but their old ids still point to
  // real learner progress and must follow the final headword.
  const inheritedMergedEntries = aliases.flatMap(({ entry }) => asArray(entry?.mergedEntries));
  const inheritedAliasSnapshots = aliases.flatMap(({ entry }) => asArray(entry?.mergedAliases))
    .filter((alias) => {
      const key = normalizeReadingGKey(alias?.key || alias?.word);
      return key && !snapshots.some((snapshot) => snapshot.key === key);
    })
    .map((alias) => {
      const key = normalizeReadingGKey(alias?.key || alias?.word);
      const historic = inheritedMergedEntries.find((entry) => (
        normalizeReadingGKey(entry?.key || entry?.word) === key
      ));
      return {
        ...aliasSnapshot({
          ...(historic || {}),
          id: text(alias?.id) || historic?.id,
          word: text(alias?.word) || historic?.word || key
        }, alias?.relationType === "family" ? "family" : "form"),
        key,
        id: text(alias?.id) || text(historic?.id),
        word: text(alias?.word || historic?.word || key)
      };
    });
  const allSnapshots = [...snapshots, ...inheritedAliasSnapshots];

  for (const snapshot of allSnapshots) {
    if (snapshot.relationType === "form") forms.push(relationRow(snapshot, canonical));
    else family.push(relationRow(snapshot, canonical));
  }
  for (const { entry } of aliases) {
    forms.push(...asArray(entry.forms).filter((row) => !aliasKeys.has(normalizeReadingGKey(relationWord(row)))));
    family.push(...asArray(entry.wordFamily).filter((row) => !aliasKeys.has(normalizeReadingGKey(relationWord(row)))));
  }

  const allEntries = [canonical, ...aliases.map(({ entry }) => entry)];
  const familyAliasKeys = new Set(
    allSnapshots
      .filter((snapshot) => snapshot.relationType === "family")
      .map((snapshot) => snapshot.key)
  );
  const normalizedForms = uniqueRelations(forms, canonical.word).filter(
    (row) => !familyAliasKeys.has(normalizeReadingGKey(relationWord(row)))
  );
  const formKeys = new Set(normalizedForms.map((row) => normalizeReadingGKey(relationWord(row))));
  const mergedAliases = new Map();
  // An alias can already be a compacted canonical entry itself.  When that
  // intermediate entry is subsequently merged into its real headword, keep
  // every historical alias/id instead of orphaning its progress record.
  const inheritedAliases = aliases.flatMap(({ entry }) => asArray(entry?.mergedAliases));
  for (const alias of [...asArray(canonical.mergedAliases), ...inheritedAliases, ...allSnapshots]) {
    const key = normalizeReadingGKey(alias?.key || alias?.word);
    if (!key) continue;
    mergedAliases.set(key, {
      key,
      id: text(alias?.id),
      word: text(alias?.word || key),
      relationType: alias?.relationType === "family" ? "family" : "form"
    });
  }
  const mergedEntries = new Map();
  const inheritedEntries = aliases.flatMap(({ entry }) => asArray(entry?.mergedEntries));
  for (const merged of [...asArray(canonical.mergedEntries), ...inheritedEntries, ...allSnapshots]) {
    const key = normalizeReadingGKey(merged?.key || merged?.word);
    if (!key) continue;
    mergedEntries.set(key, { ...merged, key });
  }
  return {
    ...canonical,
    forms: normalizedForms,
    wordFamily: uniqueRelations(family, canonical.word).filter(
      (row) => !formKeys.has(normalizeReadingGKey(relationWord(row)))
    ),
    mergedAliases: [...mergedAliases.values()],
    mergedEntries: [...mergedEntries.values()],
    layers: uniqueText(allEntries.flatMap((entry) => asArray(entry.layers))),
    topics: uniqueText(allEntries.flatMap((entry) => asArray(entry.topics))),
    sourceFiles: uniqueText(allEntries.flatMap((entry) => asArray(entry.sourceFiles))),
    qualityFlags: uniqueText([
      ...allEntries.flatMap((entry, index) => asArray(entry.qualityFlags).filter(
        (flag) => index === 0 || flag !== "missing_master_lexicon"
      )),
      "reading_g_internal_family_compacted"
    ]),
    studyMode: allEntries.some((entry) => entry.studyMode !== "reference") ? "active" : "reference",
    layerRank: Math.min(...allEntries.map((entry) => Number(entry.layerRank) || 99))
  };
}

export function applyReadingGCompaction(items, payload = {}) {
  const plan = normalizeReadingGCompactionPlan(payload);
  const byKey = new Map(
    asArray(items)
      .filter((entry) => (entry?.entryType || "word") === "word")
      .map((entry) => [normalizeReadingGKey(entry.normalizedKey || entry.word), entry])
  );
  const removedKeys = new Set();
  const representedKeys = new Set();
  const suppressedKeys = new Set();
  const replacements = new Map();
  let appliedFamilyCount = 0;

  for (const rule of plan.rules) {
    const canonical = byKey.get(rule.canonicalKey);
    const aliases = rule.aliases.flatMap((alias) => {
      const entry = byKey.get(alias.key);
      return entry ? [{ ...alias, entry }] : [];
    });
    if (!canonical) {
      for (const alias of aliases) {
        removedKeys.add(alias.key);
        suppressedKeys.add(alias.key);
      }
      continue;
    }
    representedKeys.add(rule.canonicalKey);
    for (const alias of rule.aliases) representedKeys.add(alias.key);
    // A persistent plan can include a historic alias whose independent row was
    // removed in an earlier run.  Materialise its relation/id on the canonical
    // even without that row, otherwise later chaining would lose navigation
    // and status migration for the old card.
    const presentAliasKeys = new Set(aliases.map((alias) => alias.key));
    const absentAliases = rule.aliases
      .filter((alias) => !presentAliasKeys.has(alias.key))
      .map((alias) => ({
        ...alias,
        entry: {
          id: alias.id,
          entryType: "word",
          word: alias.word || alias.key,
          normalizedKey: alias.key,
          forms: [],
          wordFamily: [],
          layers: [],
          topics: [],
          sourceFiles: [],
          qualityFlags: [],
          studyMode: canonical.studyMode || "active"
        }
      }));
    const allAliases = [...aliases, ...absentAliases];
    if (!allAliases.length) continue;
    replacements.set(rule.canonicalKey, mergeCanonicalEntry(canonical, allAliases));
    for (const alias of aliases) removedKeys.add(alias.key);
    if (aliases.length) appliedFamilyCount += 1;
  }

  const compactedItems = asArray(items).flatMap((entry) => {
    if ((entry?.entryType || "word") !== "word") return [entry];
    const key = normalizeReadingGKey(entry.normalizedKey || entry.word);
    if (removedKeys.has(key)) return [];
    return [replacements.get(key) || entry];
  });
  return {
    items: compactedItems,
    representedKeys,
    suppressedKeys,
    stats: {
      configuredFamilyCount: plan.rules.length,
      appliedFamilyCount,
      removedIndependentWordCount: removedKeys.size,
      representedAliasCount: representedKeys.size - appliedFamilyCount,
      suppressedBecauseCanonicalMissing: suppressedKeys.size
    }
  };
}
