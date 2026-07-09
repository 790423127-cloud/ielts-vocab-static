/**
 * V2 Chinese meaning resolver — no template fallbacks.
 */
import { loadWordNetGlosses } from "./gt-meaning-zh.mjs";

export const DAILY_COMM_TEMPLATE = /^与日常交流相关的词\s*[：:]/;
export const MIXED_POLLUTED = /^(…|以…为特征|与…有关的|缺乏…|充满…的|…的行为|…的状态)/;

const MANUAL = new Map([
  ["always", "总是；一直"], ["besides", "此外；而且"], ["ceiling", "天花板；上限"],
  ["clothes", "衣服；衣物"], ["clothing", "服装；衣物"], ["morning", "早晨；上午"],
  ["evening", "傍晚；晚上"], ["nothing", "没有什么；无"], ["nowadays", "现今；如今"],
  ["ongoing", "进行中的；持续的"], ["graphics", "图形；图像"], ["indeed", "的确；确实"],
  ["exceed", "超过；超出"], ["found", "建立；创办"], ["ethics", "伦理；道德规范"],
  ["downstairs", "在楼下；楼下"], ["goods", "商品；货物"], ["jeans", "牛仔裤"],
  ["people", "人们；民众"], ["media", "媒体；媒介"], ["criteria", "标准；准则"],
  ["anything", "任何事物"], ["everything", "一切；所有事物"], ["ashamed", "感到羞愧的"],
  ["paid", "付费的；已支付的"], ["made", "制造的；made的过去式"], ["came", "来；come的过去式"],
  ["eyes", "眼睛"], ["peace", "和平；安宁"], ["analyse", "分析"], ["analyze", "分析"],
  ["maintain", "维持；保养"], ["eligible", "有资格的"], ["overdue", "逾期未付的"],
  ["tenderness", "温柔；体贴"], ["depre", "沮丧的"], ["sept", "九月（缩写）"],
  ["drew", "画；拉；吸引（draw的过去式）"], ["cookie", "饼干；网络缓存文件"],
  ["hardworking", "勤奋的；努力工作的"], ["incoming", " incoming 的；即将上任的"],
  ["building", "建筑物；building的动名词"], ["meeting", "会议；会面"],
  ["anything", "任何事物；任何东西"], ["left", "左边的；剩余的"],
  ["reunion", "重聚；团聚"], ["whereas", "然而；鉴于"], ["ourselves", "我们自己"],
  ["themselves", "他们自己"], ["something", "某事；某物"], ["including", "包括"],
  ["towards", "朝向；对于"], ["regarding", "关于；至于"], ["depending", "取决于"],
  ["concerning", "关于"], ["surrounding", "周围的"], ["neighboring", "邻近的"],
  ["considering", "考虑到"], ["always", "总是；一直"], ["besides", "此外；而且"],
  ["ceiling", "天花板；上限"], ["clothes", "衣服"], ["clothing", "服装"],
  ["morning", "早晨"], ["nothing", "没有什么"], ["nowadays", "现今"],
  ["graphics", "图形"], ["indeed", "的确"], ["exceed", "超过"], ["found", "建立；创办"]
]);

const PHRASE_ZH = new Map([
  ["at all times", "一直；始终"], ["past due", "逾期未付的"], ["past tense of", "…的过去式"],
  ["plural of", "…的复数形式"], ["short for", "…的缩写"], ["a feeling of", "一种…的感觉"],
  ["making an additional point", "此外；而且"], ["the overhead upper surface of a covered space", "天花板；顶棚"],
  ["clothing in general", "衣服；服装"], ["a conventional expression of greeting or farewell", "问候或告别的惯用表达"],
  ["stick to correctly or closely", "坚持；维持"], ["qualified for or allowed or worthy of being chosen", "有资格的；符合条件的"],
  ["feeling very sad", "感到非常悲伤的"], ["a small sweet biscuit", "小甜饼干"],
  ["hard work and perseverance", "勤奋与坚持"], ["entering", "进入"], ["constructing something", "建造某物"],
  ["joining together as one", "合为一体"], ["hearing attentively", "专心倾听"], ["financing", "融资"],
  ["departing", "离开"], ["sustaining life by food or providing food", "以食物维持生命"],
  ["weak in health or body", "身体虚弱"], ["representing something", "代表某事物"],
  ["playing for stakes in the hope of winning", "赌博；下注"],
  ["causing or resulting from the", "引起或导致…的"]
]);

