import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEligibilityWordMap,
  canGenerateFormsFromHeadword,
  isBrushableWord,
  isInflectedReferenceWord,
  resolveBrushableWord,
  resolveWordSearchTarget
} from "../word-study-eligibility.mjs";
import {
  buildLocalFormFamilyResult,
  buildLocalExactDedupeResult,
  buildLocalOptimizeResult,
  generateInflectedForms,
  getDisplayForms,
  LOCAL_LEXICON_ORGANIZATION_POLICY,
  normalizeFormList,
  repairHeadwordLocally
} from "../page-word-helpers.mjs";
import {
  formatHeadwordForDisplay,
  formatHeadwordForSpeech,
  preserveHeadwordSlashAlternatives
} from "../headword-format.mjs";
import {
  buildFilteredWordIndices,
  buildStudyWordIndices,
  filterKey,
  wordMatchesFilter
} from "../word-flashcard-study-pool.mjs";
import {
  persistWordFlashSession,
  resolveCurrentStudyItem,
  resolveWordStudyIndex
} from "../word-flashcard-session.mjs";
import { buildRgStudyList } from "../../reading-g-vocab/storage.mjs";
import { buildBasicStudyList } from "../../basic-vocab/storage.mjs";
import {
  MASTER_LEXICON_EXPECTED_COUNT,
  MASTER_LEXICON_SHA256
} from "../master-lexicon-baseline.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CACHE_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC_PATH = path.join(ROOT, "public", "data", "words.json");
const MEANING_PATH = path.join(ROOT, "public", "data", "meaning-6000.json");
const RETIREMENTS_PATH = path.join(ROOT, "app", "lib", "vocab", "master-lexicon-retirements.json");
const cacheRaw = fs.readFileSync(CACHE_PATH);
const payload = JSON.parse(cacheRaw);
const meaningPayload = JSON.parse(fs.readFileSync(MEANING_PATH));
const retirementPayload = JSON.parse(fs.readFileSync(RETIREMENTS_PATH));
const words = payload.words;
const wordMap = buildEligibilityWordMap(words);
const refs = words.filter(isInflectedReferenceWord);
const brushable = words.filter(isBrushableWord);
const normalizeWord = (value) => String(value || "").trim().toLowerCase();
const everything = { type: "everything", value: "" };

function indexOf(word) {
  return words.findIndex((entry) => normalizeWord(entry.word) === normalizeWord(word));
}

test("master lexicon physical record count matches the controlled baseline", () => {
  assert.equal(words.length, MASTER_LEXICON_EXPECTED_COUNT);
  assert.equal(payload.count, MASTER_LEXICON_EXPECTED_COUNT);
  assert.ok(MASTER_LEXICON_EXPECTED_COUNT > 10_000);
});

test("master lexicon has unique stable ids and normalized headwords", () => {
  assert.equal(new Set(words.map((entry) => entry.id)).size, words.length);
  assert.equal(new Set(words.map((entry) => normalizeWord(entry.word))).size, words.length);
});

test("physical records partition into brushable cards and audited references", () => {
  assert.ok(refs.length > 0);
  assert.ok(brushable.length > 0);
  assert.equal(refs.length + brushable.length, words.length);
});

test("every pure inflected reference resolves to a brushable base", () => {
  for (const entry of refs) {
    assert.equal(entry.readingPriority, false, entry.word);
    assert.ok(entry.baseWord, entry.word);
    assert.ok(entry.baseWordId, entry.word);
    assert.equal(entry.redirectToWord, entry.baseWord, entry.word);
    const base = wordMap.get(normalizeWord(entry.baseWord));
    assert.ok(base, entry.word);
    assert.equal(base.id, entry.baseWordId, entry.word);
    assert.equal(isBrushableWord(base), true, entry.word);
    const owners = words.filter((candidate) => (candidate.forms || []).some((form) => form.id === entry.id));
    assert.equal(owners.length, 1, entry.word);
    assert.equal(owners[0].id, base.id, entry.word);
  }
});

test("the invalid neff record is absent", () => {
  assert.equal(wordMap.has("neff"), false);
});

for (const [name, filter] of [
  ["everything", everything],
  ["today queue", { type: "all", value: "" }],
  ["IELTS use", { type: "ielts", value: "Reading" }],
  ["topic", { type: "topic", value: "教育" }],
  ["difficulty", { type: "difficulty", value: "基础高频" }],
  ["status", { type: "status", value: "不熟" }],
  ["idictation", { type: "idictation", value: "listening" }]
]) {
  test(`${name} filter never admits pure inflected references`, () => {
    for (const entry of refs) assert.equal(wordMatchesFilter(entry, filter), false, entry.word);
  });
}

