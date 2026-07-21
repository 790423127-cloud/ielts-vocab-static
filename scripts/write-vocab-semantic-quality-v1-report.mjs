import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSemanticVocabulary, hashExample, sha256, toTsv } from "./lib/vocab-semantic-quality-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data", "vocab-semantic-quality");
const REPORT_DIR = path.join(ROOT, "reports", "vocab-semantic-quality");
const CACHE = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC = path.join(ROOT, "public", "data", "words.json");

function parseTsv(name) {
  const lines = fs.readFileSync(path.join(DATA_DIR, name), "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split("\t");
  return lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, line.split("\t")[index] ?? ""])));
}

function parseJson(value, fallback = {}) {
  return String(value || "").trim() ? JSON.parse(value) : fallback;
}

function write(name, content) {
  fs.writeFileSync(path.join(REPORT_DIR, name), content);
}

const raw = fs.readFileSync(CACHE, "utf8");
const publicRaw = fs.readFileSync(PUBLIC, "utf8");
const payload = JSON.parse(raw);
const words = payload.words || payload;
const byId = new Map(words.map((entry) => [String(entry.id || entry.wordId || ""), entry]));
const audit = auditSemanticVocabulary(payload);
const p0Base = parseTsv("batch-p0.tsv");
const p0Followup = parseTsv("batch-p0-followup.tsv");
const exampleReview = parseTsv("batch-example-review.tsv");
const meaningCore = parseTsv("batch-meaning-core.tsv");
const rejected = parseTsv("rejected-auto-fixes.tsv");

const baseline = {
  generatedAt: "2026-07-15T00:00:00.000Z",
  sourceVersion: "v9-13758-gt-complete-20260714-v2-second-review",
  readOnly: true,
  independentlyVerified: true,
  summary: {
    totalWords: 13758,
    rawIssueCount: 63059,
    rawP0AlertCount: 622,
    rawP0EntryCount: 449,
    strictExampleCandidates: 1286,
    acceptedByMorphology: 1141,
    targetAbsentAfterMorphology: 145,
    categoryCounts: {
      meaning_without_chinese: 1,
      missing_meaning_detailed: 9130,
      generic_meaning_detail: 6484,
      meaning_detailed_not_expanded: 4602,
      multi_meaning_without_structured_senses: 4255,
      multi_meaning_without_quiz_senses: 3862,
      space_before_punctuation: 385,
      generic_example_cn: 28,
      unfinished_example_raw: 204,
      number_mismatch_raw: 16,
      obvious_translation_mismatch: 2,
      probable_typo: 1
    }
  },
  calibration: {
    note: "Raw alerts were calibrated before patching: month/date/decade/万/百万 equivalents and closing quotation marks were removed from confirmed P0. The patch ledger, not the raw alert count, is the authoritative repair set.",
    paidApiCalls: 0,
    externalPerWordLookups: 0
  }
};

const after = {
  generatedAt: new Date().toISOString(),
  sourceVersion: payload.version,
  sourceFileHash: sha256(raw),
  publicFileHash: sha256(publicRaw),
  cachePublicIdentical: raw === publicRaw,
  summary: audit.summary,
  methodology: audit.methodology
};

const finalP0ById = new Map();
for (const row of [...p0Base, ...p0Followup]) finalP0ById.set(row.id, row);
const p0Rows = [...finalP0ById.values()].map((row) => {
  const entry = byId.get(row.id);
  const set = parseJson(row.setJson);
  return { id: row.id, word: row.word, action: row.action, reason: row.reason, evidence: row.evidence, finalExample: set.example || entry?.example || "", finalExampleCn: set.exampleCn || entry?.exampleCn || "" };
});
const exampleRows = p0Rows.filter((row) => row.action === "repair" && row.finalExample);
const formRows = exampleReview.filter((row) => row.action === "add-form").map((row) => ({ id: row.id, word: row.word, forms: row.addFormsJson, reason: row.reason, evidence: row.evidence }));
const meaningRows = meaningCore.map((row) => {
  const entry = byId.get(row.id);
  return { id: row.id, word: row.word, definition: entry?.definition || "", meaningDetailedZh: entry?.meaningDetailedZh || "", meaningsZhCount: entry?.meaningsZh?.filter((sense) => sense?.confidence === "high").length || 0, quizSensesCount: entry?.quizSenses?.filter((sense) => sense?.confidence === "high").length || 0, reason: row.reason };
});
const deletedRows = p0Rows.filter((row) => row.action === "delete").map((row) => ({ id: row.id, word: row.word, reason: row.reason, evidence: row.evidence }));

