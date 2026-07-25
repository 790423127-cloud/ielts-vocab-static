const COMMON_BASIC_HEADWORDS = new Set(`
a an the this that these those i me my mine you your yours he him his she her hers it its
we us our ours they them their theirs who what when where why how which all any both each
every few many much more most some no none one two three four five six seven eight nine ten
first second third yes not very too also only even again still just already always never often
sometimes usually here there now then today tomorrow yesterday morning afternoon evening night
day week month year time hour minute early late before after during while until since
and or but so because if though although than as like with without for from to of in on at by
near under over above below between behind beside around through across into out up down left right
be am is are was were been being have has had do does did can could may might must shall should
will would go goes went gone come came get got make made take took give gave know knew think thought
see saw look watch hear listen say said tell told ask answer call use work play try need want like
love hate help keep put let start stop open close turn move live stay bring buy pay sell send show
find feel become leave mean set meet run walk sit stand wait follow learn study teach read write
speak talk eat drink cook wash clean sleep wake wear carry drive ride fly travel visit build cut
break choose remember forget understand change grow happen begin end win lose
good bad big small long short high low old new young hot cold warm cool fast slow easy hard
happy sad angry afraid tired busy free full empty clean dirty rich poor strong weak safe dangerous
right wrong same different important ready sure kind nice great fine well better best
man woman boy girl child children person people friend family mother father mum mom dad brother
sister son daughter husband wife baby parent home house room door window wall floor bed chair table
desk kitchen bathroom garden school class teacher student book page paper pen pencil bag box
work job office shop store market money price food water bread rice meat fish egg milk tea coffee
fruit apple banana orange vegetable breakfast lunch dinner road street car bus train taxi bike
bicycle plane airport station ticket city town village country place hospital doctor nurse body
head face eye ear nose mouth hand arm leg foot feet heart name number color weather rain snow sun
wind cloud animal dog cat bird horse farm tree flower grass sea river lake mountain beach
phone computer internet email picture music song film movie game sport ball clothes shirt shoe shoes
coat dress hat key light fire air earth world life thing way part side end problem question idea
story word language english chinese
`.trim().split(/\s+/));

const IRREGULAR_BASIC_BASES = new Map(Object.entries({
  children: "child",
  men: "man",
  women: "woman",
  people: "person",
  feet: "foot",
  teeth: "tooth",
  mice: "mouse",
  geese: "goose",
  went: "go",
  gone: "go",
  came: "come",
  did: "do",
  done: "do",
  made: "make",
  had: "have",
  saw: "see",
  seen: "see",
  took: "take",
  taken: "take",
  got: "get",
  gotten: "get",
  gave: "give",
  given: "give",
  knew: "know",
  known: "know",
  thought: "think",
  found: "find",
  felt: "feel",
  left: "leave",
  told: "tell",
  became: "become",
  began: "begin",
  begun: "begin",
  bought: "buy",
  brought: "bring",
  wrote: "write",
  written: "write",
  spoke: "speak",
  spoken: "speak",
  ran: "run",
  ate: "eat",
  eaten: "eat",
  drank: "drink",
  drunk: "drink",
  slept: "sleep",
  sat: "sit",
  stood: "stand",
  paid: "pay",
  met: "meet",
  sent: "send",
  built: "build",
  lost: "lose",
  held: "hold",
  heard: "hear"
}));

const EVERYDAY_USES = new Set(["生活高频", "工作高频"]);
const EVERYDAY_TOPICS = new Set([
  "家庭", "学校", "家", "食物", "购物", "交通", "健康", "天气", "时间", "颜色",
  "数字", "身体", "职业", "衣服", "地点", "自然", "动物", "兴趣", "方向", "工作",
  "住房", "消费", "旅行", "社区", "公共服务"
]);

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function addCandidateBase(found, value) {
  const key = normalizeKey(value);
  if (key && key.length >= 2) found.add(key);
}

