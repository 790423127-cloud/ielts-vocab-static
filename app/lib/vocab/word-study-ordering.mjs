import {
  WORD_STUDY_DIFFICULTY_MODE,
  createWordInternalDifficultyProfile,
  difficultyModeDirection,
  difficultyModeTier,
  isFixedWordStudyDifficultyMode,
  normalizeWordStudyDifficultyMode,
  wordInternalDifficultyScore,
  wordInternalDifficultyTier
} from "./word-internal-difficulty.mjs";

export const WORD_STUDY_ORDER_MODE = Object.freeze({
  CURRENT: "current",
  RANDOM: "random",
  FAMILY: "family",
  ASSOCIATION: "association",
  // Legacy values are retained only for local preference migration.
  EASY_TO_HARD: "easy-to-hard",
  HARD_TO_EASY: "hard-to-easy"
});

export const WORD_STUDY_ORDER_MODES = Object.freeze([
  { value: WORD_STUDY_ORDER_MODE.CURRENT, label: "现有顺序" },
  { value: WORD_STUDY_ORDER_MODE.RANDOM, label: "随机" },
  { value: WORD_STUDY_ORDER_MODE.FAMILY, label: "词族关系" },
  { value: WORD_STUDY_ORDER_MODE.ASSOCIATION, label: "场景关联" }
]);

export const WORD_STUDY_SEQUENCE_MODES = WORD_STUDY_ORDER_MODES;
export const WORD_STUDY_RELATION_MODES = Object.freeze(
  WORD_STUDY_ORDER_MODES.filter((mode) => (
    mode.value === WORD_STUDY_ORDER_MODE.FAMILY
    || mode.value === WORD_STUDY_ORDER_MODE.ASSOCIATION
  ))
);

export const WORD_STUDY_ORDER_STORAGE_KEY = "ielts_vocab_word_order_modes_v1";
export const WORD_STUDY_ORDER_CURSOR_STORAGE_KEY = "ielts_vocab_word_order_cursors_v1";
export const WORD_STUDY_ORDER_SNAPSHOT_VERSION = 1;

const TOKEN_STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "be", "by", "for", "from", "in", "into",
  "of", "on", "or", "the", "to", "with", "about", "after", "before", "during",
  "related", "service", "services", "someone", "something", "system", "systems",
  "thing", "things", "people", "person", "use", "used", "using", "work", "working"
]);

