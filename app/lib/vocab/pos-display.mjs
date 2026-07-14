/**
 * English POS → Chinese gloss for UI display.
 * Example: "noun" → "noun 名词", "n./v." → "n./v. 名词/动词"
 */

const ATOM_MAP = [
  [/^(proper\s*noun|propernoun)$/i, "专有名词"],
  [/^(modal\s*verb|modal)$/i, "情态动词"],
  [/^(auxiliary\s*verb|aux\.?)$/i, "助动词"],
  [/^(noun|n\.?)$/i, "名词"],
  [/^(verb|v\.?|vb\.?)$/i, "动词"],
  [/^(adjective|adj\.?|a\.?)$/i, "形容词"],
  [/^(adverb|adv\.?)$/i, "副词"],
  [/^(preposition|prep\.?|prepositional)$/i, "介词"],
  [/^(conjunction|conj\.?)$/i, "连词"],
  [/^(pronoun|pron\.?)$/i, "代词"],
  [/^(article|art\.?)$/i, "冠词"],
  [/^(interjection|int\.?|interj\.?)$/i, "感叹词"],
  [/^(determiner|det\.?)$/i, "限定词"],
  [/^(numeral|number|num\.?)$/i, "数词"],
  [/^(phrase|phrasal|idiom)$/i, "短语"],
  [/^(exclamation|excl\.?)$/i, "感叹词"],
  [/^(abbreviation|abbr\.?)$/i, "缩写"],
  [/^(prefix)$/i, "前缀"],
  [/^(suffix)$/i, "后缀"],
  [/^(word)$/i, "词"],
  [/^(unknown|other)$/i, ""]
];

function mapAtom(atom) {
  const t = String(atom || "").trim();
  if (!t) return "";
  // already Chinese
  if (/[\u4e00-\u9fff]/.test(t) && !/[a-z]/i.test(t)) return t;
  for (const [re, zh] of ATOM_MAP) {
    if (re.test(t)) return zh;
  }
  // loose contains for long labels
  const low = t.toLowerCase();
  if (low.includes("noun")) return "名词";
  if (low.includes("verb")) return "动词";
  if (low.includes("adj")) return "形容词";
  if (low.includes("adv")) return "副词";
  if (low.includes("prep")) return "介词";
  if (low.includes("conj")) return "连词";
  if (low.includes("pron")) return "代词";
  if (low.includes("phrase")) return "短语";
  return "";
}

/**
 * Split compound POS strings like "noun/verb", "n. / v.", "adj., n."
 */
export function splitPosAtoms(pos = "") {
  return String(pos || "")
    .split(/\s*(?:\/|,|&|;|\||\+|·|／|、)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Chinese-only gloss (may be compound with /).
 */
export function getPosChinese(pos = "") {
  const raw = String(pos || "").trim();
  if (!raw) return "";
  if (/[\u4e00-\u9fff]/.test(raw) && !/[a-z]/i.test(raw)) return raw;

  const atoms = splitPosAtoms(raw);
  if (!atoms.length) return mapAtom(raw);

  const mapped = atoms.map(mapAtom).filter(Boolean);
  if (!mapped.length) return mapAtom(raw);

  // de-dupe while preserving order
  const seen = new Set();
  const unique = [];
  for (const m of mapped) {
    if (seen.has(m)) continue;
    seen.add(m);
    unique.push(m);
  }
  return unique.join("/");
}

/**
 * Display label: "noun 名词" / "noun/verb 名词/动词"
 */
export function getPosDisplay(pos = "", options = {}) {
  const raw = String(pos || "").trim();
  if (!raw) return options.empty || "";

  // already has Chinese after English
  if (/[a-z].*[\u4e00-\u9fff]/i.test(raw) || /[\u4e00-\u9fff].*[a-z]/i.test(raw)) {
    // if only Chinese, keep; if mixed already formatted, keep
    return raw;
  }

  const chinese = getPosChinese(raw);
  if (!chinese) return raw;
  if (raw.includes(chinese)) return raw;

  return `${raw} ${chinese}`;
}

/**
 * For posFamily enum values used by meaning modes.
 */
export function getPosFamilyDisplay(posFamily = "") {
  const f = String(posFamily || "").trim().toLowerCase();
  if (!f || f === "unknown" || f === "other") return "";
  return getPosDisplay(f);
}
