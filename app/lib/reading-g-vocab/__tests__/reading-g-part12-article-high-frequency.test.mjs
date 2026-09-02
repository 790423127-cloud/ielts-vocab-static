import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeReadingGKey, stableReadingGId } from "../normalize.mjs";
import {
  buildRgStudyList,
  compareRgArticleFrequency,
  getRgArticleFrequency,
  getRgFilterLabel,
  RG_LEARNING_ENTRIES
} from "../storage.mjs";
import {
  PART12_ONLY_HF_FILTER_TYPE,
  PART12_ONLY_HF_LABEL,
  compareRgPart12OnlyFrequency,
  getRgPart12OnlyArticleCount,
  isReadingGBasicZeroHeadword,
  isReadingGPart12OnlyHighFrequency
} from "../part12-only-high-frequency.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const vocab = JSON.parse(
  fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8")
);
const source = JSON.parse(
  fs.readFileSync(
    path.join(root, "scripts/data/reading-g-part12-article-high-frequency-20260823.json"),
    "utf8"
  )
);
const staticJs = fs.readFileSync(path.join(root, "public/assets/reading-g.js"), "utf8");
const exportRoute = fs.readFileSync(path.join(root, "app/api/export-static/route.js"), "utf8");
const layerId = "part12ArticleHighFrequency";
const expectedKeptShort = ["GPS", "MA", "CCTV", "PLC"];
const expectedTeachingCards = [
  "perhaps",
  "swan",
  "GPS",
  "MA",
  "administrator",
  "carrier",
  "CCTV",
  "credential",
  "federation",
  "PLC",
  "rucksack"
];
const byKey = new Map(vocab.items.map((item) => [
  `${item.entryType || "word"}::${normalizeReadingGKey(item.normalizedKey || item.word)}`,
  item
]));
const layerItems = vocab.items.filter((item) => (item.layers || []).includes(layerId));
const rowKey = (row) => `${row.entryType || "word"}::${normalizeReadingGKey(row.key || row.word)}`;

test("source audit contains 224 distinct articles and the v3 high-frequency cards", () => {
  assert.equal(source.corpus.articleCount, 224);
  assert.equal(source.corpus.testCount, 56);
  assert.equal(source.corpus.part1ArticleCount, 112);
  assert.equal(source.corpus.part2ArticleCount, 112);
  assert.equal(source.articleCatalog.length, 224);
  assert.equal(new Set(source.articleCatalog.map((article) => article.articleId)).size, 224);
  assert.equal(source.minimumDistinctArticles, 1);
  assert.equal(source.count, 3038);
  assert.equal(source.rows.length, 3038);
  assert.equal(source.wordCount, 2913);
  assert.equal(source.phraseCount, 125);
  assert.equal(new Set(source.rows.map(rowKey)).size, 3038);
  for (const row of source.rows) {
    const part12 = Number(row.articleCount || 0);
    const part3 = Number(row.part3ArticleCount || 0);
    assert.ok(part12 + part3 >= 1, `${row.word}: article threshold`);
    assert.equal(new Set(row.articleIds || []).size, part12, `${row.word}: distinct article count`);
    assert.equal(new Set(row.part3ArticleIds || []).size, part3, `${row.word}: part3 count`);
    assert.ok(["word", "phrase"].includes(row.entryType || "word"), `${row.word}: entryType`);
  }
});

test("selection keeps short non-basic forms and does not use word length as a simplicity rule", () => {
  assert.equal(source.additionCount, 224);
  assert.equal(source.existingCount, 2814);
  assert.match(source.policy, /Do not use word length as a simplicity rule/);
  assert.match(source.policy, /Keep separate cards when an inflection or word-family member has a different meaning/);
  for (const word of expectedKeptShort) {
    assert.ok(source.rows.some((row) => row.word === word && row.articleCount >= 2), word);
  }
  assert.equal(source.rows.some((row) => normalizeReadingGKey(row.word) === "above"), false);
  assert.equal(source.rows.some((row) => row.word === "such as"), false);
  assert.equal(source.rows.some((row) => row.word === "for example"), false);
});

test("different-meaning inflections and lexicalized plurals stay as separate cards", () => {
  const words = new Set(source.rows.filter((row) => (row.entryType || "word") === "word").map((row) => row.key));
  for (const word of ["provide", "provided", "require", "required", "working", "works", "premises", "savings", "customs"]) {
    assert.ok(words.has(word), word);
  }
  assert.ok(source.rows.some((row) => row.entryType === "phrase" && row.word === "make sure"));
  assert.ok(source.rows.some((row) => row.entryType === "phrase" && row.word === "find out"));
});