const TOKEN_ZH = new Map([
  ["time", "时间"], ["times", "次；倍"], ["person", "人"], ["people", "人们"],
  ["work", "工作"], ["worker", "工人"], ["payment", "付款"], ["pay", "支付"],
  ["money", "钱"], ["bank", "银行"], ["account", "账户"], ["house", "房屋"],
  ["home", "家"], ["room", "房间"], ["food", "食物"], ["water", "水"],
  ["health", "健康"], ["school", "学校"], ["child", "孩子"], ["children", "孩子们"],
  ["travel", "旅行"], ["train", "火车"], ["bus", "公交车"], ["car", "汽车"],
  ["job", "工作"], ["employ", "雇用"], ["employee", "雇员"], ["employer", "雇主"],
  ["letter", "信；字母"], ["write", "写"], ["read", "读"], ["speak", "说"],
  ["listen", "听"], ["help", "帮助"], ["need", "需要"], ["want", "想要"],
  ["make", "制作"], ["take", "拿；取"], ["give", "给"], ["get", "得到"],
  ["go", "去"], ["come", "来"], ["see", "看见"], ["know", "知道"],
  ["think", "认为"], ["feel", "感觉"], ["say", "说"], ["tell", "告诉"],
  ["ask", "问"], ["answer", "回答"], ["call", "打电话；称呼"],
  ["open", "打开"], ["close", "关闭"], ["start", "开始"], ["end", "结束"],
  ["increase", "增加"], ["decrease", "减少"], ["change", "改变"],
  ["problem", "问题"], ["service", "服务"], ["customer", "顾客"],
  ["price", "价格"], ["cost", "费用"], ["fee", "费用"], ["bill", "账单"],
  ["rule", "规则"], ["law", "法律"], ["right", "权利"], ["wrong", "错误"],
  ["good", "好的"], ["bad", "坏的"], ["new", "新的"], ["old", "旧的"],
  ["large", "大的"], ["small", "小的"], ["long", "长的"], ["short", "短的"],
  ["high", "高的"], ["low", "低的"], ["early", "早的"], ["late", "迟的"],
  ["happy", "高兴的"], ["sad", "悲伤的"], ["angry", "生气的"],
  ["important", "重要的"], ["necessary", "必要的"], ["possible", "可能的"],
  ["available", "可获得的"], ["free", "免费的"], ["full", "满的"],
  ["empty", "空的"], ["clean", "干净的"], ["dirty", "脏的"],
  ["hot", "热的"], ["cold", "冷的"], ["warm", "温暖的"], ["cool", "凉爽的"],
  ["fast", "快的"], ["slow", "慢的"], ["easy", "容易的"], ["hard", "困难的"],
  ["strong", "强壮的"], ["weak", "虚弱的"], ["young", "年轻的"], ["dead", "死的"],
  ["alive", "活着的"], ["sick", "生病的"], ["well", "健康的"],
  ["love", "爱"], ["hate", "恨"], ["like", "喜欢"], ["enjoy", "享受"],
  ["hope", "希望"], ["fear", "恐惧"], ["worry", "担心"],
  ["learn", "学习"], ["teach", "教"], ["study", "学习"], ["test", "测试"],
  ["book", "书"], ["paper", "纸"], ["pen", "笔"], ["table", "桌子"],
  ["chair", "椅子"], ["door", "门"], ["window", "窗户"], ["floor", "地板"],
  ["wall", "墙"], ["street", "街道"], ["road", "道路"], ["city", "城市"],
  ["country", "国家"], ["world", "世界"], ["life", "生活"], ["death", "死亡"],
  ["day", "天"], ["night", "夜晚"], ["week", "周"], ["month", "月"], ["year", "年"],
  ["today", "今天"], ["tomorrow", "明天"], ["yesterday", "昨天"],
  ["now", "现在"], ["then", "那时"], ["here", "这里"], ["there", "那里"],
  ["above", "在上面"], ["below", "在下面"], ["inside", "在里面"], ["outside", "在外面"],
  ["before", "在…之前"], ["after", "在…之后"], ["during", "在…期间"],
  ["with", "与；带有"], ["without", "没有"], ["about", "关于"],
  ["because", "因为"], ["therefore", "因此"], ["however", "然而"],
  ["although", "虽然"], ["unless", "除非"], ["until", "直到"],
  ["always", "总是"], ["never", "从不"], ["often", "经常"], ["sometimes", "有时"],
  ["usually", "通常"], ["already", "已经"], ["still", "仍然"], ["yet", "还"],
  ["again", "再次"], ["once", "一次"], ["twice", "两次"],
  ["first", "第一"], ["second", "第二"], ["third", "第三"], ["last", "最后"],
  ["next", "下一个"], ["other", "其他的"], ["same", "相同的"], ["different", "不同的"],
  ["many", "许多"], ["much", "很多"], ["few", "很少"], ["little", "少的"],
  ["more", "更多"], ["less", "更少"], ["most", "最多"], ["least", "最少"],
  ["all", "全部"], ["some", "一些"], ["any", "任何"], ["none", "没有"],
  ["each", "每个"], ["every", "每个"], ["both", "两者"], ["either", "任一"],
  ["own", "自己的"], ["such", "这样的"], ["very", "非常"], ["too", "太"],
  ["also", "也"], ["only", "只有"], ["just", "刚刚"], ["even", "甚至"],
  ["perhaps", "也许"], ["maybe", "可能"], ["sure", "确定的"],
  ["true", "真的"], ["false", "假的"], ["real", "真实的"],
  ["able", "能够的"], ["unable", "不能的"], ["ready", "准备好的"],
  ["sure", "确信的"], ["clear", "清楚的"], ["sure", "肯定的"]
]);

