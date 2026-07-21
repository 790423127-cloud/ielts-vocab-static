import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "app", "lib", "vocab", "word-flashcard-study-pool.mjs");
const MARKER = 'group: "G类完整学习计划"';
const ANCHOR = /  \{\r?\n    group: "难度层级",\r?\n/;
const INSERT = `  {
    group: "G类完整学习计划",
    items: [
      {
        title: "阶段1 · 核心理解",
        desc: "G类阅读核心词和本轮真题精补词，目标是1至2秒内认出。",
        filter: { type: "topic", value: "G类完整学习计划·阶段1" }
      },
      {
        title: "阶段2 · 扩展识别",
        desc: "Section 2和Section 3扩展词，以阅读识别为主。",
        filter: { type: "topic", value: "G类完整学习计划·阶段2" }
      },
      {
        title: "阶段4 · 专业参考",
        desc: "真题专业词、专名和低频词，只需结合原文识别。",
        filter: { type: "topic", value: "G类完整学习计划·阶段4" }
      }
    ]
  },
`;

const source = fs.readFileSync(TARGET, "utf8");
if (source.includes(MARKER)) {
  console.log(JSON.stringify({ ok: true, changed: false, target: path.relative(ROOT, TARGET) }, null, 2));
  process.exit(0);
}
if (!ANCHOR.test(source)) {
  console.error(JSON.stringify({ ok: false, error: "learning entry anchor not found", target: path.relative(ROOT, TARGET) }, null, 2));
  process.exit(1);
}
const eol = source.includes("\r\n") ? "\r\n" : "\n";
const normalizedInsert = INSERT.replace(/\n/g, eol);
fs.writeFileSync(TARGET, source.replace(ANCHOR, (anchor) => `${normalizedInsert}${anchor}`), "utf8");
console.log(JSON.stringify({ ok: true, changed: true, target: path.relative(ROOT, TARGET) }, null, 2));
