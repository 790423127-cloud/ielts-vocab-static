import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getReadingWordMissingFields } from "../app/lib/reading-words/storage.mjs";
import { getStudyEntryDisplay } from "../app/lib/vocab/study-entry-display.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "public", "data", "personal-reading-words.json");
const BACKUP_ROOT = path.join(ROOT, "backups");
const VERSION = "reading-words-multi-pos-sense-repair-v1-20260811";

const REPAIRS = new Map([
  ["compromise", {
    pos: "verb", meaning: "妥协；让步",
    definition: "to reach agreement by accepting less than originally wanted",
    detail: "在当前例句中作动词，表示双方通过让步达成一致，常用结构为 compromise on something 或 compromise with somebody。",
    example: "We need to compromise on the budget to move forward.", exampleCn: "我们需要在预算上妥协以推进工作。",
    other: [
      ["noun", "妥协；折中方案", "an agreement reached when each side gives up part of what it wanted", "They reached a compromise after a long discussion.", "经过长时间讨论，他们达成了妥协。"],
      ["verb", "损害；危及", "to weaken or endanger something such as safety or principles", "Weak passwords can compromise online security.", "弱密码会危及网络安全。"]
    ]
  }],
  ["venture", {
    pos: "noun", meaning: "风险项目；合资企业",
    definition: "a business project or activity that involves risk",
    detail: "在当前例句中作名词，指带有风险的商业项目；joint venture 是“合资企业”的固定搭配。",
    example: "They started a joint venture.", exampleCn: "他们创办了一家合资企业。",
    other: [
      ["verb", "冒险去；敢于尝试", "to go somewhere or do something despite possible danger or risk", "They ventured into the dark cave.", "他们冒险进入了黑暗的洞穴。"],
      ["verb", "谨慎提出（意见）", "to dare to express an opinion or suggestion", "She ventured an opinion about the plan.", "她谨慎地提出了对该计划的看法。"]
    ]
  }],
  ["spare", {
    pos: "verb", meaning: "抽出；匀出（时间、钱等）",
    definition: "to make time, money, or another resource available for someone or something",
    detail: "在当前例句中作动词，表示从有限的时间或资源中抽出一部分，常用结构为 spare somebody something。",
    example: "Can you spare a few minutes to help me?", exampleCn: "你能抽出几分钟帮帮我吗？",
    other: [
      ["adjective", "备用的；空闲的", "additional and available to use when needed", "Keep a spare key in a safe place.", "把备用钥匙放在安全的地方。"],
      ["noun", "备用品；备用轮胎", "an extra item kept in case it is needed", "There is a spare in the boot.", "后备箱里有一个备用轮胎。"]
    ]
  }],
  ["equivalent", {
    pos: "adjective", meaning: "等价的；相当的",
    definition: "equal in value, amount, meaning, or function",
    detail: "在当前例句中作形容词，表示价值、数量或作用相等，常用结构为 be equivalent to。",
    example: "This is equivalent to five dollars.", exampleCn: "这相当于五美元。",
    other: [["noun", "等价物；对应物", "a person or thing equal in value, amount, or function to another", "This phrase has no exact English equivalent.", "这个短语在英语中没有完全对应的说法。"]]
  }],
  ["varnish", {
    pos: "noun", meaning: "清漆；罩光漆",
    definition: "a transparent liquid coating used to protect wood or other surfaces",
    detail: "在当前例句中作名词，指涂在木材等表面、干后形成透明保护层的清漆。",
    example: "High-quality gum was used to manufacture furniture varnish.", exampleCn: "高品质树胶曾用于制造家具清漆。",
    other: [["verb", "给……涂清漆", "to cover a surface with varnish", "He varnished the wooden table.", "他给木桌涂了清漆。"]]
  }],
  ["assumed", {
    pos: "verb", meaning: "采用；冒用（身份、姓名等）",
    definition: "to take on or use a particular identity, name, or role",
    detail: "在当前例句中是 assume 的过去式，表示采用或冒用另一身份；不是形容词“假定的”。",
    example: "He assumed a different identity to avoid detection.", exampleCn: "他冒用了另一个身份以避免被发现。",
    other: [["adjective", "假定的；假装的", "accepted as true without proof, or adopted falsely", "He travelled under an assumed name.", "他使用假名旅行。"]]
  }],
  ["feminist", {
    pos: "noun", meaning: "女权主义者；女性主义者",
    definition: "a person who supports equal rights and opportunities for women",
    detail: "在当前例句中作名词，指支持女性与男性享有平等权利和机会的人。",
    example: "She is a feminist who advocates for equal pay.", exampleCn: "她是一位主张同工同酬的女性主义者。",
    other: [["adjective", "女权主义的；女性主义的", "relating to feminism or the support of women's equal rights", "She wrote a feminist critique of the novel.", "她写了一篇对该小说的女性主义评论。"]]
  }],
  ["forecast", {
    pos: "noun", meaning: "预测；预报",
    definition: "a statement about what is expected to happen in the future",
    detail: "在当前例句中作名词，weather forecast 表示“天气预报”；也常用于经济、销售等未来趋势的预测。",
    example: "The weather forecast says it will rain.", exampleCn: "天气预报说会下雨。",
    other: [["verb", "预测；预报", "to say what is expected to happen in the future", "Experts forecast that prices will rise.", "专家预测价格会上涨。"]]
  }],
  ["aside", {
    pos: "adverb", meaning: "到一边；留出",
    definition: "to or toward one side, or away from the main purpose",
    detail: "在当前例句的 set aside 中作副词性成分，表示把时间留出来；常见搭配还有 put aside 和 stand aside。",
    example: "Set aside some time for relaxation.", exampleCn: "留出一些时间放松。",
    other: [["noun", "旁白；低声说的话", "a remark intended for the audience but not for other characters in a play", "The actor delivered an aside to the audience.", "演员向观众说了一句旁白。"]]
  }],
  ["crash", {
    pos: "verb", meaning: "猛烈撞击；坠毁",
    definition: "to hit something violently or to fall and be badly damaged",
    detail: "在当前例句中作动词，表示车辆猛烈撞上某物；飞机等从空中坠毁也可用 crash。",
    example: "The car crashed into a tree.", exampleCn: "汽车撞到了一棵树上。",
    other: [
      ["noun", "撞车事故；坠毁事故", "a violent collision or an accident in which a vehicle or aircraft is badly damaged", "Three people were injured in the crash.", "三人在这起撞车事故中受伤。"],
      ["verb", "（计算机或系统）崩溃", "to stop working suddenly, especially of a computer system", "My computer crashed and I lost the file.", "我的电脑崩溃了，文件也丢失了。"]
    ]
  }],
  ["harness", {
    pos: "verb", meaning: "控制并利用（能源、资源等）",
    definition: "to control and use a natural force or resource to produce a useful result",
    detail: "在当前例句中作动词，表示把太阳能等自然力量转化为可用资源，常搭配 energy、power、technology。",
    example: "We need to harness solar energy more efficiently.", exampleCn: "我们需要更有效地利用太阳能。",
    other: [["noun", "安全带；挽具", "a set of straps used to control an animal or secure a person", "The climber checked her safety harness.", "登山者检查了她的安全带。"]]
  }],
  ["alongside", {
    pos: "preposition", meaning: "在……旁边；与……一起",
    definition: "next to someone or something, or together with them",
    detail: "在当前例句中作介词，后接名词 the dock，表示“在码头旁边”；也可表示与某人或某事共同进行。",
    example: "The boat is alongside the dock.", exampleCn: "船停在码头旁边。",
    other: [["adverb", "在旁边；并排地", "at or to the side of someone or something", "A police car pulled up alongside.", "一辆警车在旁边停了下来。"]]
  }]
]);

