function normalizeWord(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

const IRREGULAR_FORMS = new Map(Object.entries({
  arise: ["arose", "arisen"],
  be: ["am", "is", "are", "was", "were", "been", "being"],
  bear: ["bore", "borne", "born"],
  beat: ["beaten"],
  become: ["became"],
  begin: ["began", "begun"],
  bend: ["bent"],
  bind: ["bound"],
  bite: ["bit", "bitten"],
  blow: ["blew", "blown"],
  break: ["broke", "broken"],
  breed: ["bred"],
  bring: ["brought"],
  build: ["built"],
  buy: ["bought"],
  catch: ["caught"],
  choose: ["chose", "chosen"],
  come: ["came"],
  cost: ["cost"],
  cut: ["cut"],
  deal: ["dealt"],
  dig: ["dug"],
  do: ["does", "did", "done", "doing"],
  draw: ["drew", "drawn"],
  drink: ["drank", "drunk"],
  drive: ["drove", "driven"],
  eat: ["ate", "eaten"],
  fall: ["fell", "fallen"],
  feed: ["fed"],
  feel: ["felt"],
  fight: ["fought"],
  find: ["found"],
  fly: ["flew", "flown"],
  forget: ["forgot", "forgotten"],
  get: ["got", "gotten"],
  give: ["gave", "given"],
  go: ["went", "gone"],
  grow: ["grew", "grown"],
  have: ["has", "had", "having"],
  hear: ["heard"],
  hide: ["hid", "hidden"],
  hit: ["hit"],
  hold: ["held"],
  keep: ["kept"],
  know: ["knew", "known"],
  lay: ["laid"],
  lead: ["led"],
  leave: ["left"],
  lend: ["lent"],
  lose: ["lost"],
  make: ["made"],
  mean: ["meant"],
  meet: ["met"],
  pay: ["paid"],
  read: ["read"],
  ride: ["rode", "ridden"],
  ring: ["rang", "rung"],
  rise: ["rose", "risen"],
  run: ["ran"],
  say: ["said"],
  see: ["saw", "seen"],
  seek: ["sought"],
  sell: ["sold"],
  send: ["sent"],
  shake: ["shook", "shaken"],
  shoot: ["shot"],
  show: ["shown"],
  sing: ["sang", "sung"],
  sit: ["sat"],
  sleep: ["slept"],
  speak: ["spoke", "spoken"],
  spend: ["spent"],
  stand: ["stood"],
  steal: ["stole", "stolen"],
  swim: ["swam", "swum"],
  take: ["took", "taken"],
  teach: ["taught"],
  tear: ["tore", "torn"],
  tell: ["told"],
  think: ["thought"],
  throw: ["threw", "thrown"],
  understand: ["understood"],
  wake: ["woke", "woken"],
  wear: ["wore", "worn"],
  win: ["won"],
  write: ["wrote", "written"],
  child: ["children"],
  automaton: ["automata"],
  bacterium: ["bacteria"],
  criterion: ["criteria"],
  analysis: ["analyses"],
  axis: ["axes"],
  basis: ["bases"],
  crisis: ["crises"],
  datum: ["data"],
  dormouse: ["dormice"],
  foot: ["feet"],
  fisherman: ["fishermen"],
  fireman: ["firemen"],
  man: ["men"],
  mouse: ["mice"],
  person: ["people"],
  phenomenon: ["phenomena"],
  thesis: ["theses"],
  tooth: ["teeth"],
  workman: ["workmen"],
  woman: ["women"],
  trousers: ["trouser"],
  good: ["better", "best"],
  well: ["better", "best"],
  bad: ["worse", "worst"],
  far: ["farther", "farthest", "further", "furthest"],
  little: ["less", "least"],
  many: ["more", "most"],
  much: ["more", "most"]
}).map(([base, forms]) => [base, new Set(forms)]));

const UNSAFE_LOOKALIKE_PAIRS = new Set([
  "fee::feed"
]);

const REGULAR_COMPARISON_ROOTS = new Set([
  "big", "broad", "busy", "cheap", "clear", "cold", "deep", "early", "easy", "fast",
  "great", "hard", "high", "hot", "large", "late", "long", "low", "old",
  "poor", "pure", "quick", "rich", "short", "slow", "small", "smart", "strong", "tall",
  "warm", "wide", "young"
]);

function isConsonant(value) {
  return /^[bcdfghjklmnpqrstvwxyz]$/.test(value);
}

function isCvcWord(word) {
  if (word.length < 3) return false;
  const [a, b, c] = word.slice(-3);
  return isConsonant(a)
    && /^[aeiou]$/.test(b)
    && isConsonant(c)
    && !/[wxy]$/.test(word);
}

export function regularInflectionForms(value) {
  const base = normalizeWord(value);
  const forms = new Map();
  const add = (word, kind) => {
    if (word && word !== base && !forms.has(word)) forms.set(word, kind);
  };
  if (!base || /[^a-z'-]/.test(base) || base.includes(" ")) return forms;

  add(`${base}'s`, "possessive");
  add(`${base}s`, "plural-or-third-person");
  if (/(?:s|x|z|ch|sh|o)$/.test(base)) add(`${base}es`, "plural-or-third-person");
  if (/[^aeiou]y$/.test(base)) add(`${base.slice(0, -1)}ies`, "plural-or-third-person");
  if (/fe$/.test(base)) add(`${base.slice(0, -2)}ves`, "plural");
  if (/f$/.test(base)) add(`${base.slice(0, -1)}ves`, "plural");

  add(`${base}ing`, "present-participle");
  if (/ie$/.test(base)) add(`${base.slice(0, -2)}ying`, "present-participle");
  if (/e$/.test(base) && !/(?:ee|ye|oe)$/.test(base)) add(`${base.slice(0, -1)}ing`, "present-participle");
  if (isCvcWord(base)) add(`${base}${base.at(-1)}ing`, "present-participle");

  add(`${base}ed`, "past-or-past-participle");
  if (/e$/.test(base)) add(`${base}d`, "past-or-past-participle");
  if (/[^aeiou]y$/.test(base)) add(`${base.slice(0, -1)}ied`, "past-or-past-participle");
  if (isCvcWord(base)) add(`${base}${base.at(-1)}ed`, "past-or-past-participle");

  if (REGULAR_COMPARISON_ROOTS.has(base)) {
    if (/e$/.test(base)) {
      add(`${base}r`, "comparative");
      add(`${base}st`, "superlative");
    } else if (/[^aeiou]y$/.test(base)) {
      add(`${base.slice(0, -1)}ier`, "comparative");
      add(`${base.slice(0, -1)}iest`, "superlative");
    } else if (isCvcWord(base)) {
      add(`${base}${base.at(-1)}er`, "comparative");
      add(`${base}${base.at(-1)}est`, "superlative");
    } else {
      add(`${base}er`, "comparative");
      add(`${base}est`, "superlative");
    }
  }

  return forms;
}

export function classifySurfaceInflection(baseValue, formValue) {
  const base = normalizeWord(baseValue);
  const form = normalizeWord(formValue);
  if (!base || !form || base === form) return "";
  if (UNSAFE_LOOKALIKE_PAIRS.has(`${base}::${form}`)) return "";
  const regular = regularInflectionForms(base).get(form);
  if (regular) return regular;
  if (IRREGULAR_FORMS.get(base)?.has(form)) return "irregular";
  return "";
}

export function isDirectSurfaceInflection(baseValue, formValue) {
  return Boolean(classifySurfaceInflection(baseValue, formValue));
}

/**
 * Return plausible grammatical owners for a stored surface form.  Candidates
 * are generated locally and then verified by classifySurfaceInflection, so a
 * suffix look-alike alone never becomes a relation.
 */
export function findSurfaceInflectionBases(formValue) {
  const form = normalizeWord(formValue);
  if (!form || /[^a-z'-]/.test(form) || form.includes(" ")) return [];

  const candidates = new Set();
  const add = (value) => {
    const candidate = normalizeWord(value);
    if (candidate && candidate !== form) candidates.add(candidate);
  };

  if (form.endsWith("'s")) add(form.slice(0, -2));
  if (form.endsWith("ies") && form.length > 4) add(`${form.slice(0, -3)}y`);
  if (form.endsWith("ves") && form.length > 4) {
    add(`${form.slice(0, -3)}f`);
    add(`${form.slice(0, -3)}fe`);
  }
  if (form.endsWith("es") && form.length > 3) {
    add(form.slice(0, -2));
    add(form.slice(0, -1));
  }
  if (form.endsWith("s") && form.length > 2) add(form.slice(0, -1));

  if (form.endsWith("ying") && form.length > 5) add(`${form.slice(0, -4)}ie`);
  if (form.endsWith("ing") && form.length > 4) {
    const stem = form.slice(0, -3);
    add(stem);
    add(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1));
  }

  if (form.endsWith("ied") && form.length > 4) add(`${form.slice(0, -3)}y`);
  if (form.endsWith("ed") && form.length > 3) {
    const stem = form.slice(0, -2);
    add(stem);
    add(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1));
  }
  if (form.endsWith("d") && form.length > 2) add(form.slice(0, -1));

  if (form.endsWith("ier") && form.length > 4) add(`${form.slice(0, -3)}y`);
  if (form.endsWith("iest") && form.length > 5) add(`${form.slice(0, -4)}y`);
  if (form.endsWith("er") && form.length > 3) {
    const stem = form.slice(0, -2);
    add(stem);
    add(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1));
  }
  if (form.endsWith("est") && form.length > 4) {
    const stem = form.slice(0, -3);
    add(stem);
    add(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1));
  }

  for (const [base, forms] of IRREGULAR_FORMS) {
    if (forms.has(form)) candidates.add(base);
  }

  return [...candidates].filter((base) => classifySurfaceInflection(base, form));
}

export function normalizeSurfaceWord(value) {
  return normalizeWord(value);
}
