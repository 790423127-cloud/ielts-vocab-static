import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PATCH_COLUMNS,
  auditSemanticVocabulary,
  exampleTargetStatus,
  hashExample,
  hashMeaning,
  toTsv
} from "./lib/vocab-semantic-quality-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, ".static-export-cache", "words.json");
const DATA_DIR = path.join(ROOT, "data", "vocab-semantic-quality");

const MANUAL_EXAMPLES = {
  bat: ["He hit the ball with a bat.", "他用球棒击球。"],
  bay: ["The ship anchored in the bay.", "船停泊在海湾里。"],
  box: ["He put the gift in a small box.", "他把礼物放进一个小盒子里。"],
  by: ["I go to school by bus.", "我乘公交车去学校。"],
  day: ["I work eight hours a day.", "我每天工作八小时。"],
  den: ["The fox hid in its den.", "狐狸躲进了洞穴。"],
  gem: ["The jeweller found a rare gem in the box.", "珠宝商在盒子里发现了一颗稀有宝石。"],
  hug: ["She gave her friend a warm hug.", "她热情地拥抱了朋友。"],
  jar: ["She stored the biscuits in a jar.", "她把饼干放在罐子里。"],
  joy: ["The good news brought us great joy.", "这个好消息给我们带来了极大的喜悦。"],
  mug: ["He poured coffee into a mug.", "他把咖啡倒进马克杯。"],
  nap: ["I took a short nap after lunch.", "午饭后我小睡了一会儿。"],
  pod: ["Each coffee pod makes one cup.", "每个咖啡胶囊可以冲一杯咖啡。"],
  wit: ["Her quick wit made everyone laugh.", "她的机智逗得大家发笑。"],
  ice: ["The roads are covered with ice.", "道路被冰覆盖了。"],
  mud: ["The car got stuck in the mud.", "汽车陷在泥里。"],
  sea: ["We went swimming in the sea.", "我们去海里游泳了。"],
  ago: ["I moved here two years ago.", "我两年前搬到这里。"],
  app: ["I downloaded a fitness app.", "我下载了一个健身应用。"],
  aug: ["The event is on 10 August.", "活动在8月10日举行。"],
  awe: ["The Grand Canyon filled me with awe.", "大峡谷令我心生敬畏。"],
  bin: ["Please put the paper in the blue bin.", "请把纸放进蓝色垃圾桶。"],
  bra: ["She chose a comfortable bra.", "她选了一件舒适的胸罩。"],
  era: ["We live in a digital era.", "我们生活在数字时代。"],
  eve: ["We had a party on New Year's Eve.", "我们在除夕举办了聚会。"],
  fat: ["This meat has too much fat.", "这块肉含有太多脂肪。"],
  fax: ["Please send the contract by fax.", "请用传真发送合同。"],
  fur: ["She wore a coat made of fake fur.", "她穿了一件人造毛皮大衣。"],
  hub: ["The city is a major transport hub.", "这座城市是一个重要的交通枢纽。"],
  ink: ["Please sign the form with black ink.", "请用黑色墨水签署表格。"],
  kit: ["I bought a first-aid kit.", "我买了一个急救包。"],
  lag: ["The video call began to lag.", "视频通话开始出现延迟。"],
  law: ["Driving without a licence is against the law.", "无证驾驶是违法的。"],
  oak: ["The table is made of oak.", "这张桌子由橡木制成。"],
  pie: ["She ate a slice of apple pie.", "她吃了一片苹果派。"],
  sex: ["The form asks for your name, age, and sex.", "表格要求填写姓名、年龄和性别。"],
  spy: ["He was accused of being a spy.", "他被指控是一名间谍。"],
  toy: ["The child played with a toy car.", "孩子玩了一辆玩具车。"],
  payload: ["The truck's payload capacity is 10 tons, suitable for heavy cargo transport.", "这辆卡车的有效载荷为10吨，适合运输重型货物。"],
  janitor: ["The janitor cleans the office after everyone leaves.", "所有人离开后，管理员会打扫办公室。"],
  hotline: ["Call the customer hotline if you need urgent help.", "如需紧急帮助，请拨打客户热线。"],
  prestige: ["The award brought prestige to the university.", "这个奖项为该大学带来了声望。"],
  boiler: ["The boiler broke down last winter, so the landlord replaced it.", "锅炉去年冬天坏了，因此房东更换了它。"]
};