test("everything study queue contains every brushable card and no references", () => {
  const indices = buildStudyWordIndices(words, everything);
  assert.equal(indices.length, brushable.length);
  assert.ok(indices.every((index) => isBrushableWord(words[index])));
});

test("searching conducted redirects to conduct", () => {
  const result = resolveWordSearchTarget(words, "conducted");
  assert.equal(result.source.word, "conducted");
  assert.equal(result.target.word, "conduct");
  assert.equal(result.redirected, true);
});

test("searching carried redirects to carry", () => {
  const result = resolveWordSearchTarget(words, "carried");
  assert.equal(result.source.word, "carried");
  assert.equal(result.target.word, "carry");
  assert.equal(result.redirected, true);
});

for (const [plural, base] of [["forces", "force"], ["questions", "question"]]) {
  test(`${plural} is a stable plural reference to ${base}`, () => {
    const entry = wordMap.get(plural);
    const baseEntry = wordMap.get(base);
    assert.equal(entry.entryType, "inflected-form");
    assert.equal(entry.studyMode, "reference");
    assert.equal(entry.readingPriority, false);
    assert.equal(entry.baseWord, base);
    assert.equal(entry.baseWordId, baseEntry.id);
    assert.equal(entry.redirectToWord, base);
    assert.equal(entry.relationType, "plural");
    assert.ok(baseEntry.forms.some((form) => form.word === plural && form.id === entry.id));
  });

  test(`${plural} never enters ordinary filters`, () => {
    const entry = wordMap.get(plural);
    for (const filter of [
      everything,
      { type: "all", value: "" },
      { type: "ielts", value: "Reading" },
      { type: "topic", value: "实用补充" },
      { type: "difficulty", value: "中级核心" },
      { type: "status", value: "不熟" }
    ]) assert.equal(wordMatchesFilter(entry, filter), false, JSON.stringify(filter));
  });

  test(`search and legacy position for ${plural} resolve to ${base}`, () => {
    const searchResult = resolveWordSearchTarget(words, plural);
    assert.equal(searchResult.target.word, base);
    assert.equal(searchResult.redirected, true);

    const restoreResult = resolveWordStudyIndex(words, {
      session: { wordKey: plural, filter: everything },
      entryPositions: {},
      filter: everything,
      wordMatchesFilter,
      filterKey,
      normalizeWord
    });
    assert.equal(restoreResult.index, indexOf(base));
    assert.equal(restoreResult.reason, "wordKeyInflectedRedirect");
  });
}

test("inflected references cannot generate another inflection", () => {
  for (const plural of ["forces", "questions"]) {
    const entry = wordMap.get(plural);
    assert.equal(canGenerateFormsFromHeadword(entry), false);
    assert.deepEqual(generateInflectedForms(entry, { wordMap }), []);
    const displayed = getDisplayForms(entry, { wordMap }).map((form) => form.word);
    assert.ok(!displayed.includes(`${plural}es`));
  }
});

test("baseWordId alone can resolve a legacy inflected reference", () => {
  const base = { id: "base-1", word: "example", entryType: "headword" };
  const reference = {
    id: "form-1",
    word: "examples",
    entryType: "inflected-form",
    studyMode: "reference",
    baseWordId: "base-1",
    relationType: "plural"
  };
  const localMap = buildEligibilityWordMap([base, reference]);
  assert.equal(resolveBrushableWord(reference, localMap), base);
});

test("runtime never invents suffix forms that were not audited into the lexicon", () => {
  const synthetic = { word: "canvas", pos: "noun", forms: [] };
  assert.deepEqual(generateInflectedForms(synthetic, { wordMap }), []);
  assert.deepEqual(getDisplayForms(synthetic, { wordMap }), []);
});

test("local form normalization preserves audited ids, provenance, and every stored row", () => {
  const input = Array.from({ length: 13 }, (_, index) => ({
    word: `form-${index}`,
    id: `id-${index}`,
    type: "plural",
    source: "manual-audit",
    customEvidence: `evidence-${index}`
  }));
  input.push({ word: "form-0", id: "duplicate-id", type: "plural" });

  const result = normalizeFormList(input);
  assert.equal(result.length, 13);
  assert.equal(result[0].id, "id-0");
  assert.equal(result[0].source, "manual-audit");
  assert.equal(result[0].customEvidence, "evidence-0");
});

