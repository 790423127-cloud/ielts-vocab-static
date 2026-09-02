#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { isInflectedReferenceWord } from "../app/lib/vocab/word-study-eligibility.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const publicPath = path.join(root, "public", "data", "words.json");
const staticPath = path.join(root, ".static-export-cache", "words.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const version = "master-structural-anomaly-repair-v1-20260811";

const renameRepairs = new Map([
  ["picturepiece", {
    word: "puzzle piece",
    phonetic: "/ˈpʌzəl piːs/",
    pos: "noun phrase",
    meaning: "拼图块；拼图的一片",
    detail: "指拼图中单独的一小片，需要与其他拼图块拼合成完整图案；也可比喻理解问题所需的一部分信息。",
    example: "I found the last puzzle piece under the sofa.",
    exampleCn: "我在沙发下面找到了最后一块拼图。",
    collocations: [["missing puzzle piece", "缺失的拼图块"], ["last puzzle piece", "最后一块拼图"], ["jigsaw puzzle piece", "拼图的一片"]],
    phrases: [["fit the puzzle piece into place", "把拼图块放到正确位置"]]
  }],
  ["ourself", {
    word: "ourselves",
    phonetic: "/aʊərˈselvz/",
    pos: "pronoun",
    meaning: "我们自己；我们亲自",
    detail: "第一人称复数反身代词，用于主语为 we 时指回主语本身；也可用于强调某件事是“我们亲自”做的。",
    example: "We enjoyed ourselves at the party.",
    exampleCn: "我们在聚会上玩得很开心。",
    collocations: [["enjoy ourselves", "我们玩得开心"], ["by ourselves", "我们独自；靠我们自己"]],
    phrases: [["do it ourselves", "我们亲自做"]]
  }],
  ["offerletter", {
    word: "offer letter",
    phonetic: "/ˈɔːfər ˌletər/",
    pos: "noun phrase",
    meaning: "录用通知；录取通知书",
    detail: "由公司或学校发出的正式书面通知，说明愿意提供职位或录取名额，通常列有薪资、入职日期或接受期限等条件。",
    example: "I received the offer letter yesterday and will sign it today.",
    exampleCn: "我昨天收到了录用通知，今天会签署。",
    collocations: [["receive an offer letter", "收到录用通知"], ["sign an offer letter", "签署录用通知"]],
    phrases: [["accept the offer letter", "接受录用通知中的条件"]]
  }],
  ["gardenleave", {
    word: "garden leave",
    phonetic: "/ˌɡɑːrdən ˈliːv/",
    pos: "noun phrase",
    meaning: "离职前带薪离岗期；花园假",
    detail: "英式职场用语，指员工辞职或被解雇后在通知期内仍领工资，但不再到岗工作，通常也不得立即为竞争对手工作。",
    example: "After resigning, she was placed on garden leave for three months.",
    exampleCn: "辞职后，她进入了三个月的带薪离岗期。",
    collocations: [["be on garden leave", "处于带薪离岗期"], ["place somebody on garden leave", "安排某人带薪离岗"]],
    phrases: [["during garden leave", "在带薪离岗期间"]]
  }],
  ["customsdeclaration", {
    word: "customs declaration",
    phonetic: "/ˈkʌstəmz ˌdekləˈreɪʃən/",
    pos: "noun phrase",
    meaning: "海关申报；海关申报单",
    detail: "入境或出境时向海关说明所携带物品、现金或应税商品的正式申报，也可指填写的申报表。",
    example: "Passengers must complete a customs declaration before landing.",
    exampleCn: "乘客必须在着陆前填写海关申报单。",
    collocations: [["complete a customs declaration", "填写海关申报单"], ["customs declaration form", "海关申报表"]],
    phrases: [["make a customs declaration", "进行海关申报"]]
  }],
  ["pestcontrol", {
    word: "pest control",
    phonetic: "/ˈpest kənˌtroʊl/",
    pos: "noun phrase",
    meaning: "害虫防治；虫害控制",
    detail: "通过清洁、封堵、诱捕或药剂等方法预防和清除会损害房屋、农作物或健康的昆虫和其他有害生物。",
    example: "We called pest control because there were cockroaches in the kitchen.",
    exampleCn: "厨房里有蟑螂，所以我们联系了害虫防治人员。",
    collocations: [["pest control service", "害虫防治服务"], ["pest control company", "害虫防治公司"]],
    phrases: [["call pest control", "联系害虫防治人员"]]
  }],
  ["claimform", {
    word: "claim form",
    phonetic: "/ˈkleɪm fɔːrm/",
    pos: "noun phrase",
    meaning: "索赔表；理赔申请表",
    detail: "向保险公司、雇主或有关机构正式申请赔偿或报销时填写的表格，通常需要附上事故、费用或损失证明。",
    example: "I filled out a claim form after the accident.",
    exampleCn: "事故发生后，我填写了一份理赔申请表。",
    collocations: [["fill out a claim form", "填写索赔表"], ["submit a claim form", "提交索赔表"]],
    phrases: [["attach evidence to the claim form", "在索赔表中附上证明"]]
  }],
  ["supportingdocument", {
    word: "supporting document",
    phonetic: "/səˈpɔːrtɪŋ ˈdɑːkjəmənt/",
    pos: "noun phrase",
    meaning: "证明文件；佐证材料",
    detail: "随申请、声明或报告一并提交，用来证明其中信息真实或符合条件的文件，如身份证明、工资单、收据或证书。",
    example: "You must submit a supporting document with the application.",
    exampleCn: "你必须随申请一并提交一份证明文件。",
    collocations: [["submit a supporting document", "提交证明文件"], ["required supporting documents", "所需佐证材料"]],
    phrases: [["provide supporting documents", "提供证明材料"]]
  }],
  ["subjectline", {
    word: "subject line",
    phonetic: "/ˈsʌbdʒekt laɪn/",
    pos: "noun phrase",
    meaning: "（电子邮件的）主题栏；主题行",
    detail: "电子邮件顶部概括邮件内容的一行文字，清楚的主题栏能让收件人迅速判断邮件目的并便于日后检索。",
    example: "Use a clear subject line for your job application email.",
    exampleCn: "求职申请邮件应使用清楚的主题栏。",
    collocations: [["email subject line", "电子邮件主题栏"], ["clear subject line", "清楚的主题行"]],
    phrases: [["write the subject line", "填写邮件主题"]]
  }],
  ["evictionnotice", {
    word: "eviction notice",
    phonetic: "/ɪˈvɪkʃən ˌnoʊtɪs/",
    pos: "noun phrase",
    meaning: "搬离通知；驱逐通知",
    detail: "房东依法要求租户在规定日期前搬离房屋的正式通知，通常会说明欠租、违约等原因以及可以采取的后续程序。",
    example: "The landlord served an eviction notice for non-payment of rent.",
    exampleCn: "房东因租客拖欠房租送达了搬离通知。",
    collocations: [["serve an eviction notice", "送达搬离通知"], ["receive an eviction notice", "收到搬离通知"]],
    phrases: [["challenge an eviction notice", "对搬离通知提出异议"]]
  }],
  ["zealand", {
    word: "New Zealand",
    phonetic: "/ˌnuː ˈziːlənd/",
    pos: "proper noun",
    meaning: "新西兰",
    detail: "位于西南太平洋的国家，主要由北岛和南岛组成；英语中通常作为完整国名 New Zealand 使用。",
    example: "I want to visit New Zealand.",
    exampleCn: "我想去新西兰旅行。",
    collocations: [["New Zealand government", "新西兰政府"], ["New Zealand citizen", "新西兰公民"]],
    phrases: [["travel to New Zealand", "前往新西兰旅行"]]
  }],
  ["hardwork", {
    word: "hard work",
    phonetic: "/ˌhɑːrd ˈwɜːrk/",
    pos: "noun phrase",
    meaning: "努力；辛勤工作",
    detail: "为完成目标而持续投入大量精力和时间；work 在这个固定搭配中是不可数名词，因此写作两个词 hard work。",
    example: "Hard work is essential for achieving success.",
    exampleCn: "努力工作是取得成功的重要条件。",
    collocations: [["years of hard work", "多年的辛勤工作"], ["hard work pays off", "努力会有回报"]],
    phrases: [["through hard work", "通过努力"]]
  }],
  ["jointaccount", {
    word: "joint account",
    phonetic: "/ˌdʒɔɪnt əˈkaʊnt/",
    pos: "noun phrase",
    meaning: "联名账户；共同账户",
    detail: "由两人或多人共同持有并可按约定存取资金的银行账户，常用于夫妻、家庭成员或商业伙伴共同管理开支。",
    example: "My husband and I opened a joint account for household bills.",
    exampleCn: "我和丈夫开了一个联名账户来支付家庭账单。",
    collocations: [["open a joint account", "开设联名账户"], ["joint bank account", "联名银行账户"]],
    phrases: [["pay bills from a joint account", "用联名账户支付账单"]]
  }],
  ["canva", {
    word: "Canva",
    phonetic: "/ˈkænvə/",
    pos: "proper noun",
    meaning: "Canva（在线设计平台）",
    detail: "一个在线图形设计平台的品牌名，可用于制作演示文稿、海报和社交媒体图片；它不是表示“画布、帆布”的普通名词 canvas。",
    example: "She used Canva to create her presentation slides.",
    exampleCn: "她使用 Canva 制作演示文稿。",
    collocations: [["Canva template", "Canva 模板"], ["Canva presentation", "Canva 演示文稿"]],
    phrases: [["design in Canva", "在 Canva 中设计"]]
  }]
]);

const referenceRepairs = new Map([
  ["so-cal", "so-called"],
  ["headquarter", "headquarters"],
  ["suppo", "suppose"],
  ["trad", "trade"],
  ["serv", "serve"],
  ["thanksgive", "thanksgiving"]
]);

const rejectedImports = new Map([
  ["emselves in difficult circumstan", "截取自句中 find themselves in difficult circumstances 的非单词残片"]
]);

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function stateSnapshot(entry = {}) {
  const result = {};
  for (const field of USER_STATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) result[field] = entry[field];
  }
  return result;
}