function atomicWrite(filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function otherMeanings(rows) {
  return rows.map(([pos, meaningZh, definitionEn, example, exampleCn]) => ({
    pos, meaningZh, definitionEn, example, exampleCn
  }));
}

function applyRepair(entry, repair, repairedAt) {
  return {
    ...entry,
    pos: repair.pos,
    meaning: repair.meaning,
    meaningDetailZh: repair.detail,
    definition: repair.definition,
    example: repair.example,
    exampleCn: repair.exampleCn,
    otherMeanings: otherMeanings(repair.other),
    readingMeaning: repair.meaning,
    readingContextPending: false,
    readingContextReviewed: true,
    readingContextReviewSource: "manual-context-multi-pos-repair",
    readingContextReviewedAt: repairedAt,
    multiPosSenseRepair: { version: VERSION, repairedAt },
    updatedAt: repairedAt
  };
}

function buildRepair(payload, repairedAt) {
  const next = structuredClone(payload);
  const words = next?.transfer?.readingWords;
  if (!Array.isArray(words)) throw new Error("阅读生词发布包缺少 transfer.readingWords");
  const repaired = [];

  for (const [word, repair] of REPAIRS) {
    const index = words.findIndex((entry) => String(entry?.word || "").toLowerCase() === word);
    if (index < 0) throw new Error(`找不到待修阅读生词：${word}`);
    const original = words[index];
    const updated = applyRepair(original, repair, repairedAt);
    const missing = getReadingWordMissingFields(updated);
    if (missing.includes("multiPosSenses")) {
      throw new Error(`${word} 修复后仍缺多词性义项`);
    }
    const display = getStudyEntryDisplay(updated);
    if (display.pos !== repair.pos || display.supplementalSenses.length !== repair.other.length) {
      throw new Error(`${word} 修复后的主词性或附加义项显示不一致`);
    }
    words[index] = updated;
    repaired.push({
      id: original.id,
      word,
      stableIdPreserved: original.id === updated.id,
      primaryPos: repair.pos,
      supplementalSenseCount: display.supplementalSenses.length
    });
  }

  next.revision = Number(next.revision || 0) + 1;
  next.sourceUpdatedAt = repairedAt;
  next.publishedAt = repairedAt;
  next.multiPosSenseRepair = {
    version: VERSION,
    repairedAt,
    count: repaired.length,
    words: repaired.map((entry) => entry.word)
  };
  next.transfer.exportedAt = repairedAt;
  return { next, repaired };
}

function main() {
  const write = process.argv.includes("--write");
  const repairedAt = new Date().toISOString();
  const payload = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const { next, repaired } = buildRepair(payload, repairedAt);
  const result = {
    mode: write ? "write" : "dry-run",
    version: VERSION,
    repaired,
    stableIdsPreserved: repaired.every((entry) => entry.stableIdPreserved),
    wordCountPreserved: next.transfer.readingWords.length === payload.transfer.readingWords.length
  };
  if (!write) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const stamp = repairedAt.replace(/[:.]/g, "-");
  const backupDir = path.join(BACKUP_ROOT, `reading-words-multi-pos-sense-repair-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, "personal-reading-words.json.before");
  fs.copyFileSync(DATA_PATH, backupPath);
  try {
    atomicWrite(DATA_PATH, next);
  } catch (error) {
    fs.copyFileSync(backupPath, DATA_PATH);
    throw error;
  }
  console.log(JSON.stringify({ ...result, backupDir }, null, 2));
}

main();