test("local relation organization follows stored reference metadata and never suffix spelling", () => {
  const correctBase = { id: "base-correct", word: "conduct", forms: [], wordFamily: [] };
  const wrongBase = {
    id: "base-wrong",
    word: "con",
    forms: [{ word: "conducted", id: "ref-conducted", type: "past tense" }],
    wordFamily: []
  };
  const reference = {
    id: "ref-conducted",
    word: "conducted",
    entryType: "inflected-form",
    studyMode: "reference",
    baseWord: "conduct",
    baseWordId: "base-correct",
    redirectToWord: "conduct",
    relationType: "past tense / past participle",
    forms: [],
    wordFamily: []
  };
  const canvas = { id: "canvas", word: "canvas", forms: [], wordFamily: [] };
  const canva = { id: "canva", word: "canva", forms: [], wordFamily: [] };
  const evening = { id: "evening", word: "evening", forms: [], wordFamily: [] };
  const even = { id: "even", word: "even", forms: [], wordFamily: [] };

  const result = buildLocalFormFamilyResult([correctBase, wrongBase, reference, canvas, canva, evening, even]);
  const resultMap = new Map(result.words.map((entry) => [entry.word, entry]));
  assert.equal(resultMap.get("con").forms.length, 0);
  assert.deepEqual(resultMap.get("conduct").forms.map((form) => [form.word, form.id, form.type]), [
    ["conducted", "ref-conducted", "past tense / past participle"]
  ]);
  assert.equal(resultMap.get("canva").forms.length, 0);
  assert.equal(resultMap.get("even").forms.length, 0);
  assert.equal(result.stats.wrongOwnerLinksRemoved, 1);
  assert.equal(result.stats.referenceLinksAdded, 1);
  assert.equal(result.stats.suffixGuesses, 0);
});

test("local headword repair uses the reviewed exact whitelist only", () => {
  assert.equal(repairHeadwordLocally("suppos"), "suppose");
  assert.equal(repairHeadwordLocally("cultivat"), "cultivat");
  assert.equal(LOCAL_LEXICON_ORGANIZATION_POLICY.suffixGuessing, false);
  assert.equal(LOCAL_LEXICON_ORGANIZATION_POLICY.derivedWordAutoDelete, false);
});

test("dedupe-only keeps unrelated rows byte-equivalent and preserves duplicate learning state", () => {
  const untouched = {
    id: "untouched",
    word: "canvas",
    forms: [{ word: "canvases", id: "stored-form", type: "plural", customEvidence: "keep" }],
    wordFamily: []
  };
  const first = { id: "first", word: "Example", status: "不熟", reviewCount: 2, favorite: false };
  const second = { id: "second", word: "example", reviewCount: 7, favorite: true };
  const result = buildLocalExactDedupeResult([untouched, first, second]);

  assert.equal(result.stats.merged, 1);
  assert.deepEqual(result.words[0], untouched);
  assert.equal(result.words[1].id, "first");
  assert.equal(result.words[1].status, "不熟");
  assert.equal(result.words[1].reviewCount, 7);
  assert.equal(result.words[1].favorite, true);
});

test("safe local organization is idempotent on the audited master lexicon", () => {
  const result = buildLocalOptimizeResult(words);
  assert.equal(result.words.length, words.length);
  assert.deepEqual(result.words, words);
  assert.equal(result.stats.exactMerged, 0);
  assert.equal(result.stats.referenceLinksAdded, 0);
  assert.equal(result.stats.wrongOwnerLinksRemoved, 0);
  assert.equal(result.stats.suffixGuesses, 0);
});

test("the local admin UI exposes derived-word review but no suffix-based bulk delete", () => {
  const source = fs.readFileSync(path.join(ROOT, "app", "components", "VocabAdminToolsPanel.jsx"), "utf8");
  assert.match(source, /安全本地规整（推荐）/);
  assert.match(source, /审核冷僻\/派生词（只扫描）/);
  assert.doesNotMatch(source, /localDeleteObscureDerivedWords|删除冷僻\/派生词/);
});

