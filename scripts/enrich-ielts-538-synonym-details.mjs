import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyIelts538SynonymDetails,
  buildIelts538SynonymDetailIndex
} from "../app/lib/ielts-538/synonym-details.mjs";

const IELTS_538_PATH = resolve(process.cwd(), "public/data/ielts-538-words.json");
const MASTER_LEXICON_PATH = resolve(process.cwd(), "public/data/words.json");

function withoutSynonymDetails(words) {
  return words.map(({ synonymDetails: _synonymDetails, ...word }) => word);
}

const current = JSON.parse(readFileSync(IELTS_538_PATH, "utf8"));
const masterLexicon = JSON.parse(readFileSync(MASTER_LEXICON_PATH, "utf8"));

if (current?.count !== 376 || current?.words?.length !== 376) {
  throw new Error("538 独立词库数量异常，停止补充同义词释义。");
}

const detailIndex = buildIelts538SynonymDetailIndex(masterLexicon?.words);
const words = applyIelts538SynonymDetails(current.words, detailIndex);

if (
  JSON.stringify(withoutSynonymDetails(current.words)) !==
  JSON.stringify(withoutSynonymDetails(words))
) {
  throw new Error("释义补充触及了 synonymDetails 以外的数据，停止写回。");
}

const details = words.flatMap((word) => Object.values(word.synonymDetails || {}));
const summary = {
  displayed: details.length,
  withOriginalMeaning: details.filter((detail) => detail.originalMeaning).length,
  withContextualMeaning: details.filter((detail) => detail.contextualMeaning).length
};

if (process.argv.includes("--apply")) {
  writeFileSync(
    IELTS_538_PATH,
    `${JSON.stringify({ ...current, words }, null, 2)}\n`,
    "utf8"
  );
  console.log(`已补充同义替换释义：${JSON.stringify(summary)}`);
} else {
  console.log(`预览同义替换释义：${JSON.stringify(summary)}`);
  console.log("未写回；确认后使用 --apply。");
}
