import fs from "node:fs";

const file = "scripts/apply-quality-standard-patch.mjs";
let source = fs.readFileSync(file, "utf8");
const replacements = [
  ["${pendingAiCount}", "\\${pendingAiCount}"],
  ["${audioStats.has}", "\\${audioStats.has}"],
  ["${audioStats.total}", "\\${audioStats.total}"]
];

for (const [before, after] of replacements) {
  source = source.replaceAll(before, after);
}

fs.writeFileSync(file, source, "utf8");
console.log("Escaped embedded JSX template expressions in quality patch script.");
