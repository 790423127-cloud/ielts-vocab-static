const QUOTED_ENGLISH = `[“""'][A-Za-z][A-Za-z' -]*[”""']`;
const QUOTED_LEMMA_PATTERN = new RegExp(QUOTED_ENGLISH, "g");

const QUOTED_LEMMA_REPLACEMENTS = [
  [new RegExp(`${QUOTED_ENGLISH}的比较级[；;]?`, "g"), "比较级形式"],
  [new RegExp(`${QUOTED_ENGLISH}的最高级[；;]?`, "g"), "最高级形式"],
  [new RegExp(`${QUOTED_ENGLISH}的复数[；;]?`, "g"), "复数形式"],
  [new RegExp(`${QUOTED_ENGLISH}的过去式和过去分词[；;]?`, "g"), "过去式和过去分词形式"],
  [new RegExp(`${QUOTED_ENGLISH}的过去式[；;]?`, "g"), "过去式形式"],
  [new RegExp(`${QUOTED_ENGLISH}的过去分词[；;]?`, "g"), "过去分词形式"],
  [new RegExp(`${QUOTED_ENGLISH}的第三人称单数[；;]?`, "g"), "第三人称单数形式"],
  [new RegExp(`${QUOTED_ENGLISH}的现在分词[；;]?`, "g"), "现在分词形式"],
  [new RegExp(`[（(]\\s*${QUOTED_ENGLISH}[^）)]*[）)]`, "g"), ""],
  [new RegExp(`；\\s*v\\.\\s*${QUOTED_ENGLISH}的[^；;\\n]+[；;]?`, "g"), "；"]
];

const IDICTATION_HEADWORD_FIXES = {
  comprised: "v. 由…组成；包含（过去式/过去分词，常用于被动）",
  eco: "abbr. 经济；经济学的；生态的",
  squash: "n. 壁球运动；\nv. 压碎；挤压",
  graves: "n. 坟墓；墓穴（复数）",
  tesla: "n. 特斯拉（人名/品牌）",
  nations: "n. 国家（复数）",
  santa: "n. 圣诞老人",
  loch: "n. 湖；海湾（苏格兰用语）",
  ness: "n. 海角；岬角",
  standing: "v. 现在分词形式；站立；\nadj. 直立的；常设的；\n n. 地位"
};

export const MAIN_LEXICON_MEANING_OVERRIDES = {
  dna: "脱氧核糖核酸",
  canva: "画布；帆布；设计平台（品牌）",
  loft: "阁楼；顶层空间",
  rogue: "无赖；流氓；也指离群的动物",
  made: "制造的；过去式/过去分词形式",
  asked: "询问的；要求的（过去式/过去分词）",
  going: "进行的；前往的（现在分词）",
  moved: "移动的；感动的（过去式/过去分词）",
  tried: "尝试的；审讯过的（过去式/过去分词）",
  led: "带领的；引导的（过去式/过去分词）",
  doing: "进行的；从事的（现在分词）",
  lying: "躺着的；说谎的（现在分词）",
  lived: "居住的；有生命的（过去式/过去分词）",
  gazed: "凝视的（过去式/过去分词）",
  died: "死亡的（过去式/过去分词）",
  cured: "治愈的；加工处理的（过去式/过去分词）",
  attine: "切叶蚁（属名）",
  trueb: "专名（人名）",
  rugg: "专名（人名）",
  plumridge: "专名（人名/地名）",
  escovopsis: "真菌属名（切叶蚁相关）",
  ruamahanga: "专名（地名/河名）",
  daniel: "丹尼尔（男子名，来源于希伯来语，意为“上帝是我的审判者”）",
  older: "更老的；更旧的；更年老的（比较级）",
  cheaper: "更便宜的（比较级）",
  safer: "更安全的（比较级）",
  wider: "更宽的；更宽阔的（比较级）",
  easier: "更容易的；更简单的（比较级）",
  bigger: "更大的（比较级）",
  drew: "画；拉；吸引（过去式）",
  pronoun: "代词（语法术语）"
};

function cleanupOrphanLemmaFragments(text = "") {
  return String(text || "")
    .replace(/；的比较级/g, "；比较级形式")
    .replace(/的比较级/g, "比较级形式")
    .replace(/；的最高级/g, "；最高级形式")
    .replace(/的最高级/g, "最高级形式")
    .replace(/v\.\s*的现在分词/g, "v. 现在分词形式")
    .replace(/；的现在分词/g, "；现在分词形式")
    .replace(/；的复数/g, "；复数形式")
    .replace(/；的过去式和过去分词/g, "；过去式和过去分词形式")
    .replace(/；的过去式/g, "；过去式形式")
    .replace(/；的过去分词/g, "；过去分词形式")
    .replace(/意为[；;]?$/u, "意为“上帝是我的审判者”");
}

function normalizeMeaningText(value = "") {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[;]/g, "；")
    .replace(/[ ]{2,}/g, " ")
    .replace(/[；;]{2,}/g, "；")
    .replace(/^[；;]+|[；;]+$/g, "")
    .trim();
}

export function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsHeadword(word = "", text = "") {
  const normalized = String(word || "").toLowerCase().replace(/[^a-z0-9'-]/g, "").trim();
  if (!normalized || !text) return false;
  const re = new RegExp(`(^|[^a-z])${escapeRegExp(normalized)}([^a-z]|$)`, "i");
  return re.test(String(text));
}

export function sanitizeQuotedLemmaMeaning(meaning = "") {
  let result = normalizeMeaningText(meaning);
  if (!result) return result;

  for (const [pattern, replacement] of QUOTED_LEMMA_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  result = result
    .replace(/\(also [^)]+\)/gi, "")
    .replace(/[；;]{2,}/g, "；")
    .replace(/[；;]\s*[；;]/g, "；")
    .replace(/^[；;]+|[；;]+$/g, "")
    .trim();

  return normalizeMeaningText(cleanupOrphanLemmaFragments(result));
}

export function sanitizeIdictationMeaning(entry = {}) {
  const word = String(entry.word || "").trim();
  const override = IDICTATION_HEADWORD_FIXES[word.toLowerCase()];
  if (override) {
    return { meaning: override, changed: true, reason: "headword-override" };
  }

  const original = String(entry.meaning || "");
  const sanitized = sanitizeQuotedLemmaMeaning(original);
  if (sanitized !== normalizeMeaningText(original)) {
    return { meaning: sanitized, changed: true, reason: "quoted-lemma" };
  }

  if (containsHeadword(word, sanitized)) {
    return { meaning: sanitized, changed: false, reason: "headword-still-present" };
  }

  return { meaning: sanitized, changed: false, reason: "unchanged" };
}

export function sanitizeMainLexiconMeaning(entry = {}) {
  const word = String(entry.word || "").trim();
  const key = word.toLowerCase();
  const override = MAIN_LEXICON_MEANING_OVERRIDES[key];
  if (override) {
    return { meaning: override, changed: true, reason: "manual-override" };
  }

  const original = String(entry.meaning || "");
  const sanitized = sanitizeQuotedLemmaMeaning(original);
  if (sanitized !== normalizeMeaningText(original)) {
    return { meaning: sanitized, changed: true, reason: "quoted-lemma" };
  }

  return { meaning: sanitized, changed: false, reason: "unchanged" };
}

export function hasQuotedLemmaInMeaning(meaning = "") {
  return QUOTED_LEMMA_PATTERN.test(String(meaning || ""));
}