/**
 * High-confidence paraphrase MCQ generator (reading-g v3).
 * Only confidence==="high" && canAutoQuiz===true groups.
 */
import { normalizeReadingGKey } from "./normalize.mjs";

export function isQuizEligibleGroup(group) {
  return Boolean(
    group &&
      group.confidence === "high" &&
      group.canAutoQuiz === true &&
      group.sourceType !== "network" &&
      String(group.anchor || "").trim() &&
      String(group.commonMeaningZh || "").trim() &&
      Array.isArray(group.members) &&
      group.members.some((m) => String(m || "").trim())
  );
}

export function getQuizEligibleGroups(groups = []) {
  return (groups || []).filter(isQuizEligibleGroup);
}

function surfaceKey(s) {
  return normalizeReadingGKey(s);
}

function groupMemberKeys(group) {
  const keys = new Set();
  keys.add(surfaceKey(group.anchor));
  for (const m of group.members || []) keys.add(surfaceKey(m));
  return keys;
}

function normalizePos(pos) {
  return String(pos || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

function meaningKey(zh) {
  return String(zh || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Build a single MCQ item.
 * @returns {null|{groupId,stem,correct,options:string[],correctIndex,meta}}
 */
export function buildParaphraseMcq(group, allEligibleGroups, rng = Math.random, recentGroupIds = [], direction = "anchorToMember") {
  if (!isQuizEligibleGroup(group)) return null;

  const members = (group.members || [])
    .map((m) => String(m || "").trim())
    .filter(Boolean);
  if (!members.length) return null;
  const member = members[Math.floor(rng() * members.length)];
  const reverse = direction === "memberToAnchor";
  const stem = reverse ? member : String(group.anchor || "").trim();
  const correct = reverse ? String(group.anchor || "").trim() : member;
  const stemKey = surfaceKey(stem);
  const correctKey = surfaceKey(correct);
  if (!correctKey || correctKey === stemKey) return null;

  const ownKeys = groupMemberKeys(group);
  const pos = normalizePos(group.posConstraint);
  const correctMeaning = meaningKey(group.commonMeaningZh);

  const distractorPool = [];
  for (const g of allEligibleGroups) {
    if (!g || g.groupId === group.groupId) continue;
    if (!isQuizEligibleGroup(g)) continue;
    if (recentGroupIds.includes(g.groupId)) {
      /* still allow as distractor source */
    }
    const gPos = normalizePos(g.posConstraint);
    // POS must match when either side declares a constraint
    if (pos && gPos && pos !== gPos) continue;
    if (pos && !gPos) continue;
    if (!pos && gPos) continue;

    const gMeaning = meaningKey(g.commonMeaningZh);
    if (correctMeaning && gMeaning && correctMeaning === gMeaning) continue;

    const gKeys = groupMemberKeys(g);
    // no member-set intersection
    let intersect = false;
    for (const k of gKeys) {
      if (ownKeys.has(k)) {
        intersect = true;
        break;
      }
    }
    if (intersect) continue;

    const candidates = [g.anchor, ...(g.members || [])]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    for (const c of candidates) {
      const ck = surfaceKey(c);
      if (!ck || ck === stemKey || ck === correctKey) continue;
      if (ownKeys.has(ck)) continue;
      distractorPool.push({ text: c, key: ck, fromGroup: g.groupId, meaning: gMeaning });
    }
  }

  // unique by key
  const seen = new Set([stemKey, correctKey]);
  const distractors = [];
  // shuffle pool
  const pool = distractorPool.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const d of pool) {
    if (seen.has(d.key)) continue;
    // avoid same meaning as correct
    if (correctMeaning && d.meaning && d.meaning === correctMeaning) continue;
    seen.add(d.key);
    distractors.push(d.text);
    if (distractors.length >= 3) break;
  }

  if (distractors.length < 3) {
    return null; // skip — no unsafe fallback
  }

  // place correct with balanced RNG
  const correctIndex = Math.floor(rng() * 4);
  // rotate so correct lands at correctIndex
  const final = new Array(4);
  final[correctIndex] = correct;
  let di = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === correctIndex) continue;
    final[i] = distractors[di++];
  }

  // final uniqueness check
  const optKeys = final.map(surfaceKey);
  if (new Set(optKeys).size !== 4) return null;
  if (optKeys.includes(stemKey)) return null;

  return {
    groupId: group.groupId,
    stem,
    correct,
    options: final,
    correctIndex,
    meta: {
      relationType: group.relationType || "near_synonym",
      commonMeaningZh: group.commonMeaningZh || "",
      differenceZh: group.differenceZh || "",
      posConstraint: group.posConstraint || "",
      sourceType: group.sourceType || "verified",
      confidence: group.confidence
      ,direction
      ,anchor: group.anchor || ""
      ,members: (group.members || []).slice()
      ,sources: (group.sources || []).slice(0, 2)
    }
  };
}

/**
 * Build a quiz session queue.
 * Skips groups that cannot get 3 safe distractors.
 * Avoids repeating groupId within last 20.
 * Avoids identical option-set on consecutive items.
 */
export function buildParaphraseQuizQueue(groups, count = 50, rng = Math.random) {
  const eligible = getQuizEligibleGroups(groups);
  const skipped = [];
  const built = [];
  const recent = [];
  let lastOptionSig = "";

  // shuffle eligible order
  const order = eligible.slice();
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const tried = new Set();
  let guard = 0;
  while (built.length < count && guard < eligible.length * 4) {
    guard += 1;
    const g = order[guard % order.length];
    if (!g) break;
    if (recent.includes(g.groupId)) continue;
    if (tried.has(g.groupId) && tried.size >= eligible.length) break;

    const item = buildParaphraseMcq(g, eligible, rng, recent);
    if (!item) {
      if (!tried.has(g.groupId)) {
        skipped.push({ groupId: g.groupId, reason: "unsafe_or_insufficient_distractors" });
      }
      tried.add(g.groupId);
      continue;
    }
    const sig = item.options
      .map(surfaceKey)
      .slice()
      .sort()
      .join("|");
    if (sig === lastOptionSig) {
      tried.add(g.groupId);
      continue;
    }
    built.push(item);
    lastOptionSig = sig;
    recent.push(g.groupId);
    if (recent.length > 20) recent.shift();
    tried.add(g.groupId);
  }

  // position distribution
  const posDist = [0, 0, 0, 0];
  for (const q of built) posDist[q.correctIndex] += 1;

  return {
    questions: built,
    skipped,
    eligibleCount: eligible.length,
    positionDistribution: posDist
  };
}

/**
 * Audit how many groups can form at least one safe MCQ.
 */
export function auditParaphraseQuizSafety(groups) {
  const eligible = getQuizEligibleGroups(groups);
  const safe = [];
  const skipped = [];
  const reasons = {};

  for (const g of eligible) {
    const item = buildParaphraseMcq(g, eligible, () => 0.42, []);
    if (item) safe.push(g.groupId);
    else {
      skipped.push(g.groupId);
      reasons[g.groupId] = "insufficient_safe_distractors";
    }
  }

  return {
    eligibleCount: eligible.length,
    safeParaphraseQuizGroupCount: safe.length,
    skippedParaphraseQuizGroupCount: skipped.length,
    skippedGroupReasons: reasons,
    safeGroupIds: safe,
    skippedGroupIds: skipped
  };
}
