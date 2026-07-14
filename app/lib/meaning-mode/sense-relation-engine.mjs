// sense-relation-engine.mjs v10 -- Core concept-axis/value relation engine.
// Stage 10: broad-axis degradation, hard blacklist, learnerDistinctionZh requirement.

import { SENSE_RELATION_CATALOG } from "./sense-relation-catalog.generated.mjs";
import { checkSensePairContrast, checkWordPairContrast } from "./sense-pair-contrast.mjs";

const byWordId = new Map();
const byAxis = new Map();
const byFamily = new Map();
const axisSizes = new Map();

for (const entry of SENSE_RELATION_CATALOG) {
  byWordId.set(entry.wordId, entry);
  if (!byAxis.has(entry.conceptAxis)) byAxis.set(entry.conceptAxis, []);
  byAxis.get(entry.conceptAxis).push(entry);
  if (!byFamily.has(entry.relationFamily)) byFamily.set(entry.relationFamily, []);
  byFamily.get(entry.relationFamily).push(entry);
  axisSizes.set(entry.conceptAxis, (axisSizes.get(entry.conceptAxis) || 0) + 1);
}

export const RELATION = Object.freeze({
  SAME_AXIS_DIFFERENT_VALUE: "same-axis-different-value",
  ADJACENT_CONTRAST: "adjacent-contrast",
  SIBLING_CONCEPT: "sibling-concept",
  CLOSE_SYNONYM_WITH_CONTRAST: "close-synonym-with-contrast",
  UNRELATED: "unrelated",
  EXACT_SAME_SENSE: "exact-same-sense",
  SAME_BROAD_DOMAIN_ONLY: "same-broad-domain-only",
  RANDOM_SAME_POS: "random-same-pos"
});

// Broad axes: >150 entries is too vague for same-axis-different-value
const BROAD_AXIS_THRESHOLD = 150;
const BROAD_AXES = new Set();
for (const [axis, size] of axisSizes) {
  if (size > BROAD_AXIS_THRESHOLD) BROAD_AXES.add(axis);
}

// Hard blacklist: wordId pairs that must NEVER be distractors for each other
const HARD_BLACKLIST = new Set([
  'word_f7866b0e49ec||word_e8bd3ac56619',
  'word_e8bd3ac56619||word_f7866b0e49ec',
]);

// Experience must never pair with satisfaction/anxiety/happiness
const EXP_BLACKLIST = new Set(['satisfaction', 'anxiety', 'happiness']);

const ALLOWED = new Set([RELATION.SAME_AXIS_DIFFERENT_VALUE, RELATION.ADJACENT_CONTRAST,
  RELATION.SIBLING_CONCEPT, RELATION.CLOSE_SYNONYM_WITH_CONTRAST]);
const FORBIDDEN = new Set([RELATION.EXACT_SAME_SENSE, RELATION.UNRELATED,
  RELATION.RANDOM_SAME_POS, RELATION.SAME_BROAD_DOMAIN_ONLY]);

export const QUALITY_CLASS = Object.freeze({
  P1: "P1",
  P2: "P2",
  P3: "P3",
  P4: "P4"
});

const FORBIDDEN_TEMPLATE_REASONS = [
  "两者属于同一语义领域",
  "意思相近但不完全相同",
  "目标词更具体，候选词更一般"
];

const HARD_BLACKLIST_WORDS = new Map([
  ["commitment", new Set(["culture", "relation", "independence"])],
  ["experience", new Set(["satisfaction", "anxiety", "happiness"])],
  ["limited", new Set(["early", "extra", "all", "quick", "rapid", "fast"])],
  ["aggressive", new Set(["meaningful", "used", "asian"])]
]);

export function getRelationEntry(wordId) { return byWordId.get(wordId) || null; }
export function getSameAxisEntries(axis) { return byAxis.get(axis) || []; }
export function getSameFamilyEntries(family) { return byFamily.get(family) || []; }
function isBroadAxis(axis) { return BROAD_AXES.has(axis); }

function isHardBlacklistedWordPair(targetWord, candidateWord) {
  const t = String(targetWord || "").toLowerCase();
  const c = String(candidateWord || "").toLowerCase();
  return (HARD_BLACKLIST_WORDS.get(t) || new Set()).has(c)
    || (HARD_BLACKLIST_WORDS.get(c) || new Set()).has(t);
}