const GENERIC_CN_TRANSLATIONS = {
  maternity: "员工手册说明了产假政策。",
  electrician: "房东派了一名电工来修理线路。",
  workload: "由于新项目，我这个月的工作量翻了一番，需要加班。",
  overdraft: "银行批准了我活期账户500美元的透支额度，以支付意外开支。",
  unsatisfactory: "维修结果不能令人满意，所以我要求退款。",
  rectify: "我写信请求你们尽快纠正最新发票中的账单错误。",
  tenancy: "租赁协议规定，我们搬走前必须提前两个月通知。",
  boiler: "锅炉去年冬天坏了，因此房东更换了它。",
  redundancy: "公司宣布裁员后，许多员工开始寻找新工作。",
  verification: "身份核验需要两个工作日。",
  rota: "我更喜欢值班表上的早班，但同事想和我换班。",
  arrears: "如果连续三个月不交房租，你将拖欠租金并面临被驱逐的风险。",
  clarification: "你能否说明信中提到的付款条款？",
  roadworks: "M25高速公路的道路施工今天早上造成了两小时延误。",
  owing: "活动因天气恶劣而取消。",
  leasehold: "这套公寓以租赁产权出售，而不是永久产权。",
  freehold: "这套房屋是永久产权，因此房屋和土地都归你所有。",
  mould: "浴室天花板出现了黑霉，房东必须安排清除。",
  eviction: "多次迟交房租可能导致被驱逐。",
  groundwork: "扩建工程的基础施工星期一开始。",
  refurbish: "市政委员会决定翻新社区中心，提高其能源效率。",
  paternity: "他申请了两周陪产假。",
  sicknote: "请在三天内上传病假条。",
  standingorder: "房租通过定期转账在每月一日支付。",
  directdebit: "请为健身房会员费设置直接借记。",
  "follow-up": "后续电子邮件将确认预订。",
  notwithstanding: "尽管有所延误，活动仍按计划举行。",
  henceforth: "今后必须在网上预订。"
};

