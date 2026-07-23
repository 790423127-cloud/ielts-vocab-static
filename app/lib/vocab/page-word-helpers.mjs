/**
 * Pure helpers extracted from app/page.jsx (I3 split).
 * UI/state stays in page.jsx; lexicon math lives here for reuse/tests.
 */
import { cleanupBrowserCachesForVocab } from "./cache-cleanup.mjs";
import { saveWordsToIndexedDB } from "./word-store.mjs";
import {
  safeLocalStorageGet as sharedLocalStorageGet,
  safeLocalStorageRemove as sharedLocalStorageRemove,
  safeLocalStorageSet as sharedLocalStorageSet
} from "../browser-storage.mjs";
import {
  isBrushableWord,
  isInflectedReferenceWord
} from "./word-study-eligibility.mjs";
import {
  isLearningContentComplete,
  isMissingClassification
} from "./word-quality-status.mjs";
import {
  AI_CONTENT_FIELDS,
  copyFields,
  pickPreferredAiContentPackage
} from "./word-field-boundaries.mjs";

export {
  isMissingAiFields,
  isMissingClassification
} from "./word-quality-status.mjs";

export const LOCAL_LEXICON_ORGANIZATION_POLICY = Object.freeze({
  version: "manual-morphology-audit-v3-20260722",
  relationSource: "stored baseWord/baseWordId/redirectToWord metadata only",
  suffixGuessing: false,
  derivedWordAutoDelete: false,
  headwordRepair: "reviewed exact-match whitelist only",
  preserveRelationMetadata: true,
  preserveUserState: true
});

export function fallback(value, text) {
  return value && String(value).trim() ? value : text;
}

export function formatSpeechSourceLabel(result = {}) {
  // Product policy: only Edge fallback speech is used.
  if (!result || result.source === "empty") return "发音";
  return "兜底发音";
}

export function normalizeWord(word) {
  return String(word || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
    .replace(/\s+/g, " ");
}

export function isSimpleDictionaryWord(value) {
  const text = String(value || "").trim();

  // 只让真正的单个英文单词走词典接口。
  // 短语 / 句子也走统一发音入口：真人源优先，缺失时才使用临时兜底。
  return /^[A-Za-z][A-Za-z'-]*$/.test(text);
}

export function isCompleteAiWord(word) {
  return isLearningContentComplete(word) && !isMissingClassification(word);
}

export function normalizePhraseItems(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") {
        return { phrase: item, chinese: "" };
      }

      return {
        phrase: item?.phrase || item?.text || item?.collocation || "",
        chinese: item?.chinese || item?.translation || item?.meaning || ""
      };
    })
    .filter((item) => item.phrase)
    .slice(0, 3);
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export function mergePhraseLists(a = [], b = []) {
  const map = new Map();

  [...normalizePhraseItems(a), ...normalizePhraseItems(b)].forEach((item) => {
    const key = normalizeWord(item.phrase);
    if (!key) return;

    const existing = map.get(key);
    map.set(key, {
      phrase: existing?.phrase || item.phrase,
      chinese: existing?.chinese || item.chinese || ""
    });
  });

  return Array.from(map.values()).slice(0, 3);
}

export function normalizeFormList(value) {
  if (!Array.isArray(value)) return [];

  const map = new Map();

  value.forEach((item) => {
    const word = String(item?.word || item || "").trim();
    if (!word) return;

    const type = String(item?.type || "form").trim();
    const key = `${normalizeWord(word)}::${type.toLowerCase()}`;
    const source = item && typeof item === "object" ? item : {};
    const normalized = { ...source, word, type };

    if (Object.prototype.hasOwnProperty.call(source, "id")) normalized.id = String(source.id || "").trim();
    if (Object.prototype.hasOwnProperty.call(source, "note")) normalized.note = String(source.note || "").trim();
    if (Object.prototype.hasOwnProperty.call(source, "source")) normalized.source = String(source.source || "").trim();

    const existing = map.get(key);
    if (!existing) {
      map.set(key, normalized);
      return;
    }

    // Duplicate relation rows are merged without discarding audited ids or
    // provenance. The first non-empty value stays authoritative.
    const merged = { ...existing };
    Object.entries(normalized).forEach(([field, fieldValue]) => {
      if ((merged[field] === undefined || merged[field] === null || merged[field] === "") && fieldValue !== "") {
        merged[field] = fieldValue;
      }
    });
    map.set(key, merged);
  });

  return Array.from(map.values());
}

export function mergeFormLists(a = [], b = []) {
  return normalizeFormList([...normalizeFormList(a), ...normalizeFormList(b)]);
}

export function normalizeFamilyList(value) {
  if (!Array.isArray(value)) return [];

  const map = new Map();

  value.forEach((item) => {
    const word = String(item?.word || item || "").trim();
    if (!word) return;

    const key = normalizeWord(word);
    const source = item && typeof item === "object" ? item : {};
    const normalized = { ...source, word };

    for (const field of ["id", "pos", "meaning", "relation"]) {
      if (Object.prototype.hasOwnProperty.call(source, field)) normalized[field] = String(source[field] || "").trim();
    }

    if (!map.has(key)) {
      map.set(key, normalized);
      return;
    }

    const existing = map.get(key);
    const merged = { ...existing };
    Object.entries(normalized).forEach(([field, fieldValue]) => {
      if ((merged[field] === undefined || merged[field] === null || merged[field] === "") && fieldValue !== "") {
        merged[field] = fieldValue;
      }
    });
    map.set(key, merged);
  });

  return Array.from(map.values());
}

export function mergeFamilyLists(a = [], b = []) {
  return normalizeFamilyList([...normalizeFamilyList(a), ...normalizeFamilyList(b)]);
}