function cleanText(value) {
  return String(value || "").trim();
}

function hasForbiddenTemplate(value) {
  const text = cleanText(value);
  return FORBIDDEN_TEMPLATE_REASONS.some(t => text.includes(t));
}

function splitGlossParts(value) {
  return cleanText(value)
    .split(/[;；、,，/]+/g)
    .map(p => p.trim())
    .filter(Boolean);
}

function getEvidenceFields(entry, prefix) {
  const fields = [];
  if (entry.quizMeaningZh) fields.push(prefix + ".quizMeaningZh");
  if (entry.meaningDetailedZh) fields.push(prefix + ".meaningDetailedZh");
  if (Array.isArray(entry.sourceEvidence) && entry.sourceEvidence.length > 0) fields.push(prefix + ".sourceEvidence");
  if (entry.conceptAxis) fields.push(prefix + ".conceptAxis");
  if (entry.conceptValue) fields.push(prefix + ".conceptValue");
  if (entry.relationFamily) fields.push(prefix + ".relationFamily");
  return fields;
}

function buildDefinitionDistinction(t, c) {
  const tGloss = cleanText(t.quizMeaningZh || t.meaningDetailedZh);
  const cGloss = cleanText(c.quizMeaningZh || c.meaningDetailedZh);
  if (!tGloss || !cGloss || tGloss === cGloss) return null;
  const tParts = splitGlossParts(tGloss);
  const cParts = splitGlossParts(cGloss);
  if (tParts.length === 0 || cParts.length === 0) return null;
  const tCore = tParts[0];
  const cCore = cParts[0];
  if (!tCore || !cCore || tCore === cCore) return null;
  const text = (t.word || "target") + " 表示「" + tCore + "」；"
    + (c.word || "candidate") + " 表示「" + cCore + "」。本题考前者的义项，不考后者。";
  return hasForbiddenTemplate(text) ? null : text;
}

function qualityPayload({
  relation, reason, qualityClass, qualityTier, learnerDistinctionZh,
  confidence, relationEvidence, usable, relationType
}) {
  const safeReason = cleanText(reason);
  const safeDistinction = cleanText(learnerDistinctionZh);
  const hasTrace = relationEvidence && relationEvidence.kind
    && Array.isArray(relationEvidence.sourceFields)
    && relationEvidence.sourceFields.length > 0;
  const realUsable = usable === true
    && (qualityClass === QUALITY_CLASS.P1 || qualityClass === QUALITY_CLASS.P2)
    && (qualityTier === "A" || qualityTier === "B")
    && safeReason
    && safeReason !== relation
    && safeDistinction
    && !hasForbiddenTemplate(safeDistinction)
    && hasTrace;
  return {
    relation,
    relationType: relationType || relation,
    reason: safeReason || "no-verifiable-relation-reason",
    qualityClass,
    qualityTier,
    learnerDistinctionZh: safeDistinction || null,
    confidence: confidence || (qualityTier === "A" ? "high" : qualityTier === "B" ? "medium" : "low"),
    relationEvidence: hasTrace ? relationEvidence : null,
    usable: realUsable
  };
}

function findWordPairContrast(t, c) {
  if (!t || !c) return { hasContrast: false };
  const byStableId = checkWordPairContrast(t.wordId, c.wordId);
  if (byStableId.hasContrast) return byStableId;
  // Early curated rows used headwords as identifiers. Preserve those audited
  // pairs while newer rows continue to use stable master-lexicon wordIds.
  return checkWordPairContrast(t.word, c.word);
}

