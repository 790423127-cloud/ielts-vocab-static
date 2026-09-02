import test from "node:test";
import assert from "node:assert/strict";

import { applyReadingGCompaction } from "../compaction.mjs";
import { prepareReadingGMasterReferenceForms } from "../master-reference-forms.mjs";
import { remapStatusToStableKeys } from "../migration.mjs";
import { getRgStatus, RG_STATUS } from "../storage.mjs";

function master(word, overrides = {}) {
  return {
    id: `word_${word}`,
    word,
    entryType: "headword",
    studyMode: "active",
    pos: "noun",
    meaning: `${word} 的释义`,
    definition: `${word} 的释义`,
    example: `A ${word} example.`,
    exampleCn: `${word} 的例句。`,
    forms: [],
    wordFamily: [],
    ...overrides
  };
}

function gWord(word, id = `rg_word_${word}`) {
  return {
    id,
    entryType: "word",
    word,
    normalizedKey: word,
    primaryMeaningZh: `${word} 的旧释义`,
    meaning: `${word} 的旧释义`,
    definition: `${word} 的旧释义`,
    example: `Old ${word} example.`,
    exampleCn: `${word} 的旧例句。`,
    pos: "noun",
    forms: [],
    wordFamily: [],
    layers: ["questionBankActive"],
    studyMode: "active",
    qualityFlags: ["question_bank_5262_expansion"]
  };
}

test("pure master reference forms are compacted into the actual headword", () => {
  const affairs = master("affairs", {
    id: "word_affairs",
    entryType: "inflected-form",
    studyMode: "reference",
    baseWord: "affair",
    baseWordId: "word_affair",
    redirectToWord: "affair",
    relationType: "plural"
  });
  const prepared = prepareReadingGMasterReferenceForms({
    items: [gWord("affairs", "old-affairs")],
    masterWords: [master("affair", { id: "word_affair" }), affairs],
    additionalWords: ["affairs"],
    compactionPayload: { rules: [] },
    createBaseEntry: (entry) => gWord(entry.word)
  });
  const compacted = applyReadingGCompaction(prepared.items, prepared.compactionPayload);

  assert.equal(prepared.addedHeadwords.includes("affair"), true);
  assert.equal(compacted.items.length, 1);
  assert.equal(compacted.items[0].word, "affair");
  assert.equal(compacted.items[0].mergedAliases.some((alias) => (
    alias.key === "affairs" && alias.id === "old-affairs"
  )), true);
  assert.equal(compacted.items[0].forms.some((form) => form.word === "affairs"), true);
});

test("a retired base word is not recreated merely because an old reference form exists", () => {
  const affairs = master("affairs", {
    id: "word_affairs",
    entryType: "inflected-form",
    studyMode: "reference",
    baseWord: "affair",
    baseWordId: "word_affair",
    redirectToWord: "affair",
    relationType: "plural"
  });
  const prepared = prepareReadingGMasterReferenceForms({
    items: [gWord("affairs", "old-affairs")],
    masterWords: [master("affair", { id: "word_affair" }), affairs],
    additionalWords: ["affairs"],
    compactionPayload: { rules: [] },
    retirementPayload: {
      entries: [{ key: "word::affair", id: "old-affair", word: "affair", entryType: "word" }]
    },
    createBaseEntry: (entry) => gWord(entry.word)
  });
  const compacted = applyReadingGCompaction(prepared.items, prepared.compactionPayload);

  assert.deepEqual(prepared.addedHeadwords, []);
  assert.deepEqual(prepared.skippedRetiredHeadwords, ["affair"]);
  assert.equal(compacted.items.length, 0);
});

test("an obsolete intermediate canonical is flattened into the real master headword", () => {
  const leed = master("leed", {
    id: "word_leed",
    entryType: "word-reference",
    studyMode: "reference",
    baseWord: "lead",
    redirectToWord: "lead",
    relationType: "spelling variant"
  });
  const prepared = prepareReadingGMasterReferenceForms({
    items: [gWord("leed", "old-leed")],
    masterWords: [master("lead"), leed],
    compactionPayload: {
      rules: [{
        canonicalKey: "leed",
        canonicalId: "old-leed",
        canonicalWord: "leed",
        aliases: [{ key: "leeds", id: "old-leeds", word: "leeds", relationType: "form" }]
      }]
    },
    createBaseEntry: (entry) => gWord(entry.word)
  });
  const compacted = applyReadingGCompaction(prepared.items, prepared.compactionPayload);
  const lead = compacted.items.find((entry) => entry.word === "lead");

  assert.ok(lead);
  assert.equal(compacted.items.some((entry) => entry.word === "leed"), false);
  assert.deepEqual(lead.mergedAliases.map((alias) => alias.key).sort(), ["leed", "leeds"]);
});

test("old standalone-form status is read and remapped to the canonical G card", () => {
  const canonical = {
    ...gWord("affair", "rg_word_affair"),
    mergedAliases: [{ key: "affairs", id: "old-affairs", word: "affairs", relationType: "form" }]
  };
  const raw = {
    progressSchemaVersion: 4,
    entries: {
      "old-affairs": { meaningStatus: "familiar", favorite: true }
    }
  };
  const remapped = remapStatusToStableKeys(raw, [canonical]);

  assert.deepEqual(remapped.entries.rg_word_affair, {
    meaningStatus: "familiar",
    phraseStatus: "unlearned",
    paraphraseStatus: "unlearned",
    status: "",
    favorite: true
  });
  assert.equal(getRgStatus(canonical, raw), RG_STATUS.FAMILIAR);
});
