// Build semantic distractor index for Meaning Mode � v2 rich micro-domain classification.
// Reads: .static-export-cache/words.json
// Matches against: public/data/meaning-4500.json
// Outputs: app/lib/meaning-mode/semantic-distractor-index.mjs
// NEVER modifies source files.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const WORDS_PATH = join(ROOT, ".static-export-cache", "words.json");
const MEANING_PATH = join(ROOT, "public", "data", "meaning-4500.json");
const OUTPUT = join(__dirname, "semantic-distractor-index.mjs");

const wordsData = JSON.parse(readFileSync(WORDS_PATH, "utf-8"));
const meaningData = JSON.parse(readFileSync(MEANING_PATH, "utf-8"));

const byWordId = new Map();
for (const w of wordsData.words) {
  if (w.wordId) byWordId.set(w.wordId, w);
}

function normalizePosFamily(pos) {
  if (!pos) return "unknown";
  const p = String(pos).trim().toLowerCase();
  if (p.startsWith("noun") || p === "n" || p === "n.") return "noun";
  if (p.startsWith("verb") || p === "v" || p === "v.") return "verb";
  if (p.startsWith("adjectiv") || p === "adj" || p === "adj.") return "adjective";
  if (p.startsWith("adverb") || p === "adv" || p === "adv.") return "adverb";
  if (p.includes("noun")) return "noun";
  if (p.includes("verb")) return "verb";
  if (p.includes("adj")) return "adjective";
  if (p.includes("adv")) return "adverb";
  return "other";
}

