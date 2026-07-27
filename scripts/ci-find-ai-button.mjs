import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const needles = [
  "开始处理",
  "补全AI内容",
  "AI补全范围",
  "aiConfirmed",
  "aiTargetWords",
  "确认只补全当前538",
  "当前538词库"
];
const allowed = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".html", ".css"]);
const ignored = new Set([".git", "node_modules", ".next", "outputs", "reports", ".static-export-cache"]);
const hits = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!allowed.has(path.extname(entry.name))) continue;
    const stat = fs.statSync(full);
    if (stat.size > 3 * 1024 * 1024) continue;
    const text = fs.readFileSync(full, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const matched = needles.filter((needle) => line.includes(needle));
      if (!matched.length) return;
      hits.push({
        file: path.relative(ROOT, full).replaceAll("\\", "/"),
        line: index + 1,
        matched,
        context: lines.slice(Math.max(0, index - 8), Math.min(lines.length, index + 9))
          .map((value, offset) => `${Math.max(0, index - 8) + offset + 1}: ${value}`)
      });
    });
  }
}

walk(ROOT);
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/ci-ai-button-locations.json", `${JSON.stringify({ needles, hits }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ hitCount: hits.length, files: [...new Set(hits.map((hit) => hit.file))] }, null, 2));
