/** Read-only semantic quality audit. Source lexicons are never modified. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSemanticVocabulary, sha256, toTsv } from "./lib/vocab-semantic-quality-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SOURCE = path.join(ROOT, ".static-export-cache", "words.json");
const REPORT_DIR = path.join(ROOT, "reports", "vocab-semantic-quality");

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

export function runAudit(args = process.argv.slice(2)) {
  const previousArgv = process.argv;
  process.argv = [previousArgv[0], previousArgv[1], ...args];
  try {
    const sourceArg = option("--source", DEFAULT_SOURCE);
    const sourcePath = path.resolve(ROOT, sourceArg);
    const priority = option("--priority").toUpperCase();
    const batchSize = Number(option("--batch-size", "0")) || 0;
    const raw = fs.readFileSync(sourcePath, "utf8");
    const payload = JSON.parse(raw);
    const result = auditSemanticVocabulary(payload, {
      priority: priority || "",
      batchSize,
      onlyGt: process.argv.includes("--only-gt"),
      onlyCore: process.argv.includes("--only-core")
    });
    const output = {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      source: path.relative(ROOT, sourcePath).replace(/\\/g, "/"),
      sourceFileHash: sha256(raw),
      sourceVersion: payload?.version || "",
      filters: { priority: priority || null, batchSize: batchSize || null, onlyGt: process.argv.includes("--only-gt"), onlyCore: process.argv.includes("--only-core") },
      ...result
    };
    if (process.argv.includes("--write-reports")) {
      fs.mkdirSync(REPORT_DIR, { recursive: true });
      const name = priority || batchSize || process.argv.includes("--only-gt") || process.argv.includes("--only-core") ? "latest-filtered-audit" : "baseline-summary";
      fs.writeFileSync(path.join(REPORT_DIR, `${name}.json`), `${JSON.stringify(output, null, 2)}\n`);
      fs.writeFileSync(path.join(REPORT_DIR, `${name}-issues.tsv`), toTsv(output.issues, ["priority", "category", "id", "word", "disposition", "evidence"]));
    }
    return output;
  } finally {
    process.argv = previousArgv;
  }
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const result = runAudit();
  console.log(JSON.stringify({ source: result.source, sourceVersion: result.sourceVersion, summary: result.summary, methodology: result.methodology }, null, 2));
}
