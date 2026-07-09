/**
 * Apply deterministic P0 phrase-layer content fixes.
 * Usage: node scripts/repair-phrase-quality-p0.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditPhrases } from "./phrase-quality-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHRASES_PATH = path.join(ROOT, "public", "data", "phrases.json");
const MARKER = "无中文释义";

const HEAD_FIXES = new Map([
  ["I'l be there for you", "I'll be there for you"],
  ["Would I be correct in supposin", "Would I be correct in supposing"]
]);

const MEANING_FIXES = new Map([
  ["lies at the heart of", "位于……的核心；是……的核心"],
  ["it may be possible to", "有可能……；或许可以……"],
  ["Can I get one thing clear", "我能先弄清楚一件事吗？"],
  ["Would I be correct in supposing", "我这样假设对吗？"],
  ["Would I be correct in supposin", "我这样假设对吗？"],
  ["I'm sorry but I don't know much about but perhaps", "抱歉我对这方面不太了解，不过也许……"],
  ["In other words I am", "换句话说，我是……"],
  ["If I may say so this is", "恕我直言，这是……"],
  ["Well as you know at the moment I'm studying at", "嗯，如你所知，我目前在……学习"],
  ["if something goes wrong I think I will probably", "如果出了问题，我想我可能会……"],
  ["I reckon I'll", "我想我会……"],
  ["I'm figuring on", "我打算；我预计"],
  ["Once when I was a college student I went on a trip which I will never forget", "大学时我去过一次终生难忘的旅行"],
  ["In my opinion there are three way of looking at it first of all next then", "在我看来，有三种看法：首先……接下来……然后……"],
  ["Well I think there are two", "嗯，我认为有两点/两个方面"],
  [
    "Yes these day it is quite popular to go on these chat lines but I think it's not very good",
    "现在上这些聊天线路很流行，但我认为不太好"
  ],
  [
    "Yes there are quite a few differences between the way children and adults make friends. A good example is the way they just start using each other's toys happily without needing permission",
    "儿童和成人交友方式有不少差异。例如，孩子可以开心地共用玩具，不必先征得许可"
  ],
  ["Normalize seeking therapy", "使寻求心理治疗变得正常化"],
  ["save time be time-saving", "节省时间；省时的"]
]);

function replaceAllSafe(value, from, to) {
  return String(value || "").split(from).join(to);
}

function cleanZh(value) {
  return String(value || "")
    .replaceAll(MARKER, "")
    .replace(/[（(]\s*[）)]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function applyHeadFix(entry, from, to) {
  const fields = ["word", "phrase", "answer"];
  for (const field of fields) {
    if (entry[field] === from) entry[field] = to;
  }
  if (Array.isArray(entry.acceptedAnswers)) {
    entry.acceptedAnswers = entry.acceptedAnswers.map((item) => (item === from ? to : item));
  }
}

function fixExampleGrammar(entry) {
  if (typeof entry.example === "string") {
    entry.example = entry.example
      .replace(/\bThe study have shown\b/gi, "The study has shown")
      .replace(/\bStudies has shown\b/gi, "Studies have shown");
  }
  if (typeof entry.definition === "string") {
    entry.definition = entry.definition
      .replace(/\bThe study have shown\b/gi, "The study has shown");
  }
}

function main() {
  const payload = JSON.parse(fs.readFileSync(PHRASES_PATH, "utf8"));
  const phrases = Array.isArray(payload.phrases) ? payload.phrases : [];
  let changed = 0;

  for (const entry of phrases) {
    const before = JSON.stringify(entry);
    const head = String(entry.phrase || entry.word || entry.answer || "").trim();

    for (const [from, to] of HEAD_FIXES.entries()) {
      if (head === from || entry.word === from || entry.phrase === from || entry.answer === from) {
        applyHeadFix(entry, from, to);
      }
    }

    // After head fix, recompute lookup key.
    const fixedHead = String(entry.phrase || entry.word || entry.answer || "").trim();

    if (HEAD_FIXES.has(head) || fixedHead.includes("I'll be there for you")) {
      // also fix residual I'l anywhere in entry text fields
      for (const field of ["word", "phrase", "answer", "example", "exampleCn", "meaning", "definition"]) {
        if (typeof entry[field] === "string" && entry[field].includes("I'l")) {
          entry[field] = replaceAllSafe(entry[field], "I'l", "I'll");
        }
      }
      if (Array.isArray(entry.acceptedAnswers)) {
        entry.acceptedAnswers = entry.acceptedAnswers.map((item) => replaceAllSafe(item, "I'l", "I'll"));
      }
    }

    if (MEANING_FIXES.has(fixedHead)) {
      entry.meaning = MEANING_FIXES.get(fixedHead);
      if (entry.definition === "谎言的心脏" || String(entry.definition || "").includes(MARKER) || !entry.definition) {
        entry.definition = entry.meaning;
      }
    } else if (String(entry.meaning || "").includes(MARKER)) {
      entry.meaning = cleanZh(entry.meaning) || MEANING_FIXES.get(fixedHead) || cleanZh(entry.meaning);
    }

    if (String(entry.definition || "").includes(MARKER)) {
      entry.definition = cleanZh(entry.definition) || entry.meaning;
    }

    if (fixedHead === "lies at the heart of" || String(entry.meaning || "").includes("谎言的心脏")) {
      entry.meaning = "位于……的核心；是……的核心";
      entry.definition = "to be the most important part of something";
    }

    fixExampleGrammar(entry);

    if (JSON.stringify(entry) !== before) changed += 1;
  }

  payload.count = phrases.length;
  payload.qualityRepairedAt = new Date().toISOString();
  payload.qualityRepair = "p0-phrase-quality-2026-07-10";

  fs.writeFileSync(PHRASES_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const after = auditPhrases(payload);
  console.log(
    JSON.stringify(
      {
        ok: after.ok,
        changed,
        count: phrases.length,
        fatalTotal: after.fatalTotal,
        fatalCounts: after.fatalCounts,
        errors: after.errors
      },
      null,
      2
    )
  );
  if (!after.ok) process.exitCode = 1;
}

main();
