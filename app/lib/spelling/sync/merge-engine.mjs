const REPAIR_STATE_PRIORITY = {
  normal: 0,
  mastered: 1,
  done_today: 1,
  in_repair: 3,
  must_repair: 3,
  waiting_second: 3
};

const SEVERITY_PRIORITY = {
  low: 0,
  medium: 1,
  high: 2
};

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function latestByUpdatedAt(a = {}, b = {}) {
  return number(a.updatedAt) >= number(b.updatedAt) ? clone(a) : clone(b);
}

function latestValue(aValue, aTime, bValue, bTime) {
  return number(bTime) > number(aTime) ? bValue : aValue;
}

function stricterRepairState(a, b) {
  const aState = a || "normal";
  const bState = b || "normal";
  return REPAIR_STATE_PRIORITY[bState] > REPAIR_STATE_PRIORITY[aState] ? bState : aState;
}

function selectTodaySnapshot(a = {}, b = {}, aUpdatedAt = 0, bUpdatedAt = 0) {
  const aTime = number(a.lastSeenAt || a.updatedAt || aUpdatedAt);
  const bTime = number(b.lastSeenAt || b.updatedAt || bUpdatedAt);

  if (aTime !== bTime) {
    return aTime > bTime
      ? { source: "a", value: a, state: a.repairState || "normal", usedStrictest: false }
      : { source: "b", value: b, state: b.repairState || "normal", usedStrictest: false };
  }

  const state = stricterRepairState(a.repairState, b.repairState);
  const source = (b.repairState || "normal") === state && (a.repairState || "normal") !== state ? "b" : "a";
  return { source, value: source === "a" ? a : b, state, usedStrictest: true };
}

function mergeSpelling(a = {}, b = {}) {
  const lastAttemptAt = Math.max(number(a.lastAttemptAt), number(b.lastAttemptAt));

  return {
    ...latestByUpdatedAt(a, b),
    totalAttempts: Math.max(number(a.totalAttempts), number(b.totalAttempts)),
    correctAttempts: Math.max(number(a.correctAttempts), number(b.correctAttempts)),
    wrongAttempts: Math.max(number(a.wrongAttempts), number(b.wrongAttempts)),
    lastAnswer: latestValue(a.lastAnswer || "", a.lastAttemptAt, b.lastAnswer || "", b.lastAttemptAt),
    lastAttemptAt,
    hintLevel: Math.max(number(a.hintLevel), number(b.hintLevel))
  };
}

function mergeToday(a = {}, b = {}, selection = selectTodaySnapshot(a, b)) {
  const state = selection.state;
  const latest = clone(selection.value || {});
  const inRepair = ["must_repair", "in_repair", "waiting_second"].includes(state);
  const repairStreak = number(latest.repairStreak ?? latest.repairCorrectCount);

  return {
    ...latest,
    repairState: state,
    completedToday: !inRepair && Boolean(latest.completedToday || ["mastered", "done_today"].includes(state)),
    repairStreak,
    repairCorrectCount: repairStreak,
    repairLocked: inRepair && Boolean(latest.repairLocked),
    nextEligibleAt: number(latest.nextEligibleAt),
    minOtherWordsBeforeNext: number(latest.minOtherWordsBeforeNext),
    lastSeenSequence: number(latest.lastSeenSequence),
    lastSeenAt: number(latest.lastSeenAt),
    currentErrorCount: number(latest.currentErrorCount),
    activeInTodayList: inRepair || Boolean(latest.activeInTodayList)
  };
}

function mergeErrorBank(a = {}, b = {}, aUpdatedAt = 0, bUpdatedAt = 0) {
  const latestWrongAt = Math.max(number(a.latestWrongAt), number(b.latestWrongAt));
  const severity = SEVERITY_PRIORITY[b.severity] > SEVERITY_PRIORITY[a.severity] ? b.severity : a.severity;
  return {
    ...latestByUpdatedAt({ ...a, updatedAt: a.latestWrongAt || 0 }, { ...b, updatedAt: b.latestWrongAt || 0 }),
    everWrong: Boolean(a.everWrong || b.everWrong),
    totalWrongCount: Math.max(number(a.totalWrongCount), number(b.totalWrongCount)),
    totalCorrectCount: Math.max(number(a.totalCorrectCount), number(b.totalCorrectCount)),
    latestWrongAt,
    lastWrongAnswer: latestValue(a.lastWrongAnswer || "", a.latestWrongAt, b.lastWrongAnswer || "", b.latestWrongAt),
    active: Boolean(a.everWrong || b.everWrong),
    severity: severity || "low"
  };
}