const CORE_MEANINGS = {
  issue: { definition: "an important subject or problem for discussion", detail: "作名词常指需要讨论或解决的问题，也可指公共议题；在通知和投诉语境中尤其常见。", senses: [["问题；待解决事项", "noun", "一般问题"], ["议题；争议事项", "noun", "公共讨论"]] },
  charge: { definition: "to ask someone to pay a price, or an amount of money asked for a service", detail: "可作动词表示收费或指控，也可作名词表示费用；电子设备语境中还表示充电。", senses: [["收费；费用", "noun/verb", "服务与账单"], ["指控", "noun/verb", "法律"], ["充电", "verb", "设备"]] },
  claim: { definition: "to say that something is true or to ask formally for money or a right", detail: "既可表示声称，也常用于保险、福利和退款语境，表示正式索赔或申领。", senses: [["声称；主张", "verb", "陈述"], ["索赔；申领", "noun/verb", "保险与福利"]] },
  cover: { definition: "to place something over another thing, include a subject, or protect against a cost", detail: "除覆盖外，在课程中可表示涵盖内容，在保险语境中表示承保或承担费用。", senses: [["覆盖；遮盖", "verb", "物理动作"], ["涵盖；涉及", "verb", "内容范围"], ["承保；承担费用", "verb", "保险"]] },
  account: { definition: "an arrangement with a bank or service, or a description of an event", detail: "常指银行或网络账户；在阅读中也可表示对事件的叙述或说明。", senses: [["账户；账号", "noun", "银行与服务"], ["叙述；说明", "noun", "阅读"]] },
  notice: { definition: "information or a warning given in writing, or the act of becoming aware of something", detail: "作名词常指通知、公告或提前告知期；作动词表示注意到。", senses: [["通知；公告", "noun", "公共信息"], ["提前通知", "noun", "租赁与工作"], ["注意到", "verb", "感知"]] },
  due: { definition: "expected or required at a particular time, or caused by something", detail: "可表示到期、应支付，也用于 due to 表示由于；注意不同结构对应不同词性功能。", senses: [["到期的；应支付的", "adjective", "时间与付款"], ["由于", "preposition phrase", "due to"]] },
  rent: { definition: "money paid regularly for the use of a room, building or land", detail: "通常指按期支付的房租或租金；作动词时表示租用或出租。", senses: [["租金；房租", "noun", "住房"], ["租用；出租", "verb", "住房"]] },
  deposit: { definition: "money paid in advance as security, or money placed in a bank account", detail: "住房语境常指押金，银行语境指存款；作动词可表示存入或放下。", senses: [["押金", "noun", "租赁"], ["存款；存入", "noun/verb", "银行"]] },
  shift: { definition: "a period of work or a change in position, direction or opinion", detail: "工作语境中指轮班或班次；阅读中也常表示位置、趋势或观点的转变。", senses: [["轮班；班次", "noun", "工作"], ["转变；移动", "noun/verb", "变化"]] },
  leave: { definition: "to go away from a place, or permitted time away from work", detail: "作动词表示离开或留下；作名词时在工作语境中表示获准休假。", senses: [["离开；留下", "verb", "一般动作"], ["休假；假期", "noun", "工作"]] },
  appeal: { definition: "a formal request to change a decision, or a quality that attracts people", detail: "法律和行政语境中指上诉、申诉；描述产品或地点时可指吸引力。", senses: [["上诉；申诉", "noun/verb", "法律与行政"], ["吸引力", "noun", "评价"]] },
  fine: { definition: "money paid as a punishment, or of good quality", detail: "作名词通常指罚款；作形容词可表示好的、精细的，也可表示身体状况尚可。", senses: [["罚款", "noun", "规则与处罚"], ["好的；精细的", "adjective", "质量"]] },
  current: { definition: "happening or existing now, or a continuous movement of water or electricity", detail: "作形容词表示当前的；作名词可指水流、洋流或电流，需依语境判断。", senses: [["当前的；现行的", "adjective", "时间"], ["水流；洋流", "noun", "自然"], ["电流", "noun", "电力"]] },
  reserve: { definition: "to keep something for future use or arrange for it to be available", detail: "常表示预订座位或房间，也可表示保留资源；名词还可指储备。", senses: [["预订", "verb", "旅行与服务"], ["保留；储备", "noun/verb", "资源"]] },
  address: { definition: "the details of where someone lives, or to deal with a problem", detail: "名词指地址；作动词可表示向某人讲话，也常表示处理问题。", senses: [["地址", "noun", "联系信息"], ["处理；应对", "verb", "问题"], ["向……讲话", "verb", "交流"]] },
  subject: { definition: "a topic of study or discussion, or something affected by a condition", detail: "可指学科、主题或研究对象；subject to 表示受某条件约束或可能发生。", senses: [["科目；主题", "noun", "学习与讨论"], ["研究对象", "noun", "研究"], ["受……约束", "adjective", "subject to"]] },
  term: { definition: "a word used for a particular idea, a school period, or a condition in an agreement", detail: "可指术语、学期，也常以复数 terms 表示合同或付款条款。", senses: [["术语", "noun", "语言"], ["学期", "noun", "教育"], ["条款；条件", "noun", "合同"]] },
  balance: { definition: "the amount of money remaining in an account, or a state in which things are equal", detail: "银行语境指账户余额；一般语境表示平衡，也可作动词表示使两者兼顾。", senses: [["余额", "noun", "银行"], ["平衡；均衡", "noun/verb", "一般关系"]] }
};

const CN_COMPLEMENTS = [
  [/新法律|法律/u, "new law"], [/工作|职位/u, "job"], [/流感/u, "flu"], [/海边/u, "sea"], [/腿/u, "leg"],
  [/健身房/u, "gym"], [/太阳|阳光/u, "sun"], [/牙龈/u, "gums"], [/冰上/u, "ice"], [/战争/u, "war"],
  [/垃圾桶/u, "bin"], [/海湾/u, "bay"], [/公交/u, "bus"], [/橡木/u, "oak"], [/英国/u, "England"],
  [/耳边/u, "her ear"], [/床/u, "bed"], [/实验室/u, "laboratory"], [/自动取款机/u, "cash machine"], [/空气/u, "air"],
  [/大本钟/u, "Big Ben"], [/密码/u, "log in"], [/法律面前/u, "law"], [/儿子/u, "son"], [/汽车|车里/u, "car"],
  [/美国/u, "United States"], [/咖啡|茶/u, "tea"], [/申请/u, "position"], [/课程/u, "course"], [/学校/u, "school"],
  [/河|海岸/u, "coast"], [/桌/u, "table"], [/包/u, "bag"], [/提案|建议/u, "proposal"], [/报告/u, "report"]
];

