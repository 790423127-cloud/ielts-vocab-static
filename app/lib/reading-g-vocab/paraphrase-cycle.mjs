/**
 * Paraphrase quiz: total safe pool (233) vs per-session batch + coverage cycle.
 * Does not alter relation data — only schedules groupIds.
 */
import { buildParaphraseMcq, getQuizEligibleGroups, isQuizEligibleGroup } from "./paraphrase-quiz.mjs";
import { getParaphraseReviewPriorities } from "./paraphrase-review.mjs";

/** Session sizes (Next + static parity) */
export const PARA_SESSION_SIZE = {
  guided: 10,
  quick: 20,
  full: 80
};

export const DEFAULT_SESSION_MODE = "guided";

export function emptyCoverageState(sessionMode = DEFAULT_SESSION_MODE) {
  return {
    version: 1,
    seenGroupIds: [],
    currentCycleOrder: [],
    currentCycleIndex: 0,
    cycleNumber: 1,
    lastSessionGroupIds: [],
    updatedAt: 0,
    sessionMode,
    sessionSize: PARA_SESSION_SIZE[sessionMode] || PARA_SESSION_SIZE.guided
  };
}

export function normalizeCoverageState(raw, sessionMode = DEFAULT_SESSION_MODE) {
  const base = emptyCoverageState(sessionMode);
  if (!raw || typeof raw !== "object") return base;
  return {
    version: 1,
    seenGroupIds: Array.isArray(raw.seenGroupIds) ? raw.seenGroupIds.map(String) : [],
    currentCycleOrder: Array.isArray(raw.currentCycleOrder)
      ? raw.currentCycleOrder.map(String)
      : [],
    currentCycleIndex: Math.max(0, Number(raw.currentCycleIndex) || 0),
    cycleNumber: Math.max(1, Number(raw.cycleNumber) || 1),
    lastSessionGroupIds: Array.isArray(raw.lastSessionGroupIds)
      ? raw.lastSessionGroupIds.map(String)
      : [],
    updatedAt: Math.max(0, Number(raw.updatedAt) || 0),
    sessionMode: raw.sessionMode || sessionMode,
    sessionSize:
      Number(raw.sessionSize) ||
      PARA_SESSION_SIZE[raw.sessionMode || sessionMode] ||
      PARA_SESSION_SIZE.guided
  };
}

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getParaphraseStatusCode(paraMap, groupId) {
  if (!groupId || !paraMap) return "unlearned";
  const e = paraMap[groupId];
  if (!e) return "unlearned";
  if (typeof e === "string") return e;
  if (e.paraphraseStatus) return e.paraphraseStatus;
  if (e.mastered === true) return "familiar";
  if (e.mastered === false) return "unfamiliar";
  return "unlearned";
}

/**
 * Full counting pipeline for audits.
 */
export function auditParaphraseQueuePipeline(groups, options = {}) {
  const {
    coverage = emptyCoverageState(),
    sessionMode = DEFAULT_SESSION_MODE,
    sessionSize = PARA_SESSION_SIZE[sessionMode] || 10
  } = options;

  const all = Array.isArray(groups) ? groups : [];
  const highGroups = all.filter((g) => g.confidence === "high");
  const autoQuizGroups = highGroups.filter((g) => g.canAutoQuiz === true);
  const validMeaningGroups = autoQuizGroups.filter((g) =>
    String(g.commonMeaningZh || "").trim()
  );
  const eligibleRaw = getQuizEligibleGroups(all);
  const eligible = [...new Map(eligibleRaw.map((group) => [group.groupId, group])).values()];
  const eligibleIds = eligible.map((g) => g.groupId);

  const excluded = [];
  for (const g of all) {
    if (isQuizEligibleGroup(g)) continue;
    let reason = "not_eligible";
    if (g.confidence !== "high") reason = "not_high";
    else if (g.canAutoQuiz !== true) reason = "canAutoQuiz_false";
    else if (!String(g.commonMeaningZh || "").trim()) reason = "empty_commonMeaningZh";
    else if (!g.anchor || !(g.members || []).length) reason = "empty_anchor_or_members";
    excluded.push({ groupId: g.groupId, reason });
  }

  // session truncate simulation (historical bug used 80)
  const sessionPoolBeforeLimit = eligibleIds.length;
  const sessionPoolAfterLimit = Math.min(sessionSize, sessionPoolBeforeLimit);

  const seen = new Set(coverage.seenGroupIds || []);
  const cumulativeUnique = eligibleIds.filter((id) => seen.has(id)).length;

  return {
    totalGroups: all.length,
    highGroups: highGroups.length,
    autoQuizGroups: autoQuizGroups.length,
    validMeaningGroups: validMeaningGroups.length,
    deduplicatedGroups: eligible.length,
    filteredGroups: eligible.length,
    statusFilteredGroups: eligible.length, // status does not shrink pool
    sessionPoolBeforeLimit,
    sessionPoolAfterLimit,
    historicalNextLimit: Math.min(80, eligible.length),
    historicalStaticLimit: Math.min(60, eligible.length),
    cumulativeUniqueGroups: cumulativeUnique,
    remainingUnseenGroups: Math.max(0, eligible.length - cumulativeUnique),
    excludedGroupIds: excluded.map((e) => e.groupId),
    excludedReasons: excluded.reduce((acc, e) => {
      acc[e.reason] = (acc[e.reason] || 0) + 1;
      return acc;
    }, {}),
    excludedSamples: excluded.slice(0, 80)
  };
}