function classifyQuality(t, c, base) {
  if (!t || !c) {
    return qualityPayload({
      relation: base.relation,
      reason: base.reason,
      qualityClass: QUALITY_CLASS.P4,
      qualityTier: "BAD",
      learnerDistinctionZh: null,
      confidence: "low",
      relationEvidence: null,
      usable: false
    });
  }

  const contrast = findWordPairContrast(t, c);
  if (contrast.hasContrast && contrast.entry && contrast.entry.allowInSameQuestion) {
    const distinction = cleanText(contrast.entry.learnerDistinctionZh);
    return qualityPayload({
      relation: base.relation,
      reason: "contrast catalog pair " + contrast.entry.pairId + " on " + contrast.entry.contrastDimension,
      qualityClass: QUALITY_CLASS.P1,
      qualityTier: "A",
      learnerDistinctionZh: distinction,
      confidence: contrast.entry.confidence || "high",
      relationEvidence: {
        kind: "catalog",
        sourceFields: ["sense-pair-contrast.pairId", "sense-pair-contrast.contrastDimension", "sense-pair-contrast.learnerDistinctionZh"]
      },
      usable: true
    });
  }

  if (FORBIDDEN.has(base.relation) || base.qualityTier === "BAD" || base.qualityTier === "C" || base.confidence === "low") {
    return qualityPayload({
      relation: base.relation,
      reason: base.reason,
      qualityClass: QUALITY_CLASS.P4,
      qualityTier: "BAD",
      learnerDistinctionZh: null,
      confidence: "low",
      relationEvidence: null,
      usable: false
    });
  }

  const distinction = buildDefinitionDistinction(t, c);
  if (distinction) {
    return qualityPayload({
      relation: base.relation,
      reason: "definition-derived contrast using target/candidate gloss fields; base relation: " + base.reason,
      qualityClass: QUALITY_CLASS.P2,
      qualityTier: base.qualityTier === "A" ? "A" : "B",
      learnerDistinctionZh: distinction,
      confidence: base.confidence || "medium",
      relationEvidence: {
        kind: "definition-derived",
        sourceFields: [
          ...getEvidenceFields(t, "target"),
          ...getEvidenceFields(c, "candidate")
        ]
      },
      usable: true
    });
  }

  return qualityPayload({
    relation: base.relation,
    reason: "metadata-only relation without verifiable learner distinction: " + base.reason,
    qualityClass: QUALITY_CLASS.P3,
    qualityTier: base.qualityTier === "A" ? "B" : "BAD",
    learnerDistinctionZh: null,
    confidence: base.confidence || "low",
    relationEvidence: null,
    usable: false
  });
}

