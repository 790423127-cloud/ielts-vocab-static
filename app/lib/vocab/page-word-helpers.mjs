/**
 * Pure helpers extracted from app/page.jsx (I3 split).
 * UI/state stays in page.jsx; lexicon math lives here for reuse/tests.
 */
import { cleanupBrowserCachesForVocab } from "./cache-cleanup.mjs";
import { saveWordsToIndexedDB } from "./word-store.mjs";

export function fallback(value, text) {
  return value && String(value).trim() ? value : text;
}

export function formatSpeechSourceLabel(result = {}) {
  if (result.realAudio || String(result.source || "").startsWith("real-")) {
    if (String(result.source || "") === "real-commons" || /lingua|commons|wiktionary/i.test(String(result.provider || ""))) {
      return "真人发音：Lingua Libre WAV";
    }
    return result.provider ? `真人发音：${result.provider}` : "真人发音：Lingua Libre WAV";
  }
  if (String(result.source || "").startsWith("edge-")) {
    return "兜底发音";
  }
  return "发音";
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
  return Boolean(
    word?.pos &&
    word?.meaning &&
    word?.definition &&
    word?.example &&
    word?.exampleCn &&
    Array.isArray(word?.collocations) &&
    word.collocations.length &&
    Array.isArray(word?.phraseCollocations) &&
    word.phraseCollocations.length &&
    Array.isArray(word?.ieltsUse) &&
    word.ieltsUse.length &&
    Array.isArray(word?.topics) &&
    word.topics.length &&
    word?.difficulty
  );
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

export const IRREGULAR_VERB_FORMS = {
  went: { base: "go", type: "past tense", note: "注意注意不规则过去式" },
  gone: { base: "go", type: "past participle", note: "注意注意不规则过去分词" },
  bought: { base: "buy", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  brought: { base: "bring", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  thought: { base: "think", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  taught: { base: "teach", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  caught: { base: "catch", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  made: { base: "make", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  met: { base: "meet", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  felt: { base: "feel", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  found: { base: "find", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  left: { base: "leave", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  lost: { base: "lose", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  kept: { base: "keep", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  slept: { base: "sleep", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  spent: { base: "spend", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  sent: { base: "send", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  lent: { base: "lend", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  built: { base: "build", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  dealt: { base: "deal", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  meant: { base: "mean", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  heard: { base: "hear", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  held: { base: "hold", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  paid: { base: "pay", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  said: { base: "say", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  sold: { base: "sell", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  told: { base: "tell", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  stood: { base: "stand", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  understood: { base: "understand", type: "past tense / past participle", note: "不注意过去式 / 过去分词" },
  took: { base: "take", type: "past tense", note: "注意不规则过去式" },
  taken: { base: "take", type: "past participle", note: "注意不规则过去分词" },
  gave: { base: "give", type: "past tense", note: "注意不规则过去式" },
  given: { base: "give", type: "past participle", note: "注意不规则过去分词" },
  wrote: { base: "write", type: "past tense", note: "注意不规则过去式" },
  written: { base: "write", type: "past participle", note: "注意不规则过去分词" },
  spoke: { base: "speak", type: "past tense", note: "注意不规则过去式" },
  spoken: { base: "speak", type: "past participle", note: "注意不规则过去分词" },
  drove: { base: "drive", type: "past tense", note: "注意不规则过去式" },
  driven: { base: "drive", type: "past participle", note: "注意不规则过去分词" },
  chose: { base: "choose", type: "past tense", note: "注意不规则过去式" },
  chosen: { base: "choose", type: "past participle", note: "注意不规则过去分词" },
  broke: { base: "break", type: "past tense", note: "注意不规则过去式" },
  broken: { base: "break", type: "past participle", note: "注意不规则过去分词" },
  began: { base: "begin", type: "past tense", note: "注意不规则过去式" },
  begun: { base: "begin", type: "past participle", note: "注意不规则过去分词" },
  ran: { base: "run", type: "past tense", note: "注意不规则过去式" },
  seen: { base: "see", type: "past participle", note: "注意不规则过去分词" },
  saw: { base: "see", type: "past tense", note: "注意不规则过去式" },
  eaten: { base: "eat", type: "past participle", note: "注意不规则过去分词" },
  ate: { base: "eat", type: "past tense", note: "注意不规则过去式" },
  fallen: { base: "fall", type: "past participle", note: "注意不规则过去分词" },
  fell: { base: "fall", type: "past tense", note: "注意不规则过去式" },
  flown: { base: "fly", type: "past participle", note: "注意不规则过去分词" },
  flew: { base: "fly", type: "past tense", note: "注意不规则过去式" },
  become: { base: "become", type: "past participle", note: "注意不规则过去分词，与原形相同" },
  became: { base: "become", type: "past tense", note: "注意不规则过去式" }
};

export const IRREGULAR_PLURAL_FORMS = {
  children: { base: "child", type: "irregular plural", note: "注意不规则复数" },
  people: { base: "person", type: "irregular plural", note: "注意不规则复数" },
  men: { base: "man", type: "irregular plural", note: "注意不规则复数" },
  women: { base: "woman", type: "irregular plural", note: "注意不规则复数" },
  feet: { base: "foot", type: "irregular plural", note: "注意不规则复数" },
  teeth: { base: "tooth", type: "irregular plural", note: "注意不规则复数" },
  mice: { base: "mouse", type: "irregular plural", note: "注意不规则复数" },
  geese: { base: "goose", type: "irregular plural", note: "不规则复数" },
  oxen: { base: "ox", type: "irregular plural", note: "不规则复数" },
  criteria: { base: "criterion", type: "irregular plural", note: "注意不规则复数" },
  phenomena: { base: "phenomenon", type: "irregular plural", note: "注意不规则复数" },
  media: { base: "medium", type: "irregular plural", note: "注意不规则复数" },
  analyses: { base: "analysis", type: "irregular plural", note: "学术阅读常见不规则复数" },
  bases: { base: "basis", type: "irregular plural", note: "学术阅读常见不规则复数" },
  crises: { base: "crisis", type: "irregular plural", note: "学术阅读常见不规则复数" },
  theses: { base: "thesis", type: "irregular plural", note: "学术阅读常见不规则复数" }
};

export const PLURAL_FALSE_POSITIVES = new Set([
  "news",
  "business",
  "series",
  "species",
  "analysis",
  "basis",
  "crisis",
  "thesis",
  "physics",
  "mathematics",
  "economics",
  "politics"
]);

export function normalizeFormList(value) {
  if (!Array.isArray(value)) return [];

  const map = new Map();

  value.forEach((item) => {
    const word = String(item?.word || item || "").trim();
    if (!word) return;

    const type = String(item?.type || "form").trim();
    const key = `${normalizeWord(word)}::${type}`;

    if (!map.has(key)) {
      map.set(key, {
        word,
        type,
        note: String(item?.note || "").trim(),
        source: String(item?.source || "local").trim()
      });
    }
  });

  return Array.from(map.values()).slice(0, 12);
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

    if (!map.has(key)) {
      map.set(key, {
        word,
        pos: String(item?.pos || "").trim(),
        meaning: String(item?.meaning || "").trim(),
        relation: String(item?.relation || "word family").trim()
      });
    }
  });

  return Array.from(map.values()).slice(0, 12);
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
    phonetic: "",
    pos: clean.includes(" ") ? "phrase" : "",
    meaning: "",
    definition: "",
    example: "",
    exampleCn: "",
    collocations: [],
    phraseCollocations: [],
    ieltsUse: [],
    topics: [],
    difficulty: "",
    category: clean.includes(" ") ? `${label} · 短语` : `${label} · 单词`,
    status: word.status || "",
    favorite: Boolean(word.favorite),
    forms: normalizeFormList(word.forms),
    wordFamily: normalizeFamilyList(word.wordFamily)
  };
}

export function detectRegularPlural(word) {
  const lower = String(word || "").toLowerCase();

  if (!lower || PLURAL_FALSE_POSITIVES.has(lower)) return null;
  if (!/^[a-z][a-z'-]*$/.test(lower)) return null;

  if (lower.endsWith("ies") && lower.length > 4) {
    return lower.slice(0, -3) + "y";
  }

  if (/(ches|shes|sses|xes|zes)$/.test(lower) && lower.length > 5) {
    return lower.slice(0, -2);
  }

  if (lower.endsWith("ves") && lower.length > 5) {
    const stem = lower.slice(0, -3);
    return stem.endsWith("i") ? stem.slice(0, -1) + "ife" : stem + "f";
  }

  if (lower.endsWith("s") && !/(ss|us|is|ous)$/.test(lower) && lower.length > 4) {
    return lower.slice(0, -1);
  }

  return null;
}

export function buildRegularPlural(word) {
  const lower = String(word || "").toLowerCase();

  if (!/^[a-z][a-z'-]*$/.test(lower)) return "";

  if (/(s|x|z|ch|sh)$/.test(lower)) return `${lower}es`;
  if (/[^aeiou]y$/.test(lower)) return `${lower.slice(0, -1)}ies`;
  if (/(f)$/.test(lower)) return `${lower.slice(0, -1)}ves`;
  if (/(fe)$/.test(lower)) return `${lower.slice(0, -2)}ves`;

  return `${lower}s`;
}


export function repairBaseCandidate(stem) {
  const lower = String(stem || "").toLowerCase().trim();

  const known = {
    manufactur: "manufacture",
    creat: "create",
    relat: "relate",
    communicat: "communicate",
    educat: "educate",
    indicat: "indicate",
    operat: "operate",
    participat: "participate",
    separa: "separate",
    invit: "invite",
    decid: "decide",
    includ: "include",
    provid: "provide",
    produc: "produce",
    reduc: "reduce",
    introduc: "introduce",
    achiev: "achieve",
    receiv: "receive",
    believ: "believe",
    improv: "improve",
    remov: "remove",
    mov: "move",
    lov: "love",
    liv: "live",
    us: "use",
    caus: "cause",
    clos: "close",
    choos: "choose",
    manag: "manage",
    chang: "change"
  };

  if (known[lower]) return known[lower];

  if (lower.endsWith("ur") && lower.length >= 6) return `${lower}e`;

  return lower;
}


export function detectRegularVerbForm(word) {
  const lower = String(word || "").toLowerCase();

  if (!/^[a-z][a-z'-]*$/.test(lower)) return null;

  if (lower.endsWith("ied") && lower.length > 5) {
    return {
      base: lower.slice(0, -3) + "y",
      type: "past tense / past participle",
      note: "注意过去式 / 过去分词"
    };
  }

  if (lower.endsWith("ing") && lower.length > 6) {
    let stem = lower.slice(0, -3);

    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) {
      stem = stem.slice(0, -1);
    } else if (/(tak|mak|writ|driv|giv|com|us)$/.test(stem)) {
      stem = `${stem}e`;
    }

    stem = repairBaseCandidate(stem);

    return {
      base: stem,
      type: "present participle",
      note: "注意 -ing 形式"
    };
  }

  if (lower.endsWith("ed") && lower.length > 5) {
    let stem = lower.slice(0, -2);

    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) {
      stem = stem.slice(0, -1);
    }

    stem = repairBaseCandidate(stem);

    return {
      base: stem,
      type: "past tense / past participle",
      note: "注意过去式 / 过去分词"
    };
  }

  return null;
}

export function getInflectionInfo(value) {
  const clean = cleanWordForLocalUse(value);

  if (!clean || clean.includes(" ")) {
    return {
      clean,
      base: clean,
      forms: []
    };
  }

  const irregularVerb = IRREGULAR_VERB_FORMS[clean];
  if (irregularVerb && irregularVerb.base !== clean) {
    return {
      clean,
      base: irregularVerb.base,
      forms: [
        {
          word: clean,
          type: irregularVerb.type,
          note: irregularVerb.note,
          source: "local-irregular-verb"
        }
      ]
    };
  }

  const irregularPlural = IRREGULAR_PLURAL_FORMS[clean];
  if (irregularPlural && irregularPlural.base !== clean) {
    return {
      clean,
      base: irregularPlural.base,
      forms: [
        {
          word: clean,
          type: irregularPlural.type,
          note: irregularPlural.note,
          source: "local-irregular-plural"
        }
      ]
    };
  }

  const pluralBase = detectRegularPlural(clean);
  if (pluralBase && pluralBase !== clean) {
    return {
      clean,
      base: pluralBase,
      forms: [
        {
          word: clean,
          type: "plural",
          note: "注意复数形式",
          source: "local-plural"
        }
      ]
    };
  }

  const regularVerb = detectRegularVerbForm(clean);
  if (regularVerb?.base && regularVerb.base !== clean && regularVerb.base.length >= 3) {
    return {
      clean,
      base: regularVerb.base,
      forms: [
        {
          word: clean,
          type: regularVerb.type,
          note: regularVerb.note,
          source: "local-verb-form"
        }
      ]
    };
  }

  return {
    clean,
    base: clean,
    forms: []
  };
}

export function familyStem(word) {
  let stem = cleanWordForLocalUse(word);

  if (!stem || stem.includes(" ") || stem.length < 5) return "";

  stem = stem
    .replace(/(abilities|ibility|ability)$/i, "")
    .replace(/(ational|ization|isation)$/i, "")
    .replace(/(ations|ation|ition|tion|sion)$/i, "")
    .replace(/(ments|ment)$/i, "")
    .replace(/(iveness|fulness|lessness|ness)$/i, "")
    .replace(/(ities|ity)$/i, "")
    .replace(/(ically|ical|ally|ly)$/i, "")
    .replace(/(ative|itive|ive)$/i, "")
    .replace(/(able|ible|al|ous|ic|ful|less|er|or|ist|ism)$/i, "")
    .replace(/(ing|ed)$/i, "");

  if (stem.endsWith("i")) stem = `${stem.slice(0, -1)}y`;

  return stem.length >= 4 ? stem : "";
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
  return {
    ...oldItem,
    phonetic: oldItem.phonetic || newItem.phonetic || "",
    pos: oldItem.pos || newItem.pos || "",
    meaning: oldItem.meaning || newItem.meaning || "",
    definition: oldItem.definition || newItem.definition || "",
    example: oldItem.example || newItem.example || "",
    exampleCn: oldItem.exampleCn || newItem.exampleCn || "",
    collocations: mergePhraseLists(oldItem.collocations, newItem.collocations),
    phraseCollocations: mergePhraseLists(oldItem.phraseCollocations, newItem.phraseCollocations),
    ieltsUse: oldItem.ieltsUse?.length ? oldItem.ieltsUse : newItem.ieltsUse || [],
    topics: oldItem.topics?.length ? oldItem.topics : newItem.topics || [],
    difficulty: oldItem.difficulty || newItem.difficulty || "",
    category: oldItem.category || newItem.category || "IELTS G类",
    status: oldItem.status || newItem.status || "",
    favorite: Boolean(oldItem.favorite || newItem.favorite),
    forms: mergeFormLists(oldItem.forms, newItem.forms),
    wordFamily: mergeFamilyLists(oldItem.wordFamily, newItem.wordFamily)
  };
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

    const cleanedWord = {
      ...word,
      forms: normalizeFormList(word.forms),
      wordFamily: normalizeFamilyList(word.wordFamily)
    };

    if (map.has(key)) {
      merged += 1;
      map.set(key, mergeWord(map.get(key), cleanedWord));
    } else {
      map.set(key, cleanedWord);
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
  const output = [];
  const indexByKey = new Map();
  let formMerged = 0;
  let convertedToBase = 0;

  function addOrMerge(word) {
    const key = normalizeWord(word.word);
    if (!key) return;

    if (indexByKey.has(key)) {
      const idx = indexByKey.get(key);
      output[idx] = mergeWord(output[idx], word);
      formMerged += 1;
    } else {
      indexByKey.set(key, output.length);
      output.push(word);
    }
  }

  sourceWords.forEach((word) => {
    const info = getInflectionInfo(word.word);

    if (!info.clean) return;

    const baseKey = normalizeWord(info.base);
    const cleanKey = normalizeWord(info.clean);
    const forms = normalizeFormList([...(word.forms || []), ...(info.forms || [])]);

    if (info.base && baseKey !== cleanKey && info.forms.length) {
      if (indexByKey.has(baseKey)) {
        const baseIndex = indexByKey.get(baseKey);
        output[baseIndex] = mergeWord(output[baseIndex], {
          ...word,
          word: output[baseIndex].word,
          forms
        });
        formMerged += 1;
        return;
      }

      convertedToBase += 1;
      addOrMerge({
        ...resetAiFieldsForChangedWord(word, info.base, "本地归并词形"),
        forms
      });
      return;
    }

    addOrMerge({
      ...word,
      word: info.clean,
      forms,
      wordFamily: normalizeFamilyList(word.wordFamily)
    });
  });

  const deduped = buildLocalExactDedupeResult(output).words;

  const groups = new Map();

  deduped.forEach((word, idx) => {
    const stem = familyStem(word.word);

    if (!stem) return;

    if (!groups.has(stem)) groups.set(stem, []);
    groups.get(stem).push({ word, idx });
  });

  let familyLinked = 0;
  const linked = deduped.map((word) => ({
    ...word,
    forms: normalizeFormList(word.forms),
    wordFamily: normalizeFamilyList(word.wordFamily)
  }));

  groups.forEach((group) => {
    if (group.length < 2 || group.length > 10) return;

    group.forEach(({ word, idx }) => {
      const relatives = group
        .filter((item) => item.idx !== idx)
        .map((item) => ({
          word: item.word.word,
          pos: item.word.pos || "",
          meaning: item.word.meaning || "",
          relation: "同词族 / 派生词"
        }));

      if (relatives.length) {
        familyLinked += relatives.length;
        linked[idx] = {
          ...linked[idx],
          wordFamily: mergeFamilyLists(linked[idx].wordFamily, relatives)
        };
      }
    });
  });

  return {
    words: linked,
    stats: {
      formMerged,
      convertedToBase,
      familyLinked
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
      formMerged: formResult.stats.formMerged,
      convertedToBase: formResult.stats.convertedToBase,
      familyLinked: formResult.stats.familyLinked
    }
  };
}

export function getDisplayForms(word) {
  const pos = String(word?.pos || "").toLowerCase();
  const baseWord = cleanWordForLocalUse(word?.word);
  const baseKey = normalizeWord(baseWord);
  const forms = normalizeFormList(word?.forms)
    .filter((form) => normalizeWord(form.word) !== baseKey)
    .map((form) => {
      const formWord = cleanWordForLocalUse(form.word);
      const inferredBase = detectRegularPlural(formWord);
      const type = String(form.type || "").trim().toLowerCase();

      if (type === "form" && inferredBase && normalizeWord(inferredBase) === baseKey) {
        return {
          ...form,
          type: "plural reminder",
          note: form.note || "注意复数形式"
        };
      }

      return form;
    });

  if (
    baseWord &&
    !baseWord.includes(" ") &&
    (pos.includes("noun") || pos.includes("n.") || pos === "n")
  ) {
    const plural = buildRegularPlural(baseWord);
    const hasPlural = forms.some((item) => normalizeWord(item.word) === normalizeWord(plural));

    if (plural && plural !== baseWord && !hasPlural) {
      forms.push({
        word: plural,
        type: "plural reminder",
        note: "注意复数形式",
        source: "local-listening-reminder"
      });
    }
  }

  return normalizeFormList(forms).slice(0, 6);
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
  const lookup = wordMap instanceof Map ? wordMap : buildLibraryWordMap([]);
  return normalizeFamilyList(familyList)
    .map((entry) => {
      const repairedWord = repairBaseCandidate(cleanWordForLocalUse(entry.word));
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



export function getPosChinese(pos = "") {
  const text = String(pos || "").trim().toLowerCase();

  if (!text) return "";

  if (/\bnoun\b|^n\.?$/.test(text)) return "名词";
  if (/\bverb\b|^v\.?$/.test(text)) return "动词";
  if (/\badjective\b|^adj\.?$/.test(text)) return "形容词";
  if (/\badverb\b|^adv\.?$/.test(text)) return "副词";
  if (/\bphrase\b|短语/.test(text)) return "短语";
  if (/\bpreposition\b|^prep\.?$/.test(text)) return "介词";
  if (/\bconjunction\b|^conj\.?$/.test(text)) return "连词";
  if (/\bpronoun\b|^pron\.?$/.test(text)) return "代词";
  if (/\barticle\b|冠词/.test(text)) return "冠词";
  if (/\binterjection\b|^int\.?$/.test(text)) return "感叹词";

  return "";
}

export function getPosDisplay(pos = "") {
  const raw = String(pos || "").trim();

  if (!raw) return "";

  const chinese = getPosChinese(raw);

  if (!chinese) return raw;
  if (raw.includes(chinese)) return raw;

  return `${raw} ${chinese}`;
}


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

export function isMissingAiFields(word) {
  return (
    !word.meaning ||
    !word.pos ||
    !word.example ||
    !normalizePhraseItems(word.collocations).length ||
    !normalizePhraseItems(word.phraseCollocations).length
  );
}

export function isMissingClassification(word) {
  return !word.ieltsUse?.length || !word.topics?.length || !word.difficulty;
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

  if (!text.trim()) return true;

  const badMarkers = [
    "undefined",
    "null",
    "nan",
    "???",
    "待补全",
    "无释义",
    "unknown",
    "not available",
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

  // 非常保守的规则：只修明显“少了 e”的常见动词后缀。
  // 不处理普通短词，避免误改。
  if (/^[a-z]{6,}$/.test(lower)) {
    const suffixes = [
      ["ivat", "ivate"],
      ["grat", "grate"],
      ["trat", "trate"],
      ["ulat", "ulate"],
      ["icat", "icate"],
      ["igat", "igate"],
      ["erat", "erate"],
      ["orat", "orate"],
      ["iat", "iate"],
      ["iev", "ieve"],
      ["eiv", "eive"],
      ["olv", "olve"],
      ["rov", "rove"],
      ["mov", "move"]
    ];

    for (const [bad, good] of suffixes) {
      if (lower.endsWith(bad)) {
        return lower.slice(0, -bad.length) + good;
      }
    }
  }

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

  // 其他基础字段只清除“整格就是占位符”的坏内容，不再做拼写补 e。
  ["pos", "meaning", "definition", "example", "exampleCn", "difficulty", "category"].forEach((field) => {
    if (isBadLocalText(next[field])) {
      next[field] = "";
    }
  });

  next.phonetic = String(next.phonetic || "").trim();
  next.collocations = cleanBadPhraseItemsOnly(next.collocations);
  next.phraseCollocations = cleanBadPhraseItemsOnly(next.phraseCollocations);
  next.forms = cleanBadFormItemsOnly(next.forms);
  next.wordFamily = cleanBadFormItemsOnly(next.wordFamily);
  next.ieltsUse = normalizeStringArray(next.ieltsUse).filter((item) => !isBadLocalText(item));
  next.topics = normalizeStringArray(next.topics).filter((item) => !isBadLocalText(item));

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
  { suffix: "ization", min: 13, reason: "过度 -ization 派生词" },
  { suffix: "isation", min: 13, reason: "过度 -isation 派生词" },
  { suffix: "ification", min: 13, reason: "过度 -ification 派生词" },
  { suffix: "ational", min: 13, reason: "过度 -ational 派生词" },
  { suffix: "iveness", min: 12, reason: "过度 -iveness 派生词" },
  { suffix: "lessness", min: 12, reason: "过度 -lessness 派生词" },
  { suffix: "fulness", min: 12, reason: "过度 -fulness 派生词" },
  { suffix: "ological", min: 13, reason: "偏专业 -ological 词" },
  { suffix: "ologist", min: 12, reason: "偏专业 -ologist 词" },
  { suffix: "graphical", min: 13, reason: "偏专业 -graphical 词" },
  { suffix: "istically", min: 13, reason: "过度 -istically 副词" },
  { suffix: "ariness", min: 12, reason: "过度 -ariness 派生词" },
  { suffix: "ability", min: 14, reason: "过长 -ability 派生词" },
  { suffix: "ibility", min: 14, reason: "过长 -ibility 派生词" },
  { suffix: "ment", min: 16, reason: "过长 -ment 派生词" },
  { suffix: "ness", min: 15, reason: "过长 -ness 派生词" },
  { suffix: "ity", min: 16, reason: "过长 -ity 派生词" }
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

  // 有基础词时，派生词更适合删除；没有基础词时只删很长的明显派生词，避免误删。
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