function possibleBasicBases(key) {
  const found = new Set();
  const irregular = IRREGULAR_BASIC_BASES.get(key);
  if (irregular) found.add(irregular);

  if (key.length >= 4 && key.endsWith("ies")) addCandidateBase(found, `${key.slice(0, -3)}y`);
  if (key.length >= 4 && key.endsWith("ied")) addCandidateBase(found, `${key.slice(0, -3)}y`);

  if (key.length >= 4 && key.endsWith("es")) {
    addCandidateBase(found, key.slice(0, -2));
    addCandidateBase(found, key.slice(0, -1));
  } else if (key.length >= 4 && key.endsWith("s") && !key.endsWith("ss")) {
    addCandidateBase(found, key.slice(0, -1));
  }

  if (key.length >= 5 && key.endsWith("ing")) {
    const stem = key.slice(0, -3);
    addCandidateBase(found, stem);
    addCandidateBase(found, `${stem}e`);
    if (stem.length >= 3 && stem.at(-1) === stem.at(-2)) addCandidateBase(found, stem.slice(0, -1));
  }

  if (key.length >= 4 && key.endsWith("ed")) {
    const stem = key.slice(0, -2);
    addCandidateBase(found, stem);
    addCandidateBase(found, `${stem}e`);
    if (stem.length >= 3 && stem.at(-1) === stem.at(-2)) addCandidateBase(found, stem.slice(0, -1));
  }

  if (key.length >= 5 && key.endsWith("er")) {
    const stem = key.slice(0, -2);
    addCandidateBase(found, stem);
    addCandidateBase(found, `${stem}e`);
    if (stem.length >= 3 && stem.at(-1) === stem.at(-2)) addCandidateBase(found, stem.slice(0, -1));
  }

  if (key.length >= 6 && key.endsWith("est")) {
    const stem = key.slice(0, -3);
    addCandidateBase(found, stem);
    addCandidateBase(found, `${stem}e`);
    if (stem.length >= 3 && stem.at(-1) === stem.at(-2)) addCandidateBase(found, stem.slice(0, -1));
  }

  return [...found];
}

function stringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function matchesBasicDifficulty(value) {
  const text = normalizeKey(value);
  if (!text) return false;
  return (
    ["零基础", "基础", "基础高频", "基础必会", "入门", "初级"].some((label) => text.includes(label)) ||
    /(^|[\s·/_-])(pre-?a1|a1|a2|beginner|elementary)(?=$|[\s·/_-])/.test(text)
  );
}

function matchesBasicCategory(value) {
  const text = normalizeKey(value);
  if (!text) return false;
  return ["零基础", "基础单词", "基础词", "入门", "日常常用", "生活常用"].some((label) => text.includes(label));
}

function hasCommonPartOfSpeech(value) {
  const text = normalizeKey(value);
  if (!text) return false;
  return [
    "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction",
    "determiner", "number", "numeral", "名词", "动词", "形容词", "副词", "代词",
    "介词", "连词", "限定词", "数词"
  ].some((label) => text.includes(label));
}

export function evaluateSimpleWord(word) {
  const key = normalizeKey(word?.word);
  if (!key || !/^[a-z][a-z'-]*$/.test(key)) {
    return { isSimple: false, score: 0, reasonCodes: [], matchedBase: "" };
  }

  let score = 0;
  let matchedBase = "";
  const reasonCodes = [];
  const addReason = (code, points) => {
    if (!reasonCodes.includes(code)) reasonCodes.push(code);
    score += points;
  };

  if (COMMON_BASIC_HEADWORDS.has(key)) {
    matchedBase = key;
    addReason("core_basic_headword", 4);
  } else {
    const base = possibleBasicBases(key).find((candidate) => COMMON_BASIC_HEADWORDS.has(candidate));
    if (base) {
      matchedBase = base;
      addReason("basic_word_form", 3);
    }
  }

  if (matchesBasicDifficulty(word?.difficulty)) addReason("basic_difficulty", 4);
  if (matchesBasicCategory(word?.category)) addReason("basic_category", 3);

  const uses = stringList(word?.ieltsUse);
  const topics = stringList(word?.topics);
  const everydayUse = uses.some((value) => EVERYDAY_USES.has(value));
  const everydayTopic = topics.some((value) => EVERYDAY_TOPICS.has(value));

  if (everydayUse) addReason("everyday_usage", 1);
  if (everydayTopic) addReason("everyday_topic", 1);

  const shortCommonWord =
    key.length <= 7 &&
    hasCommonPartOfSpeech(word?.pos) &&
    (everydayUse || everydayTopic || matchesBasicCategory(word?.category));
  if (shortCommonWord) addReason("short_common_word", 1);

  return {
    isSimple: score >= 3,
    score,
    reasonCodes: score >= 3 ? reasonCodes : [],
    matchedBase
  };
}
