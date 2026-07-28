const ORTHOGRAPHIC_VARIANT_GROUPS = Object.freeze([
  ["encyclopaedia", "encyclopedia"],
  ["encyclopaedic", "encyclopedic"],
  ["paediatric", "pediatric"],
  ["paediatrics", "pediatrics"],
  ["aesthetic", "esthetic"],
  ["anaesthesia", "anesthesia"],
  ["anaesthetic", "anesthetic"],
  ["archaeology", "archeology"],
  ["foetus", "fetus"],
  ["haemoglobin", "hemoglobin"],
  ["diarrhoea", "diarrhea"],
  ["manoeuvre", "maneuver"],
  ["mediaeval", "medieval"],
  ["orthopaedic", "orthopedic"],
  ["oesophagus", "esophagus"],
  ["colour", "color"],
  ["favourite", "favorite"],
  ["honour", "honor"],
  ["labour", "labor"],
  ["neighbour", "neighbor"],
  ["behaviour", "behavior"],
  ["centre", "center"],
  ["metre", "meter"],
  ["theatre", "theater"],
  ["organise", "organize"],
  ["organisation", "organization"],
  ["analyse", "analyze"],
  ["defence", "defense"],
  ["licence", "license"],
  ["travelling", "traveling"],
  ["travelled", "traveled"],
  ["traveller", "traveler"],
  ["catalogue", "catalog"],
  ["dialogue", "dialog"],
  ["programme", "program"],
  ["grey", "gray"]
]);

const ORTHOGRAPHIC_VARIANT_KEY = new Map();
for (const group of ORTHOGRAPHIC_VARIANT_GROUPS) {
  const canonical = group[0];
  for (const variant of group) ORTHOGRAPHIC_VARIANT_KEY.set(variant, canonical);
}

export function cleanSynonymTerm(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

export function synonymEquivalenceKey(value) {
  const compact = cleanSynonymTerm(value)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9]+/g, "");
  return ORTHOGRAPHIC_VARIANT_KEY.get(compact) || compact;
}

export function areSynonymTermsEquivalent(left, right) {
  const leftKey = synonymEquivalenceKey(left);
  return Boolean(leftKey && leftKey === synonymEquivalenceKey(right));
}

export function filterDistinctSynonymTerms(value, headword = "", { max = 8 } = {}) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,，;；|\n]+/);
  const headwordKey = synonymEquivalenceKey(headword);
  const seen = new Set();
  const result = [];
  for (const item of values) {
    const term = cleanSynonymTerm(typeof item === "string" ? item : item?.word || item?.replacement);
    const termKey = synonymEquivalenceKey(term);
    if (!termKey || termKey === headwordKey || seen.has(termKey)) continue;
    seen.add(termKey);
    result.push(term);
    if (result.length >= max) break;
  }
  return result;
}