test("formal vocabulary represents every reviewed row once in the dedicated layer", () => {
  assert.equal(vocab.count, vocab.items.length);
  assert.equal(vocab.logicRuleSupplement?.newPhraseTargetCount, 18);
  assert.equal(layerItems.length, 3036);
  assert.equal(vocab.layerStats[layerId].filterCount, 3038);
  assert.equal(vocab.layerStats[layerId].mode, "mixed");
  assert.equal(vocab.part12ArticleHighFrequency.layerCount, 3038);
  assert.equal(vocab.part12ArticleHighFrequency.paidAiCalls, 0);

  const mergeKeys = vocab.items.map((item) => (
    `${item.entryType || "word"}::${normalizeReadingGKey(item.normalizedKey || item.word)}`
  ));
  assert.equal(new Set(mergeKeys).size, mergeKeys.length);
  assert.equal(new Set(vocab.items.map((item) => item.id)).size, vocab.items.length);

  for (const row of source.rows) {
    const item = byKey.get(rowKey(row));
    assert.ok(item, `${row.word}: missing formal entry`);
    assert.ok((item.layers || []).includes(layerId), `${row.word}: missing layer`);
    assert.equal(item.part12ArticleFrequency.articleCount, row.articleCount, `${row.word}: evidence`);
    assert.equal(new Set(item.part12ArticleFrequency.articleIds).size, row.articleCount);
  }
  const referenceWords = layerItems
    .filter((item) => item.studyMode === "reference")
    .map((item) => item.word);
  assert.ok(referenceWords.includes("complicated"));
  assert.ok(referenceWords.includes("however") === false);
});

test("kept short and reviewed supplements still have complete visible teaching content", () => {
  for (const word of expectedTeachingCards) {
    const key = normalizeReadingGKey(word);
    const item = byKey.get(`word::${key}`);
    assert.ok(item, `${word}: missing`);
    assert.equal(item.id, stableReadingGId("word", key), `${word}: stable id`);
    assert.equal(item.studyMode, "active", `${word}: study mode`);
    assert.ok(item.phonetic, `${word}: phonetic`);
    assert.ok(item.primaryPos, `${word}: primaryPos`);
    assert.match(item.primaryMeaningZh, /[\u3400-\u9fff]/u, `${word}: meaning`);
    assert.match(item.meaningDetailZh, /[\u3400-\u9fff]/u, `${word}: detail`);
    assert.match(item.example, /[A-Za-z]/u, `${word}: example`);
    assert.match(item.exampleCn || item.exampleZh, /[\u3400-\u9fff]/u, `${word}: example translation`);
    assert.ok((item.layers || []).includes(layerId), `${word}: layer`);
    assert.ok(item.part12ArticleFrequency.articleCount >= 2, `${word}: article threshold`);
  }

  const ma = byKey.get("word::ma");
  assert.match(ma.primaryMeaningZh, /产假津贴|生育津贴/);
  assert.ok((ma.otherMeanings || []).some((meaning) => JSON.stringify(meaning).includes("文学硕士")));
  assert.equal((byKey.get("word::above")?.layers || []).includes(layerId), false);
});

test("retired and rejected formatting/name candidates were not restored into the layer", () => {
  for (const word of ["gap", "base", "Arthur", "GF", "Hanley", "PO"]) {
    const item = byKey.get(`word::${normalizeReadingGKey(word)}`);
    assert.equal((item?.layers || []).includes(layerId), false, word);
  }
  assert.deepEqual(source.exclusions.retired.map((row) => row.word), ["gap", "base"]);
  assert.deepEqual(
    source.exclusions.unknownRejected.map((row) => row.word),
    ["arthur", "gf", "hanley", "po"]
  );
});