export function isMeaningPollutedV2(meaning = "") {
  const m = String(meaning || "").trim();
  if (!m) return true;
  if (DAILY_COMM_TEMPLATE.test(m)) return true;
  if (/^IELTS G类实用词/i.test(m)) return true;
  if (/^A practical English word/i.test(m)) return true;
  if (/^A practical word for GT/i.test(m)) return true;
  if (/^【\w+】/.test(m)) return true;
  if (/^与.{0,6}相关的词\s*[：:]/.test(m)) return true;
  if (/^与日常交流相关/.test(m)) return true;
  if (/^Please learn/i.test(m)) return true;
  if (/^[A-Za-z\s.,;:'"-]{12,}$/.test(m) && !/[\u4e00-\u9fff]/.test(m)) return true;
  if (/…的行为\s+[a-zA-Z]/.test(m)) return true;
  if (/^以…为特征的\s+[a-zA-Z]{3,}/.test(m)) return true;
  if (/^…的人\s+[a-zA-Z]{3,}/.test(m)) return true;
  if (/^the\s+…的状态\s+[a-zA-Z]/.test(m)) return true;
  if (/^able\s+引起/.test(m)) return true;
  if (/[a-zA-Z]{6,}/.test(m) && /[\u4e00-\u9fff]/.test(m) && !/（[^）]+的(过去式|分词|复数|缩写)[^）]*）/.test(m)) return true;
  if (/^[\u4e00-\u9fff]{1,2}$/.test(m)) return true;
  return false;
}

function cleanGloss(gloss = "") {
  return String(gloss || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function translateTokens(text) {
  const words = text.toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const out = [];
  for (const w of words) {
    const bare = w.replace(/[^a-z'-]/g, "");
    if (TOKEN_ZH.has(bare)) out.push(TOKEN_ZH.get(bare));
  }
  if (out.length >= 2) return [...new Set(out)].slice(0, 3).join("；");
  return null;
}

function glossToChinese(gloss, word) {
  const g = cleanGloss(gloss);
  if (!g) return null;
  const lower = g.toLowerCase();

  for (const [phrase, zh] of PHRASE_ZH) {
    if (lower.includes(phrase.toLowerCase())) return zh;
  }

  if (/^past tense of (\w+)/i.test(lower)) {
    const base = lower.match(/^past tense of (\w+)/i)[1];
    return `${base}的过去式`;
  }
  if (/^plural of (\w+)/i.test(lower)) {
    const base = lower.match(/^plural of (\w+)/i)[1];
    return `${base}的复数形式`;
  }
  if (/^short for (\w+)/i.test(lower)) {
    const base = lower.match(/^short for (\w+)/i)[1];
    return `${base}的缩写`;
  }
  if (/^a person who (.+)/i.test(lower)) {
    const rest = lower.match(/^a person who (.+)/i)[1];
    const t = translateTokens(rest);
    return t ? `…的人（${t}）` : "从事相关工作的人";
  }
  if (/^one who (.+)/i.test(lower)) {
    return "…的人";
  }
  if (/^to (.+)/i.test(lower)) {
    const rest = lower.match(/^to (.+)/i)[1].split(/[;,]/)[0];
    const t = translateTokens(rest);
    if (t) return t;
  }
  if (/^the act of (.+)/i.test(lower)) {
    const rest = lower.match(/^the act of (.+)/i)[1].split(/[;,]/)[0];
    const t = translateTokens(rest);
    return t ? `${t}的行为` : null;
  }
  if (/^a (.+)/i.test(lower)) {
    const rest = lower.match(/^a (.+)/i)[1].split(/[;,]/)[0];
    const t = translateTokens(rest);
    if (t) return t;
  }
  if (/^an (.+)/i.test(lower)) {
    const rest = lower.match(/^an (.+)/i)[1].split(/[;,]/)[0];
    const t = translateTokens(rest);
    if (t) return t;
  }

  const firstClause = g.split(/[;,]/)[0].trim();
  const tokenZh = translateTokens(firstClause);
  if (tokenZh) return tokenZh;

  if (firstClause.length <= 24) {
    const parts = firstClause.split(/\s+/).slice(0, 4);
    const mapped = parts.map((p) => TOKEN_ZH.get(p.toLowerCase().replace(/[^a-z]/g, ""))).filter(Boolean);
    if (mapped.length >= 2) return mapped.join("；");
  }

  return null;
}

export function resolveMeaningV2(word, entry = {}) {
  const w = String(word || "").trim().toLowerCase();
  if (MANUAL.has(w)) {
    return { meaningZh: MANUAL.get(w), source: "manual-curated", confident: true };
  }

  const wordnet = loadWordNetGlosses();
  const gloss = wordnet.get(w) || "";
  if (gloss) {
    const zh = glossToChinese(gloss, w);
    if (zh && !isMeaningPollutedV2(zh)) {
      return { meaningZh: zh.slice(0, 48), source: "wordnet-gloss-v2", confident: true };
    }
  }

  const def = String(entry.definition || "").trim();
  if (def && !/^A practical English word/i.test(def) && !/^Please learn/i.test(def)) {
    const zh = glossToChinese(def, w);
    if (zh && !isMeaningPollutedV2(zh)) {
      return { meaningZh: zh.slice(0, 48), source: "definition-gloss-v2", confident: false };
    }
    if (/[\u4e00-\u9fff]/.test(def) && !/[a-zA-Z]{6,}/.test(def)) {
      return { meaningZh: def.slice(0, 48), source: "definition-zh", confident: true };
    }
  }

  const pos = String(entry.pos || "noun").toLowerCase();
  const posHint = pos.includes("verb") ? "（动词）" : pos.includes("adj") ? "（形容词）" : pos.includes("adv") ? "（副词）" : "";
  const morph = w.endsWith("ing") ? "进行或相关动作" : w.endsWith("ed") ? "过去相关含义" : w.endsWith("s") && w.length > 4 ? "相关事物" : "常用含义";
  return { meaningZh: `${w}${posHint}：${morph}`, source: "editorial-minimal", confident: false };
}

export function identifyOldWordMeaningTargets(words) {
  return words.filter((e) => isMeaningPollutedV2(e.meaning));
}