function completionFromChinese(text) {
  for (const [pattern, value] of CN_COMPLEMENTS) if (pattern.test(text)) return value;
  return "the matter";
}

function repairBrokenExample(entry) {
  const manual = MANUAL_EXAMPLES[entry.word];
  if (manual) return { example: manual[0], exampleCn: manual[1] };
  let example = String(entry.example || "").replace(/\s+([,.!?;:])/g, "$1").trim();
  example = example
    .replace(/New Year['’]\.$/i, "New Year's Day.")
    .replace(/everyone['’]\.$/i, "everyone's attention.")
    .replace(/their\.$/i, "their destination.")
    .replace(/your\.$/i, "your application.");
  const complement = completionFromChinese(String(entry.exampleCn || ""));
  const endings = ["with", "in", "on", "of", "a", "an", "the", "to", "from", "at", "by", "for", "my", "his", "her", "its", "our"];
  for (const ending of endings) {
    const pattern = new RegExp(`\\b${ending}\\.$`, "i");
    if (!pattern.test(example)) continue;
    if (["a", "an", "the", "my", "his", "her", "its", "our"].includes(ending)) example = example.replace(/\.$/, ` ${complement}.`);
    else example = example.replace(/\.$/, ` the ${complement}.`).replace(/\bthe the\b/i, "the");
    break;
  }
  return { example, exampleCn: entry.exampleCn };
}

function row(entry, action, values = {}) {
  return {
    id: String(entry.id || entry.wordId || ""), word: entry.word, action,
    setJson: values.setJson ? JSON.stringify(values.setJson) : "",
    addFormsJson: values.addFormsJson ? JSON.stringify(values.addFormsJson) : "",
    addMeaningsJson: values.addMeaningsJson ? JSON.stringify(values.addMeaningsJson) : "",
    addQuizSensesJson: values.addQuizSensesJson ? JSON.stringify(values.addQuizSensesJson) : "",
    reason: values.reason || "", evidence: values.evidence || "",
    expectedMeaningHash: hashMeaning(entry), expectedExampleHash: hashExample(entry)
  };
}

function main() {
  const payload = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  const words = payload.words || payload;
  const byWord = new Map(words.map((entry) => [entry.word, entry]));
  const audit = auditSemanticVocabulary(payload);
  const p0Categories = new Map();
  for (const item of audit.issues.filter((issue) => issue.priority === "P0")) {
    if (!p0Categories.has(item.id)) p0Categories.set(item.id, new Set());
    p0Categories.get(item.id).add(item.category);
  }
  const p0Rows = [];
  for (const entry of words) {
    const id = String(entry.id || entry.wordId || "");
    const categories = p0Categories.get(id);
    const manual = MANUAL_EXAMPLES[entry.word];
    const genericCn = GENERIC_CN_TRANSLATIONS[entry.word];
    if (entry.word === "neff") {
      p0Rows.push(row(entry, "delete", { reason: "source-noise", evidence: "未在本地剑雅G类10-21语料中发现；释义eff无中文且不具通用学习价值" }));
      continue;
    }
    if (!categories && !manual && !genericCn) continue;
    const setJson = {};
    if (categories?.has("space_before_punctuation") || categories?.has("unfinished_example")) Object.assign(setJson, repairBrokenExample(entry));
    if (manual) Object.assign(setJson, { example: manual[0], exampleCn: manual[1] });
    if (genericCn) setJson.exampleCn = genericCn;
    if (entry.word === "payload" || entry.word === "janitor") Object.assign(setJson, { example: MANUAL_EXAMPLES[entry.word][0], exampleCn: MANUAL_EXAMPLES[entry.word][1] });
    if (Object.keys(setJson).length) p0Rows.push(row(entry, "repair", { setJson, reason: [...(categories || []), manual ? "manual-priority-review" : ""].filter(Boolean).join(","), evidence: "现有中文例句、本地词条字段及人工语义复核" }));
  }

  const exampleRows = [];
  const rejectedRows = [];
  for (const entry of words) {
    const target = exampleTargetStatus(entry);
    if (target.rawMatch) continue;
    const knownCompound = { claimform: "claim form", byproduct: "by-product", dropoff: "drop-off", dutyfree: "duty-free" }[entry.word];
    if (knownCompound) {
      exampleRows.push(row(entry, "add-form", { addFormsJson: [{ word: knownCompound, type: "standard compound form", note: "空格或连字符标准形式", source: "semantic-quality-v1" }], reason: "NORMALIZE_COMPOUND", evidence: `例句或短语层使用${knownCompound}` }));
    } else if (entry.word === "prestige") {
      exampleRows.push(row(entry, "add-form", { addFormsJson: [{ word: "prestigious", type: "word family", note: "形容词派生形式", source: "semantic-quality-v1" }], reason: "KEEP_FORM_VARIANT", evidence: "原例句使用prestigious；主例句已改为prestige" }));
    } else if (target.morphologyMatch) {
      exampleRows.push(row(entry, "keep", { reason: "KEEP_FORM_VARIANT", evidence: `合法词形命中：${target.variants.filter((variant) => String(entry.example || "").toLowerCase().includes(variant)).slice(0, 3).join(", ") || "规则/不规则词形"}` }));
    } else if (MANUAL_EXAMPLES[entry.word]) {
      exampleRows.push(row(entry, "keep", { reason: "REPAIR_EXAMPLE_IN_P0", evidence: "已由batch-p0.tsv人工修复" }));
    } else {
      const deferred = row(entry, "defer", { reason: "MANUAL_RELATION_REVIEW", evidence: "词形归一化后仍未命中；本轮不自动重写" });
      exampleRows.push(deferred);
      rejectedRows.push({ ...deferred, reason: "REJECTED_LOW_CONFIDENCE_AUTO_FIX" });
    }
  }

  const meaningRows = [];
  for (const [word, config] of Object.entries(CORE_MEANINGS)) {
    const entry = byWord.get(word);
    if (!entry) throw new Error(`missing core meaning target: ${word}`);
    const meanings = config.senses.map(([gloss, posFamily, label], index) => ({ gloss, posFamily, label, confidence: "high", evidence: [{ sourceType: "existing-entry-and-local-editorial", sourceBook: "", sourceTest: "", sourceSection: "", contextSnippet: entry.example || "", evidenceConfidence: "high" }], order: index + 1 }));
    const quizSenses = meanings.map((sense, index) => ({ senseId: `${entry.id}-semantic-v1-${index + 1}`, quizMeaningZh: sense.gloss, meaningDetailedZh: sense.gloss, posFamily: sense.posFamily, confidence: "high", source: "semantic-quality-v1" }));
    meaningRows.push(row(entry, "add-sense", { setJson: { definition: config.definition, meaningDetailedZh: config.detail, meaningDetailZh: "" }, addMeaningsJson: meanings, addQuizSensesJson: quizSenses, reason: "CORE_GT_STAGE_1_2", evidence: `G类阶段${entry.gtPlanStage || "核心"}；现有例句与本地编辑复核` }));
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "batch-p0.tsv"), toTsv(p0Rows, PATCH_COLUMNS));
  fs.writeFileSync(path.join(DATA_DIR, "batch-example-review.tsv"), toTsv(exampleRows, PATCH_COLUMNS));
  fs.writeFileSync(path.join(DATA_DIR, "batch-meaning-core.tsv"), toTsv(meaningRows, PATCH_COLUMNS));
  fs.writeFileSync(path.join(DATA_DIR, "rejected-auto-fixes.tsv"), toTsv(rejectedRows, PATCH_COLUMNS));
  console.log(JSON.stringify({ p0: p0Rows.length, exampleReview: exampleRows.length, meaningCore: meaningRows.length, rejectedAutoFixes: rejectedRows.length }, null, 2));
}

main();