export function standardizeAuxiliaryPhrase(text) {
  let output = String(text || "").trim();

  output = output.replace(/^(am|is|are|was|were|been|being)\s+/i, "be ");
  output = output.replace(/^(has|had)\s+/i, "have ");
  output = output.replace(/^(does|did)\s+/i, "do ");

  output = output.replace(/\b(am|is|are|was|were)\s+responsible\s+for\b/i, "be responsible for");
  output = output.replace(/\b(has|had)\s+an?\s+effect\s+on\b/i, "have an effect on");
  output = output.replace(/\b(is|are|was|were)\s+an?\s+result\s+of\b/i, "be a result of");

  return output.replace(/\s+/g, " ").trim();
}

export function cleanWordForLocalUse(value) {
  let text = String(value || "")
    .normalize("NFKC")
    .replace(/^\uFEFF/, "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .trim();

  text = text.replace(/^\s*(?:\d+[\.\)、\)]|[-*•●]+)\s*/g, "");
  text = text.replace(/[\u3400-\u9FFF].*$/u, "");
  text = text.replace(/\s+[-–—:：]\s+.*$/g, "");
  text = text.replace(/^[`"'“”‘’\[\]{}()]+|[`"'“”‘’\[\]{}(),.;:!?]+$/g, "");
  text = text.replace(/\s+/g, " ").trim();

  if (!text) return "";

  text = text.toLowerCase();
  text = standardizeAuxiliaryPhrase(text);

  return text;
}

export function resetAiFieldsForChangedWord(word, clean, label = "本地整理") {
  return {
    ...word,
    word: clean,
    forms: normalizeFormList(word.forms),
    wordFamily: normalizeFamilyList(word.wordFamily),
    localHeadwordNormalizedFrom: word.localHeadwordNormalizedFrom || String(word.word || "").trim(),
    localHeadwordNormalizedAt: Date.now(),
    localHeadwordNormalization: label
  };
}

export function generateInflectedForms(word, { wordMap = null } = {}) {
  // All displayed forms must come from the audited master lexicon. Runtime
  // suffix guessing previously created false links such as canva -> canvas.
  void word;
  void wordMap;
  return [];
}


export function makeCleanWordObject(word, clean, label = "本地整理") {
  const changed = normalizeWord(clean) !== normalizeWord(word.word);

  if (!changed) {
    return {
      ...word,
      forms: normalizeFormList(word.forms),
      wordFamily: normalizeFamilyList(word.wordFamily)
    };
  }

  return resetAiFieldsForChangedWord(word, clean, label);
}

export function mergeWord(oldItem, newItem) {
  const preferredAiPackage = pickPreferredAiContentPackage(oldItem, newItem);
  const merged = {
    ...oldItem,
    ...copyFields(preferredAiPackage, AI_CONTENT_FIELDS),
    status: oldItem.status || newItem.status || "",
    favorite: Boolean(oldItem.favorite || newItem.favorite),
    duplicateContentSource: preferredAiPackage === oldItem ? "first" : "second"
  };

  // Exact duplicate consolidation must never throw away local learning state.
  // Keep the strongest counters/progress and the most recent review timestamp.
  for (const field of ["reviewCount", "correctCount", "wrongCount", "mastery"]) {
    const values = [oldItem[field], newItem[field]].map(Number).filter(Number.isFinite);
    if (values.length) merged[field] = Math.max(...values);
  }

  const reviewTimes = [oldItem.lastReviewedAt, newItem.lastReviewedAt].filter(Boolean);
  if (reviewTimes.length) merged.lastReviewedAt = reviewTimes.sort().at(-1);

  if (oldItem.learningProgress !== undefined || newItem.learningProgress !== undefined) {
    merged.learningProgress = oldItem.learningProgress ?? newItem.learningProgress;
  }

  return merged;
}

export function buildLocalCleanResult(sourceWords) {
  let changed = 0;
  let removed = 0;

  const words = sourceWords
    .map((word) => {
      const clean = cleanWordForLocalUse(word.word);

      if (!clean) {
        removed += 1;
        return null;
      }

      if (normalizeWord(clean) !== normalizeWord(word.word)) {
        changed += 1;
      }

      return makeCleanWordObject(word, clean, "本地整理");
    })
    .filter(Boolean);

  return {
    words,
    stats: {
      changed,
      removed
    }
  };
}

export function buildLocalExactDedupeResult(sourceWords) {
  const map = new Map();
  let merged = 0;

  sourceWords.forEach((word) => {
    const key = normalizeWord(cleanWordForLocalUse(word.word));

    if (!key) return;

    if (map.has(key)) {
      merged += 1;
      map.set(key, mergeWord(map.get(key), word));
    } else {
      // The dedupe-only action must not silently normalize unrelated rows.
      map.set(key, word);
    }
  });

  return {
    words: Array.from(map.values()),
    stats: {
      merged
    }
  };
}

export function buildLocalFormFamilyResult(sourceWords) {
  const stats = {
    normalizedForms: 0,
    normalizedFamilies: 0,
    referenceLinksAdded: 0,
    referenceLinksUpdated: 0,
    wrongOwnerLinksRemoved: 0,
    selfLinksRemoved: 0,
    danglingReferences: 0,
    metadataConflicts: 0,
    suffixGuesses: 0
  };
  const words = sourceWords.map((word) => {
    const sourceForms = Array.isArray(word.forms) ? word.forms : [];
    const sourceFamily = Array.isArray(word.wordFamily) ? word.wordFamily : [];
    const protectedAiForms = sourceForms.filter((item) => item?.source === "ai-generated");
    const protectedAiFamily = sourceFamily.filter((item) => item?.source === "ai-generated");
    const forms = [
      ...normalizeFormList(sourceForms.filter((item) => item?.source !== "ai-generated")),
      ...protectedAiForms
    ];
    const wordFamily = [
      ...normalizeFamilyList(sourceFamily.filter((item) => item?.source !== "ai-generated")),
      ...protectedAiFamily
    ];
    if (JSON.stringify(forms) !== JSON.stringify(word.forms || [])) stats.normalizedForms += 1;
    if (JSON.stringify(wordFamily) !== JSON.stringify(word.wordFamily || [])) stats.normalizedFamilies += 1;
    return { ...word, forms, wordFamily };
  });
  const byWord = new Map();
  const byId = new Map();

  words.forEach((word) => {
    const wordKey = normalizeWord(word.word);
    const id = String(word.id || word.wordId || "").trim();
    if (wordKey && !byWord.has(wordKey)) byWord.set(wordKey, word);
    if (id && !byId.has(id)) byId.set(id, word);
  });

  const references = words.filter(isInflectedReferenceWord);
  const declaredBase = new Map();

  references.forEach((reference) => {
    const idTarget = String(reference.baseWordId || "").trim()
      ? byId.get(String(reference.baseWordId).trim())
      : null;
    const wordTargetKey = normalizeWord(reference.redirectToWord || reference.baseWord);
    const wordTarget = wordTargetKey ? byWord.get(wordTargetKey) : null;

    if (idTarget && wordTarget && idTarget !== wordTarget) {
      stats.metadataConflicts += 1;
      stats.danglingReferences += 1;
      return;
    }

    const target = idTarget || wordTarget;
    if (!target || !isBrushableWord(target) || target === reference) {
      stats.danglingReferences += 1;
      return;
    }

    declaredBase.set(reference, target);
  });

  words.forEach((owner) => {
    const ownerKey = normalizeWord(owner.word);
    const nextForms = [];

    owner.forms.forEach((form) => {
      if (form?.source === "ai-generated") {
        nextForms.push(form);
        return;
      }
      const formKey = normalizeWord(form.word);
      if (!formKey || formKey === ownerKey) {
        stats.selfLinksRemoved += 1;
        return;
      }

      const idTarget = String(form.id || "").trim() ? byId.get(String(form.id).trim()) : null;
      const wordTarget = byWord.get(formKey) || null;
      if (idTarget && wordTarget && idTarget !== wordTarget) {
        stats.metadataConflicts += 1;
        nextForms.push(form);
        return;
      }

      const target = idTarget || wordTarget;
      if (!isInflectedReferenceWord(target)) {
        nextForms.push(form);
        return;
      }

      const expectedOwner = declaredBase.get(target);
      if (expectedOwner && expectedOwner !== owner) {
        stats.wrongOwnerLinksRemoved += 1;
        return;
      }

      if (!expectedOwner) {
        nextForms.push(form);
        return;
      }

      const canonical = {
        ...form,
        word: target.word,
        id: target.id || target.wordId || form.id,
        type: String(target.relationType || form.type || "inflected form").trim()
      };
      if (JSON.stringify(canonical) !== JSON.stringify(form)) stats.referenceLinksUpdated += 1;
      nextForms.push(canonical);
    });

    owner.forms = normalizeFormList(nextForms);
  });

  references.forEach((reference) => {
    const owner = declaredBase.get(reference);
    if (!owner) return;

    const referenceId = String(reference.id || reference.wordId || "").trim();
    const referenceKey = normalizeWord(reference.word);
    const exists = owner.forms.some((form) => {
      const formId = String(form.id || "").trim();
      return (referenceId && formId === referenceId) || normalizeWord(form.word) === referenceKey;
    });

    if (!exists) {
      owner.forms.push({
        word: reference.word,
        id: reference.id || reference.wordId,
        type: String(reference.relationType || "inflected form").trim(),
        source: LOCAL_LEXICON_ORGANIZATION_POLICY.version
      });
      stats.referenceLinksAdded += 1;
    }
  });

  return {
    words,
    stats: {
      ...stats,
      policyVersion: LOCAL_LEXICON_ORGANIZATION_POLICY.version
    }
  };
}

export function buildLocalOptimizeResult(sourceWords) {
  const cleanResult = buildLocalCleanResult(sourceWords);
  const dedupeResult = buildLocalExactDedupeResult(cleanResult.words);
  const formResult = buildLocalFormFamilyResult(dedupeResult.words);
  const finalDedupe = buildLocalExactDedupeResult(formResult.words);

  return {
    words: finalDedupe.words,
    stats: {
      changed: cleanResult.stats.changed,
      removed: cleanResult.stats.removed,
      exactMerged: dedupeResult.stats.merged + finalDedupe.stats.merged,
      normalizedForms: formResult.stats.normalizedForms,
      normalizedFamilies: formResult.stats.normalizedFamilies,
      referenceLinksAdded: formResult.stats.referenceLinksAdded,
      referenceLinksUpdated: formResult.stats.referenceLinksUpdated,
      wrongOwnerLinksRemoved: formResult.stats.wrongOwnerLinksRemoved,
      selfLinksRemoved: formResult.stats.selfLinksRemoved,
      danglingReferences: formResult.stats.danglingReferences,
      metadataConflicts: formResult.stats.metadataConflicts,
      suffixGuesses: 0,
      policyVersion: formResult.stats.policyVersion
    }
  };
}

export function getDisplayForms(word) {
  const baseWord = cleanWordForLocalUse(word?.word);
  const baseKey = normalizeWord(baseWord);
  return normalizeFormList(word?.forms)
    .filter((form) => normalizeWord(form.word) !== baseKey)
    .slice(0, 6);
}


export function getFormChineseType(type = "") {
  const lower = String(type || "").toLowerCase();

  if (lower.includes("irregular plural")) {
    return "不规则复数";
  }

  if (lower.includes("plural reminder") || lower === "plural") {
    return "复数形式";
  }

  if (lower.includes("past tense / past participle")) {
    return "过去式 / 过去分词";
  }

  if (lower.includes("past tense")) {
    return "过去式";
  }

  if (lower.includes("past participle")) {
    return "过去分词";
  }

  if (lower.includes("present participle")) {
    return "-ing 形式";
  }

  return type || "变形";
}

export function getFormExplanation(baseWord, meaning, form) {
  const cleanBase = cleanWordForLocalUse(baseWord);
  const baseMeaning = String(meaning || "").trim();
  const formWord = String(form?.word || "").trim();
  const typeCn = getFormChineseType(form?.type);

  if (!cleanBase || !formWord) return "";

  const meaningPart = baseMeaning ? `（${baseMeaning}）` : "";

  return `${formWord} 是 ${cleanBase}${meaningPart} 的${typeCn}`;
}

export function getFormHint(form) {
  const typeCn = getFormChineseType(form?.type);
  const customNote = String(form?.note || "").trim();

  if (customNote) {
    if (customNote.includes("复数") && typeCn === "复数形式") return "注意复数形式";
    if (customNote.includes("不规则复数") || typeCn === "不规则复数") return "注意不规则复数";
    if (customNote.includes("不规则")) return "注意不规则变形";
    return customNote;
  }

  if (typeCn === "复数形式") return "注意复数形式";
  if (typeCn === "不规则复数") return "注意不规则复数";
  if (typeCn === "过去式") return "注意过去式";
  if (typeCn === "过去分词") return "注意过去分词";
  if (typeCn === "过去式 / 过去分词") return "注意过去式 / 过去分词";
  if (typeCn === "-ing 形式") return "注意 -ing 形式";

  return "";
}



export function enrichDisplayFamily(familyList, wordMap, currentWord) {
  const lookup = wordMap instanceof Map ? wordMap : new Map();
  return normalizeFamilyList(familyList)
    .map((entry) => {
      const repairedWord = repairHeadwordLocally(cleanWordForLocalUse(entry.word));
      const displayWord = repairedWord || entry.word;
      const matched = lookup.get(normalizeWord(displayWord)) || lookup.get(normalizeWord(entry.word));

      return {
        ...entry,
        word: displayWord,
        pos: entry.pos || matched?.pos || "",
        meaning: entry.meaning || matched?.meaning || "",
        relation: entry.relation || "词族 / 派生词"
      };
    })
    .filter((entry) => normalizeWord(entry.word) !== normalizeWord(currentWord))
    .filter((entry, index, list) => list.findIndex((item) => normalizeWord(item.word) === normalizeWord(entry.word)) === index)
    .slice(0, 8);
}



export {
  getPosChinese,
  getPosDisplay,
  getPosFamilyDisplay,
  splitPosAtoms
} from "./pos-display.mjs";


export function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.includes("\t") ? trimmed.split("\t") : trimmed.split(",");
  const word = (parts[0] || "").trim();

  if (!word) return null;

  return {
    word,
    phonetic: "",
    pos: (parts[1] || "").trim(),
    meaning: (parts[2] || "").trim(),
    definition: "",
    example: (parts[3] || "").trim(),
    exampleCn: (parts[4] || "").trim(),
    collocations: (parts[5] || "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((phrase) => ({ phrase, chinese: "" })),
    phraseCollocations: [],
    ieltsUse: [],
    topics: [],
    difficulty: "",
    category: "IELTS G类",
    status: "",
    favorite: false,
    forms: [],
    wordFamily: []
  };
}

export function parseImportText(text) {
  return text.split(/\r?\n/).map(parseLine).filter(Boolean);
}

export function splitListText(value) {
  return String(value || "")
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function phraseItemsToText(items) {
  if (!Array.isArray(items)) return "";

  return items
    .map((item) => {
      if (typeof item === "string") return item;
      const phrase = item?.phrase || item?.word || "";
      const meaning = item?.meaning || item?.chinese || item?.cn || "";
      return meaning ? `${phrase} = ${meaning}` : phrase;
    })
    .filter(Boolean)
    .join("\n");
}

export function formsToText(items) {
  if (!Array.isArray(items)) return "";

  return items
    .map((item) => {
      const word = item?.word || "";
      const type = item?.type || item?.label || "";
      const note = item?.note || item?.meaning || item?.chinese || item?.cn || "";
      return [word, type, note].filter(Boolean).join(" | ");
    })
    .filter(Boolean)
    .join("\n");
}

export function parsePhraseItems(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*=\s*/);
      return {
        phrase: (parts[0] || "").trim(),
        meaning: (parts[1] || "").trim(),
        chinese: (parts[1] || "").trim()
      };
    })
    .filter((item) => item.phrase);
}

