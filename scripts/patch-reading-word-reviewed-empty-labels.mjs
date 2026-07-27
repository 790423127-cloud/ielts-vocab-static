import fs from "node:fs";

const ROOT = process.cwd();

function replaceRequired(file, before, after) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Expected text not found in ${file}: ${before.slice(0, 180)}`);
  }
  fs.writeFileSync(file, source.replace(before, after), "utf8");
}

const storage = `${ROOT}/app/lib/reading-words/storage.mjs`;
replaceRequired(
  storage,
  `  next.formsReviewed = true;\n  next.wordFamilyReviewed = true;\n  next.synonymsReviewed = true;\n  next.updatedAt = new Date().toISOString();`,
  `  if (Array.isArray(profile.forms)) next.formsReviewed = true;\n  if (Array.isArray(profile.wordFamily)) next.wordFamilyReviewed = true;\n  if (Array.isArray(profile.synonyms)) next.synonymsReviewed = true;\n  next.updatedAt = new Date().toISOString();`
);

const mainSync = `${ROOT}/app/lib/reading-words/main-lexicon-sync.mjs`;
replaceRequired(
  mainSync,
  `  next.formsReviewed = true;\n  next.wordFamilyReviewed = true;\n  next.synonymsReviewed = true;\n  if ((!Array.isArray(next.ieltsUse) || !next.ieltsUse.length) && Array.isArray(profile.ieltsUse)) {`,
  `  if (Array.isArray(profile.forms)) next.formsReviewed = true;\n  if (Array.isArray(profile.wordFamily)) next.wordFamilyReviewed = true;\n  if (Array.isArray(profile.synonyms)) next.synonymsReviewed = true;\n  if ((!Array.isArray(next.ieltsUse) || !next.ieltsUse.length) && Array.isArray(profile.ieltsUse)) {`
);

const page = `${ROOT}/app/reading-words/page.jsx`;
replaceRequired(
  page,
  `                  emptyText="暂无重要变形"`,
  `                  emptyText={selectedWord.formsReviewed ? "已审核 · 无变形" : "待 AI 检查变形"}`
);
replaceRequired(
  page,
  `                  emptyText="暂无词族信息"`,
  `                  emptyText={selectedWord.wordFamilyReviewed ? "已审核 · 无词族" : "待 AI 检查词族"}`
);
replaceRequired(
  page,
  `                  emptyText="当前词暂无可靠同义替换"`,
  `                  emptyText={selectedWord.synonymsReviewed ? "已审核 · 无可替换" : "待 AI 检查同义替换"}`
);

const testFile = `${ROOT}/app/lib/vocab/__tests__/word-flashcard-session.test.mjs`;
replaceRequired(
  testFile,
  `test("successful AI review marks empty relation sections so they are not processed repeatedly", () => {`,
  `test("any single unreviewed empty relation keeps the word in the AI queue", () => {\n  const base = {\n    word: "brochure",\n    pos: "noun",\n    meaning: "小册子",\n    definition: "a small book containing information",\n    example: "Please pick up a travel brochure at the counter.",\n    exampleCn: "请在柜台拿一份旅行小册子。",\n    forms: [{ word: "brochures", type: "plural" }],\n    wordFamily: [{ word: "brochure", pos: "noun" }],\n    synonyms: ["leaflet"]\n  };\n  const completeMain = {\n    word: "brochure",\n    ieltsUse: ["Reading"],\n    topics: ["旅行"],\n    difficulty: "基础"\n  };\n\n  for (const field of ["forms", "wordFamily", "synonyms"]) {\n    const word = normalizeReadingWord({ ...base, [field]: [] });\n    assert.deepEqual(getReadingWordMissingFields(word), [field]);\n    assert.equal(needsReadingAiProcessing(word, completeMain), true);\n  }\n});\n\ntest("AI only marks a relation reviewed when that field is explicitly returned", () => {\n  const word = normalizeReadingWord({\n    word: "brochure",\n    pos: "noun",\n    meaning: "小册子",\n    definition: "a small book containing information",\n    example: "Please pick up a travel brochure at the counter.",\n    exampleCn: "请在柜台拿一份旅行小册子。"\n  });\n  const partial = mergeReadingWordAiProfile(word, { forms: [] });\n\n  assert.equal(partial.formsReviewed, true);\n  assert.equal(partial.wordFamilyReviewed, false);\n  assert.equal(partial.synonymsReviewed, false);\n  assert.deepEqual(getReadingWordMissingFields(partial), ["wordFamily", "synonyms"]);\n});\n\ntest("successful AI review marks empty relation sections so they are not processed repeatedly", () => {`
);
replaceRequired(
  testFile,
  `test("home page imports the unified quality queue used after vocab hydration", () => {`,
  `test("reviewed empty reading relations are shown with explicit labels", () => {\n  assert.match(readingWordsSource, /已审核 · 无变形/);\n  assert.match(readingWordsSource, /已审核 · 无词族/);\n  assert.match(readingWordsSource, /已审核 · 无可替换/);\n  assert.match(readingWordsSource, /待 AI 检查变形/);\n  assert.match(readingWordsSource, /待 AI 检查词族/);\n  assert.match(readingWordsSource, /待 AI 检查同义替换/);\n});\n\ntest("home page imports the unified quality queue used after vocab hydration", () => {`
);

console.log(JSON.stringify({
  behavior: "empty relations enter AI once; explicit empty arrays create reviewed markers and visible labels"
}, null, 2));
