(function () {
  "use strict";

  const VERSION = "20260727_mobile_first_screen_v1";
  const READING_KEY = "ielts-personal-reading-words-v1";
  const MAIN_SUPPLEMENT_KEY = "static_personal_reading_main_v1";
  const TRANSFER_TYPE = "ielts-reading-words-transfer";
  const els = Object.fromEntries([
    "mainStatus", "totalCount", "frequentCount", "incompleteCount", "searchInput",
    "frequentFilterBtn", "singleAddBtn", "batchAddBtn", "exportBtn", "importInput",
    "aiInfoBtn", "singlePanel", "singleForm", "wordInput", "meaningInput", "posInput",
    "synonymInput", "singleCancelBtn", "batchPanel", "batchInput", "batchCancelBtn",
    "batchImportBtn", "aiPanel", "emptyState", "wordContent", "positionText",
    "frequencyBadge", "exampleText", "exampleCnText", "exampleSoundBtn", "wordSoundBtn",
    "phoneticText", "posText", "meaningText", "formsList", "familyList", "synonymList",
    "prevBtn", "knownBtn", "blurryBtn", "unknownBtn", "nextBtn", "visibleCount",
    "wordList", "toast"
  ].map((id) => [id, document.getElementById(id)]));

  let mainWords = [];
  let mainIndex = new Map();
  let words = readReadingWords();
  let selectedId = words[0]?.id || "";
  let frequentOnly = false;

  function clean(value) {
    return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  }

  function key(value) {
    return clean(value).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
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
    const seen = new Set([key(word)]);
    return list.map((item) => clean(typeof item === "string" ? item : item?.word || item?.replacement))
      .filter((item) => {
        const normalized = key(item);
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      }).slice(0, 8);
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
      importCount,
      highFrequency: input?.highFrequency === true || importCount >= 2,
      status: ["熟悉", "模糊", "不熟"].includes(input?.status) ? input.status : "",
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
    for (const field of ["phonetic", "pos", "forms", "wordFamily"]) {
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
      forms: readingWord.forms,
      wordFamily: readingWord.wordFamily,
      synonyms: readingWord.synonyms,
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
      const incoming = normalizeReadingWord(raw, now);
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
    return !word.pos || !word.meaning || !word.definition || !word.example || !word.exampleCn;
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

  function listHtml(items, formatter) {
    return items.length
      ? items.map((item) => `<p>${escapeHtml(formatter(item))}</p>`).join("")
      : '<p class="empty">暂无可靠内容</p>';
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function render() {
    const visible = visibleWords();
    const current = currentWord();
    if (current && !selectedId) selectedId = current.id;
    els.totalCount.textContent = words.length;
    els.frequentCount.textContent = words.filter((word) => word.highFrequency || Number(word.importCount) >= 2).length;
    els.incompleteCount.textContent = words.filter(isIncomplete).length;
    els.visibleCount.textContent = `${visible.length} 个`;
    els.frequentFilterBtn.setAttribute("aria-pressed", String(frequentOnly));
    els.frequentFilterBtn.classList.toggle("primary", frequentOnly);
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
    els.exampleText.textContent = current.example || "暂无英文例句";
    els.exampleCnText.textContent = current.exampleCn || "";
    els.wordSoundBtn.textContent = current.word;
    els.phoneticText.textContent = current.phonetic || "";
    els.posText.textContent = current.pos || "词性待补全";
    els.meaningText.textContent = current.meaning || "释义待补全";
    els.formsList.innerHTML = listHtml(current.forms || [], (item) => `${item.word || ""}${item.type ? ` · ${item.type}` : ""}`);
    els.familyList.innerHTML = listHtml(current.wordFamily || [], (item) => `${item.word || ""}${item.pos ? ` · ${item.pos}` : ""}${item.meaning ? ` · ${item.meaning}` : ""}`);
    els.synonymList.innerHTML = listHtml(current.synonyms || [], (item) => typeof item === "string" ? item : item.word || item.replacement || "");
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
    words = words.map((word) => word.id === current.id ? { ...word, status, updatedAt: new Date().toISOString() } : word);
    saveReadingWords();
    render();
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
  els.knownBtn.onclick = () => mark("熟悉");
  els.blurryBtn.onclick = () => mark("模糊");
  els.unknownBtn.onclick = () => mark("不熟");
  els.wordSoundBtn.onclick = () => speak(currentWord()?.word);
  els.exampleSoundBtn.onclick = () => speak(currentWord()?.example);

  async function boot() {
    try {
      const response = await fetch(`./data/words.json?v=${VERSION}`, { cache: "force-cache" });
      if (!response.ok) throw new Error("主词库读取失败");
      const payload = await response.json();
      const formalWords = Array.isArray(payload?.words) ? payload.words : Array.isArray(payload) ? payload : [];
      const supplements = readSupplements();
      mainWords = [...formalWords];
      const known = new Set(formalWords.map((entry) => key(entry.word)));
      for (const supplement of supplements) {
        if (!known.has(key(supplement.word))) mainWords.push(supplement);
      }
      mainIndex = new Map(mainWords.map((entry) => [key(entry.word), entry]));
      words = words.map((word) => applyMain(word, mainIndex.get(key(word.word))));
      saveReadingWords();
      els.mainStatus.textContent = `已连接主词库 ${formalWords.length.toLocaleString("zh-CN")} 词`;
    } catch (error) {
      els.mainStatus.textContent = error.message;
    }
    render();
  }

  boot();
})();