const SCENE_RULES = [
  ["求职招聘", /求职|招聘|职业|雇佣|工资|薪水|面试|简历|job (?:vacancy|position)|career|employ|recruit|vacancy|salary|interview|resume|occupation/i, /求职|招聘|employment/i],
  ["办公管理", /办公室|公司|部门|经理|管理|会议|合同|截止日期|office|company|department|manager|management|meeting|contract|deadline|staff/i, /办公|商业|管理|business/i],
  ["银行支付", /银行|存款|贷款|现金|付款|支付|账户|押金|费用|预算|价格|bank|deposit|loan|cash|payment|account|fee|budget|price|dollar|card/i, /支付|消费|经济|finance|shopping/i],
  ["邮寄通信", /邮寄|邮件|信件|包裹|邮资|通信|快递|mail|airmail|postage|parcel|letter|delivery|courier/i, /邮寄|通信|公共服务|communication/i],
  ["机场航班", /机场|航班|登机|行李|护照|海关|航空|airport|flight|boarding|luggage|passport|customs|airline|departure|arrival gate/i, /航空|机场|旅行|交通|travel/i],
  ["铁路交通", /铁路|火车|车站|站台|公交|地铁|交通|railway|train|station|platform|bus|subway|transport/i, /交通|铁路/i],
  ["旅行住宿", /旅行|旅游|酒店|宾馆|预订|住宿|景点|travel|tour|hotel|hostel|booking|reservation|accommodation|tourist/i, /旅行|住宿|travel/i],
  ["住房租赁", /住房|房屋|租房|房租|公寓|家具|家务|房东|房客|housing|house|rent|apartment|furniture|household|landlord|tenant/i, /住房|家庭|生活|housing/i],
  ["购物售后", /购物|商店|商品|退款|折扣|收据|顾客|shopping|shop|store|refund|discount|receipt|customer|purchase/i, /购物|消费|shopping/i],
  ["餐饮食物", /餐饮|食物|食品|餐厅|烹饪|饮料|菜单|food|restaurant|cook|meal|drink|menu|recipe/i, /餐饮|食物|消费|food/i],
  ["医疗就诊", /医疗|医院|疾病|症状|诊断|治疗|药物|手术|hospital|disease|illness|symptom|diagnosis|treatment|medicine|surgery|clinical/i, /健康|医疗|health/i],
  ["健康生活", /健康|锻炼|运动|营养|休息|康复|health|exercise|fitness|nutrition|rest|recover|wellbeing/i, /健康|健身|health/i],
  ["校园课程", /学校|校园|课程|课堂|老师|学生|讲座|school|campus|course|class|teacher|student|lecture|tuition/i, /学校|教育|education/i],
  ["考试学习", /学习|考试|测验|作业|入学|奖学金|study|learn|exam|test|assignment|admission|scholarship|qualification/i, /教育|考试|education/i],
  ["环境污染", /环境|污染|垃圾|回收|生态|碳|塑料|environment|pollution|waste|recycle|ecology|carbon|plastic/i, /环境|environment/i],
  ["能源气候", /气候|能源|温度|天气|排放|全球变暖|climate|energy|temperature|weather|emission|global warming/i, /环境|科技|environment/i],
  ["科技网络", /科技|技术|软件|网络|媒体|互联网|设备|technology|software|network|media|internet|device|digital|computer|online/i, /科技|technology/i],
  ["科研数据", /研究|实验|数据|证据|分析|调查|样本|research|experiment|data|evidence|analysis|survey|sample|laboratory/i, /科学|研究|science/i],
  ["政府法律", /政府|法律|犯罪|警察|安全|法庭|政策|选举|government|law|crime|police|security|court|policy|election|politician/i, /政府|法律|社会|government|law/i],
  ["社区服务", /社区|公共服务|市政|设施|图书馆|居民|community|public service|municipal|facility|library|resident/i, /社区|公共服务|community/i],
  ["家庭人际", /家庭|朋友|关系|婚姻|父母|孩子|社交|family|friend|relationship|marriage|parent|child|social/i, /家庭|人际|family/i],
  ["文化活动", /文化|历史|艺术|音乐|电影|活动|典礼|culture|history|art|music|film|event|ceremony|festival/i, /文化|历史|社会|culture/i],
  ["农业自然", /农业|农场|植物|动物|森林|海洋|土壤|agriculture|farm|plant|animal|forest|marine|soil|wildlife/i, /环境|农业|自然|environment/i]
];

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
    .replace(/\s+/g, " ");
}

function wordFromRelation(value) {
  if (typeof value === "string") return value;
  return value?.word || value?.replacement || value?.term || value?.text || "";
}

function phraseFromRelation(value) {
  if (typeof value === "string") return value;
  return value?.phrase || value?.text || value?.collocation || value?.word || "";
}

function relationWords(value) {
  if (!Array.isArray(value)) return [];
  return value.map(wordFromRelation).map(normalizeKey).filter(Boolean);
}