export function parseFormItems(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*\|\s*/);
      return {
        word: (parts[0] || "").trim(),
        type: (parts[1] || "").trim(),
        note: (parts[2] || "").trim(),
        meaning: (parts[2] || "").trim(),
        chinese: (parts[2] || "").trim()
      };
    })
    .filter((item) => item.word);
}

export function wordToEditDraft(word) {
  return {
    word: word?.word || "",
    phonetic: word?.phonetic || "",
    pos: word?.pos || "",
    meaning: word?.meaning || "",
    example: word?.example || "",
    exampleCn: word?.exampleCn || "",
    collocationsText: phraseItemsToText(word?.collocations),
    phraseCollocationsText: phraseItemsToText(word?.phraseCollocations),
    formsText: formsToText(word?.forms),
    wordFamilyText: formsToText(word?.wordFamily),
    ieltsUseText: Array.isArray(word?.ieltsUse) ? word.ieltsUse.join("，") : "",
    topicsText: Array.isArray(word?.topics) ? word.topics.join("，") : "",
    difficulty: word?.difficulty || ""
  };
}

export function applyEditDraftToWord(original, draft) {
  return {
    ...original,
    word: String(draft.word || "").trim() || original.word,
    phonetic: String(draft.phonetic || "").trim(),
    pos: String(draft.pos || "").trim(),
    meaning: String(draft.meaning || "").trim(),
    example: String(draft.example || "").trim(),
    exampleCn: String(draft.exampleCn || "").trim(),
    collocations: parsePhraseItems(draft.collocationsText),
    phraseCollocations: parsePhraseItems(draft.phraseCollocationsText),
    forms: parseFormItems(draft.formsText),
    wordFamily: parseFormItems(draft.wordFamilyText),
    ieltsUse: splitListText(draft.ieltsUseText),
    topics: splitListText(draft.topicsText),
    difficulty: String(draft.difficulty || "").trim(),
    editedAt: Date.now()
  };
}


