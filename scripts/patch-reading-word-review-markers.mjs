import fs from "node:fs";

const ROOT = process.cwd();

function replaceRequired(file, before, after) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Expected text not found in ${file}: ${before.slice(0, 160)}`);
  }
  fs.writeFileSync(file, source.replace(before, after), "utf8");
}

const storage = `${ROOT}/app/lib/reading-words/storage.mjs`;
replaceRequired(
  storage,
  `const CORE_FIELDS = [\n  "pos",\n  "meaning",\n  "definition",\n  "example",\n  "exampleCn"\n];`,
  `const CORE_FIELDS = [\n  "pos",\n  "meaning",\n  "definition",\n  "example",\n  "exampleCn"\n];\n\nconst REVIEWED_RELATION_FIELDS = [\n  ["forms", "formsReviewed"],\n  ["wordFamily", "wordFamilyReviewed"],\n  ["synonyms", "synonymsReviewed"]\n];`
);
replaceRequired(
  storage,
  `    synonyms: normalizeReadingSynonyms(\n      input.synonyms || input.validatedSynonyms || input.recommendedSynonyms,\n      word\n    ),\n    mainWordId: cleanText(input.mainWordId),`,
  `    synonyms: normalizeReadingSynonyms(\n      input.synonyms || input.validatedSynonyms || input.recommendedSynonyms,\n      word\n    ),\n    formsReviewed: input.formsReviewed === true,\n    wordFamilyReviewed: input.wordFamilyReviewed === true,\n    synonymsReviewed: input.synonymsReviewed === true,\n    mainWordId: cleanText(input.mainWordId),`
);
replaceRequired(
  storage,
  `export function getReadingWordMissingFields(word) {\n  return CORE_FIELDS.filter((field) => !cleanText(word?.[field]));\n}`,
  `export function getReadingWordMissingFields(word) {\n  const missing = CORE_FIELDS.filter((field) => !cleanText(word?.[field]));\n\n  for (const [field, reviewedField] of REVIEWED_RELATION_FIELDS) {\n    const hasData = Array.isArray(word?.[field]) && word[field].length > 0;\n    if (!hasData && word?.[reviewedField] !== true) missing.push(field);\n  }\n\n  return missing;\n}`
);
replaceRequired(
  storage,
  `  if (!Array.isArray(next.synonyms) || !next.synonyms.length) {\n    next.synonyms = normalizeReadingSynonyms(profile.synonyms, next.word);\n  }\n  next.updatedAt = new Date().toISOString();`,
  `  if (!Array.isArray(next.synonyms) || !next.synonyms.length) {\n    next.synonyms = normalizeReadingSynonyms(profile.synonyms, next.word);\n  }\n  next.formsReviewed = true;\n  next.wordFamilyReviewed = true;\n  next.synonymsReviewed = true;\n  next.updatedAt = new Date().toISOString();`
);

const mainSync = `${ROOT}/app/lib/reading-words/main-lexicon-sync.mjs`;
replaceRequired(
  mainSync,
  `const MAIN_ARRAY_FIELDS = [\n  "otherMeanings",\n  "forms",\n  "wordFamily"\n];`,
  `const MAIN_ARRAY_FIELDS = [\n  "otherMeanings",\n  "forms",\n  "wordFamily"\n];\n\nconst RELATION_REVIEW_FIELDS = [\n  ["forms", "formsReviewed"],\n  ["wordFamily", "wordFamilyReviewed"],\n  ["synonyms", "synonymsReviewed"]\n];`
);
replaceRequired(
  mainSync,
  `  if ((!Array.isArray(next.synonyms) || !next.synonyms.length) && Array.isArray(mainEntry.synonyms)) {\n    next.synonyms = normalizeReadingSynonyms(mainEntry.synonyms, next.word);\n  }\n  next.updatedAt = cleanText(now) || next.updatedAt;`,
  `  if ((!Array.isArray(next.synonyms) || !next.synonyms.length) && Array.isArray(mainEntry.synonyms)) {\n    next.synonyms = normalizeReadingSynonyms(mainEntry.synonyms, next.word);\n  }\n  for (const [field, reviewedField] of RELATION_REVIEW_FIELDS) {\n    if ((Array.isArray(mainEntry[field]) && mainEntry[field].length) || mainEntry[reviewedField] === true) {\n      next[reviewedField] = true;\n    }\n  }\n  next.updatedAt = cleanText(now) || next.updatedAt;`
);
replaceRequired(
  mainSync,
  `    forms: Array.isArray(readingWord.forms) ? readingWord.forms : [],\n    wordFamily: Array.isArray(readingWord.wordFamily) ? readingWord.wordFamily : [],\n    synonyms: normalizeReadingSynonyms(readingWord.synonyms, readingWord.word),\n    source: "personal-reading",`,
  `    forms: Array.isArray(readingWord.forms) ? readingWord.forms : [],\n    wordFamily: Array.isArray(readingWord.wordFamily) ? readingWord.wordFamily : [],\n    synonyms: normalizeReadingSynonyms(readingWord.synonyms, readingWord.word),\n    formsReviewed: readingWord.formsReviewed === true || Boolean(readingWord.forms?.length),\n    wordFamilyReviewed: readingWord.wordFamilyReviewed === true || Boolean(readingWord.wordFamily?.length),\n    synonymsReviewed: readingWord.synonymsReviewed === true || Boolean(readingWord.synonyms?.length),\n    source: "personal-reading",`
);
replaceRequired(
  mainSync,
  `  if ((!Array.isArray(next.synonyms) || !next.synonyms.length) && Array.isArray(profile.synonyms)) {\n    next.synonyms = normalizeReadingSynonyms(profile.synonyms, next.word);\n  }\n  if ((!Array.isArray(next.ieltsUse) || !next.ieltsUse.length) && Array.isArray(profile.ieltsUse)) {`,
  `  if ((!Array.isArray(next.synonyms) || !next.synonyms.length) && Array.isArray(profile.synonyms)) {\n    next.synonyms = normalizeReadingSynonyms(profile.synonyms, next.word);\n  }\n  next.formsReviewed = true;\n  next.wordFamilyReviewed = true;\n  next.synonymsReviewed = true;\n  if ((!Array.isArray(next.ieltsUse) || !next.ieltsUse.length) && Array.isArray(profile.ieltsUse)) {`
);

const page = `${ROOT}/app/reading-words/page.jsx`;
replaceRequired(
  page,
  `const MISSING_FIELD_LABELS = {\n  pos: "词性",\n  meaning: "中文释义",\n  definition: "英文释义",\n  example: "英文例句",\n  exampleCn: "例句翻译"\n};`,
  `const MISSING_FIELD_LABELS = {\n  pos: "词性",\n  meaning: "中文释义",\n  definition: "英文释义",\n  example: "英文例句",\n  exampleCn: "例句翻译",\n  forms: "变形",\n  wordFamily: "词族",\n  synonyms: "同义替换"\n};`
);

const testFile = `${ROOT}/app/lib/vocab/__tests__/word-flashcard-session.test.mjs`;
replaceRequired(
  testFile,
  `import {\n  buildWordStudyOverviewModel,\n  getWordStudyProgressLabel\n} from "../word-study-overview.mjs";`,
  `import {\n  buildWordStudyOverviewModel,\n  getWordStudyProgressLabel\n} from "../word-study-overview.mjs";\nimport {\n  getReadingWordMissingFields,\n  isReadingWordIncomplete,\n  mergeReadingWordAiProfile,\n  normalizeReadingWord\n} from "../../reading-words/storage.mjs";\nimport {\n  mergeAiProfileIntoMainEntry,\n  needsReadingAiProcessing\n} from "../../reading-words/main-lexicon-sync.mjs";`
);
replaceRequired(
  testFile,
  `test("home page imports the unified quality queue used after vocab hydration", () => {`,
  `test("reading relations stay pending until data exists or an AI review marker is stored", () => {\n  const word = normalizeReadingWord({\n    word: "brochure",\n    pos: "noun",\n    meaning: "小册子",\n    definition: "a small book containing information",\n    example: "Please pick up a travel brochure at the counter.",\n    exampleCn: "请在柜台拿一份旅行小册子。"\n  });\n  const completeMain = {\n    word: "brochure",\n    ieltsUse: ["Reading"],\n    topics: ["旅行"],\n    difficulty: "基础"\n  };\n\n  assert.deepEqual(getReadingWordMissingFields(word), ["forms", "wordFamily", "synonyms"]);\n  assert.equal(isReadingWordIncomplete(word), true);\n  assert.equal(needsReadingAiProcessing(word, completeMain), true);\n});\n\ntest("successful AI review marks empty relation sections so they are not processed repeatedly", () => {\n  const word = normalizeReadingWord({\n    word: "brochure",\n    pos: "noun",\n    meaning: "小册子",\n    definition: "a small book containing information",\n    example: "Please pick up a travel brochure at the counter.",\n    exampleCn: "请在柜台拿一份旅行小册子。"\n  });\n  const reviewedWord = mergeReadingWordAiProfile(word, {\n    forms: [],\n    wordFamily: [],\n    synonyms: []\n  });\n  const reviewedMain = mergeAiProfileIntoMainEntry({\n    word: "brochure",\n    ieltsUse: ["Reading"],\n    topics: ["旅行"],\n    difficulty: "基础"\n  }, {\n    forms: [],\n    wordFamily: [],\n    synonyms: []\n  }, { now: "2026-07-27T00:00:00.000Z" });\n\n  assert.equal(reviewedWord.formsReviewed, true);\n  assert.equal(reviewedWord.wordFamilyReviewed, true);\n  assert.equal(reviewedWord.synonymsReviewed, true);\n  assert.deepEqual(getReadingWordMissingFields(reviewedWord), []);\n  assert.equal(reviewedMain.formsReviewed, true);\n  assert.equal(reviewedMain.wordFamilyReviewed, true);\n  assert.equal(reviewedMain.synonymsReviewed, true);\n  assert.equal(needsReadingAiProcessing(reviewedWord, reviewedMain), false);\n});\n\ntest("existing relation data counts as complete before review markers are added", () => {\n  const word = normalizeReadingWord({\n    word: "brochure",\n    pos: "noun",\n    meaning: "小册子",\n    definition: "a small book containing information",\n    example: "Please pick up a travel brochure at the counter.",\n    exampleCn: "请在柜台拿一份旅行小册子。",\n    forms: [{ word: "brochures", type: "plural" }],\n    wordFamily: [{ word: "brochure", pos: "noun" }],\n    synonyms: ["leaflet"]\n  });\n\n  assert.deepEqual(getReadingWordMissingFields(word), []);\n});\n\ntest("home page imports the unified quality queue used after vocab hydration", () => {`
);

console.log(JSON.stringify({
  updated: [
    "app/lib/reading-words/storage.mjs",
    "app/lib/reading-words/main-lexicon-sync.mjs",
    "app/reading-words/page.jsx",
    "app/lib/vocab/__tests__/word-flashcard-session.test.mjs"
  ]
}, null, 2));