test("dynamic and static learning menus expose the same Part 1-3 high-frequency filter", () => {
  const entry = RG_LEARNING_ENTRIES
    .flatMap((group) => group.items)
    .find((candidate) => candidate.filter?.type === "layer" && candidate.filter?.value === layerId);
  assert.ok(entry);
  assert.equal(entry.title, "剑雅5–21文章高频（Part 1–3）");
  assert.equal(RG_LEARNING_ENTRIES[0].items[0].title, "剑雅5–21文章高频（Part 1–3）");
  assert.equal(getRgFilterLabel(entry.filter), entry.title);
  assert.equal(buildRgStudyList(vocab.items, entry.filter, {}).length, 3036);
  assert.ok(source.rows.some((row) => row.key === "as for" && row.entryType === "phrase"));
  assert.ok(source.rows.some((row) => row.key === "notice board" && row.entryType === "phrase"));
  assert.ok(source.rows.some((row) => row.key === "in favour of" && row.entryType === "phrase"));
  assert.ok(source.rows.some((row) => row.key === "staff" && row.articleCount >= 2));
  assert.ok(source.rows.some((row) => row.key === "however" && row.articleCount >= 2));
  assert.ok(source.rows.some((row) => row.key === "check"));
  assert.ok(source.rows.some((row) => row.key === "worldwide"));
  assert.ok(source.rows.some((row) => row.key === "mate"));
  assert.ok(source.rows.some((row) => row.key === "ecosystem"));
  assert.ok(source.rows.some((row) => row.key === "given"));
  const page = fs.readFileSync(path.join(root, "app/reading-g/page.jsx"), "utf8");
  assert.match(page, /文章高频/);
  assert.match(page, /value: "part12ArticleHighFrequency"/);
  assert.match(staticJs, /剑雅5–21文章高频（Part 1–3）/);
  assert.match(staticJs, /value: "part12ArticleHighFrequency"/);
  assert.match(staticJs, /renderArticleFrequencyPanel/);
  assert.match(staticJs, /part12ArticleFrequency/);
  assert.match(staticJs, /restoreStudyPosition\(filter\)/);
  const staticPage = fs.readFileSync(path.join(root, "public/reading-g.html"), "utf8");
  assert.match(staticPage, /id="hfQuickEntryBtn"/);
  assert.match(staticPage, /id="hfPanelEntryBtn"/);
  assert.match(staticPage, /id="part12OnlyHfQuickEntryBtn"/);
  assert.match(staticPage, /id="part12OnlyHfPanelEntryBtn"/);
  assert.match(staticPage, /id="restPanelEntryBtn"/);
  assert.match(staticPage, /其余词汇（非文章高频）/);
  assert.match(staticPage, /id="unfamiliarPanelEntryBtn"/);
  assert.match(staticPage, /不熟复习/);
  assert.match(staticPage, /id="unfamiliarQuickEntryBtn"/);
  assert.match(staticPage, /id="articleFrequencyPanel"/);
  assert.match(staticPage, /id="articleFrequencyRestartBtn"/);
  assert.match(staticPage, /剑雅5–21文章高频（Part 1–3）/);
  assert.match(staticPage, /id="readingEntryBtn"/);
  assert.match(staticPage, /全部范围/);
  assert.match(staticPage, /reading-g-entry-tools/);
  assert.match(staticJs, /featured: true/);
  assert.match(staticJs, /entry-btn-featured/);
  assert.match(staticJs, /ARTICLE_HF_LABEL/);
  assert.match(staticJs, /part12ArticleHighFrequency/);
});

test("article high-frequency study defaults to highest appearance probability first", () => {
  const studyRows = buildRgStudyList(
    vocab.items,
    { type: "layer", value: layerId },
    {}
  );
  assert.equal(studyRows.length, 3036);
  assert.equal(studyRows[0].entry.word, "working");
  assert.deepEqual(getRgArticleFrequency(studyRows[0].entry), {
    articleCount: 68,
    occurrenceCount: 106
  });
  for (let index = 1; index < studyRows.length; index += 1) {
    assert.ok(
      compareRgArticleFrequency(studyRows[index - 1], studyRows[index]) <= 0,
      `${studyRows[index - 1].entry.word} should rank before ${studyRows[index].entry.word}`
    );
  }
  assert.match(staticJs, /sortDefaultFrequencyIndices/);
  assert.match(staticJs, /articleNonHighFrequency/);
});

test("non-high-frequency remainder entry covers the rest of the active lexicon and sorts by article frequency", () => {
  const restFilter = { type: "articleNonHighFrequency", value: "" };
  const restEntry = RG_LEARNING_ENTRIES
    .flatMap((group) => group.items)
    .find((candidate) => candidate.filter?.type === "articleNonHighFrequency");
  assert.ok(restEntry);
  assert.equal(restEntry.title, "其余词汇（非文章高频）");
  assert.equal(RG_LEARNING_ENTRIES[0].items[2].title, "其余词汇（非文章高频）");
  assert.equal(getRgFilterLabel(restFilter), restEntry.title);

  const hfRows = buildRgStudyList(vocab.items, { type: "layer", value: layerId }, {});
  const restRows = buildRgStudyList(vocab.items, restFilter, {});
  assert.equal(restRows.length, 4075);
  assert.equal(restRows[0].entry.word, "many");
  assert.equal(
    restRows.every((row) => !(row.entry.layers || []).includes(layerId)),
    true
  );
  assert.equal(
    restRows.some((row) => (row.entry.layers || []).includes(layerId)),
    false
  );
  for (let index = 1; index < restRows.length; index += 1) {
    assert.ok(
      compareRgArticleFrequency(restRows[index - 1], restRows[index]) <= 0,
      `${restRows[index - 1].entry.word} should rank before ${restRows[index].entry.word}`
    );
  }
  assert.equal(hfRows.length + restRows.length, 7111);
  assert.match(staticJs, /ARTICLE_REST_LABEL/);
  assert.match(staticJs, /openReadingGArticleRest/);
  const page = fs.readFileSync(path.join(root, "app/reading-g/page.jsx"), "utf8");
  assert.match(page, /其余词汇/);
  assert.match(page, /articleNonHighFrequency/);
  assert.equal(RG_LEARNING_ENTRIES[0].items[3].title, "不熟复习");
  assert.equal(getRgFilterLabel({ type: "status", value: "不熟" }), "不熟复习");
  assert.match(page, /setLibraryFilter\(\{ type: "status", value: "不熟" \}\)/);
  assert.match(staticJs, /UNFAMILIAR_LABEL/);
  assert.match(staticJs, /openReadingGUnfamiliar/);
});

