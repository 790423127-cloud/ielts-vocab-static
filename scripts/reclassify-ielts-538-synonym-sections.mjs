import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyIelts538SynonymSections,
  buildIelts538DifficultyIndex
} from "../app/lib/ielts-538/replacement-sections.mjs";

const IELTS_538_PATH = resolve(process.cwd(), "public/data/ielts-538-words.json");
const MASTER_LEXICON_PATH = resolve(process.cwd(), "public/data/words.json");

function withoutSectionFields(words) {
  return words.map(({ readingSection: _readingSection, synonymSections: _synonymSections, ...word }) => ({
    ...word,
    paraphraseExamples: (word.paraphraseExamples || []).map(
      ({ readingSection: _pairReadingSection, ...pair }) => pair
    )
  }));
}

const current = JSON.parse(readFileSync(IELTS_538_PATH, "utf8"));
const masterLexicon = JSON.parse(readFileSync(MASTER_LEXICON_PATH, "utf8"));

if (current?.count !== 376 || current?.words?.length !== 376) {
  throw new Error("538 独立词库数量异常，停止重新标记。");
}

const difficultyIndex = buildIelts538DifficultyIndex(masterLexicon?.words);
const words = applyIelts538SynonymSections(current.words, difficultyIndex);

if (
  JSON.stringify(withoutSectionFields(current.words)) !==
  JSON.stringify(withoutSectionFields(words))
) {
  throw new Error("重新标记触及了 Section 以外的数据，停止写回。");
}

const sectionCounts = words
  .flatMap((word) => Object.values(word.synonymSections || {}))
  .reduce((counts, section) => {
    counts[section] = (counts[section] || 0) + 1;
    return counts;
  }, {});

if (process.argv.includes("--apply")) {
  writeFileSync(
    IELTS_538_PATH,
    `${JSON.stringify({ ...current, words }, null, 2)}\n`,
    "utf8"
  );
  console.log(`已重新标记 376 个词条的同义替换难度：${JSON.stringify(sectionCounts)}`);
} else {
  console.log(`预览同义替换难度分布：${JSON.stringify(sectionCounts)}`);
  console.log("未写回；确认后使用 --apply。");
}
