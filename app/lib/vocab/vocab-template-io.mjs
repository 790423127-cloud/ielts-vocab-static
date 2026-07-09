/**
 * Pure template / CSV helpers extracted from app/page.jsx (I3.3).
 */
import { normalizePhraseItems } from "./page-word-helpers.mjs";

export function blankTemplateItem() {
  return {
    word: "",
    phonetic: "",
    pos: "",
    meaning: "",
    example: "",
    exampleCn: ""
  };
}

export function buildBlankVocabTemplateJsonPayload() {
  return {
    type: "ielts_vocab_basic_template",
    version: 1,
    exportedAt: new Date().toISOString(),
    note: "这里只填写基础字段。搭配、短语、词形变化、词族、分类、难度等留给网页里的 AI 功能判断和补全。",
    instructions: [
      "只填写 6 个基础字段。",
      "word 是必填字段。",
      "phonetic 填音标，可以为空。",
      "pos 填词性，例如 noun / verb / adjective / adverb / phrase。",
      "meaning 填中文释义。",
      "example 填英文例句。",
      "exampleCn 填例句中文翻译。",
      "不要在这个模板里填写搭配、短语、词形变化、词族、分类、难度；这些让网页 AI 补全。"
    ],
    fieldGuide: {
      word: "英文单词，必填",
      phonetic: "音标，例如 /ˈɪnfluəns/",
      pos: "词性，例如 noun / verb",
      meaning: "中文释义",
      example: "英文例句",
      exampleCn: "例句中文翻译"
    },
    items: [blankTemplateItem(), blankTemplateItem(), blankTemplateItem()]
  };
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildBlankVocabTemplateCsvText() {
  const headers = ["word", "phonetic", "pos", "meaning", "example", "exampleCn"];
  const example = [
    "influence",
    "/ˈɪnfluəns/",
    "noun; verb",
    "影响；影响力",
    "Parents have a strong influence on their children's habits.",
    "父母对孩子的习惯有很大影响。"
  ];

  return [headers.map(csvEscape).join(","), example.map(csvEscape).join(",")].join("\n");
}

function normalizeTtsFormItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { word: item, type: "", note: "" };
      return {
        word: String(item?.word || "").trim(),
        type: String(item?.type || "").trim(),
        note: String(item?.note || "").trim()
      };
    })
    .filter((item) => item.word);
}

export function parseTemplatePairs(value) {
  const text = String(value || "").trim();

  if (!text) return [];

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      return normalizePhraseItems(JSON.parse(text));
    } catch {}
  }

  return text
    .split(/[;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const pieces = part.split("=");
      return {
        phrase: String(pieces[0] || "").trim(),
        chinese: String(pieces.slice(1).join("=") || "").trim()
      };
    })
    .filter((item) => item.phrase);
}

export function parseTemplateForms(value) {
  const text = String(value || "").trim();

  if (!text) return [];

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      return normalizeTtsFormItems(JSON.parse(text));
    } catch {}
  }

  return text
    .split(/[;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [wordPart, rest = ""] = part.split(":");
      const [typePart, ...noteParts] = rest.split("=");

      return {
        word: String(wordPart || "").trim(),
        type: String(typePart || "").trim(),
        note: String(noteParts.join("=") || "").trim()
      };
    })
    .filter((item) => item.word);
}

export function parseTemplateList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/[;,\n，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;

      row.push(field);

      if (row.some((cell) => String(cell).trim())) rows.push(row);

      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);

  if (row.some((cell) => String(cell).trim())) rows.push(row);

  return rows;
}

export function csvToObjects(text) {
  const rows = parseCsvRows(text);

  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => String(header || "").trim());

  return rows.slice(1).map((row) => {
    const item = {};

    headers.forEach((header, index) => {
      item[header] = row[index] || "";
    });

    return item;
  });
}

export function normalizeTemplateWord(raw) {
  const word = String(raw?.word || raw?.english || raw?.单词 || "").trim();

  if (!word) return null;

  return {
    word,
    phonetic: String(raw.phonetic || raw.音标 || "").trim(),
    pos: String(raw.pos || raw.partOfSpeech || raw.词性 || "").trim(),
    meaning: String(raw.meaning || raw.definition || raw.中文释义 || raw.释义 || "").trim(),
    definition: String(raw.meaning || raw.definition || raw.中文释义 || raw.释义 || "").trim(),
    example: String(raw.example || raw.英文例句 || raw.sentence || "").trim(),
    exampleCn: String(raw.exampleCn || raw.exampleCN || raw.例句中文 || raw.中文例句 || "").trim(),

    // 以下字段由网页原来的 AI 功能判断/补全。
    collocations: [],
    phraseCollocations: [],
    forms: [],
    wordFamily: [],
    ieltsUse: [],
    topics: [],
    difficulty: "",

    importedFromBasicTemplateAt: Date.now()
  };
}

export function mergeBasicTemplateWord(oldWord, incomingWord) {
  const next = { ...oldWord };

  function setIfPresent(field, value) {
    const text = String(value || "").trim();
    if (text) next[field] = text;
  }

  setIfPresent("phonetic", incomingWord.phonetic);
  setIfPresent("pos", incomingWord.pos);
  setIfPresent("meaning", incomingWord.meaning);
  setIfPresent("definition", incomingWord.meaning || incomingWord.definition);
  setIfPresent("example", incomingWord.example);
  setIfPresent("exampleCn", incomingWord.exampleCn);

  next.templateMergedAt = Date.now();

  return next;
}