function mergeSrs(a = {}, b = {}, preferredSource = "") {
  if (preferredSource) {
    return clone(preferredSource === "a" ? a : b) || {};
  }

  return {
    stage: Math.max(number(a.stage), number(b.stage)),
    nextReviewAt: Math.max(number(a.nextReviewAt), number(b.nextReviewAt)),
    lastReviewedAt: Math.max(number(a.lastReviewedAt), number(b.lastReviewedAt))
  };
}

function mergeDeviceIds(a, b) {
  return Array.from(new Set([
    ...(Array.isArray(a.deviceIds) ? a.deviceIds : []),
    ...(Array.isArray(b.deviceIds) ? b.deviceIds : []),
    a.deviceId,
    b.deviceId
  ].filter(Boolean)));
}

export function mergeWordState(local, remote) {
  if (!local) return clone(remote);
  if (!remote) return clone(local);
  if (local.wordId !== remote.wordId) {
    throw new Error(`Cannot merge different wordId values: ${local.wordId} vs ${remote.wordId}`);
  }

  const latest = number(remote.updatedAt) > number(local.updatedAt) ? remote : local;
  const todaySelection = selectTodaySnapshot(local.today, remote.today, local.updatedAt, remote.updatedAt);
  const hasRepairStateConflict = (local.today?.repairState || "normal") !== (remote.today?.repairState || "normal");
  const hasActiveRepairState = [local.today?.repairState, remote.today?.repairState]
    .some((state) => ["must_repair", "in_repair", "waiting_second"].includes(state));
  const deviceIds = mergeDeviceIds(local, remote);
  const merged = {
    ...clone(latest),
    wordId: local.wordId,
    updatedAt: Math.max(number(local.updatedAt), number(remote.updatedAt)),
    revision: number(local.revision) + number(remote.revision),
    version: Math.max(number(local.version, 1), number(remote.version, 1)),
    lastSyncAt: Math.max(number(local.lastSyncAt), number(remote.lastSyncAt)),
    deviceId: latest.deviceId || local.deviceId || remote.deviceId || "",
    deviceIds,
    spelling: mergeSpelling(local.spelling, remote.spelling),
    today: mergeToday(local.today, remote.today, todaySelection),
    errorBank: mergeErrorBank(local.errorBank, remote.errorBank, local.updatedAt, remote.updatedAt),
    srs: mergeSrs(local.srs, remote.srs, hasRepairStateConflict || hasActiveRepairState ? todaySelection.source : ""),
    dirty: Boolean(local.dirty || remote.dirty)
  };

  return merged;
}

export function resolveConflict(a, b) {
  const record = mergeWordState(a, b);
  const rules = ["updatedAt_latest_priority", "revision_sum", "errorBank_union", "srs_max"];

  if ((a?.today?.repairState || "normal") !== (b?.today?.repairState || "normal")) {
    const selection = selectTodaySnapshot(a?.today, b?.today, a?.updatedAt, b?.updatedAt);
    rules.push(selection.usedStrictest ? "strictest_repair_state_on_tie" : "latest_repair_event");
  }

  return {
    record,
    conflict: {
      wordId: record.wordId,
      localUpdatedAt: a?.updatedAt || 0,
      remoteUpdatedAt: b?.updatedAt || 0,
      rules
    }
  };
}

export function mergeBatch(list = []) {
  const map = new Map();
  const flattened = list.flat().filter(Boolean);

  for (const record of flattened) {
    const existing = map.get(record.wordId);
    map.set(record.wordId, existing ? mergeWordState(existing, record) : clone(record));
  }

  return Array.from(map.values()).sort((a, b) => String(a.wordId).localeCompare(String(b.wordId)));
}