// CHINESE MEANING KEYWORD MAP
const CN_DOMAIN_MAP = (() => { const m = new Map();
m.set(0, ["cognition-opinion","印象 观点 看法 想法 见解 信念 观念 理念 态度 立场 角度 视角 认知 感知 意识 思维 思想 理解 领悟 领会 判断 评估 评价 评判 推测 猜测 假设 设想 推断 推理 结论 解释 诠释 说明 主张 声称 怀疑 质疑 猜想 想象 构思 创意 主意 建议 提议 推荐 意见 知道 认识 意识到 记得 忘记 想起 回忆 认为 以为 觉得 希望 预期 预料 预计 预见 直觉 本能 灵感 启示 洞察 启发 提醒 逻辑 理性 合理 荒谬 偏见 误解 错觉 幻想 幻觉 智力 智慧 才华 天才 聪明 明智 敏锐 机灵 笨拙"]);
m.set(1, ["emotion-affect","感情 情感 情绪 心情 感受 感觉 激情 热情 渴望 欲望 愿望 焦虑 紧张 担忧 担心 害怕 恐惧 恐慌 愤怒 生气 恼怒 沮丧 失望 悲伤 难过 痛苦 忧郁 压抑 兴奋 激动 快乐 高兴 幸福 满意 满足 安心 放松 平静 冷静 惊讶 震惊 好奇 兴趣 同情 怜悯 喜爱 爱慕 憎恨 厌恶 嫉妒 羡慕 惭愧 内疚 后悔 遗憾 思念 想念 怀旧 感动 触动 鼓舞 激励 安慰 耐心 不耐烦 烦躁 无聊 厌倦 疲劳 疲惫 压力"]);
m.set(2, ["communication-language","沟通 交流 对话 讨论 辩论 争论 协商 谈判 演讲 讲话 发言 陈述 声明 宣布 表达 描述 叙述 讲述 转达 传达 传递 语言 言语 文字 词汇 短语 句子 段落 文章 作文 论文 报告 信件 邮件 消息 信息 信号 暗号 指示 指令 命令 请求 要求 询问 回答 回应 答复 解释 说明 澄清 强调 重复 引用 引述 评论 批评 表扬 称赞 抱怨 投诉 道歉 谢谢 问候 告别 介绍 推荐 建议 提议 提醒 警告 通知"]);
m.set(3, ["society-culture","社会 社区 公众 公民 人民 人群 群体 大众 民族 种族 文化 传统 习俗 风俗 习惯 礼仪 规范 规则 制度 法律 政策 政治 政府 国家 城市 乡村 农村 移民 迁移 人口 多元化 歧视 偏见 平等 公平 正义 权利 义务 责任 家庭 婚姻 亲戚 朋友 邻居 同事 伙伴 关系 社交 交际 身份 地位 角色 阶层 阶级 贫富 福利 保障 安全"]);
m.set(4, ["education-academic","教育 学校 大学 学院 课程 学科 专业 学位 文凭 证书 学习 研究 教学 教授 老师 学生 同学 考试 测试 评估 成绩 分数 作业 论文 实验 调查 分析 理论 原理 概念 知识 学术 学者 专家 权威 书籍 教材 课本 阅读 写作 听说 理解 掌握 技能 能力 素质 培养 训练 练习 实习 毕业 入学 申请 录取 奖学金 学费 学期 假期"]);
m.set(5, ["work-economy","工作 职业 就业 失业 招聘 应聘 面试 简历 工资 薪水 收入 经济 商业 贸易 市场 金融 投资 预算 利润 亏损 公司 企业 行业 产业 工厂 办公室 会议 任务 项目 管理 领导 经理 员工 同事 客户 顾客 服务 产品 商品 品牌 消费 购买 销售 营销 广告 价格 成本 费用 价值 财富 银行 贷款 利息 税收 保险 合同 协议 交易 谈判"]);
m.set(6, ["health-body","健康 身体 疾病 症状 治疗 医疗 医院 诊所 医生 护士 病人 手术 药物 药品 营养 饮食 运动 锻炼 健身 体重 心理 精神 情绪 睡眠 休息 疲劳 疼痛 受伤 康复 预防 卫生 清洁 污染 病毒 细菌 感染 免疫 疫苗 体检 诊断"]);
m.set(7, ["environment-nature","环境 自然 生态 气候 天气 季节 温度 地理 地形 风景 植物 动物 生物 物种 栖息地 资源 能源 水 空气 土壤 海洋 河流 湖泊 森林 山脉 沙漠 污染 保护 可持续 绿色 环保 循环 可再生 碳排放 温室 全球变暖 自然灾害 地震 洪水"]);
m.set(8, ["technology-science","科技 技术 科学 计算机 电脑 网络 互联网 数字 数据 信息 软件 硬件 设备 装置 机器 自动化 人工智能 机器人 创新 发明 研究 开发 实验 设计 工程 制造 生产 工艺 程序 系统 电子 通信 卫星 信号 屏幕 显示 操作 控制 监控 检测"]);
m.set(9, ["time-sequence","时间 时期 时代 年代 世纪 季节 月份 日期 时刻 小时 分钟 秒 期限 截止 日历 安排 日程 进度 频率 次数 周期 循环 顺序 先后 之前 之后 同时 期间 过程 阶段 开始 结束 持续 中断 延迟 提前 推迟 临时 永久 永恒 日常 经常 偶尔 频繁 罕见 重复 渐变 突然 立即"]);
m.set(10, ["quantity-measurement","数量 质量 大小 多少 比例 比率 百分比 程度 范围 规模 体积 重量 长度 宽度 高度 深度 速度 温度 密度 浓度 测量 计算 统计 数据 数字 估计 近似 精确 准确 增加 减少 上升 下降 增长 缩减 扩大 缩小 加倍 减半 总共 合计 平均 最大 最小 足够 不足 多余 缺少"]);
m.set(11, ["change-process","变化 改变 发展 进步 改善 改进 提高 降低 恶化 退步 转变 转换 转型 演变 进化 过渡 调整 修改 修正 更正 改革 创新 革命 突破 进程 过程 趋势 方向 模式 规律 影响 结果 后果 成效 效果 作用 功能 用途 目的 目标"]);
m.set(12, ["cause-effect","原因 理由 因素 起因 来源 根源 基础 前提 条件 结果 后果 效果 影响 作用 意义 重要性 必要性 可能性 导致 引起 造成 产生 形成 决定 取决于 关联 相关 因果关系 相互作用 连锁反应 副作用 正面 负面 积极 消极"]);
m.set(13, ["action-behavior","行为 行动 活动 操作 表现 表演 执行 实施 进行 参与 参加 加入 组织 安排 准备 计划 策划 管理 控制 监督 任务 职责 责任 使命 目标 目的 意图 动机 决心 毅力 努力 尝试 实践 练习 训练 习惯 常规 日常 例行 仪式 方法 方式 手段 策略 战术 技巧 技能 才能 本事"]);
m.set(14, ["relation-possession","关系 联系 关联 连接 纽带 网络 互动 合作 协作 配合 冲突 竞争 对抗 矛盾 协调 调解 和解 妥协 让步 拥有 持有 占有 所有 所属 归属 财产 资产 资源 财富 分享 分配 给予 接受 提供 供应 需求 交换 交易 支持 帮助 援助 赞助 保护 照顾 关心 关怀 依赖 独立 自主 自由 控制 支配 影响 权力 权威 统治"]);
m.set(15, ["movement-travel","旅行 旅游 移动 运动 行走 前进 后退 出发 到达 离开 交通 运输 车辆 道路 路线 方向 位置 地点 目的地 飞行 航行 驾驶 骑行 步行 跑步 游泳 攀登 跳跃 速度 加速 减速 停止 暂停 继续 追赶 跟随 引导 带领 机场 车站 港口 码头 桥梁 隧道 公路 铁路 航线"]);
m.set(16, ["quality-attribute","品质 质量 属性 特征 特点 特色 性质 本质 类型 种类 类别 级别 等级 层次 形式 形状 结构 组成 成分 内容 条件 状态 状况 情况 现象 外观 外表 表面 内部 外部 优点 缺点 优势 劣势 长处 短处 好处 坏处 利弊 真假 好坏 对错 新旧 快慢 难易 软硬 轻重 高矮"]);
m.set(17, ["visual-spatial","颜色 色彩 形状 大小 高低 长短 宽窄 深浅 粗细 空间 位置 方向 前后 左右 上下 内外 远近 中央 边缘 视觉 观看 观察 看见 注视 展示 显示 出现 消失 隐藏 光明 黑暗 明亮 暗淡 清晰 模糊 透明 可见 看不见 美丽 漂亮 丑陋 好看 难看 美观 装饰 设计 图案"]);
m.set(18, ["sound-auditory","声音 噪音 音乐 旋律 节奏 音量 音调 音色 发音 语音 说话 讲话 歌唱 喊叫 吵闹 安静 沉默 寂静 嘈杂 听觉 听到 聆听 听力 耳朵 响声 回声 响亮的 轻柔的"]);
m.set(19, ["food-nutrition","食物 食品 饮食 餐饮 烹饪 做饭 菜肴 食材 水果 蔬菜 肉类 鱼类 面包 米饭 饮料 水 茶 咖啡 牛奶 酒 营养 味道 口味 好吃 难吃 酸 甜 苦 辣 咸 早餐 午餐 晚餐 零食 餐厅 饭店 厨房 菜单 点菜"]);
m.set(20, ["clothing-appearance","衣服 服装 穿着 打扮 外表 外貌 形象 时尚 潮流 风格 鞋子 帽子 裤子 衬衫 裙子 外套 材料 质地 布料 款式"]);
m.set(21, ["housing-shelter","住房 房屋 建筑 楼房 公寓 房间 卧室 客厅 厨房 卫生间 家具 家电 装饰 装修 租房 买房 住宿 居住 邻居 社区"]);
m.set(22, ["arts-entertainment","艺术 音乐 绘画 舞蹈 戏剧 电影 电视 表演 娱乐 游戏 体育 比赛 竞赛 锻炼 健身 休闲 爱好 兴趣 摄影 拍照 展览 博物馆 剧院 音乐会 节日 庆祝 典礼"]);
m.set(23, ["abstract-conceptual","真理 事实 现实 理想 梦想 希望 信仰 价值 意义 目的 生活 人生 命运 运气 机遇 挑战 困难 问题 答案 解决 成功 失败 胜利 成就 荣誉 名声 声誉 地位 尊严 尊重 道德 伦理 美德 善良 邪恶 正义 公平 自由 平等 民主 爱 恨 和平 战争 暴力 安全 危险 风险"]);
return m; })();

