/**
 * Build a conservative, reproducible compaction plan from the independent
 * words already present in G-reading. No external headwords are introduced.
 *
 * Dry run: node scripts/compact-reading-g-word-families.mjs
 * Write and apply: node scripts/compact-reading-g-word-families.mjs --write
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  READING_G_COMPACTION_SOURCE,
  buildReadingGCompactionPlan
} from "../app/lib/reading-g-vocab/compaction.mjs";
import { runReadingGQuestionBankExpansion } from "./expand-reading-g-question-bank.mjs";

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWriteJson(finalPath, data) {
  const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tempPath, finalPath);
}

export function buildCurrentReadingGCompactionPlan({ root = projectRoot } = {}) {
  const vocabPath = path.join(root, "public", "data", "reading-g-vocab.json");
  const vocab = readJson(vocabPath);
  const plan = buildReadingGCompactionPlan(vocab.items);
  return { vocabPath, vocab, plan };
}

export function writeAndApplyReadingGCompaction({ root = projectRoot, rebuild = false } = {}) {
  const planPath = path.join(root, READING_G_COMPACTION_SOURCE);
  const plan = !rebuild && fs.existsSync(planPath)
    ? readJson(planPath)
    : buildCurrentReadingGCompactionPlan({ root }).plan;
  if (rebuild || !fs.existsSync(planPath)) atomicWriteJson(planPath, plan);
  const expansion = runReadingGQuestionBankExpansion({ projectRoot: root });
  return { planPath, plan, expansion };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const write = process.argv.includes("--write");
  const rebuild = process.argv.includes("--rebuild");
  const result = write
    ? writeAndApplyReadingGCompaction({ rebuild })
    : buildCurrentReadingGCompactionPlan();
  const plan = result.plan;
  console.log(JSON.stringify({
    mode: write ? "write" : "dry-run",
    sourceWordCount: plan.sourceWordCount,
    resultingWordCount: plan.resultingWordCount,
    ...plan.stats,
    planPath: result.planPath || null,
    finalWordCount: result.expansion?.vocab?.wordCount || null
  }, null, 2));
}
