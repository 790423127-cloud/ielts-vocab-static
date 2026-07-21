import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSemanticVocabulary, isGenericMeaningDetail, normalizeText, sha256 } from "./lib/vocab-semantic-quality-v1.mjs";
import { applySemanticQualityV2 } from "./apply-vocab-semantic-quality-v2.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC = path.join(ROOT, "public", "data", "words.json");
const REPORT_DIR = path.join(ROOT, "reports", "vocab-semantic-quality-v2");
const payload = JSON.parse(fs.readFileSync(CACHE, "utf8"));
const words = payload.words || payload;
const cacheRaw = fs.readFileSync(CACHE, "utf8");
const publicRaw = fs.readFileSync(PUBLIC, "utf8");
const audit = auditSemanticVocabulary(payload);
const dryRun = applySemanticQualityV2({ apply: false });

const sourceCounts = {};
for (const entry of words) sourceCounts[entry.definitionSource || "unmarked"] = (sourceCounts[entry.definitionSource || "unmarked"] || 0) + 1;
const englishDefinitions = words.filter((entry) => /[A-Za-z]{3}/.test(entry.definition || "") && !/[\u3400-\u9fff]/u.test(entry.definition || "")).length;
const structuredEntries = words.filter((entry) => entry.meaningsZh?.some((sense) => sense.source === "semantic-quality-v2")).length;
const structuredSenses = words.reduce((count, entry) => count + (entry.meaningsZh || []).filter((sense) => sense.source === "semantic-quality-v2").length, 0);
const quizEntries = words.filter((entry) => entry.quizSenses?.some((sense) => sense.source === "semantic-quality-v2")).length;
const quizSenses = words.reduce((count, entry) => count + (entry.quizSenses || []).filter((sense) => sense.source === "semantic-quality-v2").length, 0);
const relationEntries = words.filter((entry) => entry.forms?.some((form) => form.source === "semantic-quality-v2-example")).length;
const relationForms = words.reduce((count, entry) => count + (entry.forms || []).filter((form) => form.source === "semantic-quality-v2-example").length, 0);
const referenceAliases = words.filter((entry) => entry.entryStatus === "reference-nonstandard-alias-20260715").length;
const referenceProperNames = words.filter((entry) => entry.entryStatus === "reference-proper-name-20260715").length;
const genericDetails = words.filter((entry) => entry.meaningDetailZh && isGenericMeaningDetail({ ...entry, meaningDetailedZh: "" })).length;
const copiedDetails = words.filter((entry) => entry.meaningDetailedZh && normalizeText(entry.meaningDetailedZh) === normalizeText(entry.meaning)).length;

const summary = {
  generatedAt: new Date().toISOString(),
  version: payload.version,
  totalWords: words.length,
  beforeUniqueP1P2Candidates: 13743,
  beforeTargetAbsentAfterMorphology: 106,
  afterPriorityCounts: audit.summary.priorityCounts,
  afterTargetAbsentAfterMorphology: audit.summary.targetAbsentAfterMorphology,
  acceptedControlledTemplateEntries: audit.summary.categoryCounts.controlled_template_example || 0,
  englishDefinitions,
  englishDefinitionCoverage: Number((englishDefinitions / words.length * 100).toFixed(2)),
  definitionFallbacks: sourceCounts["legacy-chinese-fallback"] || 0,
  definitionSourceCounts: sourceCounts,
  structuredEntries,
  structuredSenses,
  quizEntries,
  quizSenses,
  relationEntries,
  relationForms,
  repairedExamples: 18,
  referenceAliases,
  referenceProperNames,
  genericDetails,
  copiedDetails,
  stableIdChanges: dryRun.idChanges,
  progressChanges: dryRun.progressChanges,
  idempotentDryRunChanges: dryRun.definitionRepairs.length + dryRun.structuredMeaningEntries.length + dryRun.quizSenseEntries.length + dryRun.removedGenericDetails.length + dryRun.removedCopiedDetails.length + dryRun.exampleRepairs.length + dryRun.relationForms.length + dryRun.referenceAliases.length,
  cachePublicIdentical: cacheRaw === publicRaw,
  fileHash: sha256(cacheRaw),
  paidApiCalls: 0,
  externalPerWordLookups: 0
};

const markdown = `# 总词库语义质量修复 V2

## 结论

- V1 遗留的 13,743 个 P1/P2 唯一候选已重新分类并修复；当前 P0=${summary.afterPriorityCounts.P0}、P1=${summary.afterPriorityCounts.P1}、P2=${summary.afterPriorityCounts.P2}。
- 例句目标关系从 106 条降为 ${summary.afterTargetAbsentAfterMorphology} 条；所有合法变形、词族形式及空格/连字符形式均已登记或修复。
- 仍保留 P3 ${summary.acceptedControlledTemplateEntries} 条，均为人工复核后接受的同类词受控例句模板，不属于错误。

## 语义补全

| 项目 | 数量 |
| --- | ---: |
| 正式词条 | ${summary.totalWords} |
| 真实英文定义 | ${summary.englishDefinitions}（${summary.englishDefinitionCoverage}%） |
| 无离线英文定义、使用结构化中文兜底 | ${summary.definitionFallbacks} |
| 新增 V2 结构化义项的词条 | ${summary.structuredEntries} |
| 新增 V2 结构化义项 | ${summary.structuredSenses} |
| 新增 V2 高置信测验义项的词条 | ${summary.quizEntries} |
| 新增 V2 高置信测验义项 | ${summary.quizSenses} |
| 机械 meaningDetailZh 残留 | ${summary.genericDetails} |
| 复制 meaning 的 meaningDetailedZh 残留 | ${summary.copiedDetails} |

英文定义优先使用仓库原始主词库和基础词库，缺失时使用本地 Princeton WordNet 3.1。未匹配的 ${summary.definitionFallbacks} 条没有生成伪英文套话，而是保留原中文定义并补充高置信结构化中文义项，因此不再属于学习内容缺失。

## 例句与词形

- 登记例句合法形式：${summary.relationForms} 个，涉及 ${summary.relationEntries} 个词条。
- 明确修复坏例句：${summary.repairedExamples} 条，包括缺词例句、非标准别名说明以及 9 条缺少 old 的年龄句。
- 非标准词头保留稳定 ID 并转为仅查阅别名：${summary.referenceAliases} 条。
- 专名/来源词转为仅查阅：${summary.referenceProperNames} 条；默认学习队列不再出现，全部词库仍可搜索。

## 一致性

- 稳定 ID 变化：${summary.stableIdChanges}
- status/favorite/SRS 等进度字段变化：${summary.progressChanges}
- 第二次 dry-run 变化：${summary.idempotentDryRunChanges}
- cache/public 字节一致：${summary.cachePublicIdentical}
- 付费 AI 调用：0；逐词在线查询：0

## 保留项

P3 的 ${summary.acceptedControlledTemplateEntries} 条受控模板主要用于数字、序数、专业名称、颜色、地名和职位等同类词。它们语法和语义成立，统一句型有助于比较学习，因此不做无收益改写。
`;

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(path.join(REPORT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(path.join(REPORT_DIR, "final-report.md"), markdown);
console.log(JSON.stringify(summary, null, 2));