/**
 * Ensure cycle order is a permutation of all eligible groupIds (stable across refresh).
 */
export function ensureCycleOrder(coverage, eligibleIds, rng = Math.random) {
  const set = new Set(eligibleIds);
  let order = (coverage.currentCycleOrder || []).filter((id) => set.has(id));
  const have = new Set(order);
  const missing = eligibleIds.filter((id) => !have.has(id));
  if (!order.length) {
    order = shuffle(eligibleIds, rng);
  } else if (missing.length) {
    order = order.concat(shuffle(missing, rng));
  }
  return order;
}

export function markParaphraseGroupSeen(coverageIn, groupId, eligibleIds = [], now = Date.now()) {
  const coverage = normalizeCoverageState(coverageIn);
  const valid = new Set(eligibleIds);
  if (!groupId || valid.size && !valid.has(groupId)) return coverage;
  const seen = new Set(coverage.seenGroupIds || []);
  seen.add(groupId);
  return { ...coverage, seenGroupIds: [...seen], updatedAt: now };
}

export function shuffleRemainingParaphraseCycle(coverageIn, eligibleIds, rng = Math.random, now = Date.now()) {
  const coverage = normalizeCoverageState(coverageIn);
  const order = ensureCycleOrder(coverage, eligibleIds, rng);
  const index = Math.min(coverage.currentCycleIndex, order.length);
  return {
    ...coverage,
    currentCycleOrder: [...order.slice(0, index), ...shuffle(order.slice(index), rng)],
    updatedAt: now
  };
}

/**
 * Take next session batch from 233-pool with priority inject for unmastered.
 */