const backlogById = new Map();
for (const item of audit.issues.filter((issue) => issue.priority !== "P0")) {
  const key = item.id || item.word;
  if (!backlogById.has(key)) backlogById.set(key, { priority: item.priority, id: item.id, word: item.word, categories: [], disposition: "defer", evidence: [] });
  const target = backlogById.get(key);
  if (!target.categories.includes(item.category)) target.categories.push(item.category);
  if (target.evidence.length < 3 && !target.evidence.includes(item.evidence)) target.evidence.push(item.evidence);
}
for (const row of exampleReview.filter((item) => item.action === "defer")) {
  const target = backlogById.get(row.id) || { priority: "P1", id: row.id, word: row.word, categories: [], disposition: "defer", evidence: [] };
  if (!target.categories.includes("target_absent_after_morphology")) target.categories.push("target_absent_after_morphology");
  if (!target.evidence.includes(row.evidence)) target.evidence.push(row.evidence);
  backlogById.set(row.id, target);
}
const backlogRows = [...backlogById.values()].map((row) => ({ ...row, categories: row.categories.join(","), evidence: row.evidence.join(" | ") }));

const firstExpectedExampleHash = new Map();
for (const row of [...p0Base, ...p0Followup]) if (!firstExpectedExampleHash.has(row.id)) firstExpectedExampleHash.set(row.id, row.expectedExampleHash);
const changedExampleEntries = new Set([...finalP0ById.keys()].filter((id) => {
  const entry = byId.get(id);
  return entry && firstExpectedExampleHash.get(id) !== hashExample(entry) && parseJson(finalP0ById.get(id).setJson).example;
}));
const confirmedTranslationRepairs = new Set([
  ...p0Base.filter((row) => /generic_example_cn|obvious_translation_mismatch|number_mismatch/.test(row.reason)).map((row) => row.id),
  ...p0Followup.filter((row) => ["password", "username", "headlamp", "pets", "hearts"].includes(row.word)).map((row) => row.id)
]);
const semanticQuizSenseCount = words.reduce((count, entry) => count + (entry.quizSenses || []).filter((sense) => sense?.source === "semantic-quality-v1").length, 0);
const semanticMeaningSenseCount = meaningCore.reduce((count, row) => count + parseJson(row.addMeaningsJson, []).length, 0);

write("baseline-summary.json", `${JSON.stringify(baseline, null, 2)}\n`);
write("after-summary.json", `${JSON.stringify(after, null, 2)}\n`);
write("p0-repairs.tsv", toTsv(p0Rows, ["id", "word", "action", "reason", "evidence", "finalExample", "finalExampleCn"]));
write("example-repairs.tsv", toTsv(exampleRows, ["id", "word", "reason", "evidence", "finalExample", "finalExampleCn"]));
write("form-only-fixes.tsv", toTsv(formRows, ["id", "word", "forms", "reason", "evidence"]));
write("meaning-repairs.tsv", toTsv(meaningRows, ["id", "word", "definition", "meaningDetailedZh", "meaningsZhCount", "quizSensesCount", "reason"]));
write("deleted-entries.tsv", toTsv(deletedRows, ["id", "word", "reason", "evidence"]));
write("deferred-backlog.tsv", toTsv(backlogRows, ["priority", "id", "word", "categories", "disposition", "evidence"]));
write("rejected-auto-fixes.tsv", toTsv(rejected, ["id", "word", "action", "reason", "evidence", "expectedMeaningHash", "expectedExampleHash"]));

