import fs from "node:fs";
import path from "node:path";
import {
  MEANING_COVERAGE_PENDING_FLAG,
  MEANING_COVERAGE_REVIEWED_FLAG,
  applyMeaningCoverageReview,
  isMeaningCoverageProfileUsable
} from "../app/lib/vocab/meaning-coverage-audit.mjs";
import { atomicWriteReadingGJson } from "../app/lib/reading-g-vocab/write-lock.server.mjs";
import { isReadingGMeaningCoverageCandidate } from "../app/lib/reading-g-vocab/ai-completion.mjs";

const PROJECT_ROOT = process.cwd();
const VOCAB_PATH = path.join(PROJECT_ROOT, "public", "data", "reading-g-vocab.json");
const BACKUP_DIR = path.join(PROJECT_ROOT, "backups", "reading-g-ai");
const dryRun = process.argv.includes("--dry-run");

// Editorial replacements for the 22 remaining records.  They deliberately
// cover only the main explanation and genuinely common everyday/reading uses.
// No examples, forms, family members, collocations, or synonyms are added.
const EDITORIAL_PROFILES = {
  wooden: {
    detail: "通常指由木材制成；形容人的动作、表情或说话方式时，也常指僵硬、不自然、缺少感情。"
  },
  facial: {
    detail: "作形容词指脸部或面部的；作名词时常指面部护理美容项目，如清洁、按摩或敷面膜。",
    otherMeanings: [{ pos: "noun", meaningZh: "面部护理", definitionEn: "a beauty treatment for the face, often involving cleansing, massage, or a mask" }]
  },
  husband: {
    detail: "最常指已婚女性的男性配偶；在较正式的阅读语境中也可作动词，表示节约、妥善管理资源。",
    otherMeanings: [{ pos: "verb", meaningZh: "节约使用；妥善管理", definitionEn: "to use money, resources, or supplies carefully and economically" }]
  },
  thirty: {
    detail: "表示数字三十，可用于数量、年龄、日期、编号，或 thirty years 等时间长度。"
  },
  breathe: {
    detail: "指吸入并呼出空气，是呼吸这一动作；也常用于 breathe in 和 breathe out，分别表示吸气和呼气。"
  },
  france: {
    detail: "指欧洲西部的法国，是国家名称；阅读中常用于地理、旅行、文化、政治或历史语境。"
  },
  headache: {
    detail: "本义指头部疼痛；日常和阅读中也常比喻令人烦恼、难处理的问题。",
    otherMeanings: [{ pos: "noun", meaningZh: "令人头疼的问题；麻烦", definitionEn: "a problem or situation that causes worry or difficulty" }]
  },
  landowner: {
    detail: "指拥有土地所有权的人或机构，常见于住房、农业、租赁、规划和财产权等阅读语境。"
  },
  molecular: {
    detail: "指与分子有关的，常用于描述物质结构、化学过程或生物机制，如 molecular structure。"
  },
  stolen: {
    detail: "是 steal 的过去分词，常作形容词表示某物被非法拿走或窃取；常见于犯罪、保险和财产报道。"
  },
  vegetarian: {
    detail: "作名词指不吃肉和鱼的人；作形容词指适合素食者的食物、菜单或饮食。",
    otherMeanings: [{ pos: "adjective", meaningZh: "素食的；适合素食者的", definitionEn: "relating to or suitable for people who do not eat meat or fish" }]
  },
  villager: {
    detail: "指居住在村庄的人，常见于社区、农村发展、旅游、灾害援助等阅读语境。"
  },
  straightaway: {
    detail: "作副词指立刻、毫不拖延地；在体育或道路语境中作名词可指赛道或道路的直线段。",
    otherMeanings: [{ pos: "noun", meaningZh: "直线赛道；直线路段", definitionEn: "a straight section of a road, track, or racing course" }]
  },
  bookshops: {
    detail: "是 bookshop 的复数，指销售书籍的实体或线上书店；阅读中常见于零售、出版、文化和旅游语境。"
  },
  composer: {
    detail: "指创作音乐作品的人，尤其指写作交响乐、歌曲等的作曲家，常见于艺术、音乐和人物传记语境。"
  },
  driver: {
    detail: "最常指驾驶车辆的人；在电脑技术中也常指控制硬件工作的驱动程序。",
    otherMeanings: [{ pos: "noun", meaningZh: "驱动程序", definitionEn: "software that allows a computer to communicate with and control a hardware device" }]
  },
  drummer: {
    detail: "指演奏鼓或其他打击乐器的人，常见于乐队、演出和音乐教育语境。"
  },
  potter: {
    detail: "最常指制作陶器的陶工；作动词时，尤其在 potter around 中，可指悠闲地做些零碎小事。",
    otherMeanings: [{ pos: "verb", meaningZh: "悠闲地做零碎小事", definitionEn: "to spend time doing small, unimportant tasks in a relaxed way" }]
  },
  novelist: {
    detail: "指以创作长篇小说为主要职业或身份的作家，常见于文学、出版和人物介绍语境。"
  },
  initially: {
    detail: "指在开始时、最初阶段，常用于说明事情后来发生了变化，或补充后续情况。"
  },
  enlarged: {
    detail: "指尺寸、范围、数量或程度被扩大，常见于放大的照片、增大的器官或扩展的计划。"
  },
  rapidly: {
    detail: "指以很快的速度发生或变化，常用于增长、发展、传播、下降等过程。"
  }
};

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, "utf8"));
const pending = vocab.items.filter(isReadingGMeaningCoverageCandidate);
const pendingWords = new Set(pending.map((entry) => entry.word));
const configuredWords = new Set(Object.keys(EDITORIAL_PROFILES));
if (!pendingWords.size) {
  const reviewedWords = new Set(vocab.items
    .filter((entry) => entry.meaningCoverageReviewSource === "manual-editorial")
    .map((entry) => entry.word));
  const alreadyApplied = [...configuredWords].every((word) => reviewedWords.has(word));
  if (alreadyApplied) {
    console.log(JSON.stringify({ alreadyApplied: true, reviewed: configuredWords.size, remaining: 0 }, null, 2));
    process.exit(0);
  }
}
const missingProfiles = [...pendingWords].filter((word) => !configuredWords.has(word));
const unexpectedProfiles = [...configuredWords].filter((word) => !pendingWords.has(word));

