(function () {
  "use strict";

  const VERSION = "20260809_reading_keyboard_v49";
  const READING_KEY = "ielts-personal-reading-words-v1";
  const READING_SESSION_KEY = "ielts-personal-reading-words-session-v1";
  const MAIN_SUPPLEMENT_KEY = "static_personal_reading_main_v1";
  const STATIC_PUBLISH_REVISION_KEY = "ielts_static_reading_words_publish_revision_v1";
  const STATIC_PUBLISH_URL = "./data/personal-reading-words.json";
  const TRANSFER_TYPE = "ielts-reading-words-transfer";
  const els = Object.fromEntries([
    "mainStatus", "totalCount", "frequentCount", "incompleteCount", "searchInput",
    "frequentFilterBtn", "singleAddBtn", "batchAddBtn", "exportBtn", "importInput",
    "aiInfoBtn", "singlePanel", "singleForm", "wordInput", "meaningInput", "posInput",
    "synonymInput", "singleCancelBtn", "batchPanel", "batchInput", "batchCancelBtn",
    "batchImportBtn", "aiPanel", "emptyState", "wordContent", "positionText",
    "frequencyBadge", "exampleText", "exampleCnText", "exampleSoundBtn", "wordSoundBtn",
    "phoneticText", "posText", "meaningText", "formsList", "familyList", "synonymList",
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
      definition: clean(input?.definition),
      example: clean(input?.example),
      exampleCn: clean(input?.exampleCn),
      forms: Array.isArray(input?.forms) ? input.forms : [],
      wordFamily: Array.isArray(input?.wordFamily) ? input.wordFamily : [],
      synonyms: normalizeSynonyms(input?.synonyms, word),
      synonymDetails: normalizeSynonymDetails(
        [
          ...(Array.isArray(input?.synonymDetails) ? input.synonymDetails : []),
          ...(Array.isArray(input?.synonyms) ? input.synonyms : [])
        ],
        input?.synonyms,
        word
      ),
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
    for (const field of [
      "phonetic",
      "pos",
      "forms",
      "wordFamily",
      "synonymDetails",
      "otherMeanings",
      "senses",
      "meaningsZh"
    ]) {
      if (Array.isArray(mainWord[field]) ? mainWord[field].length : clean(mainWord[field])) next[field] = mainWord[field];
    }
    for (const field of ["meaning", "definition", "example", "exampleCn"]) {
      if (!clean(next[field]) && clean(mainWord[field])) next[field] = mainWord[field];
    }
    if (!next.synonyms?.length) {
      next.synonyms = normalizeSynonyms(
        mainWord.synonyms || mainWord.validatedSynonyms || mainWord.recommendedSynonyms,
        next.word
      );
    }
    return next;
  }

  function ensureMainEntry(readingWord) {
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
      definition: readingWord.definition,
      example: readingWord.example,
      exampleCn: readingWord.exampleCn,
      otherMeanings: Array.isArray(readingWord.otherMeanings) ? readingWord.otherMeanings : [],
      senses: Array.isArray(readingWord.senses) ? readingWord.senses : [],
      meaningsZh: Array.isArray(readingWord.meaningsZh) ? readingWord.meaningsZh : [],
      forms: readingWord.forms,
      wordFamily: readingWord.wordFamily,
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
    return !word.pos || !word.meaning || !word.definition || !word.example || !word.exampleCn || !hasCompleteSynonymDetails(word);
  }

  function visibleWords() {
    const query = key(els.searchInput.value);
    return words.filter((word) => {
      if (frequentOnly && !word.highFrequency && Number(word.importCount) < 2) return false;
      return !query || [word.word, word.meaning, word.definition, ...(word.synonyms || [])]
        .some((value) => key(value).includes(query));
    });
  }

  function currentWord() {
    const visible = visibleWords();
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

  function synonymListHtml(items, details) {
    if (!items.length) return '<p class="empty">暂无可靠内容</p>';
    const detailByWord = new Map(
      normalizeSynonymDetails(details, items, currentWord()?.word)
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
    const seen = new Set(primaryMeaning.split(/[；;，,、/]+/).map(displayMeaningKey).filter(Boolean));
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
        if (!senseKey || seen.has(senseKey)) return false;
        seen.add(senseKey);
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

  function render() {
    const visible = visibleWords();
    const current = currentWord();
    if (current && current.id !== selectedId) selectedId = current.id;
    els.totalCount.textContent = words.length;
    els.frequentCount.textContent = words.filter((word) => word.highFrequency || Number(word.importCount) >= 2).length;
    els.incompleteCount.textContent = words.filter(isIncomplete).length;
    els.visibleCount.textContent = `${visible.length} 个`;
    els.frequentFilterBtn.setAttribute("aria-pressed", String(frequentOnly));
    els.frequentFilterBtn.classList.toggle("primary", frequentOnly);
    renderStudyProgress(visible, current);
    saveReadingWordsSession();
    els.wordList.innerHTML = visible.map((word) => `
      <button class="word-row${word.id === current?.id ? " active" : ""}" type="button" data-id="${escapeHtml(word.id)}">
        <span><strong>${escapeHtml(word.word)}</strong><span>${escapeHtml(word.meaning || "待补全")}</span></span>
        <em>${word.highFrequency || Number(word.importCount) >= 2 ? `高频 ×${word.importCount}` : ""}</em>
      </button>
    `).join("");
    els.wordList.querySelectorAll("[data-id]").forEach((button) => {
      button.onclick = () => {
        selectedId = button.dataset.id;
        render();
      };
    });

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
    els.exampleText.textContent = current.example || "暂无英文例句";
    els.exampleCnText.textContent = current.exampleCn || "";
    els.wordSoundBtn.textContent = current.word;
    els.phoneticText.textContent = current.phonetic || "";
    els.posText.textContent = current.pos || "词性待补全";
    els.meaningText.textContent = inlineStudyMeaningText(current);
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
    els.formsList.innerHTML = listHtml(forms, (item) => `${item.word || ""}${item.type ? ` · ${item.type}` : ""}`);
    els.familyList.innerHTML = listHtml(family, (item) => `${item.word || ""}${item.pos ? ` · ${item.pos}` : ""}${item.meaning ? ` · ${item.meaning}` : ""}`);
    els.synonymList.innerHTML = synonymListHtml(synonyms, current.synonymDetails);
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
    const currentIndex = Math.max(0, visible.findIndex((word) => word.id === currentWord()?.id));
    selectedId = visible[(currentIndex + offset + visible.length) % visible.length].id;
    render();
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

  async function applyPublishedSnapshot(formalWords) {
    try {
      const response = await fetch(`${STATIC_PUBLISH_URL}?v=${VERSION}`, { cache: "no-store" });
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`静态发布包读取失败：HTTP ${response.status}`);
      const published = publishedTransfer(await response.json());
      if (!published) throw new Error("静态发布包格式无效");
      if (
        localStorage.getItem(STATIC_PUBLISH_REVISION_KEY) === published.revision &&
        words.length
      ) {
        return false;
      }

      const previousByKey = new Map(words.map((word) => [key(word.word), word]));
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
        const previous = previousByKey.get(key(incoming.word));
        return applyMain({
          ...incoming,
          id: previous?.id || incoming.id,
          wordId: previous?.wordId || incoming.wordId,
          favorite: Boolean(incoming.favorite || previous?.favorite),
          status: incoming.status || previous?.status || ""
        }, nextMainIndex.get(key(incoming.word)));
      });
      const publishedKeys = new Set(publishedWords.map((word) => key(word.word)));
      const retainedLocalWords = words
        .filter((word) => !publishedKeys.has(key(word.word)))
        .map((word) => applyMain(word, nextMainIndex.get(key(word.word))));
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
    const supplements = readSupplements().filter((entry) => readingKeys.has(key(entry.word)));
    const payload = {
      type: TRANSFER_TYPE,
      version: 1,
      exportedAt: new Date().toISOString(),
      readingWords: words,
      linkedMainEntries: supplements.map((entry) => ({ ...entry, transferType: "supplement" })),
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
  els.prevBtn.onclick = () => move(-1);
  els.nextBtn.onclick = () => move(1);
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
    else if (action === "previous") move(-1);
    else if (action === "next") move(1);
    else if (action === "known") mark("熟悉");
    else if (action === "blurry") mark("模糊");
    else if (action === "unknown") mark("不熟");
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
      words = words.map((word) => applyMain(word, mainIndex.get(key(word.word))));
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
