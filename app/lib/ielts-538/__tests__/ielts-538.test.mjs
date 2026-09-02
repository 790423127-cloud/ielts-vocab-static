import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getIelts538ProgressKey,
  loadIelts538Words
} from "../load-ielts-538.mjs";
import {
  IELTS_538_STATUS,
  buildIelts538StudyList,
  isIelts538AiCoachParaphrase,
  patchIelts538WordStatus
} from "../storage.mjs";

const DATA_PATH = new URL("../../../../public/data/ielts-538-words.json", import.meta.url);

test("538 lexicon contains all 376 unique stable entries and expected groups", async () => {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  assert.equal(data.count, 376);
  assert.equal(data.words.length, 376);
  assert.equal(new Set(data.words.map((word) => word.id)).size, 376);
  assert.equal(new Set(data.words.map((word) => word.wordId)).size, 376);
  assert.ok(data.words.every((word) => word.id === word.wordId));
  assert.ok(data.words.every((word) => word.word && word.meaning));
  assert.deepEqual(
    data.words.reduce((counts, word) => {
      const key = `${word.sourceCategory}:${word.sourceGroup}`;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {}),
    {
      "1:1": 20,
      "2:1": 50,
      "2:2": 50,
      "3:1": 50,
      "3:2": 50,
      "3:3": 50,
      "3:4": 50,
      "3:5": 56
    }
  );
});

test("loader preserves the 376-word base and appends the isolated AI-coach practice entry", async () => {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const loaded = await loadIelts538Words(async () => ({
    ok: true,
    json: async () => data
  }));
  assert.equal(loaded.count, 376);
  assert.equal(loaded.practiceCount, 1257);
  assert.equal(loaded.words.length, 1633);
  assert.equal(loaded.words[0].word, "resemble");
  assert.deepEqual(loaded.words[0].synonyms, ["like", "look like", "be similar to"]);
  assert.equal(loaded.words[375].word, "well-being");
  assert.ok(isIelts538AiCoachParaphrase(loaded.words.at(-1)));
});

test("all 376 entries include reviewed reading-context paraphrases", async () => {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  assert.ok(data.words.every((word) => word.example && word.exampleCn));
  assert.ok(data.words.every((word) =>
    ["Section 1", "Section 2", "Section 3"].includes(word.readingSection)
  ));
  assert.ok(data.words.every((word) =>
    Object.values(word.synonymSections || {}).every((section) =>
      ["Section 1", "Section 2", "Section 3"].includes(section)
    )
  ));
  assert.ok(data.words.every((word) => word.recommendedSynonyms?.length >= 1));
  assert.equal(
    data.words.reduce((count, word) => count + word.paraphraseExamples.length, 0),
    454
  );
  assert.ok(data.words.every((word) => word.validatedSynonyms?.length >= 1));
  assert.ok(data.words.every((word) =>
    word.validatedSynonyms.length === word.paraphraseExamples?.length
  ));
  assert.ok(data.words.every((word) => {
    const replacements = word.paraphraseExamples.map((pair) => pair.replacement.toLowerCase());
    return new Set(replacements).size === replacements.length &&
      word.paraphraseExamples.every((pair) =>
        pair.sourceSentence === word.example &&
        pair.meaningCn === word.exampleCn &&
        pair.readingSection === word.synonymSections[pair.replacement] &&
        pair.sourceSentence !== pair.paraphraseSentence &&
        pair.relationType === "contextual-reading-paraphrase"
      );
  }));
  assert.ok(data.words.every((word) => {
    const recommended = new Set(word.recommendedSynonyms);
    return word.recommendedSynonyms.length <= 3 &&
      word.recommendedSynonyms.every((replacement) =>
        word.validatedSynonyms.includes(replacement)
      ) &&
      word.paraphraseExamples.every((pair) =>
        pair.isRecommended === recommended.has(pair.replacement)
      );
  }));

  const sectionCounts = data.words
    .flatMap((word) => word.paraphraseExamples)
    .reduce((counts, pair) => {
      counts[pair.readingSection] = (counts[pair.readingSection] || 0) + 1;
      return counts;
    }, {});
  assert.ok(
    sectionCounts["Section 1"] > 0 &&
      sectionCounts["Section 2"] > 0 &&
      sectionCounts["Section 3"] > 0,
    "replacement difficulty should cover all three Sections"
  );

  const loaded = await loadIelts538Words(async () => ({
    ok: true,
    json: async () => data
  }));
  assert.equal(loaded.words.length, 1633);
  assert.equal(
    loaded.words
      .filter((word) => !isIelts538AiCoachParaphrase(word))
      .reduce((count, word) => count + word.paraphraseExamples.length, 0),
    454
  );
});

test("AI-coach audit keeps 1258 usable pairs but omits the one already reviewed in 538", async () => {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const audit = data.aiCoachQuestionParaphrases;
  const cards = data.questionParaphrases;

  assert.equal(audit.officialTestCount, 58);
  assert.equal(audit.officialQuestionCount, 2320);
  assert.equal(audit.curatedCandidateCount, 2699);
  assert.equal(audit.strictAcceptedOccurrenceCount, 1273);
  assert.equal(audit.identityOccurrenceExcludedCount, 12);
  assert.equal(audit.usableContextOccurrenceCount, 1261);
  assert.equal(audit.usableContextUniquePairCount, 1258);
  assert.equal(audit.internalDuplicateExcessCount, 3);
  assert.equal(audit.internallyRepeatedUniquePairCount, 1);
  assert.equal(audit.newExactDirectedOverlapWithReviewedCount, 1);
  assert.equal(audit.alreadyAvailableIn538ReviewedCount, 1);
  assert.equal(audit.practiceEntryCount, 1257);
  assert.equal(audit.totalAvailableAcross538Count, 1258);
  assert.equal(audit.existingReviewedRelationOccurrenceCount, 454);
  assert.equal(audit.existingReviewedReverseDuplicateCount, 1);
  assert.equal(cards.length, 1257);
  assert.equal(new Set(cards.map((card) => card.id)).size, 1257);
  assert.ok(cards.every((card) =>
    card.id === card.wordId &&
    card.practiceKind === "aiCoachQuestionParaphrase" &&
    card.sourceExpression &&
    card.questionExpression &&
    card.example &&
    card.paraphraseExamples?.[0]?.relationType === "ai-coach-question-evidence" &&
    card.sources?.length === card.occurrenceCount
  ));

  assert.equal(buildIelts538StudyList(cards, { type: "aiCoachParaphrase", value: "" }, {}).length, 1257);
  assert.equal(buildIelts538StudyList(cards, { type: "everything", value: "" }, {}).length, 0);
  const firstStatus = patchIelts538WordStatus({}, cards[0], { status: IELTS_538_STATUS.FAMILIAR });
  assert.equal(
    buildIelts538StudyList(cards, { type: "aiCoachParaphrase", value: "" }, firstStatus).length,
    1256
  );
});

test("Next and static 538 surfaces expose the same AI-coach practice entry", async () => {
  const [pageSource, staticHtml, staticJs] = await Promise.all([
    readFile(new URL("../../../basic/page.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../../../public/ielts-538.html", import.meta.url), "utf8"),
    readFile(new URL("../../../../public/assets/ielts-538.js", import.meta.url), "utf8")
  ]);
  assert.match(pageSource, /AI教练真题替换/);
  assert.match(staticHtml, /value="aiCoachParaphrase">AI教练真题替换（1257组）/);
  assert.match(staticJs, /filter === "aiCoachParaphrase"/);
  assert.match(staticJs, /baseWords\.concat\(practiceWords\)/);
});

test("reviewed alternatives exclude misleading source candidates", async () => {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const byWord = new Map(data.words.map((word) => [word.word, word]));

  assert.deepEqual(
    byWord.get("resemble").validatedSynonyms,
    ["be similar to", "look like", "be like"]
  );
  assert.deepEqual(byWord.get("fundamental").validatedSynonyms, ["basic"]);
  assert.ok(!byWord.get("and").validatedSynonyms.includes("or"));
  assert.ok(!byWord.get("fertiliser").validatedSynonyms.includes("toxic"));
  assert.ok(!byWord.get("bacteria").validatedSynonyms.includes("virus"));
});

test("reviewed exam paraphrases are complete and not mechanical word swaps", async () => {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const overlapStopWords = new Set(
    "the a an to of in on at for by with from as is are was were be been being can may could will would should that this those these it its their and or but than into over under after before when while through only not no".split(" ")
  );
  const normalizeSentence = (value) => String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const contentWords = (value) => new Set(
    String(value || "").toLowerCase().match(/[a-z]+/g)
      ?.filter((word) => !overlapStopWords.has(word)) || []
  );
  const lexicalOverlap = (source, rewrite) => {
    const sourceWords = contentWords(source);
    const rewriteWords = contentWords(rewrite);
    const intersection = [...sourceWords].filter((word) => rewriteWords.has(word)).length;
    const union = new Set([...sourceWords, ...rewriteWords]).size;
    return intersection / Math.max(1, union);
  };
  let rawRelationCount = 0;
  let reviewedRawRelationCount = 0;

  for (const word of data.words) {
    const reviewedKeys = new Set(
      word.paraphraseExamples.map((pair) => pair.replacement.trim().toLowerCase())
    );
    rawRelationCount += word.synonyms.length;
    reviewedRawRelationCount += word.synonyms.filter(
      (candidate) => reviewedKeys.has(candidate.trim().toLowerCase())
    ).length;

    for (const pair of word.paraphraseExamples) {
      assert.match(pair.sourceSentence, /[.!?]$/);
      assert.match(pair.paraphraseSentence, /[.!?]$/);
      assert.doesNotMatch(
        `${pair.sourceSentence} ${pair.paraphraseSentence}`,
        /\b(?:I|we|you|my|our|your|can't|don't|won't|isn't|aren't)\b/i
      );

      const escapedWord = word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const mechanicalReplacement = pair.sourceSentence.replace(
        new RegExp(escapedWord, "ig"),
        pair.replacement
      );
      assert.notEqual(
        normalizeSentence(mechanicalReplacement),
        normalizeSentence(pair.paraphraseSentence),
        `${word.word} -> ${pair.replacement} must restructure the sentence`
      );
      assert.ok(
        lexicalOverlap(pair.sourceSentence, pair.paraphraseSentence) < 0.7,
        `${word.word} -> ${pair.replacement} retains too much passage wording`
      );
    }
  }

  assert.equal(rawRelationCount, 520);
  assert.equal(reviewedRawRelationCount, 217);
  assert.equal(rawRelationCount - reviewedRawRelationCount, 303);
});

test("resemble uses the reviewed passage-to-question exam rewrite", async () => {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const resemble = data.words.find((word) => word.word === "resemble");
  assert.equal(
    resemble.example,
    "The layout of the new staff training room closely resembles that of the main conference suite."
  );
  assert.equal(
    resemble.paraphraseExamples[0].paraphraseSentence,
    "The room used for employee training has a design similar to the principal meeting area."
  );
  assert.equal(resemble.readingSection, "Section 1");
  assert.deepEqual(resemble.recommendedSynonyms, ["be similar to"]);
});

test("Section labels describe each replacement rather than the source sentence", async () => {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const adjust = data.words.find((word) => word.word === "adjust");
  const sections = Object.fromEntries(
    adjust.paraphraseExamples.map((pair) => [pair.replacement, pair.readingSection])
  );

  assert.deepEqual(sections, {
    modify: "Section 2",
    change: "Section 1",
    shift: "Section 2",
    alter: "Section 2"
  });
  assert.equal(adjust.readingSection, "Section 2");
});

test("synonym cards preserve original meanings and the current 538 sense", async () => {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const trait = data.words.find((word) => word.word === "trait");
  const details = data.words.flatMap((word) => Object.values(word.synonymDetails || {}));

  assert.equal(details.length, 757);
  assert.equal(details.filter((detail) => detail.originalMeaning).length, 559);
  assert.ok(details.every((detail) => detail.contextualMeaning));
  assert.deepEqual(trait.synonymDetails.characteristic, {
    pos: "adjective / noun",
    originalMeaning: "特征，特有的",
    contextualMeaning: "特性，特征"
  });
  assert.deepEqual(trait.synonymDetails.property, {
    pos: "noun",
    originalMeaning: "财产；房产",
    contextualMeaning: "特性，特征"
  });
});

test("progress uses stable wordId and group filters keep all source rows", async () => {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const first = data.words[0];
  assert.equal(getIelts538ProgressKey(first), first.wordId);

  const statusMap = patchIelts538WordStatus({}, first, {
    status: IELTS_538_STATUS.FAMILIAR
  });
  assert.equal(buildIelts538StudyList(data.words, { type: "all", value: "" }, statusMap).length, 375);
  assert.equal(buildIelts538StudyList(data.words, { type: "everything", value: "" }, statusMap).length, 376);
  assert.equal(buildIelts538StudyList(data.words, { type: "group", value: "3:5" }, statusMap).length, 56);
  assert.equal(data.part3HighFrequency.part12ArticleCount, 224);
  assert.equal(data.part3HighFrequency.part3ArticleCount, 56);
  assert.equal(data.part3HighFrequency.articleCount, 280);
  assert.equal(data.part3HighFrequency.minimumDistinctArticles, 3);
  assert.equal(data.part3HighFrequency.usedReplacementCount, 274);
  assert.equal(data.part3HighFrequency.usedPhraseReplacementCount, 40);
  assert.equal(data.words.filter((word) => word.part3HighFrequency === true).length, 294);
  assert.equal(
    data.words.filter(
      (word) => word.part3HighFrequency !== true && (word.part3HighFrequencyReplacements || []).length > 0
    ).length,
    0
  );
  assert.ok(data.words.some((word) => (word.part3HighFrequencyReplacements || []).includes("look like")));
  assert.equal(buildIelts538StudyList(data.words, { type: "part3HighFrequency", value: "" }, {}).length, 294);
});
