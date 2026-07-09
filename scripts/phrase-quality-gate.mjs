/**
 * Phrase-layer quality gate (read-only by default).
 * Usage:
 *   node scripts/phrase-quality-gate.mjs
 *   node scripts/phrase-quality-gate.mjs --gate
 *   node scripts/phrase-quality-gate.mjs --write-reports
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHRASES_PATH = path.join(ROOT, "public", "data", "phrases.json");
const REPORT_PATH = path.join(ROOT, "reports", "phrase-quality-gate.json");

const MARKER = "无中文释义";

function textOf(entry) {
  return [
    entry?.word,
    entry?.phrase,
    entry?.answer,
    entry?.meaning,
    entry?.definition,
    entry?.example,
    entry?.exampleCn
  ]
    .map((value) => String(value || ""))
    .join("\n");
}

function zhOf(entry) {
  return String(entry?.meaning || entry?.chinese || entry?.meaningZh || "").trim();
}

function headOf(entry) {
  return String(entry?.phrase || entry?.word || entry?.answer || "").trim();
}

export function auditPhrases(payload) {
  const phrases = Array.isArray(payload?.phrases)
    ? payload.phrases
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : [];

  const findings = {
    missingZhMarker: [],
    emptyZh: [],
    typoIl: [],
    truncatedSupposin: [],
    grammarStudyHave: [],
    mistransHeart: [],
    truncatedHeadword: []
  };

  for (const entry of phrases) {
    const id = String(entry?.id || entry?.wordId || headOf(entry));
    const head = headOf(entry);
    const zh = zhOf(entry);
    const blob = textOf(entry);
    const row = { id, head, zh: zh.slice(0, 80) };

    if (zh.includes(MARKER)) findings.missingZhMarker.push(row);
    if (!zh) findings.emptyZh.push(row);
    if (/\bI'l\b/i.test(blob) || head.startsWith("I'l ")) findings.typoIl.push(row);
    if (/supposin(?!g)/i.test(blob)) findings.truncatedSupposin.push(row);
    if (/\bThe study have\b/i.test(blob)) findings.grammarStudyHave.push(row);
    if (zh.includes("谎言的心脏")) findings.mistransHeart.push(row);
    if (/[a-z]{5,}in$/i.test(head) && /supposin|thinkin|goin|havin|doin/i.test(head)) {
      findings.truncatedHeadword.push(row);
    }
  }

  const fatalCounts = {
    missingZhMarker: findings.missingZhMarker.length,
    emptyZh: findings.emptyZh.length,
    typoIl: findings.typoIl.length,
    truncatedSupposin: findings.truncatedSupposin.length,
    grammarStudyHave: findings.grammarStudyHave.length,
    mistransHeart: findings.mistransHeart.length,
    truncatedHeadword: findings.truncatedHeadword.length
  };

  const fatalTotal = Object.values(fatalCounts).reduce((sum, n) => sum + n, 0);
  const errors = Object.entries(fatalCounts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${key}: ${n}`);

  return {
    ok: fatalTotal === 0,
    count: phrases.length,
    payloadCount: Number(payload?.count || phrases.length),
    fatalTotal,
    fatalCounts,
    errors,
    findings
  };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const raw = fs.readFileSync(PHRASES_PATH, "utf8");
  const payload = JSON.parse(raw);
  const report = {
    generatedAt: new Date().toISOString(),
    source: path.relative(ROOT, PHRASES_PATH).replace(/\\/g, "/"),
    ...auditPhrases(payload)
  };

  // Gate response stays compact; findings stay for report files.
  const gate = {
    ok: report.ok,
    count: report.count,
    fatalTotal: report.fatalTotal,
    fatalCounts: report.fatalCounts,
    errors: report.errors
  };

  if (args.has("--write-reports")) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(args.has("--gate") ? gate : report, null, 2));
  if (args.has("--gate") && !gate.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