export function classifyRelation(targetWordId, candidateWordId) {
  const t = byWordId.get(targetWordId);
  const c = byWordId.get(candidateWordId);
  if (!t || !c) return { relation: RELATION.UNRELATED, reason: "missing-catalog-entry",
    qualityTier: "BAD", learnerDistinctionZh: null, confidence: "low" };

  // Pre-check: hard blacklist
  const blKey = targetWordId + '||' + candidateWordId;
  if (HARD_BLACKLIST.has(blKey)) return { relation: RELATION.UNRELATED, reason: "hard-blacklist",
    qualityTier: "BAD", learnerDistinctionZh: null, confidence: "low" };

  const tWordLower = (t.word || "").toLowerCase();
  const cWordLower = (c.word || "").toLowerCase();

  if (isHardBlacklistedWordPair(tWordLower, cWordLower)) {
    return { relation: RELATION.UNRELATED, reason: "hard-blacklist-word-pair",
      qualityTier: "BAD", learnerDistinctionZh: null, confidence: "low" };
  }

  // Pre-check: experience blacklist
  if ((tWordLower === "experience" && EXP_BLACKLIST.has(cWordLower)) ||
      (cWordLower === "experience" && EXP_BLACKLIST.has(tWordLower))) {
    return { relation: RELATION.UNRELATED, reason: "experience-blacklist",
      qualityTier: "BAD", learnerDistinctionZh: null, confidence: "low" };
  }

  // Pre-check: direct synonym via synonymKeys
  const tSynSet = new Set(t.synonymKeys || []);
  if (tSynSet.has(cWordLower)) return {
    relation: RELATION.EXACT_SAME_SENSE, reason: "synonym-key-match",
    qualityTier: "BAD", learnerDistinctionZh: null, confidence: "low" };

  const tA = t.conceptAxis, cA = c.conceptAxis, tV = t.conceptValue, cV = c.conceptValue;
  const tF = t.relationFamily, cF = c.relationFamily;

  // Rule 1: Same axis
  if (tA !== "general" && cA !== "general" && tA === cA) {
    if (tV === cV) {
      const cc = checkSensePairContrast(t.senseId, c.senseId);
      if (cc.hasContrast && cc.allowInSameQuestion) {
        return { relation: RELATION.CLOSE_SYNONYM_WITH_CONTRAST,
          reason: 'same axis ' + tA + ' + same value ' + tV + ' + contrast: ' + cc.entry.pairId,
          qualityTier: 'A', learnerDistinctionZh: cc.entry.learnerDistinctionZh || null,
          confidence: cc.entry.confidence || 'high' };
      }
      return { relation: RELATION.EXACT_SAME_SENSE,
        reason: 'same axis ' + tA + ' + same value ' + tV + ' no contrast',
        qualityTier: 'BAD', learnerDistinctionZh: null, confidence: 'low' };
    }
    // Different value on same axis -- quality depends on axis specificity
    if (isBroadAxis(tA)) {
      const cc2 = findWordPairContrast(t, c);
      if (cc2.hasContrast && cc2.entry.allowInSameQuestion) {
        return { relation: RELATION.CLOSE_SYNONYM_WITH_CONTRAST,
          reason: 'broad axis ' + tA + ' + contrast: ' + cc2.entry.pairId,
          qualityTier: 'A', learnerDistinctionZh: cc2.entry.learnerDistinctionZh || null,
          confidence: cc2.entry.confidence || 'high' };
      }
      if (tF !== 'general' && cF !== 'general' && tF === cF) {
        return { relation: RELATION.SAME_AXIS_DIFFERENT_VALUE,
          reason: 'broad axis ' + tA + ' same-family ' + tF + ' t=' + tV + ' c=' + cV,
          qualityTier: 'B', learnerDistinctionZh: null, confidence: 'medium' };
      }
      return { relation: RELATION.SAME_BROAD_DOMAIN_ONLY,
        reason: 'broad axis ' + tA + ' diff-family diff-value: ' + tF + '/' + tV + ' vs ' + cF + '/' + cV,
        qualityTier: 'C', learnerDistinctionZh: null, confidence: 'low' };
    }
    // Narrow axis: reliable
    const allowed = (t.allowedDistractorRelations || []).includes(RELATION.SAME_AXIS_DIFFERENT_VALUE);
    return allowed ? { relation: RELATION.SAME_AXIS_DIFFERENT_VALUE,
        reason: 'same axis ' + tA + ' target=' + tV + ' cand=' + cV,
        qualityTier: 'A', learnerDistinctionZh: null, confidence: 'medium' }
      : { relation: RELATION.EXACT_SAME_SENSE, reason: "same axis target disallows",
        qualityTier: 'BAD', learnerDistinctionZh: null, confidence: 'low' };
  }

  // Rule 2: Same relation family, different axes
  if (tF !== 'general' && cF !== 'general' && tF === cF && tA !== cA) {
    const allowed = (t.allowedDistractorRelations || []).includes(RELATION.SIBLING_CONCEPT);
    return { relation: RELATION.SIBLING_CONCEPT, reason: "same family " + tF,
      qualityTier: allowed ? 'A' : 'B', learnerDistinctionZh: null,
      confidence: allowed ? 'high' : 'medium' };
  }

  // Rule 3: Different families, both have axes
  if (tA !== 'general' && cA !== 'general' && tF !== cF) {
    const allowed = (t.allowedDistractorRelations || []).includes(RELATION.ADJACENT_CONTRAST);
    return { relation: RELATION.ADJACENT_CONTRAST,
      reason: 'adjacent ' + tF + '/' + tA + ' vs ' + cF + '/' + cA,
      qualityTier: allowed ? 'B' : 'C', learnerDistinctionZh: null,
      confidence: allowed ? 'medium' : 'low' };
  }

  // Rule 4: One or both general
  const tSyn = new Set(t.synonymKeys || []), cSyn = new Set(c.synonymKeys || []);
  const tAmb = new Set(t.ambiguityKeys || []), cAmb = new Set(c.ambiguityKeys || []);
  const synO = [...tSyn].filter(k => cSyn.has(k)).length;
  const ambO = [...tAmb].filter(k => cAmb.has(k)).length;
  if (synO > 0 || ambO >= 2) return { relation: RELATION.EXACT_SAME_SENSE, reason: "syn/amb overlap",
    qualityTier: 'BAD', learnerDistinctionZh: null, confidence: 'low' };
  if (cA !== 'general' || tA !== 'general') return { relation: RELATION.UNRELATED,
    reason: 'one general', qualityTier: 'BAD', learnerDistinctionZh: null, confidence: 'low' };
  return { relation: RELATION.UNRELATED, reason: "both general",
    qualityTier: 'BAD', learnerDistinctionZh: null, confidence: 'low' };
}