// Build reverse index: keyword -> [domains]
const cnKeywordToDomain = new Map();
for (const [_, entry] of CN_DOMAIN_MAP) {
  const domain = entry[0];
  const keywords = entry[1].split(" ");
  for (const kw of keywords) {
    if (!kw) continue;
    const existing = cnKeywordToDomain.get(kw);
    if (existing) { if (!existing.includes(domain)) existing.push(domain); }
    else { cnKeywordToDomain.set(kw, [domain]); }
  }
}

// English topic to domain
const EN_TOPIC_TO_DOMAIN = {
  "工作":"work-economy","经济":"work-economy","商业":"work-economy","消费":"work-economy",
  "金融":"work-economy","就业":"work-economy","教育":"education-academic","学校":"education-academic",
  "学术":"education-academic","学习":"education-academic","健康":"health-body","医疗":"health-body",
  "身体":"health-body","环境":"environment-nature","自然":"environment-nature","气候":"environment-nature",
  "科技":"technology-science","技术":"technology-science","数字":"technology-science",
  "计算机":"technology-science","社会":"society-culture","文化":"society-culture",
  "传统":"society-culture","社区":"society-culture","旅行":"movement-travel","交通":"movement-travel",
  "运输":"movement-travel","家庭":"society-culture","婚姻":"society-culture","住房":"housing-shelter",
  "建筑":"housing-shelter","食物":"food-nutrition","饮食":"food-nutrition","烹饪":"food-nutrition",
  "服装":"clothing-appearance","时尚":"clothing-appearance","艺术":"arts-entertainment",
  "音乐":"arts-entertainment","体育":"arts-entertainment","运动":"arts-entertainment",
  "娱乐":"arts-entertainment","游戏":"arts-entertainment","心理":"emotion-affect",
  "情感":"emotion-affect","情绪":"emotion-affect","语言":"communication-language",
  "沟通":"communication-language","交流":"communication-language","阅读":"education-academic",
  "写作":"education-academic","同义替换":"communication-language","听力":"education-academic",
  "Speaking":"communication-language","Writing":"communication-language",
  "Reading":"education-academic","Listening":"education-academic",
  "Task 1":"communication-language","Task 2":"communication-language"
};