function listItems(rows) {
  return rows.map(([phrase, chinese]) => ({ phrase, chinese, audio: "" }));
}

function applyRename(entry, repair, repairedAt) {
  const oldWord = entry.word;
  return {
    ...entry,
    word: repair.word,
    answer: repair.word,
    acceptedAnswers: [repair.word],
    legacyHeadwords: unique([...(entry.legacyHeadwords || []), oldWord]),
    correctedFrom: oldWord,
    correctionType: "headword-structure-repair",
    phonetic: repair.phonetic,
    pos: repair.pos,
    meaning: repair.meaning,
    definition: repair.meaning,
    meaningDetailZh: repair.detail,
    meaningDetailedZh: repair.detail,
    meaningDetailSource: "manual-structural-editorial-review",
    meaningDetailReviewedAt: repairedAt,
    example: repair.example,
    exampleCn: repair.exampleCn,
    collocations: listItems(repair.collocations),
    phraseCollocations: listItems(repair.phrases),
    entryType: "headword",
    isPhrase: repair.word.includes(" "),
    audio: "",
    exampleAudio: "",
    phoneticStatus: "manual_verified",
    pronunciationSource: "manual-structural-editorial-review",
    exampleStatus: "manual_verified",
    entryStatus: "manual_structural_reviewed",
    updatedAt: repairedAt
  };
}