export const AUDIO_PREFILL_CURSOR_KEY = "ielts_vocab_audio_prefill_cursor_v2";
export const REAL_AUDIO_PREFILL_CURSOR_KEY = "ielts_vocab_real_audio_prefill_cursor_v1";
export const REAL_AUDIO_BATCH_SIZE = 80;

export function safeLocalStorageGet(key) {
  return sharedLocalStorageGet(key);
}

export function safeLocalStorageSet(key, value) {
  return sharedLocalStorageSet(key, value, {
    onError: (error, storageKey) => {
      console.warn("localStorage 写入失败，已跳过：", storageKey, error);
    }
  });
}

export function safeLocalStorageRemove(key) {
  sharedLocalStorageRemove(key);
}

export function cleanupOldLargeLocalStorageKeys() {
  [
    "ielts_vocab_words_deepseek",
    "ielts_vocab_audio_status_v1",
    "static_vocab_words_v1",
    "static_vocab_word_edits_v1",
    "static_vocab_deleted_words_v1"
  ].forEach((key) => safeLocalStorageRemove(key));
}

export function withTimeout(promise, ms, fallbackValue = null) {
  let timer;

  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = window.setTimeout(() => resolve(fallbackValue), ms);
    })
  ]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

export function runWhenBrowserIdle(callback) {
  if (typeof window === "undefined") return;

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(callback, { timeout: 3000 });
    return;
  }

  window.setTimeout(callback, 0);
}