function extractSemanticDomains(entry) {
  const domains = new Set();
  const meaning = String(entry.meaning || "");
  const definition = String(entry.definition || "");
  const meaningDetailZh = String(entry.meaningDetailZh || "");
  const combinedChinese = meaning + ";" + definition + ";" + meaningDetailZh;

  for (const [keyword, kwDomains] of cnKeywordToDomain) {
    if (combinedChinese.includes(keyword)) {
      for (const d of kwDomains) domains.add(d);
    }
  }

  const topics = (entry.topics || []);
  const ieltsUse = (entry.ieltsUse || []);
  const allTags = [...topics.map(String), ...ieltsUse.map(String)];
  for (const tag of allTags) {
    const d = EN_TOPIC_TO_DOMAIN[tag];
    if (d) domains.add(d);
  }

  const pos = normalizePosFamily(entry.pos);
  if (domains.size === 0) {
    if (pos === "adjective" || pos === "adverb") domains.add("quality-attribute");
    else if (pos === "verb") domains.add("action-behavior");
    else domains.add("general");
  }

  return [...domains];
}

// BUILD INDEX
let entryCount = 0, multiDomain = 0, generalOnly = 0;
const posFamilyCounts = {}, domainCounts = {};

for (const item of meaningData.items) {
  const mw = byWordId.get(item.wordId);
  if (!mw) continue;
  const posFamily = normalizePosFamily(mw.pos);
  posFamilyCounts[posFamily] = (posFamilyCounts[posFamily] || 0) + 1;
  const domains = extractSemanticDomains(mw);
  if (domains.length > 1) multiDomain++;
  if (domains.length === 1 && domains[0] === "general") generalOnly++;
  for (const d of domains) domainCounts[d] = (domainCounts[d] || 0) + 1;

  const topicCount = (mw.topics || []).length;
  const ieltsCount = (mw.ieltsUse || []).length;
  let confidence = "low";
  if (domains.length >= 3) confidence = "high";
  else if (domains.length === 2 || topicCount >= 3 || ieltsCount >= 2) confidence = "medium";
  else if (domains.length === 1 && domains[0] !== "general") confidence = "medium";

  item._posFamily = posFamily;
  item._semanticGroups = domains;
  item._confidence = confidence;
  item._sourceFields = "pos+topics+ieltsUse+meaning+definition+meaningDetailZh";
  entryCount++;
}