export function takeNextParaphraseSession(groups, paraStatusMap, coverageIn, options = {}) {
  const rng = options.rng || Math.random;
  const sessionMode = options.sessionMode || coverageIn?.sessionMode || DEFAULT_SESSION_MODE;
  const sessionSize =
    Number(options.sessionSize) ||
    PARA_SESSION_SIZE[sessionMode] ||
    PARA_SESSION_SIZE.guided;

  const eligible = getQuizEligibleGroups(groups);
  const byId = new Map(eligible.map((g) => [g.groupId, g]));
  const eligibleIds = eligible.map((g) => g.groupId);
  const coverage = normalizeCoverageState(coverageIn, sessionMode);
  coverage.sessionMode = sessionMode;
  coverage.sessionSize = sessionSize;

  if (!eligibleIds.length) {
    return {
      questions: [],
      coverage,
      sessionIds: [],
      poolSize: 0,
      sessionSize,
      sessionMode
    };
  }

  let order = ensureCycleOrder(coverage, eligibleIds, rng);
  let index = Math.min(coverage.currentCycleIndex, order.length);
  const sessionIds = [];
  const sessionKinds = [];
  const used = new Set();

  const reviewPriorities = getParaphraseReviewPriorities(options.reviewState, eligibleIds, options.now || Date.now());
  const legacyWrong = eligibleIds.filter((id) => getParaphraseStatusCode(paraStatusMap, id) === "unfamiliar");
  const reviewCandidates = [
    ...reviewPriorities.wrong.map((id) => ({ id, kind: "wrong" })),
    ...reviewPriorities.uncertain.map((id) => ({ id, kind: "uncertain" })),
    ...reviewPriorities.due.map((id) => ({ id, kind: "due" })),
    ...legacyWrong.map((id) => ({ id, kind: "legacyUnfamiliar" }))
  ];
  const reviewLimit = options.includeReview === false ? 0 : Math.floor(sessionSize / 2);
  for (const candidate of reviewCandidates) {
    if (sessionIds.length >= reviewLimit || used.has(candidate.id)) continue;
    sessionIds.push(candidate.id);
    sessionKinds.push(candidate.kind);
    used.add(candidate.id);
  }

  let guard = 0;
  const cycleCompletions = [];
  while (sessionIds.length < sessionSize && guard < eligibleIds.length * 3) {
    guard += 1;
    if (index >= order.length) {
      cycleCompletions.push({ cycleNumber: coverage.cycleNumber, sessionOffset: sessionIds.length });
      order = shuffle(eligibleIds, rng);
      index = 0;
      coverage.cycleNumber = (coverage.cycleNumber || 1) + 1;
    }
    const id = order[index];
    index += 1;
    if (!id || used.has(id)) continue;
    sessionIds.push(id);
    sessionKinds.push(cycleCompletions.length ? "nextCycle" : "new");
    used.add(id);
  }

  coverage.currentCycleOrder = order;
  coverage.currentCycleIndex = index;
  coverage.lastSessionGroupIds = sessionIds;
  coverage.updatedAt = options.now || Date.now();

  const questions = [];
  const recent = [];
  let lastSig = "";
  for (const id of sessionIds) {
    const g = byId.get(id);
    if (!g) continue;
    let q = buildParaphraseMcq(g, eligible, rng, recent);
    if (!q) continue;
    const sig = q.options
      .map((o) => String(o || "").toLowerCase())
      .slice()
      .sort()
      .join("|");
    if (sig === lastSig) {
      q = buildParaphraseMcq(g, eligible, rng, recent);
    }
    if (!q) continue;
    questions.push(q);
    lastSig = q.options
      .map((o) => String(o || "").toLowerCase())
      .slice()
      .sort()
      .join("|");
    recent.push(id);
    if (recent.length > 20) recent.shift();
  }

  return {
    questions,
    coverage,
    sessionIds,
    sessionKinds,
    cycleCompletions,
    poolSize: eligibleIds.length,
    sessionSize,
    sessionMode,
    cumulativeUnique: coverage.seenGroupIds.filter((id) => byId.has(id)).length,
    remainingUnseen: Math.max(
      0,
      eligibleIds.length - coverage.seenGroupIds.filter((id) => byId.has(id)).length
    )
  };
}

/**
 * Simulate multi-round coverage (no wrong-inject priority beyond status).
 */
export function simulateCoverageRounds(groups, rounds = 30, sessionSize = 10, rng = Math.random) {
  let coverage = emptyCoverageState("guided");
  coverage.sessionSize = sessionSize;
  const paraStatusMap = {};
  const history = [];
  const eligible = getQuizEligibleGroups(groups);
  const pool = eligible.length;

  for (let r = 1; r <= rounds; r += 1) {
    const before = new Set(coverage.seenGroupIds || []);
    const batch = takeNextParaphraseSession(groups, paraStatusMap, coverage, {
      sessionSize,
      sessionMode: "guided",
      rng,
      includeReview: false
    });
    coverage = batch.coverage;
    for (const id of batch.sessionIds) {
      coverage = markParaphraseGroupSeen(coverage, id, eligible.map((group) => group.groupId));
    }
    const after = new Set(coverage.seenGroupIds || []);
    let newUnique = 0;
    for (const id of batch.sessionIds) {
      if (!before.has(id)) newUnique += 1;
    }
    history.push({
      round: r,
      roundNumber: r,
      sessionSize: batch.sessionIds.length,
      groupCount: batch.sessionIds.length,
      newUniqueCount: newUnique,
      newUniqueGroups: newUnique,
      normalRepeatCount: 0,
      reviewRepeatCount: batch.sessionIds.length - newUnique,
      repeatedGroups: batch.sessionIds.length - newUnique,
      cumulativeUnique: after.size,
      cumulativeUniqueGroups: after.size,
      remainingUnseen: Math.max(0, pool - after.size),
      remainingUnseenGroups: Math.max(0, pool - after.size),
      cycleNumber: coverage.cycleNumber
    });
    if (after.size >= pool) break;
  }

  return {
    poolSize: pool,
    roundsRun: history.length,
    finalUnique: history.length ? history[history.length - 1].cumulativeUniqueGroups : 0,
    coversAll: history.length ? history[history.length - 1].cumulativeUniqueGroups >= pool : false,
    history
  };
}