export async function compactBrowserStorageForCurrentWords(currentWords, sourceMeta = {}) {
  cleanupOldLargeLocalStorageKeys();
  await cleanupBrowserCachesForVocab().catch(() => 0);

  if (navigator?.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }

  await saveWordsToIndexedDB(currentWords, sourceMeta);
}


export function isProbablyFullVocab(list) {
  return Array.isArray(list) && list.length >= 1000;
}

export function emergencyDefaultCloudUrl() {
  return "https://ielts-vocab-d1gymoilc5746f67a-1441466606.tcloudbaseapp.com/beidanci/";
}



export function flattenWordFieldsForCheck(word) {
  const values = [];

  function add(value) {
    if (value === null || value === undefined) return;

    if (typeof value === "string" || typeof value === "number") {
      values.push(String(value));
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }

    if (typeof value === "object") {
      Object.values(value).forEach(add);
    }
  }

  add(word?.phonetic);
  add(word?.pos);
  add(word?.meaning);
  add(word?.definition);
  add(word?.example);
  add(word?.exampleCn);
  add(word?.collocations);
  add(word?.phraseCollocations);
  add(word?.forms);
  add(word?.wordFamily);
  add(word?.ieltsUse);
  add(word?.topics);
  add(word?.difficulty);

  return values.join(" ").toLowerCase();
}

export function isLikelyWrongAiWord(word) {
  if (!word?.word) return false;

  const text = flattenWordFieldsForCheck(word);
  const cleanWord = normalizeWord(word.word);

  if (!text.trim()) return false;

  const badMarkers = [
    "undefined",
    "null",
    "nan",
    "???",
    "example sentence",
    "中文释义",
    "英文释义",
    "完成"
  ];

  if (badMarkers.some((marker) => text.includes(marker))) return true;

  // 明显异常：词族/变形里出现当前词被截断后的错误拼写，例如 experience -> experienc / experiencs。
  if (cleanWord.length >= 5) {
    const chopped = cleanWord.slice(0, -1);
    if (chopped.length >= 4 && text.includes(chopped) && !text.includes(cleanWord)) {
      return true;
    }
  }

  // 明显异常：单词本身是短词，但生成了过多不相关的大段内容时，交给 AI 重修更稳。
  if (cleanWord.length <= 2 && text.length > 900) return true;

  return false;
}