if (missingProfiles.length || unexpectedProfiles.length) {
  throw new Error(`Manual editorial scope mismatch. Missing: ${missingProfiles.join(", ") || "none"}; unexpected: ${unexpectedProfiles.join(", ") || "none"}`);
}

const reviewedAt = new Date().toISOString();
const nextItems = vocab.items.map((entry) => {
  const editorial = EDITORIAL_PROFILES[entry.word];
  if (!editorial) return entry;
  const profile = {
    word: entry.word,
    meaning: entry.meaning || entry.primaryMeaningZh || "",
    meaningDetailZh: editorial.detail,
    otherMeanings: editorial.otherMeanings || []
  };
  if (!isMeaningCoverageProfileUsable(profile, entry.word)) {
    throw new Error(`Manual editorial profile did not pass validation: ${entry.word}`);
  }
  const reviewed = applyMeaningCoverageReview(entry, profile, {
    source: "manual-editorial",
    reviewedAt
  });
  return {
    ...reviewed,
    qualityFlags: [...new Set([
      ...(Array.isArray(reviewed.qualityFlags) ? reviewed.qualityFlags : []).filter((flag) => flag !== MEANING_COVERAGE_PENDING_FLAG),
      MEANING_COVERAGE_REVIEWED_FLAG
    ])],
    meaningCoverageReviewSource: "manual-editorial",
    meaningCoveragePromptVersion: "manual-common-sense-review-v1",
    updatedAt: reviewedAt
  };
});

const nextVocab = { ...vocab, items: nextItems, updatedAt: reviewedAt };
const remaining = nextItems.filter(isReadingGMeaningCoverageCandidate);
if (remaining.length) {
  throw new Error(`Manual editorial review left ${remaining.length} pending entries: ${remaining.map((entry) => entry.word).join(", ")}`);
}

if (!dryRun) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `reading-g-vocab-manual-meaning-coverage-${timestampForFile()}.json`);
  atomicWriteReadingGJson(backupPath, vocab);
  atomicWriteReadingGJson(VOCAB_PATH, nextVocab);
  console.log(JSON.stringify({ applied: Object.keys(EDITORIAL_PROFILES).length, remaining: remaining.length, backupPath }, null, 2));
} else {
  console.log(JSON.stringify({ dryRun: true, wouldApply: Object.keys(EDITORIAL_PROFILES).length, remaining: remaining.length }, null, 2));
}