test("the word study UI renders the paid AI tool panel", () => {
  const viewSource = fs.readFileSync(path.join(ROOT, "app", "components", "WordFlashcardView.jsx"), "utf8");
  const panelSource = fs.readFileSync(path.join(ROOT, "app", "components", "VocabAdminToolsPanel.jsx"), "utf8");
  assert.doesNotMatch(viewSource, /showAiTools=\{false\}/);
  assert.match(panelSource, /AI工具（会扣费）/);
  assert.match(panelSource, /AI处理当前词（会扣费）/);
  assert.match(panelSource, /默认付费队列只处理/);
  assert.match(panelSource, /最多 100 词/);
  assert.match(panelSource, /AI修复当前词头符号/);
  assert.doesNotMatch(panelSource, /只保留 4 个按钮/);
});

test("slash alternatives stay lexical in storage, become clearer on screen, and sound natural", () => {
  const original = "in/within the context of";
  assert.equal(formatHeadwordForDisplay(original), "in / within the context of");
  assert.equal(formatHeadwordForSpeech(original), "in or within the context of");
  assert.equal(formatHeadwordForSpeech("and/or"), "and or");
  assert.equal(original, "in/within the context of");

  const contentSource = fs.readFileSync(path.join(ROOT, "app", "components", "WordStudyContent.jsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(ROOT, "app", "globals.css"), "utf8");
  assert.match(contentSource, /word--alternatives/);
  assert.match(contentSource, /word--long/);
  assert.match(cssSource, /\.word\.word--alternatives/);
});

test("AI symbol repair cannot remove or invent slash alternatives", () => {
  assert.equal(
    preserveHeadwordSlashAlternatives("in/within the context of", "in or within the context of"),
    "in / within the context of"
  );
  assert.equal(
    preserveHeadwordSlashAlternatives("the/an effect(s) on", "the / an effect on"),
    "the / an effect on"
  );
  assert.equal(preserveHeadwordSlashAlternatives("effect(s)", "effect"), "effect");
});

test("DeepSeek symbol prompt explicitly preserves slash notation", () => {
  const source = fs.readFileSync(path.join(ROOT, "app", "api", "repair-word-symbol", "route.js"), "utf8");
  assert.match(source, /必须保留斜杠，不得改写成 or/);
  assert.match(source, /in \/ within the context of/);
  assert.doesNotMatch(source, /in or within the context of/);
});

test("all DeepSeek routes allow only real localhost without requiring a browser-exposed token", () => {
  const routeNames = [
    "categorize-words",
    "clean-words",
    "dedupe-words",
    "generate-word",
    "generate-words",
    "repair-word-symbol"
  ];
  for (const routeName of routeNames) {
    const routeSource = fs.readFileSync(path.join(ROOT, "app", "api", routeName, "route.js"), "utf8");
    assert.match(routeSource, /requireLocalAdmin\(req, \{ allowLocalhostAlways: true \}\)/, routeName);
  }
});

for (const [form, base] of [["facilities", "facility"], ["residents", "resident"], ["emissions", "emission"]]) {
  test(`${form} is now an audited reference to ${base}`, () => {
    const entry = wordMap.get(form);
    assert.equal(isBrushableWord(entry), false);
    assert.equal(entry.baseWord, base);
    assert.equal(resolveWordSearchTarget(words, form).target.word, base);
  });
}

test("library filtering by a pure form returns the base card once", () => {
  assert.deepEqual(buildFilteredWordIndices(words, everything, "conducted"), [indexOf("conduct")]);
});

test("saved wordKey on a pure form restores to its base", () => {
  const result = resolveWordStudyIndex(words, {
    session: { wordKey: "conducted", filter: everything },
    entryPositions: {},
    filter: everything,
    wordMatchesFilter,
    filterKey,
    normalizeWord
  });
  assert.equal(result.index, indexOf("conduct"));
  assert.equal(result.reason, "wordKeyInflectedRedirect");
});

test("saved numeric index on a pure form restores to its base", () => {
  const result = resolveWordStudyIndex(words, {
    session: { index: indexOf("conducted"), filter: everything },
    entryPositions: {},
    filter: everything,
    wordMatchesFilter,
    filterKey,
    normalizeWord
  });
  assert.equal(result.index, indexOf("conduct"));
  assert.equal(result.reason, "savedIndexInflectedRedirect");
});

test("session persistence never writes a pure inflected position", () => {
  const writes = new Map();
  const result = persistWordFlashSession({
    words,
    index: indexOf("conducted"),
    filter: everything,
    entryPositions: {},
    filterKey,
    normalizeWord,
    storageSet(key, value) {
      writes.set(key, value);
      return true;
    }
  });
  assert.equal(result.saved, true);
  assert.equal(result.session.word, "conduct");
  assert.equal(result.session.index, indexOf("conduct"));
  assert.equal(result.entryPositions.everything, "conduct");
  assert.ok(writes.size >= 4);
});

test("current pure-form item resolves to the base card", () => {
  assert.equal(resolveCurrentStudyItem({ words, index: indexOf("conducted"), filter: everything }).word, "conduct");
});

test("lexicalized forms remain independent brushable cards", () => {
  for (const word of ["meeting", "housing", "accounting", "found", "forgotten", "news", "means"]) {
    const entry = wordMap.get(word);
    assert.equal(isBrushableWord(entry), true, word);
    assert.notEqual(entry.entryType, "inflected-form", word);
    if (["news", "means"].includes(word)) {
      assert.equal(canGenerateFormsFromHeadword(entry), false, word);
    }
  }
});

test("pure completed redirects to complete while hybrid challenged remains brushable", () => {
  const completed = wordMap.get("completed");
  const complete = wordMap.get("complete");
  const challenged = wordMap.get("challenged");
  const challenge = wordMap.get("challenge");
  assert.equal(isBrushableWord(completed), false);
  assert.equal(completed.baseWord, "complete");
  assert.ok(complete.forms.some((form) => form.word === "completed" && form.id === completed.id));
  assert.equal(isBrushableWord(challenged), true);
  assert.ok(challenge.forms.some((form) => form.word === "challenged" && form.id === challenged.id));
});

test("crystallize spellings keep all records with corrected meanings and variant links", () => {
  for (const word of ["crystalise", "crystalize", "crystallise", "crystallize"]) {
    const entry = wordMap.get(word);
    assert.equal(isBrushableWord(entry), true, word);
    assert.match(entry.meaning, /结晶/, word);
    assert.ok((entry.variantSpellings || []).length >= 1, word);
  }
});

test("pure form links are present on surviving audited pairs", () => {
  assert.ok(wordMap.get("conduct").forms.some((form) => form.word === "conducted"));
  assert.ok(wordMap.get("complete").forms.some((form) => form.word === "completed"));
});

test("act word-family links are bidirectional", () => {
  const family = ["act", "action", "active", "actively", "activity", "activate"];
  for (const source of family) {
    const linked = new Set((wordMap.get(source).wordFamily || []).map((entry) => entry.word));
    for (const target of family) if (target !== source) assert.ok(linked.has(target), `${source} -> ${target}`);
  }
});

test("G-class queues reject master pure-form references", () => {
  const list = buildRgStudyList([wordMap.get("conducted"), wordMap.get("conduct")], everything, {});
  assert.deepEqual(list.map((row) => row.entry.word), ["conduct"]);
});

test("basic queues reject master pure-form references", () => {
  const list = buildBasicStudyList([wordMap.get("conducted"), wordMap.get("conduct")], everything, {});
  assert.deepEqual(list.map((row) => row.entry.word), ["conduct"]);
});

test("legacy meaningZh compatibility fields match the canonical meaning", () => {
  for (const entry of words) {
    if ("meaningZh" in entry) assert.equal(entry.meaningZh, entry.meaning, entry.word);
  }
});

test("the embedded full morphology audit is complete and internally consistent", () => {
  assert.match(payload.morphologyAudit.version, /^manual-morphology-audit-v\d+-\d{8}$/);
  assert.equal(
    payload.morphologyAudit.storedFormLinksReviewed,
    words.reduce((sum, entry) => sum + (entry.forms || []).length, 0)
  );
  assert.equal(payload.morphologyAudit.inflectedReferences, refs.length);
  assert.equal(payload.morphologyAudit.brushableHeadwords, brushable.length);
});

test("suffix candidate count accounts for registered retirements", () => {
  const endings = ["s", "ed", "ing", "er", "est", "en", "ind"];
  const candidates = words.filter((entry) => endings.some((ending) => normalizeWord(entry.word).endsWith(ending)));
  const retiredCandidates = retirementPayload.entries.filter(
    (entry) => (
      entry.morphologyAuditIncluded !== false &&
      endings.some((ending) => normalizeWord(entry.word).endsWith(ending))
    )
  );
  assert.equal(candidates.length + retiredCandidates.length, payload.morphologyAudit.rawSuffixHeadwordsReviewed);
});

test("literal ind-ending words remain independent headwords", () => {
  const literalIndWords = [
    "behind", "bind", "blind", "colour-blind", "find", "grind", "hind", "humankind",
    "kind", "lind", "mankind", "mind", "remind", "rescind", "wind"
  ];
  for (const word of literalIndWords) {
    const entry = wordMap.get(word);
    assert.equal(isBrushableWord(entry), true, word);
    assert.notEqual(entry.entryType, "inflected-form", word);
    assert.equal(entry.baseWord, undefined, word);
  }
});

test("hybrid forgotten keeps its independent adjective card without a legacy redirect", () => {
  const entry = wordMap.get("forgotten");
  assert.equal(isBrushableWord(entry), true);
  assert.equal(entry.entryType, "headword");
  assert.equal(entry.redirectTo, undefined);
  assert.equal(entry.relation, undefined);
  assert.equal(entry.morphologyAudit.decision, "hybrid-independent-headword");
});

test("meaning training has no dangling master ids and carries current lexicon metadata", () => {
  const masterIds = new Set(words.map((entry) => entry.wordId));
  assert.equal(meaningPayload.items.length, 6000);
  assert.ok(meaningPayload.items.every((entry) => masterIds.has(entry.wordId)));
  assert.equal(meaningPayload.sourceLexiconVersion, payload.version);
  assert.equal(meaningPayload.sourceLexiconCount, words.length);
  assert.equal(meaningPayload.sourceLexiconSha256, MASTER_LEXICON_SHA256);
});

test("audited suffix meanings are synchronized into meaning training", () => {
  const expected = new Map([
    ["acts", "行动；行为；表演"],
    ["findings", "调查结果；发现"],
    ["married", "已婚的；婚姻的"],
    ["lasting", "持久的；长期的"],
    ["testing", "测试；检验"]
  ]);
  const meaningMap = new Map(meaningPayload.items.map((entry) => [normalizeWord(entry.word), entry]));
  for (const [word, meaning] of expected) {
    assert.equal(meaningMap.get(word)?.quizMeaningZh, meaning, word);
    assert.equal(meaningMap.get(word)?.meaningSource, "master-lexicon", word);
  }
  assert.equal(meaningMap.has("ass"), false);
  assert.equal(meaningMap.has("forgotten"), true);
});

test("the audited stored-form graph has no self-links or dangling physical forms", () => {
  for (const entry of words) {
    for (const form of entry.forms || []) {
      const pair = `${normalizeWord(entry.word)} -> ${normalizeWord(form.word)}`;
      assert.notEqual(normalizeWord(entry.word), normalizeWord(form.word), pair);
      if (pair !== "earn -> earning") assert.ok(wordMap.has(normalizeWord(form.word)), pair);
    }
  }
});

test("known mechanical false links are absent and corrected owners are present", () => {
  const falsePairs = [
    ["canva", "canvas"], ["ear", "earring"], ["sacrifice", "sacred"],
    ["even", "evening"], ["find", "founding"], ["corp", "corps"],
    ["suppo", "suppos"], ["leed", "leeds"]
  ];
  for (const [base, form] of falsePairs) {
    assert.equal(Boolean(wordMap.get(base)?.forms?.some((item) => item.word === form)), false, `${base} -> ${form}`);
  }
  assert.ok(wordMap.get("found").forms.some((item) => item.word === "founding"));
  assert.ok(wordMap.get("suppose").forms.some((item) => item.word === "supposed"));
  assert.ok(wordMap.get("explosive").forms.some((item) => item.word === "explosives"));
});

test("cache and public lexicon copies are byte-identical and match baseline", () => {
  const publicRaw = fs.readFileSync(PUBLIC_PATH);
  assert.equal(cacheRaw.equals(publicRaw), true);
  assert.equal(crypto.createHash("sha256").update(cacheRaw).digest("hex"), MASTER_LEXICON_SHA256);
});

test("blurry status filter contains only explicitly blurry words", () => {
  const filter = { type: "status", value: "模糊" };

  assert.equal(wordMatchesFilter({ word: "alpha", status: "模糊" }, filter), true);
  assert.equal(wordMatchesFilter({ word: "beta", status: "" }, filter), false);
  assert.equal(wordMatchesFilter({ word: "gamma", status: "不熟" }, filter), false);
  assert.equal(wordMatchesFilter({ word: "delta", status: "熟悉" }, filter), false);
});
