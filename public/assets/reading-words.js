(function () {
  "use strict";

  const VERSION = "20260830_system_safety_v80";
  const READING_KEY = "ielts-personal-reading-words-v1";
  const READING_SESSION_KEY = "ielts-personal-reading-words-session-v1";
  const MAIN_SUPPLEMENT_KEY = "static_personal_reading_main_v1";
  const STATIC_PUBLISH_REVISION_KEY = "ielts_static_reading_words_publish_revision_v1";
  const STATIC_CONTEXT_SENSE_MIGRATION_KEY = "ielts_static_reading_context_sense_migration_v1";
  const STATIC_CONTEXT_SENSE_MIGRATION_VERSION = "20260811-context-senses-v2";
  const STATIC_PUBLISH_URL = "./data/personal-reading-words.json";
  const TRANSFER_TYPE = "ielts-reading-words-transfer";
  const els = Object.fromEntries([
    "mainStatus", "totalCount", "frequentCount", "incompleteCount", "searchInput",
    "frequentFilterBtn", "singleAddBtn", "batchAddBtn", "exportBtn", "importInput",
    "aiInfoBtn", "singlePanel", "singleForm", "wordInput", "meaningInput", "posInput",
    "synonymInput", "singleCancelBtn", "batchPanel", "batchInput", "batchCancelBtn",
    "batchImportBtn", "aiPanel", "emptyState", "wordContent", "positionText",
    "frequencyBadge", "exampleText", "exampleCnText", "exampleSoundBtn", "wordSoundBtn",
    "phoneticText", "posText", "meaningText", "meaningDetailText", "formsList", "familyList", "synonymList",
    "favoriteBtn", "prevBtn", "knownBtn", "blurryBtn", "unknownBtn", "nextBtn", "deleteBtn", "visibleCount",
    "progressScope", "progressFill", "progressSeek", "progressPosition", "progressPreview", "progressJumpToggle",
    "progressJumpForm", "progressJumpInput", "progressJumpTotal", "progressJumpCancel",
    "wordList", "toast", "studyCard"
  ].map((id) => [id, document.getElementById(id)]));

  let mainWords = [];
  let mainIndex = new Map();
  let words = [];
  let selectedId = "";
  let frequentOnly = false;
  let renderedWordListSignature = "";
  let activeWordListId = "";
  let readingSessionSaveTimer = 0;
  let holdStepTimer = null;
  let holdStepDelayTimer = null;
  let holdStepDir = 0;

  function clean(value) {
    return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  }

  function key(value) {
    return clean(value).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  }

  function meaningKey(entry) {
    return clean(entry?.meaning || entry?.meaningZh || entry?.chineseMeaning)
      .toLowerCase()
      .replace(/[；;，,。.!！?？、\s]+/g, "");
  }

  function isPersonalReadingMainEntry(entry) {
    return entry?.source === "personal-reading" || entry?.addedFromReadingWords === true;
  }

  function suggestCanonicalReadingHeadword(readingWord, candidates) {
    const previousWord = clean(readingWord?.word || readingWord?.headword);
    const previousKey = key(previousWord);
    const sourceMeaning = meaningKey(readingWord);
    const entries = Array.isArray(candidates) ? candidates : [];
    const byKey = new Map(entries.map((entry) => [key(entry?.word), entry]).filter(([entryKey]) => entryKey));
    const exact = byKey.get(previousKey);
    if (!previousKey || !sourceMeaning || (exact && !isPersonalReadingMainEntry(exact))) {
      return { word: previousWord, corrected: false, mainEntry: exact || null };
    }

    const matchesMeaning = (entry) => (
      !isPersonalReadingMainEntry(entry) && meaningKey(entry) === sourceMeaning
    );
    const prefixed = [];
    for (let code = 97; code <= 122; code += 1) {
      const entry = byKey.get(`${String.fromCharCode(code)}${previousKey}`);
      if (entry && matchesMeaning(entry)) prefixed.push(entry);
    }
    if (prefixed.length === 1) {
      return { word: clean(prefixed[0].word), corrected: true, mainEntry: prefixed[0] };
    }

    if (previousKey.length >= 6) {
      const entry = byKey.get(previousKey.slice(1));
      if (entry && matchesMeaning(entry)) {
        return { word: clean(entry.word), corrected: true, mainEntry: entry };
      }
    }
    return { word: previousWord, corrected: false, mainEntry: exact || null };
  }

  function canonicalizeReadingWord(readingWord, candidates) {
    const suggestion = suggestCanonicalReadingHeadword(readingWord, candidates);
    if (!suggestion.corrected) return readingWord;
    return {
      ...readingWord,
      word: suggestion.word,
      correctedFrom: clean(readingWord.correctedFrom) || clean(readingWord.word),
      mainWordId: clean(suggestion.mainEntry?.id || suggestion.mainEntry?.wordId),
      updatedAt: new Date().toISOString()
    };
  }

  const SYNONYM_VARIANT_GROUPS = [
    ["encyclopaedia", "encyclopedia"], ["encyclopaedic", "encyclopedic"],
    ["paediatric", "pediatric"], ["aesthetic", "esthetic"],
    ["anaesthesia", "anesthesia"], ["archaeology", "archeology"],
    ["foetus", "fetus"], ["haemoglobin", "hemoglobin"],
    ["diarrhoea", "diarrhea"], ["manoeuvre", "maneuver"],
    ["orthopaedic", "orthopedic"], ["oesophagus", "esophagus"],
    ["colour", "color"], ["favourite", "favorite"], ["honour", "honor"],
    ["labour", "labor"], ["neighbour", "neighbor"], ["behaviour", "behavior"],
    ["centre", "center"], ["metre", "meter"], ["theatre", "theater"],
    ["organise", "organize"], ["organisation", "organization"],
    ["analyse", "analyze"], ["defence", "defense"], ["licence", "license"],
    ["travelling", "traveling"], ["travelled", "traveled"], ["traveller", "traveler"],
    ["catalogue", "catalog"], ["dialogue", "dialog"], ["programme", "program"], ["grey", "gray"]
  ];
  const SYNONYM_VARIANT_KEY = new Map();
  SYNONYM_VARIANT_GROUPS.forEach((group) => group.forEach((variant) => SYNONYM_VARIANT_KEY.set(variant, group[0])));
  const restoredSession = readReadingWordsSession();
  words = readReadingWords();
  selectedId = words.some((word) => word.id === restoredSession.selectedId)
    ? restoredSession.selectedId
    : words[0]?.id || "";
  frequentOnly = restoredSession.frequentOnly;
  els.searchInput.value = restoredSession.search;

  function synonymEquivalenceKey(value) {
    const compact = clean(value).toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9]+/g, "");
    return SYNONYM_VARIANT_KEY.get(compact) || compact;
  }

  function id(prefix) {
    return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  }

  function parseJsonStorage(storageKey, fallback) {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "null") ?? fallback;
    } catch {
      return fallback;
    }
  }

  function normalizeSynonyms(value, word) {
    const list = Array.isArray(value) ? value : String(value || "").split(/[,，;；\n]+/);
    const headwordKey = synonymEquivalenceKey(word);
    const seen = new Set();
    return list.map((item) => clean(typeof item === "string" ? item : item?.word || item?.replacement))
      .filter((item) => {
        const normalized = synonymEquivalenceKey(item);
        if (!normalized || normalized === headwordKey || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      }).slice(0, 8);
  }

  function normalizeSynonymDetails(value, synonyms, word) {
    const detailByWord = new Map();
    for (const item of Array.isArray(value) ? value : []) {
      const detailWord = clean(item?.word || item?.replacement);
      const meaningZh = clean(item?.meaningZh || item?.meaning || item?.chineseMeaning);
      const detailKey = synonymEquivalenceKey(detailWord);
      if (!detailWord || !meaningZh || !detailKey || detailByWord.has(detailKey)) continue;
      detailByWord.set(detailKey, {
        word: detailWord,
        pos: clean(item?.pos || item?.primaryPos),
        meaningZh
      });
    }
    return normalizeSynonyms(synonyms, word).map((synonym) => {
      const detail = detailByWord.get(synonymEquivalenceKey(synonym));
      return detail ? { ...detail, word: synonym } : null;
    }).filter(Boolean);
  }

  function hasCompleteSynonymDetails(word) {
    const synonyms = normalizeSynonyms(word?.synonyms, word?.word);
    if (!synonyms.length) return true;
    return normalizeSynonymDetails(word?.synonymDetails, synonyms, word?.word).length === synonyms.length;
  }

  function resolveLinkedMainEntry(readingWord, candidates) {
    const entries = Array.isArray(candidates) ? candidates : [];
    const linkedId = clean(readingWord?.mainWordId || readingWord?.baseWordId);
    if (linkedId) {
      const linked = entries.find((entry) => clean(entry?.id || entry?.wordId) === linkedId);
      if (linked?.studyMode === "reference" && clean(linked.baseWord || linked.redirectToWord)) {
        return entries.find((entry) => key(entry?.word) === key(linked.baseWord || linked.redirectToWord)) || linked;
      }
      if (linked) return linked;
    }
    const exact = entries.find((entry) => key(entry?.word) === key(readingWord?.word));
    if (exact?.studyMode === "reference" && clean(exact.baseWord || exact.redirectToWord)) {
      return entries.find((entry) => key(entry?.word) === key(exact.baseWord || exact.redirectToWord)) || exact;
    }
    return exact || null;
  }

  function readingBaseForm(readingWord, mainWord) {
    const surface = clean(readingWord?.word);
    const base = clean(mainWord?.word);
    if (!surface || !base || key(surface) === key(base)) return [];
    const relationLabels = {
      "plural-or-third-person": "复数或第三人称单数",
      plural: "复数",
      "third-person singular": "第三人称单数",
      "present-participle": "现在分词或动名词",
      "present participle": "现在分词",
      "present participle / gerund": "现在分词或动名词",
      "past-or-past-participle": "过去式或过去分词",
      "past participle": "过去分词",
      "past tense": "过去式",
      "past tense / past participle": "过去式或过去分词",
      irregular: "不规则词形"
    };
    const rawRelation = clean(readingWord?.relationType);
    const relation = relationLabels[rawRelation] || "词形";
    return [{
      word: base,
      type: "原形",
      note: `${surface} 是 ${base} 的${relation}形式`,
      meaning: clean(mainWord?.meaning)
    }];
  }

  const POS_ALIASES = new Map([
    ["n", "noun"], ["noun", "noun"], ["v", "verb"], ["verb", "verb"],
    ["adj", "adjective"], ["adjective", "adjective"], ["adv", "adverb"], ["adverb", "adverb"],
    ["prep", "preposition"], ["preposition", "preposition"], ["conj", "conjunction"], ["conjunction", "conjunction"],
    ["pron", "pronoun"], ["pronoun", "pronoun"], ["det", "determiner"], ["determiner", "determiner"],
    ["art", "article"], ["article", "article"], ["interj", "interjection"], ["interjection", "interjection"],
    ["aux", "auxiliary"], ["auxiliary", "auxiliary"], ["modal", "modal"],
    ["num", "numeral"], ["numeral", "numeral"], ["number", "numeral"], ["phrase", "phrase"]
  ]);

  function normalizePosTokens(value) {
    let normalized = clean(value).normalize("NFKC").toLowerCase();
    if (!normalized) return [];
    normalized = normalized
      .replace(/(?:noun\s+phrase\s*名词|verb\s+phrase\s*动词|adjective\s+phrase\s*形容词|adverb\s+phrase\s*副词|prepositional\s+phrase\s*介词)/g, "phrase")
      .replace(/auxiliary\s+verb/g, "auxiliary")
      .replace(/modal\s+verb/g, "modal")
      .replace(/phrasal\s+verb/g, "phrase")
      .replace(/(?:noun|verb|adjective|adverb|prepositional)\s+phrase/g, "phrase")
      .replace(/形容词/g, " adjective ")
      .replace(/副词/g, " adverb ")
      .replace(/介词/g, " preposition ")
      .replace(/连词/g, " conjunction ")
      .replace(/代词/g, " pronoun ")
      .replace(/限定词/g, " determiner ")
      .replace(/冠词/g, " article ")
      .replace(/感叹词/g, " interjection ")
      .replace(/助动词/g, " auxiliary ")
      .replace(/情态动词/g, " modal ")
      .replace(/数词/g, " numeral ")
      .replace(/名词/g, " noun ")
      .replace(/动词/g, " verb ")
      .replace(/短语/g, " phrase ");
    const matches = normalized.match(/\b(?:adjective|adverb|preposition|conjunction|pronoun|determiner|article|interjection|auxiliary|modal|numeral|number|phrase|noun|verb|interj|prep|conj|pron|det|art|adj|adv|aux|num|n|v)\b/gi) || [];
    return [...new Set(matches.map((token) => POS_ALIASES.get(token.toLowerCase())).filter(Boolean))];
  }

  function senseMeaning(sense) {
    return clean(sense?.meaningZh || sense?.meaning_zh || sense?.quizMeaningZh || sense?.gloss || sense?.meaning || sense?.chinese);
  }

  function sensePos(sense) {
    return sense?.pos || sense?.posFamily || sense?.partOfSpeech || sense?.part_of_speech;
  }

  function senseRows(entry) {
    return [
      ...(Array.isArray(entry?.senses) ? entry.senses : []),
      ...(Array.isArray(entry?.otherMeanings) ? entry.otherMeanings : []),
      ...(Array.isArray(entry?.meaningsZh) ? entry.meaningsZh : [])
    ].filter((sense) => sense && typeof sense === "object");
  }

  function needsMultiPosSenseRepair(entry) {
    const declared = [...new Set([
      ...normalizePosTokens(entry?.declaredPos || entry?.declaredPartOfSpeech),
      ...normalizePosTokens(entry?.primaryPos),
      ...normalizePosTokens(entry?.pos || entry?.partOfSpeech)
    ])];
    if (declared.length < 2) return false;

    let primary = normalizePosTokens(entry?.primaryPos);
    if (primary.length !== 1) {
      const explicitSenses = Array.isArray(entry?.senses)
        ? entry.senses.filter((sense) => senseMeaning(sense))
        : [];
      const primarySense = explicitSenses.find((sense) => sense?.isPrimary === true)
        || explicitSenses.find((sense) => sense?.readingCommon === true)
        || explicitSenses[0];
      primary = normalizePosTokens(sensePos(primarySense));
    }
    if (primary.length !== 1) primary = normalizePosTokens(entry?.pos || entry?.partOfSpeech);
    if (primary.length !== 1 || !declared.includes(primary[0])) return true;

    const covered = new Set(primary);
    for (const sense of senseRows(entry)) {
      if (!senseMeaning(sense)) continue;
      const tokens = normalizePosTokens(sensePos(sense));
      if (tokens.length === 1) covered.add(tokens[0]);
    }
    return declared.some((token) => !covered.has(token));
  }

  function normalizeReadingWord(input, now = new Date().toISOString()) {
    const word = clean(input?.word || input?.headword);
    const importCount = Math.max(1, Math.floor(Number(input?.importCount) || 1));
    const stableId = clean(input?.id || input?.wordId) || id("reading");
    return {
      ...input,
      id: stableId,
      wordId: stableId,
      word,
      phonetic: clean(input?.phonetic),
      pos: clean(input?.pos),
      meaning: clean(input?.meaning || input?.chineseMeaning),
      meaningDetailZh: clean(input?.meaningDetailZh || input?.meaningDetailedZh),
      definition: clean(input?.definition),
      example: clean(input?.example),
      exampleCn: clean(input?.exampleCn),
      forms: Array.isArray(input?.forms) ? input.forms : [],
      wordFamily: Array.isArray(input?.wordFamily) ? input.wordFamily : [],
      collocations: Array.isArray(input?.collocations) ? input.collocations : [],
      phraseCollocations: Array.isArray(input?.phraseCollocations) ? input.phraseCollocations : [],
      synonyms: normalizeSynonyms(input?.synonyms, word),
      synonymDetails: normalizeSynonymDetails(
        [
          ...(Array.isArray(input?.synonymDetails) ? input.synonymDetails : []),
          ...(Array.isArray(input?.synonyms) ? input.synonyms : [])
        ],
        input?.synonyms,
        word
      ),
      mainWordId: clean(input?.mainWordId),
      baseWord: clean(input?.baseWord),
      baseWordId: clean(input?.baseWordId),
      relationType: clean(input?.relationType),
      importCount,
      highFrequency: input?.highFrequency === true || importCount >= 2,
      status: ["熟悉", "模糊", "不熟"].includes(input?.status) ? input.status : "",
      lastReviewedAt: clean(input?.lastReviewedAt),
      favorite: Boolean(input?.favorite),
      firstImportedAt: clean(input?.firstImportedAt) || now,
      lastImportedAt: clean(input?.lastImportedAt) || now,
      createdAt: clean(input?.createdAt) || now,
      updatedAt: now,
      source: "personal-reading"
    };
  }

  function readReadingWords() {
    const payload = parseJsonStorage(READING_KEY, []);
    const list = Array.isArray(payload) ? payload : payload?.words;
    return (Array.isArray(list) ? list : []).map((item) => normalizeReadingWord(item)).filter((item) => item.word);
  }

  function saveReadingWords() {
    localStorage.setItem(READING_KEY, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      words
    }));
  }

  function readSupplements() {
    const payload = parseJsonStorage(MAIN_SUPPLEMENT_KEY, []);
    return Array.isArray(payload) ? payload : Array.isArray(payload?.words) ? payload.words : [];
  }

  function saveSupplements(list) {
    localStorage.setItem(MAIN_SUPPLEMENT_KEY, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      words: list
    }));
  }

  function applyMain(readingWord, mainWord) {
    if (!mainWord) return readingWord;
    const next = { ...readingWord, mainWordId: clean(mainWord.id || mainWord.wordId || mainWord.word) };
    const hasContextualMeaning = Boolean(clean(next.readingMeaning) || next.readingContextReviewed === true);
    const linkedSurfaceForm = key(next.word) !== key(mainWord.word) && Boolean(clean(next.baseWord || next.relationType));
    if (linkedSurfaceForm) {
      next.baseWord = clean(mainWord.word);
      next.baseWordId = clean(mainWord.id || mainWord.wordId);
      next.forms = readingBaseForm(next, mainWord);
      next.formsReviewed = true;
    } else if (clean(mainWord.phonetic)) next.phonetic = mainWord.phonetic;
    if (clean(mainWord.pos) && (!hasContextualMeaning || !clean(next.pos))) next.pos = mainWord.pos;
    for (const field of [
      "forms",
      "wordFamily",
      "synonymDetails",
      "otherMeanings",
      "senses",
      "meaningsZh",
      "collocations",
      "phraseCollocations"
    ]) {
      if (hasContextualMeaning && ["otherMeanings", "senses", "meaningsZh"].includes(field)) continue;
      const reviewedField = field === "forms"
        ? "formsReviewed"
        : field === "wordFamily"
          ? "wordFamilyReviewed"
          : field === "synonymDetails"
            ? "synonymsReviewed"
            : "";
      const localEmpty = !Array.isArray(next[field]) || next[field].length === 0;
      if (
        localEmpty
        && (!reviewedField || next[reviewedField] !== true)
        && !(field === "forms" && linkedSurfaceForm)
        && Array.isArray(mainWord[field])
        && mainWord[field].length
      ) {
        next[field] = mainWord[field];
      }
    }
    for (const field of ["meaning", "meaningDetailZh", "definition", "example", "exampleCn"]) {
      if (linkedSurfaceForm) continue;
      if (field === "meaningDetailZh" && hasContextualMeaning) continue;
      if (!clean(next[field]) && clean(mainWord[field])) next[field] = mainWord[field];
    }
    if (!next.synonyms?.length && next.synonymsReviewed !== true) {
      next.synonyms = normalizeSynonyms(
        mainWord.synonyms || mainWord.validatedSynonyms || mainWord.recommendedSynonyms,
        next.word
      );
    }
    return next;
  }

  function ensureMainEntry(readingWord) {
    const linked = resolveLinkedMainEntry(readingWord, mainWords);
    if (linked) return linked;
    const normalizedKey = key(readingWord.word);
    const existing = mainIndex.get(normalizedKey);
    if (existing) return existing;
    const supplements = readSupplements();
    const supplement = {
      id: clean(readingWord.mainWordId) || id("personal-reading"),
      wordId: clean(readingWord.mainWordId) || "",
      word: readingWord.word,
      phonetic: readingWord.phonetic,
      pos: readingWord.pos,
      meaning: readingWord.meaning,
      meaningDetailZh: readingWord.meaningDetailZh,
      definition: readingWord.definition,
      example: readingWord.example,
      exampleCn: readingWord.exampleCn,
      otherMeanings: Array.isArray(readingWord.otherMeanings) ? readingWord.otherMeanings : [],
      senses: Array.isArray(readingWord.senses) ? readingWord.senses : [],
      meaningsZh: Array.isArray(readingWord.meaningsZh) ? readingWord.meaningsZh : [],
      forms: readingWord.forms,
      wordFamily: readingWord.wordFamily,
      collocations: readingWord.collocations,
      phraseCollocations: readingWord.phraseCollocations,
      synonyms: readingWord.synonyms,
      synonymDetails: readingWord.synonymDetails,
      source: "personal-reading",
      supplemental: true,
      addedFromReadingWords: true
    };
    supplement.wordId = supplement.id;
    supplements.push(supplement);
    saveSupplements(supplements);
    mainWords.push(supplement);
    mainIndex.set(normalizedKey, supplement);
    return supplement;
  }

  function mergeImport(items, transferMode = false) {
    const now = new Date().toISOString();
    const index = new Map(words.map((item, itemIndex) => [key(item.word), itemIndex]));
    let added = 0;
    let repeated = 0;
    for (const raw of items) {
      const incoming = canonicalizeReadingWord(normalizeReadingWord(raw, now), mainWords);
      const normalizedKey = key(incoming.word);
      if (!normalizedKey) continue;
      const existingIndex = index.get(normalizedKey);
      if (existingIndex !== undefined) {
        const current = words[existingIndex];
        const nextCount = transferMode
          ? Math.max(Number(current.importCount) || 1, Number(incoming.importCount) || 1)
          : (Number(current.importCount) || 1) + 1;
        words[existingIndex] = applyMain({
          ...current,
          meaning: current.meaning || incoming.meaning,
          pos: current.pos || incoming.pos,
          synonyms: current.synonyms?.length ? current.synonyms : incoming.synonyms,
          importCount: nextCount,
          highFrequency: nextCount >= 2 || current.highFrequency || incoming.highFrequency,
          lastImportedAt: now,
          updatedAt: now
        }, ensureMainEntry(current));
        repeated += 1;
        selectedId = current.id;
        continue;
      }
      const linked = applyMain(incoming, ensureMainEntry(incoming));
      words.push(linked);
      index.set(normalizedKey, words.length - 1);
      selectedId = linked.id;
      added += 1;
    }
    saveReadingWords();
    render();
    toast(`已新增 ${added} 个，合并/重复 ${repeated} 个。`);
  }

  function parseTable(text) {
    const value = String(text || "").trim();
    if (!value) return [];
    if (value.startsWith("[") || value.startsWith("{")) {
      const payload = JSON.parse(value);
      return Array.isArray(payload) ? payload : Array.isArray(payload?.words) ? payload.words : [];
    }
    const rows = value.split(/\r?\n/).map((line) => line.split(line.includes("\t") ? "\t" : ","));
    const first = rows[0]?.map((cell) => key(cell)) || [];
    const hasHeader = first.includes("word") || first.includes("单词");
    return (hasHeader ? rows.slice(1) : rows).map((row) => ({
      word: row[0],
      meaning: row[1],
      pos: row[2],
      synonyms: row[3]
    }));
  }

  function isIncomplete(word) {
    return !word.pos
      || !word.meaning
      || !word.definition
      || !word.example
      || !word.exampleCn
      || !hasCompleteSynonymDetails(word)
      || needsMultiPosSenseRepair(word);
  }

  function visibleWords() {
    const query = key(els.searchInput.value);
    return words.filter((word) => {
      if (frequentOnly && !word.highFrequency && Number(word.importCount) < 2) return false;
      return !query || [word.word, word.meaning, word.definition, ...(word.synonyms || [])]
        .some((value) => key(value).includes(query));
    });
  }

  function currentWord(visible = visibleWords()) {
    return visible.find((word) => word.id === selectedId) || visible[0] || null;
  }

  function renderStudyProgress(visible, current) {
    const total = visible.length;
    const position = current ? Math.max(1, visible.findIndex((word) => word.id === current.id) + 1) : 0;
    const percent = total ? Math.round((position / total) * 100) : 0;
    const canSeek = total > 1;
    els.progressScope.textContent = frequentOnly ? "高频阅读生词" : "全部阅读生词";
    els.progressFill.style.width = `${percent}%`;
    els.progressSeek.min = "1";
    els.progressSeek.max = String(Math.max(1, total));
    els.progressSeek.value = String(Math.max(1, position));
    els.progressSeek.disabled = !canSeek;
    els.progressSeek.setAttribute("aria-valuetext", current ? `第 ${position} / ${total} 个词：${current.word}` : "当前没有可学习单词");
    els.progressPosition.textContent = `${position} / ${total}`;
    els.progressJumpToggle.disabled = !canSeek;
    els.progressJumpTotal.textContent = `/ ${total}`;
    els.progressJumpInput.min = "1";
    els.progressJumpInput.max = String(Math.max(1, total));
    if (!els.progressJumpForm.classList.contains("hidden")) {
      els.progressJumpInput.value = String(Math.max(1, position));
    }
    if (!els.progressSeek.matches(":active")) {
      els.progressPreview.textContent = total ? `${percent}%` : "0%";
    }
  }

  function seekStudyPosition(value) {
    const visible = visibleWords();
    if (!visible.length) return;
    const position = Math.min(visible.length, Math.max(1, Math.round(Number(value) || 1)));
    selectedId = visible[position - 1].id;
    render();
  }

  function listHtml(items, formatter) {
    return items.length
      ? items.map((item) => `<p>${escapeHtml(formatter(item))}</p>`).join("")
      : '<p class="empty">暂无可靠内容</p>';
  }

  function synonymListHtml(items, details, headword = "") {
    if (!items.length) return '<p class="empty">暂无可靠内容</p>';
    const detailByWord = new Map(
      normalizeSynonymDetails(details, items, headword)
        .map((detail) => [synonymEquivalenceKey(detail.word), detail])
    );
    return items.map((item) => {
      const word = clean(typeof item === "string" ? item : item?.word || item?.replacement);
      const linked = mainIndex.get(key(word));
      const detail = detailByWord.get(synonymEquivalenceKey(word));
      const meaning = clean(
        detail?.meaningZh
        || (typeof item === "object" && item
          ? item.meaning || item.meaningZh || item.chineseMeaning
          : "")
        || linked?.meaning
        || linked?.meaningZh
        || linked?.chineseMeaning
      );
      return `
        <button class="synonym-row" type="button" data-synonym="${escapeHtml(word)}">
          <span aria-hidden="true">🔊</span>
          <strong>${escapeHtml(word)}</strong>
          <em>${escapeHtml(meaning || "释义待补全")}</em>
        </button>
      `;
    }).join("");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function displayMeaningKey(value) {
    return clean(value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s，,。；;：:、（）()\[\]【】“”"'·/\\-]+/g, "");
  }

  function normalizeDisplaySense(value) {
    if (!value) return null;
    if (typeof value === "string") {
      const meaning = clean(value);
      return meaning ? { pos: "", meaning } : null;
    }
    const meaning = clean(
      value.meaningZh
      || value.meaning_zh
      || value.gloss
      || value.quizMeaningZh
      || value.meaning
      || value.chinese
    );
    if (!meaning) return null;
    return {
      pos: clean(value.pos || value.posFamily || value.partOfSpeech || value.part_of_speech),
      meaning,
      isPrimary: value.isPrimary === true,
      readingCommon: value.readingCommon === true
    };
  }

  function displayPosKey(value) {
    const aliases = { n: "noun", v: "verb", adj: "adjective", adv: "adverb" };
    return [...new Set(clean(value).toLowerCase()
      .split(/\s*(?:\/|\||,|;|、|，|；)\s*/)
      .map((token) => token.replace(/\.$/, ""))
      .map((token) => aliases[token] || token)
      .filter(Boolean))]
      .sort()
      .join("|");
  }

  function supplementalDisplaySenses(entry) {
    const explicit = (Array.isArray(entry?.senses) ? entry.senses : [])
      .map(normalizeDisplaySense)
      .filter(Boolean);
    const preferredIndex = explicit.findIndex((sense) => sense.isPrimary);
    const readingIndex = explicit.findIndex((sense) => sense.readingCommon);
    const primaryIndex = preferredIndex >= 0 ? preferredIndex : readingIndex >= 0 ? readingIndex : 0;
    const primaryMeaning = explicit[primaryIndex]?.meaning || clean(entry?.meaning);
    const primaryPos = explicit[primaryIndex]?.pos || clean(entry?.primaryPos || entry?.pos);
    const primaryMeaningKeys = new Set(primaryMeaning.split(/[；;，,、/]+/).map(displayMeaningKey).filter(Boolean));
    const seen = new Set(
      [...primaryMeaningKeys].map((meaningKey) => `${displayPosKey(primaryPos)}::${meaningKey}`)
    );
    const candidates = [
      ...explicit.filter((_, index) => index !== primaryIndex),
      ...(Array.isArray(entry?.otherMeanings) ? entry.otherMeanings : []).map(normalizeDisplaySense).filter(Boolean),
      ...(Array.isArray(entry?.meaningsZh) ? entry.meaningsZh : [])
        .filter((sense) => !sense?.confidence || String(sense.confidence).toLowerCase() === "high")
        .map(normalizeDisplaySense)
        .filter(Boolean)
    ];
    return candidates.map((sense) => {
      const parts = clean(sense.meaning).split(/[；;，,、/]+/).map(clean).filter(Boolean).filter((part) => {
        const senseKey = displayMeaningKey(part);
        const posKey = displayPosKey(sense.pos);
        const identityKey = `${posKey}::${senseKey}`;
        if (!senseKey || (!posKey && primaryMeaningKeys.has(senseKey)) || seen.has(identityKey)) return false;
        seen.add(identityKey);
        return true;
      });
      return parts.length ? { ...sense, meaning: parts.join("；") } : null;
    }).filter(Boolean);
  }

  function inlineStudyMeaningText(entry) {
    const explicit = (Array.isArray(entry?.senses) ? entry.senses : [])
      .map(normalizeDisplaySense)
      .filter(Boolean);
    const preferredIndex = explicit.findIndex((sense) => sense.isPrimary);
    const readingIndex = explicit.findIndex((sense) => sense.readingCommon);
    const primaryIndex = preferredIndex >= 0 ? preferredIndex : readingIndex >= 0 ? readingIndex : 0;
    const primary = explicit[primaryIndex] || null;
    const primaryMeaning = primary?.meaning || clean(entry?.meaning) || "释义待补全";
    const primaryPos = primary?.pos || clean(entry?.pos);
    const primaryPosKey = displayPosKey(primaryPos);
    return [primaryMeaning, ...supplementalDisplaySenses(entry).map((sense) => {
      const sensePos = clean(sense.pos);
      return sensePos && displayPosKey(sensePos) !== primaryPosKey
        ? `[${sensePos}] ${sense.meaning}`
        : sense.meaning;
    })].join("；");
  }

  function mainMeaningDetail(entry, meaning) {
    const word = clean(entry?.word);
    const primary = clean(meaning || entry?.primaryMeaningZh || entry?.meaningZh || entry?.meaning);
    const rawDetail = clean(entry?.meaningDetailZh || entry?.meaningDetailedZh);
    const compact = (value) => clean(value).toLowerCase().replace(/[“”"'‘’；;，,。.!！?？、：:\s]/g, "");
    const primaryKeys = new Set(primary.split(/[；;，,、/]+/).map(compact).filter(Boolean));
    const wholePrimaryKey = compact(primary);
    const semantic = [];
    const support = [];
    const hasPlaceholder = /无中文释义|暂无释义|待补充|待完善|待审核|需要复核|专有名词，需结合原文识别/.test(rawDetail);
    if (rawDetail && !hasPlaceholder) {
      for (const part of rawDetail.split(/[。！？!?；;]+/)) {
        const clause = clean(part).replace(/^[，,：:\s]+|[，,：:\s]+$/g, "");
        const clauseKey = compact(clause);
        if (!clauseKey || clauseKey === wholePrimaryKey || primaryKeys.has(clauseKey)) continue;
        const lower = clause.toLowerCase();
        const headwordPrefix = word && (lower.startsWith(`${word.toLowerCase()}:`) || lower.startsWith(`${word.toLowerCase()}：`));
        const remainder = headwordPrefix ? clean(clause.slice(word.length + 1)) : "";
        if (headwordPrefix && (compact(remainder) === wholePrimaryKey || primaryKeys.has(compact(remainder)))) continue;
        if (/^(?:“?[a-z][a-z' -]*”?)(?:常见含义为|在雅思(?:听力|阅读)?中的常用含义是|的核心意思是|表示|在当前词条中)/i.test(clause)) continue;
        if (/^(?:本词条|该词|“?[a-z][a-z' -]*”?)?(?:按|作).*(?:词|使用)$/i.test(clause)) continue;
        if (/(?:复数(?:形式)?|第三人称单数(?:形式)?|过去式|过去分词|现在分词|动名词|比较级|最高级)(?:形式)?$/.test(clause)) support.push(clause);
        else semantic.push(clause.replace(/^例句提示[：:]\s*/, "在当前例句中，"));
      }
    }
    const verified = semantic.join("；");
    if ((verified.match(/[\u3400-\u9fff]/g) || []).length >= 8) return /[。！？!?]$/.test(verified) ? verified : `${verified}。`;

    const notes = [];
    const formSource = support.join("；");
    const formMatch = formSource.match(/[“"']([a-z][a-z' -]*)[”"']\s*的\s*(复数(?:形式)?|第三人称单数(?:形式)?|过去式|过去分词|现在分词|动名词|比较级|最高级)/i);
    if (formMatch) notes.push(`“${word}”是“${formMatch[1]}”的${formMatch[2].endsWith("形式") ? formMatch[2] : `${formMatch[2]}形式`}`);
    const definition = clean(entry?.definition);
    if (/[a-z]{3}/i.test(definition) && !/[\u3400-\u9fff]/.test(definition)) notes.push(`英文定义为“${definition}”`);
    const collocation = [...(entry?.collocations || []), ...(entry?.phraseCollocations || [])].find((item) => {
      const phrase = clean(typeof item === "string" ? item : item?.phrase || item?.text || item?.collocation);
      const chinese = clean(typeof item === "string" ? "" : item?.chinese || item?.meaningZh || item?.meaning);
      return phrase && chinese && (!word || phrase.toLowerCase().includes(word.toLowerCase()));
    });
    if (collocation) notes.push(`常见搭配“${clean(collocation?.phrase || collocation?.text || collocation?.collocation)}”表示“${clean(collocation?.chinese || collocation?.meaningZh || collocation?.meaning)}”`);
    const form = (entry?.forms || []).find((item) => clean(typeof item === "string" ? item : item?.word));
    if (form) notes.push(`${clean(typeof form === "string" ? "相关词形" : form?.type || form?.note || "相关词形")}为“${clean(typeof form === "string" ? form : form?.word)}”`);
    const otherSense = [...(entry?.otherMeanings || []), ...(entry?.meaningsZh || []), ...(entry?.senses || [])]
      .map((item) => clean(typeof item === "string" ? item : item?.meaningZh || item?.meaning || item?.gloss))
      .find((value) => value && compact(value) !== wholePrimaryKey);
    if (otherSense) notes.push(`另有常见义“${otherSense}”，需结合语境区分`);
    const family = (entry?.wordFamily || []).find((item) => clean(item?.word) && clean(item?.meaningZh || item?.meaning));
    if (family) notes.push(`相关词“${clean(family.word)}”表示“${clean(family.meaningZh || family.meaning)}”`);
    if (notes.length) return `${notes.slice(0, 2).join("；")}。`;
    return primary ? "现有资料只确认了主释义，语义范围和实际用法仍待补充。" : "该词的主释义和详细说明均待补充。";
  }

  function renderWordList(visible, current) {
    const signature = visible.map((word) => [
      word.id,
      word.word,
      word.meaning,
      word.highFrequency ? 1 : 0,
      Number(word.importCount) || 1
    ].join("\u0001")).join("\u0002");
    if (signature !== renderedWordListSignature) {
      els.wordList.innerHTML = visible.map((word) => `
        <button class="word-row${word.id === current?.id ? " active" : ""}" type="button" data-id="${escapeHtml(word.id)}">
          <span><strong>${escapeHtml(word.word)}</strong><span>${escapeHtml(word.meaning || "待补全")}</span></span>
          <em>${word.highFrequency || Number(word.importCount) >= 2 ? `高频 ×${word.importCount}` : ""}</em>
        </button>
      `).join("");
      renderedWordListSignature = signature;
      activeWordListId = current?.id || "";
      return;
    }

    const nextActiveId = current?.id || "";
    if (nextActiveId === activeWordListId) return;
    const previous = els.wordList.querySelector(".word-row.active");
    if (previous) previous.classList.remove("active");
    for (const button of els.wordList.querySelectorAll("[data-id]")) {
      if (button.dataset.id !== nextActiveId) continue;
      button.classList.add("active");
      break;
    }
    activeWordListId = nextActiveId;
  }

  function render() {
    const visible = visibleWords();
    const current = currentWord(visible);
    if (current && current.id !== selectedId) selectedId = current.id;
    els.totalCount.textContent = words.length;
    els.frequentCount.textContent = words.filter((word) => word.highFrequency || Number(word.importCount) >= 2).length;
    els.incompleteCount.textContent = words.filter(isIncomplete).length;
    els.visibleCount.textContent = `${visible.length} 个`;
    els.frequentFilterBtn.setAttribute("aria-pressed", String(frequentOnly));
    els.frequentFilterBtn.classList.toggle("primary", frequentOnly);
    renderStudyProgress(visible, current);
    scheduleReadingWordsSessionSave();
    renderWordList(visible, current);

    els.emptyState.classList.toggle("hidden", Boolean(current));
    els.wordContent.classList.toggle("hidden", !current);
    if (!current) return;
    const position = visible.findIndex((word) => word.id === current.id);
    els.positionText.textContent = `${position + 1} / ${visible.length}`;
    els.frequencyBadge.textContent = current.highFrequency || Number(current.importCount) >= 2
      ? `高频 ×${current.importCount}`
      : "";
    els.favoriteBtn.textContent = current.favorite ? "★ 已收藏" : "☆ 收藏";
    els.favoriteBtn.setAttribute("aria-pressed", String(Boolean(current.favorite)));
    els.favoriteBtn.classList.toggle("active", Boolean(current.favorite));
    window.IeltsExampleHighlight.render(
      els.exampleText,
      current.example || "暂无英文例句",
      current
    );
    els.exampleCnText.textContent = current.exampleCn || "";
    els.wordSoundBtn.textContent = current.word;
    els.phoneticText.textContent = current.phonetic || "";
    els.posText.textContent = current.pos || "词性待补全";
    els.meaningText.textContent = inlineStudyMeaningText(current);
    els.meaningDetailText.textContent = mainMeaningDetail(current, current.meaning);
    var forms = Array.isArray(current.forms) ? current.forms : [];
    var family = Array.isArray(current.wordFamily) ? current.wordFamily : [];
    var synonyms = Array.isArray(current.synonyms) ? current.synonyms : [];
    var detailSections = [
      [els.formsList, forms],
      [els.familyList, family],
      [els.synonymList, synonyms]
    ];
    detailSections.forEach(function (entry) {
      var section = entry[0] && entry[0].closest("section");
      if (section) section.hidden = entry[1].length === 0;
    });
    var detailGrid = els.formsList && els.formsList.closest(".detail-grid");
    if (detailGrid) detailGrid.hidden = detailSections.every(function (entry) { return entry[1].length === 0; });
    els.formsList.innerHTML = listHtml(forms, (item) => `${item.word || ""}${item.type ? ` · ${item.type}` : ""}${item.note ? ` · ${item.note}` : ""}`);
    els.familyList.innerHTML = listHtml(family, (item) => `${item.word || ""}${item.pos ? ` · ${item.pos}` : ""}${item.meaning ? ` · ${item.meaning}` : ""}`);
    els.synonymList.innerHTML = synonymListHtml(synonyms, current.synonymDetails, current.word);
    els.synonymList.querySelectorAll("[data-synonym]").forEach((button) => {
      button.onclick = () => speak(button.dataset.synonym);
    });
    for (const [button, status] of [[els.knownBtn, "熟悉"], [els.blurryBtn, "模糊"], [els.unknownBtn, "不熟"]]) {
      button.classList.toggle("active", current.status === status);
    }
  }

  function move(offset) {
    const visible = visibleWords();
    if (!visible.length) return;
    const currentIndex = Math.max(0, visible.findIndex((word) => word.id === currentWord(visible)?.id));
    selectedId = visible[(currentIndex + offset + visible.length) % visible.length].id;
    render();
  }

  function stopHoldStep() {
    holdStepDir = 0;
    if (holdStepDelayTimer) {
      clearTimeout(holdStepDelayTimer);
      holdStepDelayTimer = null;
    }
    if (holdStepTimer) {
      clearInterval(holdStepTimer);
      holdStepTimer = null;
    }
  }

  function startHoldStep(dir) {
    if (!dir || visibleWords().length < 2) return;
    if (holdStepDir === dir && holdStepTimer) return;
    stopHoldStep();
    holdStepDir = dir;
    move(dir);
    holdStepDelayTimer = setTimeout(function () {
      if (holdStepDir !== dir) return;
      holdStepTimer = setInterval(function () {
        if (holdStepDir !== dir) {
          stopHoldStep();
          return;
        }
        move(dir);
      }, 130);
    }, 380);
  }

  function mark(status) {
    const current = currentWord();
    if (!current) return;
    words = words.map((word) => word.id === current.id
      ? {
        ...word,
        status: word.status === status ? "" : status,
        lastReviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      : word);
    saveReadingWords();
    move(1);
  }

  function normalizeReadingWordsSession(value) {
    return {
      selectedId: clean(value?.selectedId),
      search: clean(value?.search),
      frequentOnly: value?.frequentOnly === true
    };
  }

  function readReadingWordsSession() {
    return normalizeReadingWordsSession(parseJsonStorage(READING_SESSION_KEY, {}));
  }

  function saveReadingWordsSession() {
    localStorage.setItem(READING_SESSION_KEY, JSON.stringify({
      selectedId,
      search: els.searchInput.value,
      frequentOnly,
      updatedAt: new Date().toISOString()
    }));
  }

  function publishedTransfer(payload) {
    const transfer = payload?.transfer && typeof payload.transfer === "object" ? payload.transfer : payload;
    if (
      transfer?.type !== "ielts-reading-words-transfer" ||
      Number(transfer?.version) !== 1 ||
      !Array.isArray(transfer?.readingWords) ||
      !Array.isArray(transfer?.linkedMainEntries)
    ) {
      return null;
    }
    const revision = clean(payload?.revision) || clean(transfer.exportedAt);
    return revision ? { revision, transfer } : null;
  }

  function scheduleReadingWordsSessionSave() {
    window.clearTimeout(readingSessionSaveTimer);
    readingSessionSaveTimer = window.setTimeout(() => {
      readingSessionSaveTimer = 0;
      saveReadingWordsSession();
    }, 80);
  }

  function stableReadingIds(word) {
    return [clean(word?.id), clean(word?.wordId)].filter(Boolean);
  }

  function sharesReadingId(left, right) {
    const rightIds = new Set(stableReadingIds(right));
    return stableReadingIds(left).some((value) => rightIds.has(value));
  }

  function publishedAliasKeys(raw) {
    return new Set([
      raw?.correctedFrom,
      ...(Array.isArray(raw?.legacyHeadwords) ? raw.legacyHeadwords : []),
      ...(Array.isArray(raw?.mergedAliases) ? raw.mergedAliases : [])
    ].map((value) => key(typeof value === "string" ? value : value?.word || value?.alias)).filter(Boolean));
  }

  function matchingPublishedLocalWords(raw, incoming, localWords) {
    const canonicalKey = key(incoming?.word);
    const aliases = publishedAliasKeys(raw);
    return localWords.filter((local) => (
      key(local?.word) === canonicalKey
      || sharesReadingId(local, raw)
      || aliases.has(key(local?.word))
    ));
  }

  function hasLegacyPublishedLocalAlias(transfer, localWords) {
    return transfer.readingWords.some((raw) => {
      const incoming = normalizeReadingWord(raw);
      const canonicalKey = key(incoming.word);
      return matchingPublishedLocalWords(raw, incoming, localWords)
        .some((local) => key(local.word) !== canonicalKey);
    });
  }

  async function applyPublishedSnapshot(formalWords) {
    try {
      const response = await fetch(`${STATIC_PUBLISH_URL}?v=${VERSION}`, { cache: "no-store" });
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`静态发布包读取失败：HTTP ${response.status}`);
      const published = publishedTransfer(await response.json());
      if (!published) throw new Error("静态发布包格式无效");
      const needsContextSenseMigration =
        localStorage.getItem(STATIC_CONTEXT_SENSE_MIGRATION_KEY) !== STATIC_CONTEXT_SENSE_MIGRATION_VERSION;
      const needsLegacyAliasRepair = hasLegacyPublishedLocalAlias(published.transfer, words);
      if (
        localStorage.getItem(STATIC_PUBLISH_REVISION_KEY) === published.revision &&
        words.length &&
        !needsContextSenseMigration &&
        !needsLegacyAliasRepair
      ) {
        return false;
      }

      const usedLocalKeys = new Set();
      const usedLocalIds = new Set();
      const supplements = published.transfer.linkedMainEntries
        .filter((entry) => entry?.transferType === "supplement")
        .map((entry) => ({ ...entry, transferType: undefined }));
      const nextMainWords = [...formalWords];
      const known = new Set(formalWords.map((entry) => key(entry.word)));
      for (const supplement of supplements) {
        if (!known.has(key(supplement.word))) nextMainWords.push(supplement);
      }
      const nextMainIndex = new Map(nextMainWords.map((entry) => [key(entry.word), entry]));
      const now = new Date().toISOString();
      const publishedWords = published.transfer.readingWords.map((raw) => {
        const incoming = canonicalizeReadingWord(normalizeReadingWord(raw, now), formalWords);
        const matches = matchingPublishedLocalWords(raw, incoming, words);
        for (const match of matches) {
          usedLocalKeys.add(key(match.word));
          for (const stableId of stableReadingIds(match)) usedLocalIds.add(stableId);
        }
        const canonicalKey = key(incoming.word);
        const previous = matches.find((match) => key(match.word) === canonicalKey)
          || matches.find((match) => sharesReadingId(match, raw))
          || matches[0];
        return applyMain({
          ...incoming,
          id: previous?.id || incoming.id,
          wordId: previous?.wordId || incoming.wordId,
          favorite: Boolean(incoming.favorite || previous?.favorite),
          status: incoming.status || previous?.status || "",
          lastReviewedAt: previous?.lastReviewedAt || incoming.lastReviewedAt || "",
          importCount: Math.max(Number(incoming.importCount) || 1, Number(previous?.importCount) || 1),
          highFrequency: Boolean(incoming.highFrequency || previous?.highFrequency),
          firstImportedAt: previous?.firstImportedAt || incoming.firstImportedAt,
          lastImportedAt: previous?.lastImportedAt || incoming.lastImportedAt,
          createdAt: previous?.createdAt || incoming.createdAt
        }, resolveLinkedMainEntry(incoming, nextMainWords));
      });
      const retainedLocalWords = words
        .filter((word) => (
          !usedLocalKeys.has(key(word.word))
          && !stableReadingIds(word).some((stableId) => usedLocalIds.has(stableId))
        ))
        .map((word) => applyMain(word, resolveLinkedMainEntry(word, nextMainWords)));
      words = [...retainedLocalWords, ...publishedWords];
      const previousSelectedId = selectedId;
      selectedId = words.some((word) => word.id === previousSelectedId)
        ? previousSelectedId
        : words[0]?.id || "";
      mainWords = nextMainWords;
      mainIndex = nextMainIndex;
      saveSupplements(supplements);
      saveReadingWords();
      localStorage.setItem(STATIC_PUBLISH_REVISION_KEY, published.revision);
      localStorage.setItem(STATIC_CONTEXT_SENSE_MIGRATION_KEY, STATIC_CONTEXT_SENSE_MIGRATION_VERSION);
      return true;
    } catch (error) {
      console.warn("Reading words static publish load skipped", error);
      return false;
    }
  }

  function toggleFavorite() {
    const current = currentWord();
    if (!current) return;
    words = words.map((word) => word.id === current.id
      ? { ...word, favorite: !word.favorite, updatedAt: new Date().toISOString() }
      : word);
    saveReadingWords();
    render();
  }

  function shouldHandleDeleteShortcut(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
    const tag = String(event.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || event.target?.isContentEditable) return false;
    const shortcutKey = String(event.key || "").toLowerCase();
    return shortcutKey === "d" || shortcutKey === "delete" || event.code === "Delete";
  }

  function getStudyKeyboardAction(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return "";
    const tag = String(event.target?.tagName || "").toLowerCase();
    const inputType = tag === "input"
      ? String(event.target?.type || event.target?.getAttribute?.("type") || "text").toLowerCase()
      : "";
    const isTextEditor = tag === "textarea"
      || event.target?.isContentEditable
      || (tag === "input" && ![
        "button", "checkbox", "color", "file", "hidden", "image",
        "radio", "range", "reset", "submit"
      ].includes(inputType));
    if (event.key === "Tab") return event.shiftKey ? "" : "word-audio";
    if (event.key === " " || event.code === "Space" || event.key === "Spacebar") {
      return isTextEditor ? "" : "example-audio";
    }
    if (isTextEditor) return "";
    if (event.key === "ArrowLeft") return "previous";
    if (event.key === "ArrowRight") return "next";
    if (event.code === "Digit1" || event.code === "Numpad1" || event.key === "1") return "known";
    if (event.code === "Digit2" || event.code === "Numpad2" || event.key === "2") return "blurry";
    if (event.code === "Digit3" || event.code === "Numpad3" || event.key === "3") return "unknown";
    return "";
  }

  function deleteCurrentReadingWord() {
    const visible = visibleWords();
    const current = currentWord();
    if (!current) return;
    const currentIndex = visible.findIndex((word) => word.id === current.id);
    if (!confirm(
      `确定从阅读生词本删除“${current.word}”吗？\n\n` +
      "只会删除阅读生词记录，不会删除主词库中的单词。"
    )) return;

    const nextVisible = visible[currentIndex + 1] || visible[currentIndex - 1] || null;
    words = words.filter((word) => word.id !== current.id);
    selectedId = nextVisible?.id || "";
    saveReadingWords();
    render();
    toast(`已从阅读生词本删除：${current.word}；主词库未改变。`);
  }

  function speak(text) {
    if (!text || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 0.92;
    speechSynthesis.speak(utterance);
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }

  function exportTransfer() {
    const readingKeys = new Set(words.map((word) => key(word.word)));
    const linkedMainIds = new Set(words.map((word) => clean(word.mainWordId || word.baseWordId)).filter(Boolean));
    const supplements = readSupplements().filter((entry) => readingKeys.has(key(entry.word)));
    const linkedStateEntries = mainWords.filter((entry) => linkedMainIds.has(clean(entry.id || entry.wordId)));
    const payload = {
      type: TRANSFER_TYPE,
      version: 1,
      exportedAt: new Date().toISOString(),
      readingWords: words,
      linkedMainEntries: [
        ...supplements.map((entry) => ({ ...entry, transferType: "supplement" })),
        ...linkedStateEntries.map((entry) => ({
          id: entry.id,
          wordId: entry.wordId || entry.id,
          word: entry.word,
          transferType: "user-state"
        }))
      ],
      sourceMainMeta: { version: VERSION }
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `阅读生词-跨设备迁移包-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("跨设备迁移包已导出。");
  }

  async function importFile(file) {
    const text = await file.text();
    try {
      const payload = JSON.parse(text);
      if (payload?.type === TRANSFER_TYPE && Array.isArray(payload.readingWords)) {
        const supplements = readSupplements();
        const supplementIndex = new Set(supplements.map((entry) => key(entry.word)));
        for (const entry of payload.linkedMainEntries || []) {
          if (entry?.transferType === "supplement" && !supplementIndex.has(key(entry.word))) {
            supplements.push({ ...entry, transferType: undefined });
            supplementIndex.add(key(entry.word));
          }
        }
        saveSupplements(supplements);
        mainWords = [...mainWords.filter((entry) => !entry.addedFromReadingWords), ...supplements];
        mainIndex = new Map(mainWords.map((entry) => [key(entry.word), entry]));
        mergeImport(payload.readingWords, true);
        return;
      }
    } catch {
      // Non-JSON table files continue through the table parser.
    }
    mergeImport(parseTable(text), false);
  }

  els.singleAddBtn.onclick = () => els.singlePanel.classList.toggle("hidden");
  els.singleCancelBtn.onclick = () => els.singlePanel.classList.add("hidden");
  els.batchAddBtn.onclick = () => els.batchPanel.classList.toggle("hidden");
  els.batchCancelBtn.onclick = () => els.batchPanel.classList.add("hidden");
  els.aiInfoBtn.onclick = () => els.aiPanel.classList.toggle("hidden");
  els.frequentFilterBtn.onclick = () => {
    frequentOnly = !frequentOnly;
    render();
  };
  els.searchInput.oninput = render;
  els.wordList.onclick = (event) => {
    const button = event.target.closest("[data-id]");
    if (!button || !els.wordList.contains(button) || button.dataset.id === selectedId) return;
    selectedId = button.dataset.id;
    render();
  };
  els.progressSeek.oninput = () => {
    const visible = visibleWords();
    const target = visible[Math.max(0, Number(els.progressSeek.value) - 1)];
    els.progressPreview.textContent = target?.word || "";
  };
  els.progressSeek.onchange = () => seekStudyPosition(els.progressSeek.value);
  els.progressJumpToggle.onclick = () => {
    const open = els.progressJumpForm.classList.toggle("hidden");
    els.progressJumpToggle.setAttribute("aria-expanded", String(!open));
    if (!open) {
      els.progressJumpInput.value = els.progressSeek.value;
      els.progressJumpInput.focus();
      els.progressJumpInput.select();
    }
  };
  els.progressJumpCancel.onclick = () => {
    els.progressJumpForm.classList.add("hidden");
    els.progressJumpToggle.setAttribute("aria-expanded", "false");
  };
  els.progressJumpForm.onsubmit = (event) => {
    event.preventDefault();
    els.progressJumpForm.classList.add("hidden");
    els.progressJumpToggle.setAttribute("aria-expanded", "false");
    seekStudyPosition(els.progressJumpInput.value);
  };
  els.singleForm.onsubmit = (event) => {
    event.preventDefault();
    mergeImport([{
      word: els.wordInput.value,
      meaning: els.meaningInput.value,
      pos: els.posInput.value,
      synonyms: els.synonymInput.value
    }]);
    els.singleForm.reset();
    els.singlePanel.classList.add("hidden");
  };
  els.batchImportBtn.onclick = () => {
    try {
      mergeImport(parseTable(els.batchInput.value));
      els.batchInput.value = "";
      els.batchPanel.classList.add("hidden");
    } catch (error) {
      toast(`导入失败：${error.message}`);
    }
  };
  els.exportBtn.onclick = exportTransfer;
  els.importInput.onchange = async () => {
    const file = els.importInput.files?.[0];
    els.importInput.value = "";
    if (!file) return;
    try {
      await importFile(file);
    } catch (error) {
      toast(`导入失败：${error.message}`);
    }
  };
  function bindHoldButton(button, dir) {
    if (!button) return;
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      startHoldStep(dir);
    });
    button.addEventListener("pointerup", stopHoldStep);
    button.addEventListener("pointercancel", stopHoldStep);
    button.addEventListener("lostpointercapture", stopHoldStep);
  }
  bindHoldButton(els.prevBtn, -1);
  bindHoldButton(els.nextBtn, 1);
  els.favoriteBtn.onclick = toggleFavorite;
  els.knownBtn.onclick = () => mark("熟悉");
  els.blurryBtn.onclick = () => mark("模糊");
  els.unknownBtn.onclick = () => mark("不熟");
  els.deleteBtn.onclick = deleteCurrentReadingWord;
  els.wordSoundBtn.onclick = () => speak(currentWord()?.word);
  els.exampleSoundBtn.onclick = () => speak(currentWord()?.example);
  window.addEventListener("keydown", (event) => {
    if (shouldHandleDeleteShortcut(event)) {
      event.preventDefault();
      deleteCurrentReadingWord();
      return;
    }
    const action = getStudyKeyboardAction(event);
    if (!action || !currentWord()) return;
    event.preventDefault();
    if (action === "word-audio") speak(currentWord()?.word);
    else if (action === "example-audio") speak(currentWord()?.example);
    else if (action === "previous") startHoldStep(-1);
    else if (action === "next") startHoldStep(1);
    else if (action === "known") mark("熟悉");
    else if (action === "blurry") mark("模糊");
    else if (action === "unknown") mark("不熟");
  });
  window.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.code === "ArrowLeft" || event.code === "ArrowRight") {
      stopHoldStep();
    }
  });
  window.addEventListener("blur", stopHoldStep);
  window.addEventListener("pagehide", () => {
    if (!readingSessionSaveTimer) return;
    window.clearTimeout(readingSessionSaveTimer);
    readingSessionSaveTimer = 0;
    saveReadingWordsSession();
  });
  async function boot() {
    try {
      const response = await fetch(`./data/words.json?v=${VERSION}`, { cache: "force-cache" });
      if (!response.ok) throw new Error("主词库读取失败");
      const payload = await response.json();
      const formalWords = Array.isArray(payload?.words) ? payload.words : Array.isArray(payload) ? payload : [];
      const publishedSnapshotApplied = await applyPublishedSnapshot(formalWords);
      const supplements = readSupplements();
      let correctedHeadwords = 0;
      words = words.map((word) => {
        const canonical = canonicalizeReadingWord(word, formalWords);
        if (key(canonical.word) !== key(word.word)) correctedHeadwords += 1;
        return canonical;
      });
      const retainedSupplements = supplements.filter(
        (entry) => !suggestCanonicalReadingHeadword(entry, formalWords).corrected
      );
      if (retainedSupplements.length !== supplements.length) saveSupplements(retainedSupplements);
      mainWords = [...formalWords];
      const known = new Set(formalWords.map((entry) => key(entry.word)));
      for (const supplement of retainedSupplements) {
        if (!known.has(key(supplement.word))) mainWords.push(supplement);
      }
      mainIndex = new Map(mainWords.map((entry) => [key(entry.word), entry]));
      words = words.map((word) => applyMain(word, resolveLinkedMainEntry(word, mainWords)));
      saveReadingWords();
      els.mainStatus.textContent = `已连接主词库 ${formalWords.length.toLocaleString("zh-CN")} 词`;
      if (publishedSnapshotApplied) toast("已加载电脑端最新静态发布包");
      if (correctedHeadwords) toast(`已自动纠正 ${correctedHeadwords} 个阅读断词。`);
    } catch (error) {
      els.mainStatus.textContent = error.message;
    }
    render();
  }

  boot();
})();
