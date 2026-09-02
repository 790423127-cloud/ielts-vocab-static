import fs from "node:fs";

const path = ".github/scripts/tmp-core-vocab-audit-repair.mjs";
let source = fs.readFileSync(path, "utf8");

const importBefore = `const {\n  buildEligibilityWordMap,\n  isBrushableWord,\n  resolveBrushableWord\n} = await import("../../app/lib/vocab/word-study-eligibility.mjs");\n`;
const importAfter = `${importBefore}const { classifySurfaceInflection } = await import("../../app/lib/vocab/word-surface-morphology.mjs");\n`;
if (!source.includes(importBefore)) throw new Error("Eligibility import anchor missing");
source = source.replace(importBefore, importAfter);

const targetBefore = `  const sourceTarget = wordMap.get(normalizeHeadword(cleaned));\n  const target = resolveBrushableWord(sourceTarget, wordMap);\n  if (!target || target === entry) throw new Error(\`No safe target for \${entry.word} -> \${cleaned}\`);\n`;
const targetAfter = `  const sourceTarget = wordMap.get(normalizeHeadword(cleaned));\n  let target = resolveBrushableWord(sourceTarget, wordMap);\n  if (!target) {\n    const morphologyMatches = words.filter((candidate) => (\n      candidate !== entry &&\n      isBrushableWord(candidate) &&\n      classifySurfaceInflection(candidate.word, cleaned)\n    ));\n    if (morphologyMatches.length === 1) target = morphologyMatches[0];\n  }\n  if (!target || target === entry) throw new Error(\`No safe unique target for \${entry.word} -> \${cleaned}\`);\n`;
if (!source.includes(targetBefore)) throw new Error("Malformed target anchor missing");
source = source.replace(targetBefore, targetAfter);

fs.writeFileSync(path, source, "utf8");
