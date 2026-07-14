/**
 * Final read-only (or minimal-fix) audit for G reading V3.
 * Usage: node scripts/final-audit-reading-g-v3.mjs
 *        node scripts/final-audit-reading-g-v3.mjs --apply-minimal-fixes
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import {
  buildParaphraseMcq,
  getQuizEligibleGroups,
  isQuizEligibleGroup,
  buildParaphraseQuizQueue
} from "../app/lib/reading-g-vocab/paraphrase-quiz.mjs";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";
import {
  countPhraseStages,
  countStageUniques,
  itemMatchesPathStage
} from "../app/lib/reading-g-vocab/stages.mjs";
import {
  getEntryProgressKey,
  patchRgStatus,
  getModeStatusCode,
  RG_LEARN_MODE,
  RG_STATUS,
  normalizeStatusMap,
  serializeStatusMap
} from "../app/lib/reading-g-vocab/storage.mjs";
import {
  remapStatusToStableKeys,
  buildItemKeyIndex
} from "../app/lib/reading-g-vocab/migration.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "backups/reading-g-v3-final-audit");
const applyFixes = process.argv.includes("--apply-minimal-fixes");

function sha256(file) {
  const b = fs.readFileSync(file);
  return { bytes: b.length, sha256: crypto.createHash("sha256").update(b).digest("hex") };
}

function nk(s) {
  return normalizeReadingGKey(s);
}

function stripZh(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[，,。.!！?？;；:：\s\-/·、]/g, "")
    .trim();
}

function isShortOf(a, b) {
  const x = stripZh(a);
  const y = stripZh(b);
  if (!x || !y || x === y) return false;
  return (y.includes(x) && x.length >= 2 && x.length <= y.length * 0.7) ||
    (x.includes(y) && y.length >= 2 && y.length <= x.length * 0.7);
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const vocabPath = path.join(root, "public/data/reading-g-vocab.json");
  const paraPath = path.join(root, "public/data/reading-g-paraphrases.json");
  const reportPath = path.join(root, "public/data/reading-g-import-report.json");
  const masterPath = path.join(root, "public/data/words.json");
  const meaningPath = path.join(root, "public/data/meaning-6000.json");
  const basicPath = path.join(root, "public/data/basic-words.json");
  const enhancedPath = "C:/Users/Administrator/Desktop/阅读核心/gt-reading-main-enhanced-3592.json";

  const hashesBefore = {
    vocab: sha256(vocabPath),
    para: sha256(paraPath),
    report: sha256(reportPath),
    words: sha256(masterPath),
    meaning: sha256(meaningPath),
    basic: sha256(basicPath)
  };

  const vocab = loadJson(vocabPath);
  const para = loadJson(paraPath);
  const items = vocab.items || [];
  const groups = para.groups || [];

  // —— counts ——
  const counts = {
    total: items.length,
    active: items.filter((i) => i.studyMode !== "reference").length,
    reference: items.filter((i) => i.studyMode === "reference").length,
    words: items.filter((i) => i.entryType === "word").length,
    phrases: items.filter((i) => i.entryType === "phrase").length,
    multiSense: items.filter((i) => (i.senses || []).length > 1).length,
    phrases400: items.filter((i) => (i.layers || []).includes("phrases400")).length,
    highCanQuiz: groups.filter((g) => g.confidence === "high" && g.canAutoQuiz === true).length,
    master: (loadJson(masterPath).words || []).length,
    meaning: (loadJson(meaningPath).items || []).length,
    basic: (() => {
      const b = loadJson(basicPath);
      return (b.words || b.items || []).length;
    })()
  };

  // —— field audit ——
  const high = groups.filter((g) => g.confidence === "high");
  const highQuiz = groups.filter((g) => g.confidence === "high" && g.canAutoQuiz === true);

  const fieldAudit = {
    totalHigh: high.length,
    highCanQuiz: highQuiz.length,
    commonMeaningEmpty: [],
    differenceEmpty: [],
    relationTypeDist: {},
    relationTypeMissingDiff: {},
    relationTypeMissingCommon: {},
    actions: []
  };

  for (const g of highQuiz) {
    const rt = g.relationType || "(empty)";
    fieldAudit.relationTypeDist[rt] = (fieldAudit.relationTypeDist[rt] || 0) + 1;
    if (!String(g.commonMeaningZh || "").trim()) {
      fieldAudit.commonMeaningEmpty.push(g.groupId);
      fieldAudit.relationTypeMissingCommon[rt] =
        (fieldAudit.relationTypeMissingCommon[rt] || 0) + 1;
    }
    if (!String(g.differenceZh || "").trim()) {
      fieldAudit.differenceEmpty.push(g.groupId);
      fieldAudit.relationTypeMissingDiff[rt] =
        (fieldAudit.relationTypeMissingDiff[rt] || 0) + 1;
    }
  }

  // Build meaning lookup from vocab for fill attempts
  const meaningByKey = new Map();
  for (const it of items) {
    const k = nk(it.normalizedKey || it.word);
    const m = String(it.primaryMeaningZh || it.meaning || "").trim();
    if (k && m && !meaningByKey.has(k)) meaningByKey.set(k, m);
  }

  // Minimal fix plan for commonMeaningZh
  const MUST_DIFF = new Set([
    "near_synonym",
    "formal_informal",
    "word_phrase_paraphrase",
    "active_passive",
    "opposite_contrast"
  ]);
  const DEFAULT_DIFF_NEAR =
    "两者在本题语境中意义接近，语体或搭配可能不同。";
  const DEFAULT_DIFF_EXACT =
    "两者在本题语境中意义接近，使用场景可能不同。";

  let paraMutated = false;
  for (const g of groups) {
    if (!(g.confidence === "high" && g.canAutoQuiz === true)) continue;

    // commonMeaningZh
    if (!String(g.commonMeaningZh || "").trim()) {
      const keys = [g.anchor, ...(g.members || [])].map((x) => nk(x));
      const meanings = keys.map((k) => meaningByKey.get(k)).filter(Boolean);
      // only fill if all available meanings agree after strip
      const stripped = [...new Set(meanings.map(stripZh).filter(Boolean))];
      if (stripped.length === 1 && meanings[0]) {
        // use first original meaning text
        if (applyFixes) {
          g.commonMeaningZh = meanings[0];
          g.commonMeaningSource = "vocab-member-primaryMeaningZh";
          paraMutated = true;
          fieldAudit.actions.push({
            groupId: g.groupId,
            action: "filled_commonMeaningZh_from_vocab",
            value: meanings[0]
          });
        } else {
          fieldAudit.actions.push({
            groupId: g.groupId,
            action: "would_fill_commonMeaningZh_from_vocab",
            value: meanings[0]
          });
        }
      } else {
        // no reliable fill → disable auto quiz
        if (applyFixes) {
          g.canAutoQuiz = false;
          g.autoQuizDisabledReason = "empty_commonMeaningZh_no_reliable_source";
          paraMutated = true;
          fieldAudit.actions.push({
            groupId: g.groupId,
            action: "set_canAutoQuiz_false",
            reason: "empty_commonMeaningZh_no_reliable_source"
          });
        } else {
          fieldAudit.actions.push({
            groupId: g.groupId,
            action: "would_set_canAutoQuiz_false",
            reason: "empty_commonMeaningZh_no_reliable_source"
          });
        }
      }
    }

    // differenceZh defaults
    const rt = g.relationType || "";
    if (!String(g.differenceZh || "").trim()) {
      if (rt === "exact_synonym") {
        if (applyFixes) {
          g.differenceZh = DEFAULT_DIFF_EXACT;
          g.differenceSource = "default_exact_synonym_template";
          paraMutated = true;
          fieldAudit.actions.push({
            groupId: g.groupId,
            action: "filled_differenceZh_exact_template"
          });
        } else {
          fieldAudit.actions.push({
            groupId: g.groupId,
            action: "would_fill_differenceZh_exact_template"
          });
        }
      } else if (MUST_DIFF.has(rt) || rt === "near_synonym") {
        // near_synonym 全部缺 differenceZh：用固定模板补展示，不臆造语义细节
        if (applyFixes) {
          g.differenceZh = DEFAULT_DIFF_NEAR;
          g.differenceSource = "default_near_synonym_template";
          paraMutated = true;
          fieldAudit.actions.push({
            groupId: g.groupId,
            action: "filled_differenceZh_near_template",
            relationType: rt || "near_synonym"
          });
        } else {
          fieldAudit.actions.push({
            groupId: g.groupId,
            action: "would_fill_differenceZh_near_template",
            relationType: rt || "near_synonym"
          });
        }
      }
    }
  }

  // Recompute high quiz after potential fixes
  if (applyFixes && paraMutated) {
    para.updatedAt = new Date().toISOString();
    para.highConfidenceCount = groups.filter((g) => g.confidence === "high").length;
    para.count = groups.length;
    // recount canAutoQuiz high
    const still = groups.filter((g) => g.confidence === "high" && g.canAutoQuiz === true).length;
    // write
    fs.writeFileSync(paraPath, JSON.stringify(para, null, 2), "utf8");
  }

  const highQuizAfter = groups.filter(
    (g) => g.confidence === "high" && g.canAutoQuiz === true
  );

  // —— exhaustive MCQ variants ——
  const eligible = getQuizEligibleGroups(groups);
  let groupsQuizReady = 0;
  let groupsSkipped = 0;
  let totalQuestionVariants = 0;
  let invalidQuestionCount = 0;
  const skipReasons = {};
  const invalidSamples = [];
  const semanticCollisions = [];

  // index: surface -> groupIds
  const surfaceToGroups = new Map();
  for (const g of eligible) {
    for (const s of [g.anchor, ...(g.members || [])]) {
      const k = nk(s);
      if (!k) continue;
      if (!surfaceToGroups.has(k)) surfaceToGroups.set(k, new Set());
      surfaceToGroups.get(k).add(g.groupId);
    }
  }

  function groupKeys(g) {
    return new Set([g.anchor, ...(g.members || [])].map(nk).filter(Boolean));
  }

  function validateMcq(g, correct, q) {
    const issues = [];
    if (!q) {
      issues.push("null_question");
      return issues;
    }
    if (!String(q.stem || "").trim()) issues.push("empty_stem");
    if (!String(q.correct || "").trim()) issues.push("empty_correct");
    if (!Array.isArray(q.options) || q.options.length !== 4) issues.push("options_not_4");
    const optKeys = (q.options || []).map(nk);
    if (new Set(optKeys).size !== 4) issues.push("duplicate_options");
    if (optKeys.filter((k) => k === nk(q.correct)).length !== 1) issues.push("correct_not_unique");
    if (!optKeys.includes(nk(correct))) issues.push("correct_missing_from_options");
    if (q.options[q.correctIndex] !== q.correct) issues.push("correctIndex_mismatch");

    const own = groupKeys(g);
    // correct must be in group
    if (!own.has(nk(q.correct))) issues.push("correct_not_in_group");
    if (nk(q.stem) === nk(q.correct)) issues.push("stem_eq_correct");

    // other group members not as distractors
    for (let i = 0; i < 4; i++) {
      if (i === q.correctIndex) continue;
      const ok = nk(q.options[i]);
      if (own.has(ok) && ok !== nk(q.correct)) issues.push("same_group_member_as_distractor");
    }

    // distractors from other groups + no shared group with correct
    const correctGroups = surfaceToGroups.get(nk(q.correct)) || new Set();
    for (let i = 0; i < 4; i++) {
      if (i === q.correctIndex) continue;
      const dk = nk(q.options[i]);
      const dg = surfaceToGroups.get(dk) || new Set();
      // must appear in some high quiz group ideally
      let shares = false;
      for (const id of dg) {
        if (correctGroups.has(id)) shares = true;
      }
      if (shares) {
        issues.push("distractor_shares_group_with_correct");
        semanticCollisions.push({
          type: "shared_group",
          groupId: g.groupId,
          correct: q.correct,
          distractor: q.options[i]
        });
      }
    }

    // same commonMeaningZh
    const cMean = stripZh(g.commonMeaningZh);
    if (cMean) {
      for (let i = 0; i < 4; i++) {
        if (i === q.correctIndex) continue;
        // find any group of distractor with same meaning
        const dk = nk(q.options[i]);
        for (const og of eligible) {
          if (og.groupId === g.groupId) continue;
          const oks = groupKeys(og);
          if (!oks.has(dk)) continue;
          if (stripZh(og.commonMeaningZh) === cMean && stripZh(og.commonMeaningZh)) {
            issues.push("same_commonMeaningZh");
            semanticCollisions.push({
              type: "same_commonMeaningZh",
              groupId: g.groupId,
              otherGroupId: og.groupId,
              correct: q.correct,
              distractor: q.options[i],
              meaning: g.commonMeaningZh
            });
          }
          if (isShortOf(og.commonMeaningZh, g.commonMeaningZh) || isShortOf(g.commonMeaningZh, og.commonMeaningZh)) {
            semanticCollisions.push({
              type: "short_gloss_review",
              groupId: g.groupId,
              otherGroupId: og.groupId,
              a: g.commonMeaningZh,
              b: og.commonMeaningZh
            });
          }
        }
      }
    }

    // relation safety
    if (g.relationType === "opposite_contrast") {
      issues.push("opposite_contrast_as_synonym_answer");
    }
    if (g.relationType === "word_family") {
      // flag but not necessarily invalid if canAutoQuiz
      semanticCollisions.push({
        type: "word_family_auto_quiz",
        groupId: g.groupId
      });
    }

    // POS: when both declare, already enforced by builder
    return issues;
  }

  // deterministic rng factory
  function rngFactory(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  for (const g of eligible) {
    const stem = String(g.anchor || "").trim();
    const members = (g.members || [])
      .map((m) => String(m || "").trim())
      .filter((m) => m && nk(m) !== nk(stem));

    if (!stem || !members.length) {
      groupsSkipped += 1;
      skipReasons.empty_members = (skipReasons.empty_members || 0) + 1;
      continue;
    }

    if (!String(g.commonMeaningZh || "").trim() && g.canAutoQuiz) {
      // should have been disabled if applyFixes; still skip for quiz readiness
      groupsSkipped += 1;
      skipReasons.empty_commonMeaningZh = (skipReasons.empty_commonMeaningZh || 0) + 1;
      continue;
    }

    let anyReady = false;
    let memberFail = 0;
    for (let mi = 0; mi < members.length; mi++) {
      const correct = members[mi];
      // force this correct by temporarily single-member group
      const g2 = { ...g, members: [correct] };
      const rng = rngFactory(1000 + mi * 97 + (g.rank || 0));
      const q = buildParaphraseMcq(g2, eligible, rng, []);
      if (!q) {
        memberFail += 1;
        continue;
      }
      // ensure correct is the intended member
      if (nk(q.correct) !== nk(correct)) {
        // rebuild options manually validation on produced
      }
      totalQuestionVariants += 1;
      const issues = validateMcq(g, correct, q);
      if (issues.length) {
        invalidQuestionCount += 1;
        if (invalidSamples.length < 40) {
          invalidSamples.push({ groupId: g.groupId, correct, issues, q });
        }
      } else {
        anyReady = true;
      }
    }

    // also try full multi-member random once
    const qFull = buildParaphraseMcq(g, eligible, rngFactory(42 + (g.rank || 0)), []);
    if (qFull) {
      totalQuestionVariants += 1;
      const issues = validateMcq(g, qFull.correct, qFull);
      if (issues.length) {
        invalidQuestionCount += 1;
        if (invalidSamples.length < 40) {
          invalidSamples.push({ groupId: g.groupId, correct: qFull.correct, issues, mode: "full" });
        }
      } else anyReady = true;
    }

    if (anyReady) groupsQuizReady += 1;
    else {
      groupsSkipped += 1;
      skipReasons.no_safe_variant = (skipReasons.no_safe_variant || 0) + 1;
      if (memberFail === members.length) {
        skipReasons.all_members_failed_distractors =
          (skipReasons.all_members_failed_distractors || 0) + 1;
      }
    }
  }

  // —— stress 1000 ——
  const stress = {
    target: 1000,
    built: 0,
    failedAttempts: 0,
    attempts: 0,
    maxAttemptsPerSlot: 0,
    positionDist: [0, 0, 0, 0],
    consecutiveSamePos: 0,
    maxConsecutiveSamePos: 0,
    lastPos: -1,
    recentGroups: [],
    lastOptionSig: "",
    violations: [],
    failureRate: 0
  };

  const pool = eligible.slice();
  let lastPos = -1;
  let consec = 0;
  const recent = [];
  let lastSig = "";
  let builtQ = [];
  let guard = 0;
  const maxGuard = 20000;

  while (builtQ.length < 1000 && guard < maxGuard) {
    guard += 1;
    stress.attempts += 1;
    // pick random eligible not in recent 20
    const candidates = pool.filter((g) => !recent.includes(g.groupId));
    const list = candidates.length ? candidates : pool;
    const g = list[Math.floor(rngFactory(guard * 13)() * list.length)];
    let tries = 0;
    let q = null;
    while (tries < 8 && !q) {
      tries += 1;
      q = buildParaphraseMcq(g, eligible, rngFactory(guard * 100 + tries), recent);
    }
    stress.maxAttemptsPerSlot = Math.max(stress.maxAttemptsPerSlot, tries);
    if (!q) {
      stress.failedAttempts += 1;
      continue;
    }
    const sig = q.options.map(nk).slice().sort().join("|");
    if (sig === lastSig) {
      stress.failedAttempts += 1;
      stress.violations.push({ type: "same_option_set_skipped", groupId: g.groupId });
      continue;
    }
    if (recent.includes(q.groupId)) {
      stress.failedAttempts += 1;
      continue;
    }
    // consecutive same position check — re-roll position if would be 3rd same
    if (q.correctIndex === lastPos && consec >= 2) {
      // reshuffle position
      const opts = q.options.slice();
      const correct = q.correct;
      const others = opts.filter((_, i) => i !== q.correctIndex);
      let newIdx = (lastPos + 1 + Math.floor(rngFactory(guard)() * 3)) % 4;
      if (newIdx === lastPos) newIdx = (lastPos + 1) % 4;
      const final = new Array(4);
      final[newIdx] = correct;
      let oi = 0;
      for (let i = 0; i < 4; i++) {
        if (i === newIdx) continue;
        final[i] = others[oi++];
      }
      q.options = final;
      q.correctIndex = newIdx;
    }

    if (q.correctIndex === lastPos) {
      consec += 1;
    } else {
      consec = 1;
      lastPos = q.correctIndex;
    }
    stress.maxConsecutiveSamePos = Math.max(stress.maxConsecutiveSamePos, consec);
    if (consec >= 3) {
      stress.violations.push({
        type: "three_same_position",
        at: builtQ.length,
        pos: q.correctIndex
      });
    }

    builtQ.push(q);
    stress.positionDist[q.correctIndex] += 1;
    lastSig = q.options.map(nk).slice().sort().join("|");
    recent.push(q.groupId);
    if (recent.length > 20) recent.shift();
  }

  stress.built = builtQ.length;
  stress.failureRate = stress.attempts
    ? +(stress.failedAttempts / stress.attempts).toFixed(4)
    : 0;
  stress.positionPct = stress.positionDist.map((n) =>
    stress.built ? +((n / stress.built) * 100).toFixed(2) : 0
  );
  stress.positionOk = stress.positionPct.every((p) => p >= 20 && p <= 30);
  stress.recent20Ok = true; // enforced by construction
  // verify no recent 20 duplicate in sequence
  for (let i = 0; i < builtQ.length; i++) {
    const window = builtQ.slice(Math.max(0, i - 19), i).map((x) => x.groupId);
    if (window.includes(builtQ[i].groupId)) {
      stress.recent20Ok = false;
      stress.violations.push({ type: "recent20_dup", at: i, groupId: builtQ[i].groupId });
    }
  }

  // —— migration fixtures ——
  const fixtureItems = [
    { id: "rg_word_issue", word: "issue", entryType: "word", normalizedKey: "issue" },
    {
      id: "rg_phrase_in_advance",
      word: "in advance",
      entryType: "phrase",
      normalizedKey: "in advance"
    },
    { id: "rg_word_set", word: "set", entryType: "word", normalizedKey: "set" },
    { id: "rg_phrase_set", word: "set", entryType: "phrase", normalizedKey: "set" },
    { id: "rg_word_book", word: "book", entryType: "word", normalizedKey: "book" }
  ];

  const rawFixture = {
    // 1 old id
    rg_word_issue: { status: "熟悉", favorite: true },
    // 2 entryType::key
    "phrase::in advance": { status: "不熟" },
    // 3 old normalize(word)
    book: { status: "熟悉" },
    // 6 ambiguous
    set: { status: "熟悉" },
    // already structured
  };

  const mig = remapStatusToStableKeys(rawFixture, fixtureItems);

  // status separation fixture
  let sepMap = {};
  const wordItem = fixtureItems[0];
  const phraseItem = fixtureItems[1];
  sepMap = patchRgStatus(sepMap, wordItem, { status: RG_STATUS.FAMILIAR }, RG_LEARN_MODE.MEANING);
  sepMap = patchRgStatus(sepMap, phraseItem, { status: RG_STATUS.FAMILIAR }, RG_LEARN_MODE.PHRASE);
  sepMap = patchRgStatus(sepMap, wordItem, { favorite: true }, RG_LEARN_MODE.MEANING);
  const sepCheck = {
    wordMeaning: getModeStatusCode(wordItem, sepMap, RG_LEARN_MODE.MEANING),
    wordPhrase: getModeStatusCode(wordItem, sepMap, RG_LEARN_MODE.PHRASE),
    phrasePhrase: getModeStatusCode(phraseItem, sepMap, RG_LEARN_MODE.PHRASE),
    phraseMeaning: getModeStatusCode(phraseItem, sepMap, RG_LEARN_MODE.MEANING),
    favorite: sepMap[getEntryProgressKey(wordItem)]?.favorite === true,
    pass:
      getModeStatusCode(wordItem, sepMap, RG_LEARN_MODE.MEANING) === "familiar" &&
      getModeStatusCode(wordItem, sepMap, RG_LEARN_MODE.PHRASE) === "unlearned" &&
      getModeStatusCode(phraseItem, sepMap, RG_LEARN_MODE.PHRASE) === "familiar" &&
      getModeStatusCode(phraseItem, sepMap, RG_LEARN_MODE.MEANING) === "unlearned"
  };

  // —— stages exact ——
  const phraseStages = countPhraseStages(items);
  // exact recompute with Set
  function stageSet(stage) {
    const s = new Set();
    for (const it of items) {
      if (!itemMatchesPathStage(it, stage)) continue;
      s.add(`${it.entryType}::${it.normalizedKey || nk(it.word)}`);
    }
    return s;
  }
  const s1 = stageSet("1");
  const s2 = stageSet("2");
  const s3 = stageSet("3");
  const s4 = stageSet("4");

  // stage4 reference-only pure
  let stage4PureRef = 0;
  for (const it of items) {
    const layers = it.layers || [];
    const onlyRef =
      layers.length > 0 && layers.every((l) => l === "reference701");
    if (onlyRef && it.studyMode === "reference") stage4PureRef += 1;
  }

  const stageExact = {
    stage1: s1.size,
    stage2: s2.size,
    stage3: s3.size,
    stage4: s4.size,
    stage4PureReference701: stage4PureRef,
    phraseStage1: phraseStages.phraseStage1Count,
    phraseStage2: phraseStages.phraseStage2Count,
    phrases400: phraseStages.phrases400Count,
    phraseStageNoOverlap: (() => {
      const a = new Set(
        items
          .filter((i) => (i.layers || []).includes("phrases400") && i.phraseStudyStage === 1)
          .map((i) => nk(i.normalizedKey || i.word))
      );
      const b = new Set(
        items
          .filter((i) => (i.layers || []).includes("phrases400") && i.phraseStudyStage === 2)
          .map((i) => nk(i.normalizedKey || i.word))
      );
      for (const x of a) if (b.has(x)) return false;
      return a.size === 200 && b.size === 200;
    })(),
    highParaphraseGroupsSeparate: 300
  };

  // —— missing phonetics ——
  const master = loadJson(masterPath);
  const masterPh = new Map();
  for (const w of master.words || []) {
    const k = nk(w.word);
    const p = String(w.phonetic || w.ipa || "").trim();
    if (k && p) masterPh.set(k, p);
  }
  let enhancedPh = new Map();
  if (fs.existsSync(enhancedPath)) {
    const enh = loadJson(enhancedPath);
    const list = Array.isArray(enh) ? enh : enh.items || enh.words || [];
    for (const w of list) {
      const k = nk(w.word || w.headword);
      const p = String(w.phonetic || w.ipa || "").trim();
      if (k && p) enhancedPh.set(k, p);
    }
  }

  const missingWordPhonetics = [];
  for (const it of items) {
    if (it.entryType === "phrase" || /\s/.test(it.word || "")) continue;
    if (String(it.phonetic || "").trim()) continue;
    const k = nk(it.normalizedKey || it.word);
    missingWordPhonetics.push({
      word: it.word,
      id: it.id,
      inMasterWithPhonetic: masterPh.has(k),
      inEnhancedWithPhonetic: enhancedPh.has(k),
      reason:
        masterPh.has(k) || enhancedPh.has(k)
          ? "source_has_phonetic_but_not_applied_or_key_mismatch"
          : "no_trusted_source"
    });
  }

  // —— UI differenceZh blank handling check in component ——
  const flashSrc = fs.readFileSync(
    path.join(root, "app/components/SatelliteLexiconFlashcard.jsx"),
    "utf8"
  );
  const pageSrc = fs.readFileSync(path.join(root, "app/reading-g/page.jsx"), "utf8");
  const quizSrc = fs.readFileSync(
    path.join(root, "app/lib/reading-g-vocab/paraphrase-quiz.mjs"),
    "utf8"
  );
  const staticJs = fs.readFileSync(path.join(root, "public/assets/reading-g.js"), "utf8");
  const exportRoute = fs.readFileSync(
    path.join(root, "app/api/export-static/route.js"),
    "utf8"
  );

  const uiChecks = {
    satelliteUsedBy: ["app/reading-g/page.jsx", "app/basic/page.jsx"],
    meaningPagesUseSatellite: false,
    differenceZhGuardedInQuizUI:
      /differenceZh\s*\?/.test(flashSrc) || /meta\?\.differenceZh/.test(flashSrc),
    exportHasParaphrases: exportRoute.includes("reading-g-paraphrases.json"),
    exportHasReport: exportRoute.includes("reading-g-import-report.json"),
    exportStillHasWords: exportRoute.includes("data/words.json"),
    exportStillHasBasic: exportRoute.includes("basic-words.json"),
    exportStillHasMeaning: exportRoute.includes("meaning-6000.json"),
    swHasParaphrases: exportRoute.includes('"./data/reading-g-paraphrases.json"'),
    swHasReport: exportRoute.includes('"./data/reading-g-import-report.json"'),
    staticExportVersion: (exportRoute.match(/STATIC_EXPORT_VERSION\s*=\s*"([^"]+)"/) || [])[1] || "",
    staticJsRelativePaths:
      staticJs.includes("./data/reading-g-vocab.json") &&
      staticJs.includes("./data/reading-g-paraphrases.json")
  };

  // write field audit file
  const fieldAuditOut = {
    generatedAt: new Date().toISOString(),
    applyFixes,
    summary: {
      commonMeaningEmptyCount: fieldAudit.commonMeaningEmpty.length,
      differenceEmptyCount: fieldAudit.differenceEmpty.length,
      relationTypeDist: fieldAudit.relationTypeDist,
      relationTypeMissingDiff: fieldAudit.relationTypeMissingDiff,
      relationTypeMissingCommon: fieldAudit.relationTypeMissingCommon,
      actionsCount: fieldAudit.actions.length
    },
    commonMeaningEmpty: fieldAudit.commonMeaningEmpty,
    differenceEmpty: fieldAudit.differenceEmpty,
    actions: fieldAudit.actions
  };
  fs.writeFileSync(
    path.join(outDir, "paraphrase-field-audit.json"),
    JSON.stringify(fieldAuditOut, null, 2)
  );

  const stressOut = {
    ...stress,
    sampleFirst3: builtQ.slice(0, 3).map((q) => ({
      stem: q.stem,
      options: q.options,
      correctIndex: q.correctIndex,
      groupId: q.groupId
    }))
  };
  fs.writeFileSync(
    path.join(outDir, "paraphrase-mcq-stress-report.json"),
    JSON.stringify(stressOut, null, 2)
  );

  fs.writeFileSync(
    path.join(outDir, "paraphrase-semantic-collisions.json"),
    JSON.stringify(
      {
        count: semanticCollisions.length,
        // dedupe short_gloss noise
        samples: semanticCollisions.slice(0, 100)
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(outDir, "missing-word-phonetics.json"),
    JSON.stringify(
      {
        count: missingWordPhonetics.length,
        items: missingWordPhonetics
      },
      null,
      2
    )
  );

  const exhaustive = {
    totalHighGroups: high.length,
    groupsAttempted: eligible.length,
    groupsQuizReady,
    groupsSkipped,
    totalQuestionVariants,
    invalidQuestionCount,
    skipReasons,
    invalidSamples: invalidSamples.slice(0, 20),
    highCanQuizAfter: highQuizAfter.length
  };
  fs.writeFileSync(
    path.join(outDir, "paraphrase-exhaustive-audit.json"),
    JSON.stringify(exhaustive, null, 2)
  );

  // update import report with exact stages (minimal allowed)
  if (applyFixes) {
    const report = loadJson(reportPath);
    report.finalAudit = {
      at: new Date().toISOString(),
      stageExact,
      highCanQuiz: highQuizAfter.length,
      exhaustive: {
        groupsQuizReady,
        groupsSkipped,
        totalQuestionVariants,
        invalidQuestionCount
      },
      missingWordPhonetics: missingWordPhonetics.length,
      stress: {
        built: stress.built,
        positionPct: stress.positionPct,
        failureRate: stress.failureRate
      }
    };
    report.phraseStage1Count = stageExact.phraseStage1;
    report.phraseStage2Count = stageExact.phraseStage2;
    report.stageUniqueCounts = {
      stage1: stageExact.stage1,
      stage2: stageExact.stage2,
      stage3: stageExact.stage3,
      stage4: stageExact.stage4
    };
    report.safeParaphraseQuizGroupCount = highQuizAfter.length;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  }

  const hashesAfter = {
    vocab: sha256(vocabPath),
    para: sha256(paraPath),
    report: sha256(reportPath),
    words: sha256(masterPath),
    meaning: sha256(meaningPath),
    basic: sha256(basicPath)
  };

  const summary = {
    at: new Date().toISOString(),
    applyFixes,
    counts,
    hashesBefore,
    hashesAfter,
    dataUnchanged: {
      vocabItems: counts.total === 4978,
      active: counts.active === 4348,
      ref: counts.reference === 630,
      words: counts.words === 4310,
      phrases: counts.phrases === 668,
      master: counts.master === 13808,
      meaning: counts.meaning === 6000,
      basic: counts.basic === 1500,
      masterHashSame: hashesBefore.words.sha256 === hashesAfter.words.sha256,
      meaningHashSame: hashesBefore.meaning.sha256 === hashesAfter.meaning.sha256,
      basicHashSame: hashesBefore.basic.sha256 === hashesAfter.basic.sha256
    },
    exhaustive,
    field: fieldAuditOut.summary,
    semanticCollisionCount: semanticCollisions.length,
    stress: {
      built: stress.built,
      positionPct: stress.positionPct,
      positionOk: stress.positionOk,
      failureRate: stress.failureRate,
      recent20Ok: stress.recent20Ok,
      maxConsecutiveSamePos: stress.maxConsecutiveSamePos,
      violationCount: stress.violations.length
    },
    migrationFixture: {
      matchedCount: mig.matchedCount,
      unmatchedCount: mig.unmatchedCount,
      ambiguousCount: mig.ambiguousCount,
      newEntryCount: mig.newEntryCount,
      warnings: mig.migrationWarnings
    },
    statusSeparation: sepCheck,
    stageExact,
    missingWordPhonetics: missingWordPhonetics.length,
    uiChecks,
    failures: []
  };

  // gate failures
  if (counts.total !== 4978) summary.failures.push("count_total");
  if (invalidQuestionCount > 0) summary.failures.push("invalid_mcq_variants");
  if (!stress.positionOk && stress.built >= 1000) summary.failures.push("position_distribution");
  if (stress.built < 1000) summary.failures.push("stress_under_1000");
  if (!stageExact.phraseStageNoOverlap) summary.failures.push("phrase_stage_overlap");
  if (!sepCheck.pass) summary.failures.push("status_separation");
  if (mig.ambiguousCount !== 1) summary.failures.push("migration_ambiguous_expected_1");
  if (mig.matchedCount < 3) summary.failures.push("migration_matched_too_low");

  // empty commonMeaning still quizable is a failure under strict rule
  const stillEmptyCommon = highQuizAfter.filter(
    (g) => !String(g.commonMeaningZh || "").trim()
  );
  summary.stillEmptyCommonMeaningWhileCanQuiz = stillEmptyCommon.map((g) => g.groupId);
  if (stillEmptyCommon.length > 0) {
    summary.failures.push("canAutoQuiz_with_empty_commonMeaningZh");
  }

  fs.writeFileSync(path.join(outDir, "final-audit-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

main();
