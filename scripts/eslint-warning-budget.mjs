import { ESLint } from "eslint";

const LINT_TARGETS = [
  "app",
  "scripts",
  "tests/e2e",
  "next.config.mjs",
  "eslint.config.mjs",
  "playwright.config.mjs"
];

// These ceilings can only move down. They make gradual cleanup enforceable
// without turning the existing dependency warnings into a risky bulk rewrite.
const WARNING_BUDGETS = {
  "no-unused-vars": 73,
  "react-hooks/exhaustive-deps": 21
};

const eslint = new ESLint();
const results = await eslint.lintFiles(LINT_TARGETS);
const counts = new Map();
const errors = [];

for (const result of results) {
  for (const message of result.messages) {
    if (message.severity === 2) {
      errors.push(`${result.filePath}:${message.line}:${message.column} ${message.ruleId || "parse"} ${message.message}`);
      continue;
    }
    const ruleId = message.ruleId || "unknown";
    counts.set(ruleId, (counts.get(ruleId) || 0) + 1);
  }
}

const regressions = [];
for (const [ruleId, count] of counts) {
  const budget = WARNING_BUDGETS[ruleId] ?? 0;
  if (count > budget) regressions.push(`${ruleId}: ${count} warnings exceeds budget ${budget}`);
}

for (const [ruleId, budget] of Object.entries(WARNING_BUDGETS)) {
  const count = counts.get(ruleId) || 0;
  console.log(`${ruleId}: ${count}/${budget}`);
}

if (errors.length || regressions.length) {
  if (errors.length) console.error(errors.join("\n"));
  if (regressions.length) console.error(regressions.join("\n"));
  process.exitCode = 1;
}