function applyReference(entry, canonical, repairedAt) {
  return {
    ...entry,
    entryType: "word-reference",
    studyMode: "reference",
    relationType: "spelling repair",
    baseWord: canonical.word,
    baseWordId: canonical.id || canonical.wordId,
    redirectToWord: canonical.word,
    meaning: `错误或不适合作为独立词条的写法；请学习 ${canonical.word}`,
    definition: `错误或不适合作为独立词条的写法；请学习 ${canonical.word}`,
    meaningDetailZh: `该记录来自旧数据中的截断或误写，已保留原 ID 以兼容历史进度；学习与搜索时会转到正确词条“${canonical.word}”。`,
    spellingEligible: false,
    referenceReason: "legacy malformed headword preserved for progress redirect",
    correctedTo: canonical.word,
    updatedAt: repairedAt
  };
}

function main() {
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master lexicon files differ; repair stopped.");
  const payload = JSON.parse(publicRaw.toString("utf8"));
  if (!Array.isArray(payload.words) || payload.words.length !== Number(payload.count)) {
    throw new Error("Master lexicon words/count mismatch; repair stopped.");
  }

  const beforeByKey = new Map(payload.words.map((entry) => [normalize(entry.word), entry]));
  for (const [oldWord, repair] of renameRepairs) {
    if (!beforeByKey.has(oldWord)) throw new Error(`Missing rename source: ${oldWord}`);
    const target = beforeByKey.get(normalize(repair.word));
    if (target && target !== beforeByKey.get(oldWord)) throw new Error(`Rename target already exists: ${repair.word}`);
  }
  for (const [badWord, canonicalWord] of referenceRepairs) {
    if (!beforeByKey.has(badWord) || !beforeByKey.has(canonicalWord)) {
      throw new Error(`Missing reference mapping: ${badWord} -> ${canonicalWord}`);
    }
  }
  for (const badWord of rejectedImports.keys()) {
    if (!beforeByKey.has(badWord)) throw new Error(`Missing rejected import: ${badWord}`);
  }

  const repairedAt = new Date().toISOString();
  const renamed = [];
  const redirected = [];
  const rejected = [];
  const stateById = new Map(payload.words.map((entry) => [entry.id || entry.wordId, JSON.stringify(stateSnapshot(entry))]));
  let nextWords = payload.words.flatMap((entry) => {
    const key = normalize(entry.word);
    if (rejectedImports.has(key)) {
      rejected.push({ id: entry.id || entry.wordId, word: entry.word, reason: rejectedImports.get(key) });
      return [];
    }
    const rename = renameRepairs.get(key);
    if (rename) {
      const next = applyRename(entry, rename, repairedAt);
      renamed.push({ id: entry.id || entry.wordId, from: entry.word, to: next.word });
      return [next];
    }
    return [entry];
  });

  const nextByKey = new Map(nextWords.map((entry) => [normalize(entry.word), entry]));
  nextWords = nextWords.map((entry) => {
    const targetWord = referenceRepairs.get(normalize(entry.word));
    if (!targetWord) return entry;
    const canonical = nextByKey.get(targetWord);
    const next = applyReference(entry, canonical, repairedAt);
    redirected.push({ id: entry.id || entry.wordId, from: entry.word, to: canonical.word });
    return next;
  });

  const redirectedByTarget = new Map(redirected.map((item) => [normalize(item.to), item]));
  nextWords = nextWords.map((entry) => {
    const alias = redirectedByTarget.get(normalize(entry.word));
    if (!alias) return entry;
    const next = {
      ...entry,
      legacyHeadwords: unique([...(entry.legacyHeadwords || []), alias.from]),
      legacyWordIds: unique([...(entry.legacyWordIds || []), alias.id]),
      updatedAt: repairedAt
    };
    if (normalize(entry.word) === "serve") {
      next.wordFamily = (entry.wordFamily || []).filter((item) => normalize(item?.word || item) !== "serv");
    }
    return next;
  });

  const normalizedKeys = nextWords.map((entry) => normalize(entry.word));
  if (new Set(normalizedKeys).size !== normalizedKeys.length) throw new Error("Repair would create duplicate headwords.");
  for (const entry of nextWords) {
    const id = entry.id || entry.wordId;
    if (stateById.has(id) && stateById.get(id) !== JSON.stringify(stateSnapshot(entry))) {
      throw new Error(`User state changed for ${entry.word} (${id}).`);
    }
  }
  for (const item of redirected) {
    const entry = nextWords.find((candidate) => (candidate.id || candidate.wordId) === item.id);
    if (!isInflectedReferenceWord(entry)) throw new Error(`Redirect was not recognized as a reference: ${item.from}`);
  }

  const nextPayload = {
    ...payload,
    structuralRepair: {
      version,
      repairedAt,
      renamed,
      redirected,
      rejected,
      policy: "correct malformed headwords and spacing; preserve legacy ids through references; remove only confirmed non-word import fragments"
    },
    words: nextWords,
    count: nextWords.length,
    savedAt: repairedAt,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords)
  };
  const content = `${JSON.stringify(nextPayload, null, 2)}\n`;
  const fileHash = crypto.createHash("sha256").update(content).digest("hex");
  const baselineContent = renderMasterLexiconBaseline({
    count: nextPayload.count,
    version: nextPayload.version,
    fileHash
  });
  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version,
    beforeCount: payload.words.length,
    afterCount: nextWords.length,
    renamed,
    redirected,
    rejected,
    paidAiCalls: 0,
    userStateChanges: 0,
    duplicateHeadwordsAfter: 0
  };
  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const stamp = repairedAt.replace(/[:.]/g, "-");
  const backupDirectory = path.join(root, "backups", "master-structural-anomaly-repair", stamp);
  fs.mkdirSync(backupDirectory, { recursive: true });
  for (const filePath of [publicPath, staticPath, baselinePath]) {
    fs.copyFileSync(filePath, path.join(backupDirectory, path.basename(filePath)));
  }
  try {
    atomicWrite(publicPath, content);
    atomicWrite(staticPath, content);
    atomicWrite(baselinePath, baselineContent);
    if (!fs.readFileSync(publicPath).equals(fs.readFileSync(staticPath))) {
      throw new Error("Authoritative lexicon copies differ after write.");
    }
  } catch (error) {
    for (const filePath of [publicPath, staticPath, baselinePath]) {
      fs.copyFileSync(path.join(backupDirectory, path.basename(filePath)), filePath);
    }
    throw error;
  }
  console.log(JSON.stringify({ ...report, backupDirectory, sha256: fileHash }, null, 2));
}

main();