export function escapeRegExpText(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isBadLocalText(value) {
  const text = String(value ?? "").trim();

  if (!text) return false;

  // 只把“整格就是占位符”的内容当坏文本。
  // 不再删除普通英文里的 null / unknown，例如 null hypothesis、unknown planet。
  return /^(undefined|null|nan|\?{2,}|unknown|not available|待补全|无释义|中文释义|英文释义|meaning here|translation here)$/i.test(text);
}

export function cleanLocalText(value) {
  const text = String(value ?? "").trim();

  if (isBadLocalText(text)) return "";

  // 保守清理：只去掉明显的 ???。
  // 不再删除 null / unknown，因为它们可能是正常英文内容。
  return text
    .replace(/\?{3,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanTtsSymbolText(value, options = {}) {
  let text = String(value ?? "").trim();

  if (!text) return "";

  const keepChineseParentheses = !!options.keepChineseParentheses;

  // 只删除短标签括号：n. / adj. / formal / UK 等。
  text = text.replace(/\s*\((n\.?|v\.?|adj\.?|adv\.?|noun|verb|adjective|adverb|formal|informal|UK|US|BrE|AmE|plural|past|past participle|phr\.?|prep\.?)\)\s*/gi, " ");

  if (!keepChineseParentheses) {
    text = text.replace(/\s*（(名词|动词|形容词|副词|正式|非正式|英式|美式|复数|过去式|过去分词)）\s*/g, " ");
  }

  text = text
    .replace(/\s+\/\s+/g, " or ")
    .replace(/([a-zA-Z])\/([a-zA-Z])/g, "$1 or $2");

  return text
    .replace(/\s+or\s+or\s+/gi, " or ")
    .replace(/\s+/g, " ")
    .replace(/^[,;，；\s]+|[,;，；\s]+$/g, "")
    .trim();
}

export function cleanHeadwordForTts(value) {
  let text = String(value ?? "").trim();

  if (!text) return "";

  // 单词本身只转换符号，不再截断内容。
  // 旧错误：in/within the context of → in
  // 新规则：in/within the context of → in or within the context of

  // 删除短词性/用法括号。
  text = text.replace(/\s*\((n\.?|v\.?|adj\.?|adv\.?|noun|verb|adjective|adverb|formal|informal|UK|US|BrE|AmE|plural|past|past participle|phr\.?|prep\.?)\)\s*/gi, " ");
  text = text.replace(/\s*（(名词|动词|形容词|副词|正式|非正式|英式|美式|复数|过去式|过去分词)）\s*/g, " ");

  // 处理常见可选拼写，不删除词干。
  text = text
    .replace(/([A-Za-z]+)\(s\)/g, "$1s")
    .replace(/([A-Za-z]+)\(es\)/g, "$1es")
    .replace(/([A-Za-z]+)\(ed\)/g, "$1ed");

  // slash 改成 or，保留两边内容。
  text = text
    .replace(/\s+\/\s+/g, " or ")
    .replace(/([A-Za-z])\/([A-Za-z])/g, "$1 or $2")
    .replace(/\s+or\s+or\s+/gi, " or ");

  return text
    .replace(/\s+/g, " ")
    .replace(/^[,;，；\s]+|[,;，；\s]+$/g, "")
    .trim();
}

export function cleanTtsTextIfChanged(value, options = {}) {
  const before = String(value ?? "").trim();
  const after = cleanTtsSymbolText(before, options);

  return {
    before,
    after,
    changed: before !== after
  };
}

export function cleanHeadwordIfChanged(value) {
  const before = String(value ?? "").trim();
  const after = cleanHeadwordForTts(before);

  return {
    before,
    after,
    changed: before !== after
  };
}

export function cleanTtsSymbolsInWord(word) {
  const next = { ...word };
  const beforeWord = String(next.word || "").trim();
  const afterWord = cleanHeadwordForTts(beforeWord);
  const reasons = [];

  // 只处理 word 单词本身，不处理音标、词性、例句、搭配、词形、词族。
  // 只做安全转换，不截断内容。
  if (afterWord && afterWord !== beforeWord) {
    next.word = afterWord;
    next.ttsSymbolsCleanedAt = Date.now();
    next.ttsSymbolsCleanReason = [`单词：${beforeWord} → ${afterWord}`];

    return {
      word: next,
      changed: true,
      reasons: next.ttsSymbolsCleanReason
    };
  }

  return {
    word: next,
    changed: false,
    reasons
  };
}



export const LOCAL_HEADWORD_REPAIR_MAP = {
  undergoe: "undergo",
  influenc: "influence",
  motivat: "motivate",
  secur: "secure",
  integrat: "integrate",
  circulat: "circulate",
  impro: "improve",
  contribut: "contribute",
  communicat: "communicate",
  participat: "participate",
  educat: "educate",
  creat: "create",
  generat: "generate",
  separ: "separate",
  separat: "separate",
  appropri: "appropriate",
  appropriat: "appropriate",
  accurat: "accurate",
  demonstrat: "demonstrate",
  illustrat: "illustrate",
  concentrat: "concentrate",
  negotiat: "negotiate",
  appreciat: "appreciate",
  evaluat: "evaluate",
  estimat: "estimate",
  indicat: "indicate",
  advocat: "advocate",
  eliminat: "eliminate",
  regulat: "regulate",
  immigrat: "immigrate",
  innovat: "innovate",
  cooperat: "cooperate",
  operat: "operate",
  compet: "compete",
  complet: "complete",
  delet: "delete",
  describ: "describe",
  prescrib: "prescribe",
  subscrib: "subscribe",
  achiev: "achieve",
  believ: "believe",
  reliev: "relieve",
  receiv: "receive",
  perceiv: "perceive",
  deceiv: "deceive",
  mov: "move",
  remov: "remove",
  prov: "prove",
  approv: "approve",
  involv: "involve",
  solv: "solve",
  evolv: "evolve",
  argu: "argue",
  issu: "issue",
  pursu: "pursue",
  valu: "value",
  continu: "continue",
  injur: "injure",
  requir: "require",
  acquir: "acquire",
  desir: "desire",
  explor: "explore",
  ignor: "ignore",
  prepar: "prepare",
  compar: "compare",
  declar: "declare",
  measur: "measure",
  ensur: "ensure",
  expos: "expose",
  oppos: "oppose",
  suppos: "suppose",
  impos: "impose",
  compos: "compose",
  dispos: "dispose",
  reduc: "reduce",
  produc: "produce",
  introduc: "introduce",
  induc: "induce",
  duee: "due"
};

export function repairHeadwordLocally(value) {
  const raw = String(value || "").trim();
  const lower = normalizeWord(raw);

  if (!lower) return raw;

  const mapped = LOCAL_HEADWORD_REPAIR_MAP[lower];

  if (mapped) return mapped;

  return raw;
}

export function hasHeadwordRepair(value) {
  return repairHeadwordLocally(value) !== String(value || "").trim();
}

export function repairTruncatedForWord(value, baseWord) {
  let text = cleanLocalText(value);
  const cleanWord = normalizeWord(baseWord);

  if (!text || cleanWord.length < 5 || !cleanWord.endsWith("e")) return text;

  const chopped = cleanWord.slice(0, -1);
  const rules = [
    [chopped + "s", cleanWord + "s"],
    [chopped + "d", cleanWord + "d"],
    [chopped, cleanWord]
  ];

  rules.forEach(([bad, good]) => {
    const re = new RegExp(`\\b${escapeRegExpText(bad)}\\b`, "gi");
    text = text.replace(re, good);
  });

  return text.replace(/\s+/g, " ").trim();
}

export function dedupeLocalItems(items, keyGetter) {
  const seen = new Set();
  const result = [];

  items.forEach((item) => {
    const key = normalizeWord(keyGetter(item));

    if (!key || seen.has(key)) return;

    seen.add(key);
    result.push(item);
  });

  return result;
}

export function repairPhraseItemsLocally(items, baseWord) {
  if (!Array.isArray(items)) return [];

  const repaired = items
    .map((item) => {
      if (typeof item === "string") {
        const phrase = repairTruncatedForWord(item, baseWord);
        return phrase ? { phrase, chinese: "" } : null;
      }

      const phrase = repairTruncatedForWord(item?.phrase || item?.word || item?.collocation || item?.text || "", baseWord);
      const chinese = cleanLocalText(item?.chinese || item?.meaning || item?.translation || item?.cn || "");

      if (!phrase) return null;

      return {
        ...item,
        phrase,
        chinese,
        meaning: chinese
      };
    })
    .filter(Boolean);

  return dedupeLocalItems(repaired, (item) => item.phrase);
}

export function repairFormItemsLocally(items, baseWord) {
  if (!Array.isArray(items)) return [];

  const repaired = items
    .map((item) => {
      if (typeof item === "string") {
        const word = repairTruncatedForWord(item, baseWord);
        return word ? { word, type: "", note: "" } : null;
      }

      const word = repairTruncatedForWord(item?.word || item?.form || "", baseWord);
      const type = cleanLocalText(item?.type || item?.label || "");
      const note = cleanLocalText(item?.note || item?.meaning || item?.chinese || item?.cn || "");

      if (!word) return null;

      return {
        ...item,
        word,
        type,
        note,
        meaning: note,
        chinese: note
      };
    })
    .filter(Boolean);

  return dedupeLocalItems(repaired, (item) => item.word);
}

export function getLocalWrongReasons(word) {
  const reasons = [];
  const cleanWord = normalizeWord(word?.word);

  const repairedHeadword = repairHeadwordLocally(word?.word);
  if (String(repairedHeadword || "").trim() !== String(word?.word || "").trim()) {
    reasons.push(`单词本身疑似截断：${word.word} → ${repairedHeadword}`);
  }

  // 只识别字段整格就是坏占位符，不再扫描音标/例句里的 twelv、sens、templ 等发音。
  ["word", "pos", "meaning", "definition", "example", "exampleCn"].forEach((field) => {
    const value = String(word?.[field] ?? "").trim();

    if (isBadLocalText(value)) {
      reasons.push(`${field} 是异常占位符`);
    }

    if (/\?{3,}/.test(value)) {
      reasons.push(`${field} 存在 ???`);
    }

    if (/待补全|无释义|example sentence|translation here|meaning here/i.test(value)) {
      reasons.push(`${field} 存在模板残留`);
    }
  });

  if (!cleanWord) {
    reasons.push("word 为空");
  }

  return reasons;
}

export function cleanBadPhraseItemsOnly(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (typeof item === "string") {
        return isBadLocalText(item) ? null : item;
      }

      if (!item || typeof item !== "object") return item;

      const next = { ...item };

      ["phrase", "word", "collocation", "text", "chinese", "meaning", "translation", "cn"].forEach((field) => {
        if (field in next && isBadLocalText(next[field])) {
          next[field] = "";
        }
      });

      return next;
    })
    .filter(Boolean);
}

export function cleanBadFormItemsOnly(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (typeof item === "string") {
        return isBadLocalText(item) ? null : item;
      }

      if (!item || typeof item !== "object") return item;

      const next = { ...item };

      ["word", "form", "text", "type", "label", "note", "meaning", "chinese", "cn"].forEach((field) => {
        if (field in next && isBadLocalText(next[field])) {
          next[field] = "";
        }
      });

      return next;
    })
    .filter(Boolean);
}