test("Part 1-2 only high-frequency entry keeps the Part 1-3 range unchanged", () => {
  const part12Filter = { type: PART12_ONLY_HF_FILTER_TYPE, value: "" };
  const part12Entry = RG_LEARNING_ENTRIES
    .flatMap((group) => group.items)
    .find((candidate) => candidate.filter?.type === PART12_ONLY_HF_FILTER_TYPE);
  assert.ok(part12Entry);
  assert.equal(part12Entry.title, PART12_ONLY_HF_LABEL);
  assert.equal(RG_LEARNING_ENTRIES[0].items[1].title, PART12_ONLY_HF_LABEL);
  assert.equal(getRgFilterLabel(part12Filter), PART12_ONLY_HF_LABEL);
  assert.equal(RG_LEARNING_ENTRIES[0].items[0].title, "剑雅5–21文章高频（Part 1–3）");

  const studyRows = buildRgStudyList(vocab.items, part12Filter, {});
  assert.equal(studyRows.length, 2076);
  assert.equal(studyRows[0].entry.word, "working");
  assert.equal(getRgPart12OnlyArticleCount(studyRows[0].entry), 68);
  assert.equal(studyRows.every((row) => isReadingGPart12OnlyHighFrequency(row.entry)), true);
  assert.equal(
    studyRows.every((row) => getRgPart12OnlyArticleCount(row.entry) >= 2),
    true
  );
  assert.equal(
    studyRows.some((row) => isReadingGBasicZeroHeadword(row.entry.word)),
    false
  );
  assert.equal(
    studyRows.some((row) => (row.entry.entryType || "word") === "phrase" || /\s/.test(row.entry.word || "")),
    false
  );
  for (let index = 1; index < studyRows.length; index += 1) {
    assert.ok(
      compareRgPart12OnlyFrequency(studyRows[index - 1], studyRows[index]) <= 0,
      `${studyRows[index - 1].entry.word} should rank before ${studyRows[index].entry.word}`
    );
  }

  const page = fs.readFileSync(path.join(root, "app/reading-g/page.jsx"), "utf8");
  assert.match(page, /part12OnlyHighFrequency/);
  assert.match(page, /P1\+2高频/);
  assert.match(staticJs, /PART12_ONLY_HF_LABEL/);
  assert.match(staticJs, /openReadingGPart12OnlyHighFrequency/);
  assert.match(staticJs, /type: "part12OnlyHighFrequency"/);
  assert.match(staticJs, /saved\[filterKey\(filter\)\]/);
  assert.match(staticJs, /filter = PART12_ONLY_HF_FILTER;\s*loadOrderPreferences\(\);/);
  const staticPage = fs.readFileSync(path.join(root, "public/reading-g.html"), "utf8");
  assert.match(staticPage, /id="part12OnlyHfQuickEntryBtn"/);
  assert.match(staticPage, /id="part12OnlyHfPanelEntryBtn"/);
  assert.match(staticPage, /剑雅5–21文章高频（Part 1–2）/);
});

test("static export route packages the updated G-reading page, script and vocabulary", () => {
  assert.match(exportRoute, /name: "reading-g\.html"/);
  assert.match(exportRoute, /name: "assets\/reading-g\.js"/);
  assert.match(exportRoute, /name: "data\/reading-g-vocab\.json"/);
  assert.match(exportRoute, /"\.\/reading-g\.html"/);
  assert.match(exportRoute, /"\.\/assets\/reading-g\.js\?v=\$\{STATIC_EXPORT_VERSION\}"/);
  assert.match(exportRoute, /"\.\/data\/reading-g-vocab\.json"/);
});