export function isAllowedDistractor(tId, cId) {
  const r = scoreCandidate(tId, cId);
  return { allowed: r.usable, relation: r.relation, qualityTier: r.qualityTier,
    qualityClass: r.qualityClass, learnerDistinctionZh: r.learnerDistinctionZh,
    relationReason: r.reason, relationEvidence: r.relationEvidence, confidence: r.confidence };
}

export function scoreCandidate(tId, cId) {
  const r = classifyRelation(tId, cId);
  const t = byWordId.get(tId);
  const c = byWordId.get(cId);
  const q = classifyQuality(t, c, r);
  const tier = { A: 300, B: 200 };
  let base = q.usable ? (tier[q.qualityTier] || 0) : (q.qualityClass === QUALITY_CLASS.P3 ? 25 : -1000);
  if (q.relation === RELATION.CLOSE_SYNONYM_WITH_CONTRAST) base += 70;
  const bonus = (t && t.allowedDistractorRelations && t.allowedDistractorRelations.includes(q.relation)) ? 50 : 0;
  return { score: base + (q.usable ? bonus : 0), relation: q.relation, relationType: q.relationType,
    reason: q.reason, relationReason: q.reason, qualityTier: q.qualityTier, qualityClass: q.qualityClass,
    usable: q.usable, learnerDistinctionZh: q.learnerDistinctionZh,
    relationEvidence: q.relationEvidence, confidence: q.confidence };
}

export function scoreCandidatesByRelation(tId, candidates, samePos) {
  const t = byWordId.get(tId);
  if (!t) return [];
  const tPos = t.posFamily;
  return candidates
    .filter(c => c.wordId !== tId && (!samePos || c.posFamily === tPos))
    .map(c => {
      const s = scoreCandidate(tId, c.wordId);
      const relEntry = byWordId.get(c.wordId) || {};
      return {
        ...c,
        ...s,
        quizMeaningZh: c.quizMeaningZh || relEntry.quizMeaningZh || c.meaningZh,
        meaningDetailedZh: c.meaningDetailedZh || relEntry.meaningDetailedZh || c.meaningZh,
        sourceEvidence: c.sourceEvidence || relEntry.sourceEvidence || [],
        senseKey: relEntry.senseId || null,
        candidateAxis: relEntry.conceptAxis || 'general',
        candidateRelationFamily: relEntry.relationFamily || 'general'
      };
    });
}

export function rankCandidatesByRelation(tId, candidates, samePos) {
  return scoreCandidatesByRelation(tId, candidates, samePos)
    .sort((a, b) => {
      if (a.usable !== b.usable) return a.usable ? -1 : 1;
      return b.score - a.score;
    });
}

export function pickBestDistractors(tId, candidates, count, samePos) {
  count = count || 3;
  samePos = samePos !== false;
  const ranked = rankCandidatesByRelation(tId, candidates, samePos);
  const usable = ranked.filter(c => c.usable);
  const chosen = [];
  const cIds = new Set();
  const cMeans = new Set();
  for (const c of usable) {
    if (chosen.length >= count) break;
    const m = (c.meaningZh || "").trim();
    if (!m || cMeans.has(m) || cIds.has(c.wordId)) continue;
    chosen.push(c);
    cIds.add(c.wordId);
    cMeans.add(m);
  }
  return { distractors: chosen, qualitySufficient: chosen.length >= count,
    totalUsable: usable.length, totalRanked: ranked.length, fallbackNeeded: chosen.length < count };
}

export function getCatalogStats() {
  const axes = {}, families = {}, confs = {};
  let gen = 0;
  for (const e of SENSE_RELATION_CATALOG) {
    axes[e.conceptAxis] = (axes[e.conceptAxis] || 0) + 1;
    families[e.relationFamily] = (families[e.relationFamily] || 0) + 1;
    confs[e.confidence] = (confs[e.confidence] || 0) + 1;
    if (e.conceptAxis === 'general') gen++;
  }
  return { total: SENSE_RELATION_CATALOG.length,
    withAxis: SENSE_RELATION_CATALOG.length - gen, general: gen, axes, families, confs };
}

export { byWordId as _relationIndex, ALLOWED as _ALLOWED, FORBIDDEN as _FORBIDDEN, BROAD_AXES as _BROAD_AXES };