export function repairObviousWrongWordLocally(word) {
  const before = JSON.stringify(word);
  const oldWord = String(word?.word || "").trim();
  const fixedWord = repairHeadwordLocally(oldWord);
  const next = { ...word };

  // 只允许修 word 单词本身。
  // 绝不修 phonetic 音标，避免 /twelv/ → /twelve/ 这种错改。
  if (fixedWord && fixedWord !== oldWord) {
    next.word = fixedWord;
    next.originalBrokenWord = next.originalBrokenWord || oldWord;
    next.headwordRepairedAt = Date.now();
  }

  if (JSON.stringify(next) !== before) {
    next.localWrongRepairedAt = Date.now();
    return {
      word: next,
      changed: true
    };
  }

  return {
    word: next,
    changed: false
  };
}

export const LOCAL_DERIVED_KEEP_WORDS = new Set([
  "ability","activity","addition","admission","advantage","advertisement","agreement","application","appointment",
  "argument","arrangement","assessment","assignment","assistance","attention","celebration","communication",
  "competition","condition","connection","consequence","construction","conversation","decision","definition",
  "description","development","difference","difficulty","discussion","education","environment","examination",
  "experience","explanation","expression","government","improvement","information","instruction","introduction",
  "knowledge","management","organization","population","preparation","presentation","production","relationship",
  "responsibility","situation","solution","transportation","understanding","university","opportunity","community",
  "technology","globalization","industrialization","modernization","environmental","international","traditional",
  "professional","educational","successful","comfortable","reasonable","available","important","different",
  "possible","necessary","public","private","economic","political","social","cultural","natural","personal"
]);

