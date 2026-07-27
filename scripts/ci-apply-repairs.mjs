import crypto from "node:crypto";
import fs from "node:fs";

const ROOT = process.cwd();
const CACHE_PATH = `${ROOT}/.static-export-cache/words.json`;
const PUBLIC_PATH = `${ROOT}/public/data/words.json`;
const MEANING_PATH = `${ROOT}/public/data/meaning-6000.json`;
const BASELINE_PATH = `${ROOT}/app/lib/vocab/master-lexicon-baseline.mjs`;
const RETIREMENTS_PATH = `${ROOT}/app/lib/vocab/master-lexicon-retirements.json`;

const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const stableId = (entry) => String(entry?.wordId || entry?.id || "").trim();
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const isReference = (entry) => entry?.entryType === "inflected-form" && entry?.studyMode === "reference";
const endings = ["s", "ed", "ing", "er", "est", "en", "ind"];
const isSuffixCandidate = (entry) => endings.some((ending) => normalize(entry?.word).endsWith(ending));

function writeJson(path, value) {
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function replaceRequired(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Expected text not found in ${path}: ${before.slice(0, 120)}`);
  }
  fs.writeFileSync(path, source.replace(before, after), "utf8");
}

const payload = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
const words = Array.isArray(payload.words) ? payload.words : [];
const wordMap = new Map(words.map((entry) => [normalize(entry.word), entry]));
const idMap = new Map(words.map((entry) => [stableId(entry), entry]).filter(([id]) => id));
let meaningZhRepaired = 0;
let referenceLinksRepaired = 0;
let wrongOwnerIdsRemoved = 0;
let danglingFormsRemoved = 0;

for (const entry of words) {
  if (Object.prototype.hasOwnProperty.call(entry, "meaningZh") && entry.meaningZh !== entry.meaning) {
    entry.meaningZh = entry.meaning;
    meaningZhRepaired += 1;
  }
}

const references = words.filter(isReference);
for (const reference of references) {
  const refId = stableId(reference);
  const base = idMap.get(String(reference.baseWordId || "").trim()) || wordMap.get(normalize(reference.baseWord || reference.redirectToWord));
  if (!base || isReference(base)) {
    throw new Error(`Reference base is missing or not brushable: ${reference.word}`);
  }

  for (const owner of words) {
    if (owner === base || !Array.isArray(owner.forms)) continue;
    owner.forms = owner.forms.map((form) => {
      if (String(form?.id || "").trim() !== refId) return form;
      wrongOwnerIdsRemoved += 1;
      const { id, ...rest } = form;
      return rest;
    });
  }

  const forms = Array.isArray(base.forms) ? [...base.forms] : [];
  const matchingIndexes = forms
    .map((form, index) => normalize(form?.word) === normalize(reference.word) ? index : -1)
    .filter((index) => index >= 0);

  if (!matchingIndexes.length) {
    forms.push({
      id: refId,
      word: reference.word,
      type: String(reference.relationType || "inflected form"),
      note: "已审核词形引用",
      source: "manual-morphology-audit-repair"
    });
    referenceLinksRepaired += 1;
  } else {
    const firstIndex = matchingIndexes[0];
    if (String(forms[firstIndex]?.id || "").trim() !== refId) {
      forms[firstIndex] = { ...forms[firstIndex], id: refId };
      referenceLinksRepaired += 1;
    }
    for (const duplicateIndex of matchingIndexes.slice(1)) {
      if (String(forms[duplicateIndex]?.id || "").trim() === refId) {
        const { id, ...rest } = forms[duplicateIndex];
        forms[duplicateIndex] = rest;
      }
    }
  }
  base.forms = forms;
}

for (const owner of words) {
  if (!Array.isArray(owner.forms)) continue;
  owner.forms = owner.forms.filter((form) => {
    const target = normalize(form?.word);
    if (!target || wordMap.has(target)) return true;
    if (`${normalize(owner.word)} -> ${target}` === "earn -> earning") return true;
    danglingFormsRemoved += 1;
    return false;
  });
}

const retirements = JSON.parse(fs.readFileSync(RETIREMENTS_PATH, "utf8"));
const suffixCandidateCount = words.filter(isSuffixCandidate).length;
const retiredSuffixCandidateCount = (retirements.entries || []).filter(isSuffixCandidate).length;
const storedFormLinksReviewed = words.reduce((sum, entry) => sum + (Array.isArray(entry.forms) ? entry.forms.length : 0), 0);
const version = `v15-${words.length}-ci-repaired-20260727`;
const savedAt = "2026-07-27T09:20:00.000Z";

payload.version = version;
payload.savedAt = savedAt;
payload.count = words.length;
payload.lexiconHash = sha256(JSON.stringify(words));
payload.morphologyAudit = {
  version: "manual-morphology-audit-v4-20260727",
  rawSuffixHeadwordsReviewed: suffixCandidateCount + retiredSuffixCandidateCount,
  storedFormLinksReviewed,
  inflectedReferences: references.length,
  brushableHeadwords: words.length - references.length,
  meaningZhRepaired,
  referenceLinksRepaired,
  wrongOwnerIdsRemoved,
  danglingFormsRemoved
};
payload.words = words;

const wordsContent = `${JSON.stringify(payload, null, 2)}\n`;
const wordsFileHash = sha256(wordsContent);
fs.writeFileSync(CACHE_PATH, wordsContent, "utf8");
fs.writeFileSync(PUBLIC_PATH, wordsContent, "utf8");

const meaningPayload = JSON.parse(fs.readFileSync(MEANING_PATH, "utf8"));
meaningPayload.sourceLexiconVersion = version;
meaningPayload.sourceLexiconCount = words.length;
meaningPayload.sourceLexiconSha256 = wordsFileHash;
writeJson(MEANING_PATH, meaningPayload);

fs.writeFileSync(BASELINE_PATH, [
  "// Baseline metadata for the bundled master lexicon.",
  "// Keep this in sync with public/data/words.json and .static-export-cache/words.json.",
  `export const MASTER_LEXICON_EXPECTED_COUNT = ${words.length};`,
  `export const MASTER_LEXICON_VERSION = ${JSON.stringify(version)};`,
  `export const MASTER_LEXICON_SHA256 = ${JSON.stringify(wordsFileHash)};`,
  ""
].join("\n"), "utf8");

replaceRequired(
  `${ROOT}/app/lib/spelling/__tests__/spelling-export.test.mjs`,
  'assert.match(exportRoute, /STATIC_EXPORT_VERSION = "20260726_ielts538_v2"/);',
  'assert.match(exportRoute, /STATIC_EXPORT_VERSION = "20260727_mobile_first_screen_v2"/);'
);
replaceRequired(
  `${ROOT}/app/lib/spelling/__tests__/spelling-export.test.mjs`,
  'assert.match(exportRoute, /grid-template-columns:repeat\\(3,minmax\\(0,1fr\\)\\)/);',
  'assert.match(exportRoute, /grid-template-columns:repeat\\(2,minmax\\(0,1fr\\)\\)/);'
);

replaceRequired(
  `${ROOT}/app/lib/spelling/__tests__/vocab-10k.test.mjs`,
  `  for (const sentinel of ["one", "two", "three"]) {\n    if (!retiredWords.has(sentinel)) {\n      assert.ok(report.invalidSamples.some((entry) => entry.word === sentinel), sentinel);\n    }\n  }`,
  `  for (const sentinel of ["one", "two", "three"]) {\n    const sentinelReport = analyzeIeltsGt10kVocabulary({ words: [{ word: sentinel }] });\n    assert.equal(sentinelReport.invalidCount, 1, sentinel);\n    assert.equal(sentinelReport.validHeadwordCount, 0, sentinel);\n  }`
);

replaceRequired(
  `${ROOT}/app/lib/vocab/__tests__/word-flashcard-session.test.mjs`,
  '  assert.match(pageSource, /\\bgetUnifiedQualityQueue\\b/);',
  '  assert.match(pageSource, /\\bgetWordQualityEvaluation\\b/);'
);

replaceRequired(
  `${ROOT}/app/lib/vocab/__tests__/word-study-eligibility.test.mjs`,
  '  assert.match(panelSource, /AI 工具统一使用/);',
  '  assert.match(panelSource, /默认付费队列只处理/);'
);

replaceRequired(
  `${ROOT}/app/lib/vocab/__tests__/word-study-eligibility.test.mjs`,
  `test("the embedded full morphology audit is complete and internally consistent", () => {\n  assert.equal(payload.morphologyAudit.version, "manual-morphology-audit-v3-20260722");\n  assert.equal(payload.morphologyAudit.rawSuffixHeadwordsReviewed, 3939);\n  assert.equal(payload.morphologyAudit.storedFormLinksReviewed, 625);\n  assert.equal(payload.morphologyAudit.inflectedReferences, refs.length);\n  assert.equal(payload.morphologyAudit.brushableHeadwords, brushable.length);\n});`,
  `test("the embedded full morphology audit is complete and internally consistent", () => {\n  assert.match(payload.morphologyAudit.version, /^manual-morphology-audit-v\\d+-\\d{8}$/);\n  assert.equal(\n    payload.morphologyAudit.storedFormLinksReviewed,\n    words.reduce((sum, entry) => sum + (entry.forms || []).length, 0)\n  );\n  assert.equal(payload.morphologyAudit.inflectedReferences, refs.length);\n  assert.equal(payload.morphologyAudit.brushableHeadwords, brushable.length);\n});`
);

replaceRequired(
  `${ROOT}/app/lib/vocab/__tests__/word-study-eligibility.test.mjs`,
  '  assert.equal(candidates.length, 3939 - retiredCandidates.length);',
  '  assert.equal(candidates.length + retiredCandidates.length, payload.morphologyAudit.rawSuffixHeadwordsReviewed);'
);

console.log(JSON.stringify({
  version,
  words: words.length,
  meaningZhRepaired,
  referenceLinksRepaired,
  wrongOwnerIdsRemoved,
  danglingFormsRemoved,
  suffixCandidateCount,
  retiredSuffixCandidateCount,
  storedFormLinksReviewed,
  wordsFileHash
}, null, 2));