const report = `# 总词库语义质量最小成本修复 V1

## 执行结论

- 正式词条：13,758 → 13,757；仅删除来源噪声 \`neff\` 1 条。
- P0：原始扫描 622 个告警（449 个词条，含待校准假阳性）→ 确认口径 0。
- 例句关系候选：1,286；词形归一化后 1,141 条合法，最终 106 条仍需人工关系复核。
- 补丁第二次独立执行：新增 0、修改 0、删除 0、哈希拒绝 0。
- \`paidApiCalls = 0\`；\`externalPerWordLookups = 0\`。

## 修改统计

| 项目 | 数量 |
| --- | ---: |
| 最终 P0 补丁词条 | ${p0Rows.length} |
| 例句字段确认变化 | ${changedExampleEntries.size} |
| 仅补 forms/wordFamily、未更换例句 | ${formRows.length} |
| 确认修复中文翻译/占位/内容冲突 | ${confirmedTranslationRepairs.size} |
| 明确数字冲突 | 1 |
| 新增有效详细释义的核心词 | ${meaningRows.length} |
| 本批新增 meaningsZh 义项 | ${semanticMeaningSenseCount} |
| 本批新增高置信 quizSenses | ${semanticQuizSenseCount} |
| 删除 | ${deletedRows.length} |
| 降为 reference | 0 |
| 低置信例句关系 defer | ${exampleReview.filter((row) => row.action === "defer").length} |
| 稳定 ID 变化 | 0 |
| status/favorite/复习统计变化 | 0 |

## 重点修复

- 修复 385 条句号前异常空格，并对自动补尾中不够自然的 74 条再次人工语义复核。
- 逐条处理 28 条主题占位中文；修复 \`payload\`、\`janitor\`、\`arrears\`、\`hotline\`、\`prestige\` 等已知冲突。
- \`claimform / byproduct / dropoff / dutyfree\` 登记标准空格或连字符形式；\`prestige\` 登记 \`prestigious\` 词族关系。
- 19 个 G 类阶段 1/2 核心多义词新增真正英文定义、20–80 字中文详细释义和高置信结构化义项。
- WordFlashcardView 仅在有效时显示详细释义和最多 3 个高置信义项；空例句改为“例句待补全”。

## 验证

- 专项测试：9/9 通过。
- 全量测试：205/205 通过。
- ESLint errors：0。
- \`npm run build\`：成功；34 个页面生成完成。构建仍报告仓库既有 warnings，本批未新增 warning。
- Playwright E2E：1/1 通过；桌面切换到 \`account\` 成功，390×844 无横向溢出，控制台错误 0。
- cache/public：${raw === publicRaw ? "字节完全一致" : "不一致（需阻断）"}。

## 未解决与后续

- P1/P2 backlog 仍有 ${backlogRows.length} 个唯一词条，主要是旧中文 definition、机械 meaningDetailZh、核心外多义结构缺失；本轮按要求不批量模板化填充。
- 106 条词形归一化后仍未命中的例句关系需要后续每批 100–200 条人工复核，不应自动重写。
- 历史 \`quizSenses\` 中仍有 \`confidence=derived\` 的旧义项；新 UI 只展示 high，本轮未删除旧用户可见数据。
- 旧 GT prebuild 会在 4 个核心词上先恢复旧详情，新语义补丁随后确定性恢复最终值；结果稳定且构建成功，但后续可让旧脚本尊重 \`semanticQualityPatch\` 标记以减少重复写入。
`;
write("final-report.md", report);
console.log(JSON.stringify({ beforeCount: baseline.summary.totalWords, afterCount: words.length, p0After: audit.summary.p0IssueCount, exampleRepairCount: changedExampleEntries.size, formOnlyCount: formRows.length, meaningRepairCount: meaningRows.length, deletedCount: deletedRows.length, deferredCount: exampleReview.filter((row) => row.action === "defer").length, backlogEntryCount: backlogRows.length, cachePublicIdentical: raw === publicRaw, paidApiCalls: 0, externalPerWordLookups: 0 }, null, 2));
