export const WORD_STUDY_ORDER_MODE = Object.freeze({
  CURRENT: "current",
  RANDOM: "random",
  FAMILY: "family",
  ASSOCIATION: "association"
});

export const WORD_STUDY_ORDER_MODES = Object.freeze([
  { value: WORD_STUDY_ORDER_MODE.CURRENT, label: "现有顺序" },
  { value: WORD_STUDY_ORDER_MODE.RANDOM, label: "随机" },
  { value: WORD_STUDY_ORDER_MODE.FAMILY, label: "词族" },
  { value: WORD_STUDY_ORDER_MODE.ASSOCIATION, label: "场景关联" }
]);

export const WORD_STUDY_ORDER_STORAGE_KEY = "ielts_vocab_word_order_modes_v1";

const ASSOCIATION_GROUP_SIZE = 8;
const TOKEN_STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "be", "by", "for", "from", "in", "into",
  "of", "on", "or", "the", "to", "with"
]);

const SCENE_RULES = [
  ["求职招聘", /求职|招聘|职位|职业|雇佣|工资|薪水|面试|job|career|employ|recruit|vacancy|salary|interview/i],
  ["邮寄通信", /邮寄|邮件|信件|包裹|邮资|通信|mail|airmail|postage|parcel|letter|delivery/i],
  ["机场出行", /机场|航班|登机|行李|护照|海关|旅行|旅游|交通|airport|flight|boarding|luggage|passport|customs|travel|transport/i],
  ["医疗健康", /医疗|健康|医院|疾病|症状|诊断|治疗|康复|medicine|medical|health|hospital|symptom|diagnosis|treatment|recover/i],
  ["住房生活", /住房|房屋|租房|房租|公寓|家具|家务|housing|house|rent|apartment|furniture|household/i],
  ["教育考试", /教育|学校|课程|课堂|学习|考试|入学|奖学金|education|school|course|class|exam|admission|scholarship/i],
  ["购物消费", /购物|消费|商店|价格|付款|退款|折扣|shopping|consumer|store|price|payment|refund|discount/i],
  ["餐饮食物", /餐饮|食物|食品|餐厅|烹饪|饮料|food|restaurant|cook|meal|drink/i],
  ["环境气候", /环境|气候|污染|能源|回收|生态|environment|climate|pollution|energy|recycle|ecology/i],
  ["科技媒体", /科技|技术|软件|网络|媒体|互联网|technology|software|network|media|internet/i],
  ["法律安全", /法律|犯罪|警察|安全|法庭|law|crime|police|security|court/i],
  ["社区服务", /社区|公共服务|政府|市政|设施|community|public service|government|facility/i],
  ["人际社交", /家庭|朋友|关系|社交|交流|family|friend|relationship|social|communication/i]
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

function associationLinks(word) {
  const links = [
    ...relationWords(word?.synonyms),
    ...relationWords(word?.relatedWords),
    ...relationWords(word?.associations)
  ];

  const ownTokens = phraseTokens(word?.word);
  if (ownTokens.length > 1) links.push(...ownTokens);

  [
    ...(Array.isArray(word?.collocations) ? word.collocations : []),
    ...(Array.isArray(word?.phraseCollocations) ? word.phraseCollocations : [])
  ].forEach((item) => links.push(...phraseTokens(item)));

  return [...new Set(links)];
}

function groupSortValue(group) {
  return Math.min(...group.map((entry) => entry.order));
}

function sortFamilyMembers(group) {
  return [...group].sort((left, right) => {
    const leftKey = normalizeKey(left.word?.word);
    const rightKey = normalizeKey(right.word?.word);
    return leftKey.split(" ").length - rightKey.split(" ").length
      || leftKey.length - rightKey.length
      || left.order - right.order;
  });
}

function sceneKeyForWord(word) {
  const searchable = [
    word?.word,
    word?.meaning,
    word?.category,
    ...(Array.isArray(word?.topics) ? word.topics : []),
    ...(Array.isArray(word?.collocations) ? word.collocations.map(phraseFromRelation) : []),
    ...(Array.isArray(word?.phraseCollocations) ? word.phraseCollocations.map(phraseFromRelation) : [])
  ].filter(Boolean).join(" ");

  return SCENE_RULES.find(([, pattern]) => pattern.test(searchable))?.[0] || "";
}

function splitGroup(group, size = ASSOCIATION_GROUP_SIZE) {
  const chunks = [];
  for (let offset = 0; offset < group.length; offset += size) {
    chunks.push(group.slice(offset, offset + size));
  }
  return chunks;
}

function buildAssociationGroups(entries) {
  const explicitComponents = groupConnectedEntries(entries, associationLinks)
    .map((group) => [...group].sort((left, right) => left.order - right.order));
  const sceneBuckets = new Map();
  const standalone = [];

  for (const component of explicitComponents) {
    const scene = component.map((entry) => sceneKeyForWord(entry.word)).find(Boolean) || "";
    if (!scene) {
      if (component.length > 1) standalone.push(...splitGroup(component));
      else standalone.push(component);
      continue;
    }
    if (!sceneBuckets.has(scene)) sceneBuckets.set(scene, []);
    sceneBuckets.get(scene).push(component);
  }

  const sceneGroups = [];
  for (const components of sceneBuckets.values()) {
    const flattened = components
      .sort((left, right) => groupSortValue(left) - groupSortValue(right))
      .flat();
    sceneGroups.push(...splitGroup(flattened));
  }

  return [...sceneGroups, ...standalone]
    .sort((left, right) => groupSortValue(left) - groupSortValue(right));
}

export function normalizeWordStudyOrderMode(value) {
  return WORD_STUDY_ORDER_MODES.some((mode) => mode.value === value)
    ? value
    : WORD_STUDY_ORDER_MODE.CURRENT;
}

export function orderStudyWordIndices(indices, pool, {
  mode = WORD_STUDY_ORDER_MODE.CURRENT,
  seed = 0,
  idictation = false
} = {}) {
  const source = Array.isArray(indices) ? [...indices] : [];
  const normalizedMode = normalizeWordStudyOrderMode(mode);
  if (normalizedMode === WORD_STUDY_ORDER_MODE.CURRENT || source.length < 2) return source;

  const entries = resolveIndexedWords(source, pool, idictation);
  if (entries.length !== source.length) return source;

  if (normalizedMode === WORD_STUDY_ORDER_MODE.RANDOM) {
    return [...entries]
      .sort((left, right) => (
        deterministicHash(`${seed}:${normalizeKey(left.word?.word)}:${left.sourceIndex}`)
        - deterministicHash(`${seed}:${normalizeKey(right.word?.word)}:${right.sourceIndex}`)
        || left.order - right.order
      ))
      .map((entry) => entry.sourceIndex);
  }

  if (normalizedMode === WORD_STUDY_ORDER_MODE.FAMILY) {
    return groupConnectedEntries(entries, familyLinks)
      .map(sortFamilyMembers)
      .sort((left, right) => groupSortValue(left) - groupSortValue(right))
      .flat()
      .map((entry) => entry.sourceIndex);
  }

  return buildAssociationGroups(entries)
    .flat()
    .map((entry) => entry.sourceIndex);
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
