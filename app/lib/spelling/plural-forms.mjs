import { normalizeSpellingAnswer } from "./word-id.mjs";

export const IRREGULAR_PLURAL_FORMS = {
  children: { base: "child", note: "注意不规则复数" },
  people: { base: "person", note: "注意不规则复数" },
  men: { base: "man", note: "注意不规则复数" },
  women: { base: "woman", note: "注意不规则复数" },
  feet: { base: "foot", note: "注意不规则复数" },
  teeth: { base: "tooth", note: "注意不规则复数" },
  mice: { base: "mouse", note: "注意不规则复数" },
  geese: { base: "goose", note: "注意不规则复数" },
  oxen: { base: "ox", note: "注意不规则复数" },
  criteria: { base: "criterion", note: "注意不规则复数" },
  phenomena: { base: "phenomenon", note: "注意不规则复数" },
  media: { base: "medium", note: "注意不规则复数" },
  analyses: { base: "analysis", note: "学术阅读常见不规则复数" },
  bases: { base: "basis", note: "学术阅读常见不规则复数" },
  crises: { base: "crisis", note: "学术阅读常见不规则复数" },
  theses: { base: "thesis", note: "学术阅读常见不规则复数" }
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

export const SINGULAR_NO_AUTO_PLURAL = new Set([
  ...PLURAL_FALSE_POSITIVES,
  "accommodation",
  "furniture",
  "information",
  "advice",
  "equipment",
  "luggage",
  "homework",
  "research",
  "evidence",
  "progress",
  "traffic",
  "weather",
  "work"
]);

function normalizeHeadword(value = "") {
  return normalizeSpellingAnswer(value).replace(/\s+/g, " ").trim();
}

export function buildRegularPlural(word = "") {
  const lower = String(word || "").trim().toLowerCase();
  if (!/^[a-z][a-z'-]*$/.test(lower)) return "";

  if (/(s|x|z|ch|sh)$/.test(lower)) return `${lower}es`;
  if (/[^aeiou]y$/.test(lower)) return `${lower.slice(0, -1)}ies`;
  if (/(f)$/.test(lower)) return `${lower.slice(0, -1)}ves`;
  if (/(fe)$/.test(lower)) return `${lower.slice(0, -2)}ves`;

  return `${lower}s`;
}

export function inferPluralBase(word = "") {
  const text = String(word || "").trim();
  const lower = text.toLowerCase();

  if (!lower || PLURAL_FALSE_POSITIVES.has(lower)) return "";
  if (!/^[a-z][a-z'-]*s$/i.test(text) || lower.length <= 3) return "";

  const irregular = IRREGULAR_PLURAL_FORMS[lower];
  if (irregular?.base) return irregular.base;

  if (/ies$/i.test(text) && text.length > 4) {
    return text.replace(/ies$/i, "y");
  }

  if (/(ches|shes|sses|xes|zes)$/i.test(text) && text.length >= 5) {
    return text.replace(/es$/i, "");
  }

  if (/ves$/i.test(text) && text.length > 5) {
    const stem = lower.slice(0, -3);
    if (stem.endsWith("i")) return `${stem.slice(0, -1)}ife`;
    const withFe = `${stem}fe`;
    const withF = `${stem}f`;
    if (buildRegularPlural(withFe) === lower) return withFe;
    if (buildRegularPlural(withF) === lower) return withF;
    return withF;
  }

  if (/s$/i.test(text) && !/(ss|us|is|ous)$/i.test(text) && text.length > 4) {
    return text.replace(/s$/i, "");
  }

  return "";
}

export function resolvePluralInflectionPair(left = "", right = "") {
  const first = String(left || "").trim();
  const second = String(right || "").trim();
  if (!first || !second || /\s/.test(first) || /\s/.test(second)) return null;

  const firstNorm = normalizeHeadword(first);
  const secondNorm = normalizeHeadword(second);
  const pluralOfFirst = inferPluralBase(first);
  const pluralOfSecond = inferPluralBase(second);

  if (pluralOfFirst && normalizeHeadword(pluralOfFirst) === secondNorm) {
    return { baseWord: second, targetAnswer: first };
  }
  if (pluralOfSecond && normalizeHeadword(pluralOfSecond) === firstNorm) {
    return { baseWord: first, targetAnswer: second };
  }

  return null;
}

export function applyPluralShortcut(base = "", marker = "") {
  const word = String(base || "").trim();
  const suffix = String(marker || "").trim().toLowerCase();
  if (!word || !suffix) return "";

  if (suffix === "+s") return buildRegularPlural(word).replace(word.toLowerCase(), word) || `${word}s`;
  if (suffix === "+es") return `${word}es`;
  if (suffix === "+ies") return `${word.replace(/y$/i, "")}ies`;
  if (suffix === "+ves") return `${word.replace(/(?:f|fe)$/i, "")}ves`;

  return buildRegularPlural(word);
}

export function resolveWordUnit(primary = "", secondary = "", options = {}) {
  const explicitAnchor = String(options.explicitAnchor || "").trim();
  const first = String(primary || "").trim();
  const second = String(secondary || "").trim();

  if (!first || /\s/.test(first) || (second && /\s/.test(second))) return null;

  if (explicitAnchor) {
    const anchorNorm = normalizeHeadword(explicitAnchor);
    const inflectedNorm = normalizeHeadword(first);
    if (anchorNorm && inflectedNorm && anchorNorm !== inflectedNorm) {
      return {
        anchor: explicitAnchor,
        inflected: first,
        hasPair: true,
        formNote: "注意复数形式"
      };
    }
  }

  if (second) {
    const pair = resolvePluralInflectionPair(first, second);
    if (pair) {
      return {
        anchor: pair.baseWord,
        inflected: pair.targetAnswer,
        hasPair: true,
        formNote: "注意复数形式"
      };
    }
    return null;
  }

  const lower = first.toLowerCase();
  if (PLURAL_FALSE_POSITIVES.has(lower) || SINGULAR_NO_AUTO_PLURAL.has(lower)) {
    return { anchor: first, inflected: first, hasPair: false, formNote: "" };
  }

  const irregular = IRREGULAR_PLURAL_FORMS[lower];
  if (irregular?.base && irregular.base !== lower) {
    return {
      anchor: irregular.base,
      inflected: first,
      hasPair: true,
      formNote: irregular.note || "注意不规则复数"
    };
  }

  const inferredBase = inferPluralBase(first);
  if (inferredBase && normalizeHeadword(inferredBase) !== normalizeHeadword(first)) {
    return {
      anchor: inferredBase,
      inflected: first,
      hasPair: true,
      formNote: "注意复数形式"
    };
  }

  const builtPlural = buildRegularPlural(first);
  if (
    builtPlural
    && builtPlural !== lower
    && !SINGULAR_NO_AUTO_PLURAL.has(lower)
    && normalizeHeadword(inferPluralBase(builtPlural)) === normalizeHeadword(first)
  ) {
    return {
      anchor: first,
      inflected: builtPlural,
      hasPair: true,
      formNote: "注意复数形式"
    };
  }

  return { anchor: first, inflected: first, hasPair: false, formNote: "" };
}