function phraseTokens(value) {
  const phrase = normalizeKey(phraseFromRelation(value));
  if (!phrase) return [];
  return phrase
    .split(/[^a-z0-9']+/i)
    .map(normalizeKey)
    .filter((token) => token.length > 2 && !TOKEN_STOP_WORDS.has(token));
}

function tokenizeEnglish(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[^a-z0-9']+/i)
    .map(normalizeKey)
    .filter((token) => token.length > 2 && !TOKEN_STOP_WORDS.has(token));
}

function deterministicHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function resolveIndexedWords(indices, pool, idictation) {
  const list = Array.isArray(pool) ? pool : [];
  const byIndex = new Map();

  for (let poolIndex = 0; poolIndex < list.length; poolIndex += 1) {
    const word = list[poolIndex];
    const sourceIndex = idictation && Number.isInteger(word?.originalIndex)
      ? word.originalIndex
      : poolIndex;
    byIndex.set(sourceIndex, word);
  }

  return indices
    .map((sourceIndex, order) => ({
      sourceIndex,
      order,
      word: byIndex.get(sourceIndex) || null
    }))
    .filter((entry) => entry.word);
}

function createUnionFind(size) {
  const parent = Array.from({ length: size }, (_, index) => index);

  function find(value) {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
    }
    return root;
  }

  function union(left, right) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  }

  return { find, union };
}

function groupConnectedEntries(entries, linkResolver) {
  const keyToPosition = new Map();
  entries.forEach((entry, position) => {
    const key = normalizeKey(entry.word?.word);
    if (key && !keyToPosition.has(key)) keyToPosition.set(key, position);
  });

  const unionFind = createUnionFind(entries.length);
  entries.forEach((entry, position) => {
    linkResolver(entry.word).forEach((linkedKey) => {
      const linkedPosition = keyToPosition.get(linkedKey);
      if (Number.isInteger(linkedPosition)) unionFind.union(position, linkedPosition);
    });
  });

  const components = new Map();
  entries.forEach((entry, position) => {
    const root = unionFind.find(position);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(entry);
  });

  return [...components.values()];
}

function familyLinks(word) {
  return [
    ...relationWords(word?.wordFamily),
    ...[
      word?.familyRoot,
      word?.rootWord,
      word?.baseWord,
      word?.lemma
    ].map(normalizeKey).filter(Boolean)
  ];
}

function explicitAssociationLinks(word) {
  return [
    ...relationWords(word?.synonyms),
    ...relationWords(word?.relatedWords),
    ...relationWords(word?.associations)
  ];
}

function associationTokens(word) {
  const tokens = [
    ...tokenizeEnglish(word?.word),
    ...tokenizeEnglish(word?.definition),
    ...tokenizeEnglish(word?.meaningEn)
  ];
  [
    ...(Array.isArray(word?.collocations) ? word.collocations : []),
    ...(Array.isArray(word?.phraseCollocations) ? word.phraseCollocations : [])
  ].forEach((item) => tokens.push(...phraseTokens(item)));
  return [...new Set(tokens)];
}

function groupSortValue(group) {
  return Math.min(...group.map((entry) => entry.order));
}

function sortFamilyMembers(group) {
  const incomingLinks = new Map();
  group.forEach((entry) => {
    familyLinks(entry.word).forEach((key) => {
      incomingLinks.set(key, (incomingLinks.get(key) || 0) + 1);
    });
  });

  return [...group].sort((left, right) => {
    const leftKey = normalizeKey(left.word?.word);
    const rightKey = normalizeKey(right.word?.word);
    const leftRootScore = familyLinks(left.word).length * 8 + (incomingLinks.get(leftKey) || 0) * 3;
    const rightRootScore = familyLinks(right.word).length * 8 + (incomingLinks.get(rightKey) || 0) * 3;
    return rightRootScore - leftRootScore
      || leftKey.split(" ").length - rightKey.split(" ").length
      || leftKey.length - rightKey.length
      || left.order - right.order;
  });
}

function sceneKeyForWord(word) {
  const content = [
    word?.word,
    word?.meaning,
    word?.category,
    ...(Array.isArray(word?.collocations) ? word.collocations.map(phraseFromRelation) : []),
    ...(Array.isArray(word?.phraseCollocations) ? word.phraseCollocations.map(phraseFromRelation) : [])
  ].filter(Boolean).join(" ");
  const topics = Array.isArray(word?.topics) ? word.topics.join(" ") : "";
  let bestScene = "";
  let bestScore = 0;

  SCENE_RULES.forEach(([scene, contentPattern, topicPattern]) => {
    const score = (contentPattern.test(content) ? 4 : 0) + (topicPattern.test(topics) ? 2 : 0);
    if (score > bestScore) {
      bestScene = scene;
      bestScore = score;
    }
  });

  return bestScene;
}

function orderSceneEntries(entries) {
  if (entries.length < 2) return entries;

  const profiles = entries.map((entry, position) => ({
    entry,
    position,
    key: normalizeKey(entry.word?.word),
    links: explicitAssociationLinks(entry.word),
    tokens: associationTokens(entry.word)
  }));
  const positionByKey = new Map(profiles.map((profile) => [profile.key, profile.position]));
  const tokenPositions = new Map();

  profiles.forEach((profile) => {
    profile.tokens.forEach((token) => {
      if (!tokenPositions.has(token)) tokenPositions.set(token, []);
      tokenPositions.get(token).push(profile.position);
    });
  });

  const remaining = new Set(profiles.map((profile) => profile.position));
  const ordered = [];
  let currentPosition = Math.min(...remaining);

  while (remaining.size) {
    if (!remaining.has(currentPosition)) currentPosition = Math.min(...remaining);
    const current = profiles[currentPosition];
    ordered.push(current.entry);
    remaining.delete(currentPosition);
    if (!remaining.size) break;

    const scores = new Map();
    current.links.forEach((linkedKey) => {
      const candidatePosition = positionByKey.get(linkedKey);
      if (remaining.has(candidatePosition)) scores.set(candidatePosition, 1000);
    });
    current.tokens.forEach((token) => {
      const positions = tokenPositions.get(token) || [];
      if (positions.length > 80) return;
      const tokenWeight = Math.max(12, 72 - positions.length);
      positions.forEach((candidatePosition) => {
        if (!remaining.has(candidatePosition)) return;
        const candidate = profiles[candidatePosition];
        const headwordBonus = candidate.key === token || current.key === token ? 90 : 0;
        scores.set(
          candidatePosition,
          (scores.get(candidatePosition) || 0) + tokenWeight + headwordBonus
        );
      });
    });

    const strongest = [...scores.entries()]
      .filter(([, score]) => score >= 32)
      .sort((left, right) => right[1] - left[1]
        || profiles[left[0]].entry.order - profiles[right[0]].entry.order)[0];
    currentPosition = strongest?.[0] ?? Math.min(...remaining);
  }

  return ordered;
}

function buildAssociationGroups(entries) {
  const sceneBuckets = new Map();
  const standalone = [];
  const components = groupConnectedEntries(entries, explicitAssociationLinks);

  for (const component of components) {
    const scene = component.map((entry) => sceneKeyForWord(entry.word)).find(Boolean);
    if (!scene) {
      standalone.push(...component);
      continue;
    }
    if (!sceneBuckets.has(scene)) sceneBuckets.set(scene, []);
    sceneBuckets.get(scene).push(...component);
  }

  return [...sceneBuckets.values()]
    .sort((left, right) => groupSortValue(left) - groupSortValue(right))
    .map(orderSceneEntries)
    .concat(standalone.map((entry) => [entry]));
}

export function normalizeWordStudyOrderMode(value) {
  return WORD_STUDY_ORDER_MODES.some((mode) => mode.value === value)
    ? value
    : WORD_STUDY_ORDER_MODE.CURRENT;
}

export function isFixedWordStudyOrderMode(
  value,
  difficultyMode = WORD_STUDY_DIFFICULTY_MODE.DEFAULT
) {
  const normalized = normalizeWordStudyOrderMode(value);
  return isFixedWordStudyDifficultyMode(difficultyMode) || [
    WORD_STUDY_ORDER_MODE.FAMILY,
    WORD_STUDY_ORDER_MODE.ASSOCIATION
  ].includes(normalized);
}

export function wordStudyOrderSnapshotKey(
  mode,
  difficultyMode = WORD_STUDY_DIFFICULTY_MODE.DEFAULT
) {
  return `${normalizeWordStudyOrderMode(mode)}|${normalizeWordStudyDifficultyMode(difficultyMode)}`;
}

export function hasWordStudyInternalDifficulty(indices, pool, {
  idictation = false
} = {}) {
  const words = resolveIndexedWords(
    Array.isArray(indices) ? indices : [],
    pool,
    idictation
  ).map((entry) => entry.word);
  return createWordInternalDifficultyProfile(words).available;
}

export const hasMultipleWordStudyDifficultyLevels = hasWordStudyInternalDifficulty;

function groupDifficultyScore(group) {
  const scores = group.map((entry) => wordInternalDifficultyScore(entry.word))
    .sort((left, right) => left - right);
  return scores[Math.floor((scores.length - 1) / 2)] || 0;
}

function applyDifficultyToGroups(groups, direction) {
  if (!direction) return groups;
  return groups
    .map((group) => [...group].sort((left, right) => (
      (wordInternalDifficultyScore(left.word) - wordInternalDifficultyScore(right.word)) * direction
      || left.order - right.order
    )))
    .sort((left, right) => (
      (groupDifficultyScore(left) - groupDifficultyScore(right)) * direction
      || groupSortValue(left) - groupSortValue(right)
    ));
}

export function orderStudyWordIndices(indices, pool, {
  mode = WORD_STUDY_ORDER_MODE.CURRENT,
  difficultyMode = WORD_STUDY_DIFFICULTY_MODE.DEFAULT,
  difficultyEnabled = true,
  seed = 0,
  idictation = false
} = {}) {
  const source = Array.isArray(indices) ? [...indices] : [];
  const normalizedMode = normalizeWordStudyOrderMode(mode);
  const normalizedDifficultyMode = difficultyEnabled
    ? normalizeWordStudyDifficultyMode(difficultyMode)
    : WORD_STUDY_DIFFICULTY_MODE.DEFAULT;
  if (source.length < 2) return source;

  const resolvedEntries = resolveIndexedWords(source, pool, idictation);
  if (resolvedEntries.length !== source.length) return source;

  if (normalizedMode === WORD_STUDY_ORDER_MODE.RANDOM) {
    return [...resolvedEntries]
      .sort((left, right) => (
        deterministicHash(`${seed}:${normalizeKey(left.word?.word)}:${left.sourceIndex}`)
        - deterministicHash(`${seed}:${normalizeKey(right.word?.word)}:${right.sourceIndex}`)
        || left.order - right.order
      ))
      .map((entry) => entry.sourceIndex);
  }

  const profile = createWordInternalDifficultyProfile(
    resolvedEntries.map((entry) => entry.word)
  );
  const requestedTier = difficultyModeTier(normalizedDifficultyMode);
  const entries = requestedTier && profile.available
    ? resolvedEntries.filter((entry) => (
      wordInternalDifficultyTier(entry.word, profile) === requestedTier
    ))
    : resolvedEntries;
  if (!entries.length) return [];

  let groups;
  if (normalizedMode === WORD_STUDY_ORDER_MODE.FAMILY) {
    groups = groupConnectedEntries(entries, familyLinks)
      .map(sortFamilyMembers)
      .sort((left, right) => groupSortValue(left) - groupSortValue(right));
  } else if (normalizedMode === WORD_STUDY_ORDER_MODE.ASSOCIATION) {
    groups = buildAssociationGroups(entries);
  } else {
    groups = entries.map((entry) => [entry]);
  }

  return applyDifficultyToGroups(
    groups,
    difficultyModeDirection(normalizedDifficultyMode)
  )
    .flat()
    .map((entry) => entry.sourceIndex);
}

export function wordStudyOrderEntryKey(word, sourceIndex, { idictation = false } = {}) {
  const stableId = word?.wordId ?? word?.id ?? word?.inputId ?? "";
  if (String(stableId).trim()) return `id:${String(stableId).trim()}`;

  const wordKey = normalizeKey(word?.word);
  if (!idictation) return `word:${wordKey}`;

  const sourceKey = normalizeKey(
    word?.sourceKey || word?.source || word?.chapter || word?.category
  );
  return `idictation:${sourceKey}:${wordKey}:${Number.isInteger(sourceIndex) ? sourceIndex : ""}`;
}

function wordBySourceIndex(pool, idictation) {
  const result = new Map();
  (Array.isArray(pool) ? pool : []).forEach((word, poolIndex) => {
    const sourceIndex = idictation && Number.isInteger(word?.originalIndex)
      ? word.originalIndex
      : poolIndex;
    result.set(sourceIndex, word);
  });
  return result;
}

export function createWordStudyOrderSnapshot(orderedIndices, pool, {
  idictation = false,
  cursorIndex = null
} = {}) {
  const byIndex = wordBySourceIndex(pool, idictation);
  const keys = [];
  const seen = new Set();

  (Array.isArray(orderedIndices) ? orderedIndices : []).forEach((sourceIndex) => {
    const word = byIndex.get(sourceIndex);
    if (!word) return;
    const key = wordStudyOrderEntryKey(word, sourceIndex, { idictation });
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  });

  const cursorWord = byIndex.get(cursorIndex);
  const cursorKey = cursorWord
    ? wordStudyOrderEntryKey(cursorWord, cursorIndex, { idictation })
    : keys[0] || "";

  return {
    version: WORD_STUDY_ORDER_SNAPSHOT_VERSION,
    keys,
    cursorKey: keys.includes(cursorKey) ? cursorKey : keys[0] || ""
  };
}

export function reconcileWordStudyOrderSnapshot(
  snapshot,
  currentIndices,
  pool,
  {
    idictation = false,
    fallbackOrder = currentIndices
  } = {}
) {
  const byIndex = wordBySourceIndex(pool, idictation);
  const eligibleByKey = new Map();

  (Array.isArray(currentIndices) ? currentIndices : []).forEach((sourceIndex) => {
    const word = byIndex.get(sourceIndex);
    if (!word) return;
    const key = wordStudyOrderEntryKey(word, sourceIndex, { idictation });
    if (key && !eligibleByKey.has(key)) eligibleByKey.set(key, sourceIndex);
  });

  const keys = [];
  const seen = new Set();
  const appendKey = (key) => {
    if (!key || seen.has(key) || !eligibleByKey.has(key)) return;
    seen.add(key);
    keys.push(key);
  };

  (Array.isArray(snapshot?.keys) ? snapshot.keys : []).forEach(appendKey);
  (Array.isArray(fallbackOrder) ? fallbackOrder : []).forEach((sourceIndex) => {
    const word = byIndex.get(sourceIndex);
    if (word) appendKey(wordStudyOrderEntryKey(word, sourceIndex, { idictation }));
  });
  eligibleByKey.forEach((_, key) => appendKey(key));

  const requestedCursorKey = String(snapshot?.cursorKey || "");
  const cursorKey = keys.includes(requestedCursorKey)
    ? requestedCursorKey
    : keys[0] || "";
  const nextSnapshot = {
    version: WORD_STUDY_ORDER_SNAPSHOT_VERSION,
    keys,
    cursorKey
  };
  const previousKeys = Array.isArray(snapshot?.keys) ? snapshot.keys : [];
  const changed = Number(snapshot?.version) !== WORD_STUDY_ORDER_SNAPSHOT_VERSION
    || snapshot?.cursorKey !== cursorKey
    || previousKeys.length !== keys.length
    || previousKeys.some((key, index) => key !== keys[index]);

  return {
    indices: keys.map((key) => eligibleByKey.get(key)),
    cursorIndex: eligibleByKey.get(cursorKey),
    snapshot: nextSnapshot,
    changed
  };
}

export function updateWordStudyOrderSnapshotCursor(
  snapshot,
  word,
  sourceIndex,
  { idictation = false } = {}
) {
  if (!snapshot || !word) return snapshot;
  const cursorKey = wordStudyOrderEntryKey(word, sourceIndex, { idictation });
  if (!snapshot.keys?.includes(cursorKey) || snapshot.cursorKey === cursorKey) return snapshot;
  return { ...snapshot, cursorKey };
}

export function readWordStudyOrderPreferences(storageGet) {
  try {
    const raw = storageGet?.(WORD_STUDY_ORDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeWordStudyOrderPreferences(preferences, storageSet) {
  try {
    storageSet?.(WORD_STUDY_ORDER_STORAGE_KEY, JSON.stringify(preferences || {}));
    return true;
  } catch {
    return false;
  }
}

export function readWordStudyOrderCursors(storageGet) {
  try {
    const raw = storageGet?.(WORD_STUDY_ORDER_CURSOR_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeWordStudyOrderCursors(cursors, storageSet) {
  try {
    storageSet?.(WORD_STUDY_ORDER_CURSOR_STORAGE_KEY, JSON.stringify(cursors || {}));
    return true;
  } catch {
    return false;
  }
}