// WRITE OUTPUT
const outputJSON = JSON.stringify(meaningData.items, null, 2);
const outLines = [
  "// Auto-generated semantic distractor index for Meaning Mode — v2 rich micro-domain.",
  "// Source: .static-export-cache/words.json (READ-ONLY)",
  "// Matched against: public/data/meaning-4500.json (READ-ONLY)",
  "// Generated: " + new Date().toISOString(),
  "// Fields: _posFamily, _semanticGroups, _confidence, _sourceFields",
  "// DO NOT EDIT — regenerate: node app/lib/meaning-mode/build-semantic-distractor-index.mjs",
  "",
  "export const SEMANTIC_INDEX = " + outputJSON + ";",
  "",
  "export function getSemanticEntry(wordId, items) {",
  "  for (const item of items) {",
  "    if (item.wordId === wordId) return item;",
  "  }",
  "  return null;",
  "}",
  ""
];
writeFileSync(OUTPUT, outLines.join("\n"), "utf-8");

console.log("Index written:", OUTPUT);
console.log("Entries:", entryCount);
console.log("Multi-domain:", multiDomain);
console.log("General-only:", generalOnly);
console.log("Pos family distribution:", JSON.stringify(posFamilyCounts));
console.log("Domain distribution:", JSON.stringify(domainCounts));

// Report
mkdirSync(join(ROOT, "reports"), { recursive: true });
const md = [
  "# Meaning Mode — Semantic Distractor Index Build Report (v2)",
  "",
  "**Generated:** " + new Date().toISOString(),
  "",
  "## Source",
  "- Main word bank: .static-export-cache/words.json (" + wordsData.words.length + " words)",
  "- Pos coverage: " + entryCount + "/" + meaningData.items.length,
  "",
  "## Pos Family Distribution",
  "| Family | Count |",
  "|--------|-------|",
  ...Object.entries(posFamilyCounts).sort((a,b) => b[1]-a[1]).map(([k,v]) => "| " + k + " | " + v + " |"),
  "",
  "## Domain Distribution",
  "| Domain | Count |",
  "|--------|-------|",
  ...Object.entries(domainCounts).sort((a,b) => b[1]-a[1]).map(([k,v]) => "| " + k + " | " + v + " |"),
  "",
  "## Stats",
  "- Multi-domain entries: " + multiDomain,
  "- General-only entries: " + generalOnly,
  "",
  "## File Integrity",
  "- words.json SHA-256: " + createHash("sha256").update(readFileSync(WORDS_PATH)).digest("hex").toUpperCase(),
  "- meaning-4500.json SHA-256: " + createHash("sha256").update(readFileSync(MEANING_PATH)).digest("hex").toUpperCase(),
  ""
].join("\n");
writeFileSync(join(ROOT, "reports", "meaning-semantic-index-report-v2.md"), md, "utf-8");
console.log("Report written. Done.");