export const LOCAL_DERIVED_SUFFIX_RULES = [
  { suffix: "ization", min: 13, reason: "人工复核候选：-ization 派生词" },
  { suffix: "isation", min: 13, reason: "人工复核候选：-isation 派生词" },
  { suffix: "ification", min: 13, reason: "人工复核候选：-ification 派生词" },
  { suffix: "ational", min: 13, reason: "人工复核候选：-ational 派生词" },
  { suffix: "iveness", min: 12, reason: "人工复核候选：-iveness 派生词" },
  { suffix: "lessness", min: 12, reason: "人工复核候选：-lessness 派生词" },
  { suffix: "fulness", min: 12, reason: "人工复核候选：-fulness 派生词" },
  { suffix: "ological", min: 13, reason: "人工复核候选：-ological 词" },
  { suffix: "ologist", min: 12, reason: "人工复核候选：-ologist 词" },
  { suffix: "graphical", min: 13, reason: "人工复核候选：-graphical 词" },
  { suffix: "istically", min: 13, reason: "人工复核候选：-istically 副词" },
  { suffix: "ariness", min: 12, reason: "人工复核候选：-ariness 派生词" },
  { suffix: "ability", min: 14, reason: "人工复核候选：较长 -ability 派生词" },
  { suffix: "ibility", min: 14, reason: "人工复核候选：较长 -ibility 派生词" },
  { suffix: "ment", min: 16, reason: "人工复核候选：较长 -ment 派生词" },
  { suffix: "ness", min: 15, reason: "人工复核候选：较长 -ness 派生词" },
  { suffix: "ity", min: 16, reason: "人工复核候选：较长 -ity 派生词" }
];

export function isPlainSingleEnglishWord(value) {
  return /^[a-z]+$/i.test(String(value || "").trim());
}

export function stripCommonDerivedSuffix(word) {
  const w = normalizeWord(word);

  const rules = [
    ["izations", "ize"], ["isation", "ise"], ["ization", "ize"], ["ifications", "ify"], ["ification", "ify"],
    ["fulness", "ful"], ["lessness", "less"], ["iveness", "ive"], ["ational", "ate"],
    ["ologically", "ology"], ["ological", "ology"], ["ologist", "ology"], ["istically", "istic"],
    ["abilities", "able"], ["ability", "able"], ["ibilities", "ible"], ["ibility", "ible"],
    ["ments", ""], ["ment", ""], ["nesses", ""], ["ness", ""], ["ities", "ity"]
  ];

  for (const [suffix, replacement] of rules) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
      return w.slice(0, -suffix.length) + replacement;
    }
  }

  return "";
}

export function getObscureDerivedReason(word, wordSet) {
  const raw = String(word?.word || "").trim();
  const w = normalizeWord(raw);

  if (!w || !isPlainSingleEnglishWord(w)) return "";
  if (LOCAL_DERIVED_KEEP_WORDS.has(w)) return "";
  if (word?.favorite || word?.status === "不熟") return "";

  const tags = [
    ...(Array.isArray(word?.topics) ? word.topics : []),
    ...(Array.isArray(word?.ieltsUse) ? word.ieltsUse : []),
    word?.category,
    word?.difficulty
  ].join(" ").toLowerCase();

  if (/核心|必会|高频|g类|writing|speaking|listening|reading|task\s*2|书信/.test(tags) && w.length < 16) {
    return "";
  }

  let matchedRule = LOCAL_DERIVED_SUFFIX_RULES.find((rule) => w.endsWith(rule.suffix) && w.length >= rule.min);

  if (!matchedRule && w.length >= 16) {
    matchedRule = { reason: "超长低频候选词" };
  }

  if (!matchedRule) return "";

  const base = stripCommonDerivedSuffix(w);
  const hasBase = base && base.length >= 4 && wordSet.has(base);

  // This is a review queue only. A spelling suffix never authorizes deletion.
  if (hasBase) {
    return `${matchedRule.reason}，词库已有基础词 ${base}`;
  }

  if (w.length >= 17) {
    return matchedRule.reason;
  }

  return "";
}

export function collectObscureDerivedCandidates(list) {
  const wordSet = new Set(list.map((item) => normalizeWord(item.word)).filter(Boolean));
  const candidates = [];

  list.forEach((word, index) => {
    const reason = getObscureDerivedReason(word, wordSet);

    if (reason) {
      candidates.push({
        index,
        word: word.word,
        reason
      });
    }
  });

  return candidates;
}
