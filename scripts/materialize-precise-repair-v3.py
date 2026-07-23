from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, before: str, after: str) -> None:
    text = read(path)
    if text.count(before) != 1:
        raise RuntimeError(f"Expected one match in {path}, found {text.count(before)}")
    write(path, text.replace(before, after, 1))


# 1. Replace broad substring detection with exact-field diagnostics.
path = "app/lib/vocab/page-word-helpers.mjs"
text = read(path)
pattern = re.compile(
    r'export function isLikelyWrongAiWord\(word\) \{.*?\n\}\n\n\nexport function escapeRegExpText',
    re.S,
)
replacement = r'''export function getLikelyWrongAiWordReasons(word) {
  if (!word?.word) return [];

  const reasons = [];
  const exactPlaceholderRe = /^(?:undefined|null|nan|\?{2,}|example sentence|中文释义|英文释义|meaning here|translation here|待补全|待完善|暂无|无释义|not available)$/i;
  const scalarFields = ["phonetic", "pos", "meaning", "definition", "example", "exampleCn", "difficulty"];

  for (const field of scalarFields) {
    const value = String(word?.[field] ?? "").trim();
    if (value && exactPlaceholderRe.test(value)) reasons.push(`placeholder:${field}`);
  }

  function inspectList(value, field) {
    if (!Array.isArray(value)) return;
    value.forEach((item, index) => {
      const values = item && typeof item === "object" ? Object.values(item) : [item];
      if (values.some((entry) => exactPlaceholderRe.test(String(entry ?? "").trim()))) {
        reasons.push(`placeholder:${field}[${index}]`);
      }
    });
  }

  inspectList(word.collocations, "collocations");
  inspectList(word.phraseCollocations, "phraseCollocations");

  // Only exact malformed relation headwords are suspicious. The former broad
  // substring scan incorrectly flagged normal words containing terms such as
  // “完成” or “null hypothesis”.
  const cleanWord = normalizeWord(word.word);
  if (cleanWord.length >= 5) {
    const chopped = cleanWord.slice(0, -1);
    const relationWords = [
      ...(Array.isArray(word.forms) ? word.forms : []),
      ...(Array.isArray(word.wordFamily) ? word.wordFamily : [])
    ]
      .map((item) => normalizeWord(item?.word || item))
      .filter(Boolean);

    if (relationWords.some((value) => value === chopped || value === `${chopped}s`)) {
      reasons.push("truncated-relation-headword");
    }
  }

  return [...new Set(reasons)];
}

export function isLikelyWrongAiWord(word) {
  return getLikelyWrongAiWordReasons(word).length > 0;
}


export function escapeRegExpText'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise RuntimeError(f"Could not replace isLikelyWrongAiWord in {path}")
write(path, text)

# 2. Keep page statistics aligned with the actual paid structure-repair queue.
replace_once(
    "app/page.jsx",
    'return { total: 0, physical: 0, references: 0, pending: 0, blurry: 0, unfamiliar: 0, familiar: 0, todayReviewed: 0, missing: 0, classifyMissing: 0, repairMissing: 0, enrichmentThin: 0, familyReview: 0, familyPromotion: 0 };',
    'return { total: 0, physical: 0, references: 0, pending: 0, blurry: 0, unfamiliar: 0, familiar: 0, todayReviewed: 0, missing: 0, classifyMissing: 0, repairMissing: 0, headwordRepair: 0, enrichmentThin: 0, familyReview: 0, familyPromotion: 0 };'
)
replace_once(
    "app/page.jsx",
    '    let repairMissing = 0;\n    let enrichmentThin = 0;',
    '    let repairMissing = 0;\n    let headwordRepair = 0;\n    let enrichmentThin = 0;'
)
replace_once(
    "app/page.jsx",
    '''      const quality = getWordQualityEvaluation(word, {
        needsRepair: isLikelyWrongAiWord(word) || hasHeadwordRepair(word.word),
        knownHeadwords
      });''',
    '''      if (hasHeadwordRepair(word.word)) headwordRepair += 1;
      const quality = getWordQualityEvaluation(word, {
        needsRepair: isLikelyWrongAiWord(word),
        knownHeadwords
      });'''
)
replace_once(
    "app/page.jsx",
    'return { total, physical: words.length, references, pending, blurry, unfamiliar, familiar, todayReviewed, missing, classifyMissing, repairMissing, enrichmentThin, familyReview, familyPromotion };',
    'return { total, physical: words.length, references, pending, blurry, unfamiliar, familiar, todayReviewed, missing, classifyMissing, repairMissing, headwordRepair, enrichmentThin, familyReview, familyPromotion };'
)

# 3. Show the separate headword queue in the UI.
replace_once(
    "app/components/VocabAdminToolsPanel.jsx",
    '''                      <div><strong>结构异常：</strong>{qualityStats.repairMissing || 0}</div>
                      <div><strong>仅缺分类：</strong>{qualityStats.classifyMissing || 0}</div>''',
    '''                      <div><strong>结构异常：</strong>{qualityStats.repairMissing || 0}</div>
                      <div><strong>词头待修：</strong>{qualityStats.headwordRepair || 0}（单独处理，不进入结构异常批次）</div>
                      <div><strong>仅缺分类：</strong>{qualityStats.classifyMissing || 0}</div>'''
)
replace_once(
    "app/components/VocabAdminToolsPanel.jsx",
    '默认付费队列只处理必须补全、结构异常和分类缺失。搭配数量不足只算“可选丰富”，不会自动重写整个词库。',
    '默认付费队列只处理必须补全、真实结构异常和分类缺失。词头待修单独显示；搭配数量不足只算“可选丰富”。'
)

# 4. Count a repair as successful only when it actually leaves the queue.
replace_once(
    "app/hooks/useHomeLexiconAdmin.ai.js",
    'import { needsOptionalWordEnrichment } from "../lib/vocab/word-quality-status.mjs";',
    '''import {
  isInvalidAiContent,
  needsOptionalWordEnrichment
} from "../lib/vocab/word-quality-status.mjs";'''
)
replace_once(
    "app/hooks/useHomeLexiconAdmin.ai.js",
    '''            next = applyIdentityUpdate(next, writeTarget, entry, (existing) => ({
              ...entry,
              ieltsUse: normalizeStringArray(entry.ieltsUse || entry.ielts_use),
              topics: normalizeStringArray(entry.topics),
              difficulty: entry.difficulty || existing.difficulty || "",
              collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
              phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations),
              status: existing.status || "",
              aiWriteMode: "precise-structure-repair",
              aiWrongRepairedAt: Date.now()
            }));

            repaired += 1;''',
    '''            next = applyIdentityUpdate(next, writeTarget, entry, (existing) => ({
              ...entry,
              ieltsUse: normalizeStringArray(entry.ieltsUse || entry.ielts_use),
              topics: normalizeStringArray(entry.topics),
              difficulty: entry.difficulty || existing.difficulty || "",
              collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
              phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations),
              status: existing.status || "",
              aiWriteMode: "precise-structure-repair",
              aiWrongRepairedAt: Date.now()
            }));

            const updated = resolveWordWriteTarget(next, writeTarget).word;
            if (isInvalidAiContent(updated) || isLikelyWrongAiWord(updated)) {
              if (!failed.includes(w.word)) failed.push(w.word);
              const reasons = isLikelyWrongAiWord(updated)
                ? "修复后仍命中异常判定"
                : "修复后其他义项结构仍无效";
              failedDetails.push(`${w.word}: ${reasons}`);
            } else {
              repaired += 1;
            }'''
)
replace_once(
    "app/hooks/useHomeLexiconAdmin.ai.js",
    'setToast(`AI稳定修复确定错词完成：处理 ${targets.length} 个，修复 ${repaired} 个，失败 ${failed.length} 个${failedDetails[0] ? "｜失败示例：" + failedDetails.slice(0, 3).join("；") : ""}`);',
    'setToast(`AI精准结构修复完成：尝试 ${targets.length} 个，真正退出异常队列 ${repaired} 个，仍需处理 ${failed.length} 个${failedDetails[0] ? "｜示例：" + failedDetails.slice(0, 3).join("；") : ""}`);'
)

# 5. Add regression tests for the false-positive detector and queue separation.
test_path = ROOT / "app/lib/vocab/__tests__/wrong-ai-word-detection.test.mjs"
test_path.write_text('''import test from "node:test";
import assert from "node:assert/strict";
import {
  getLikelyWrongAiWordReasons,
  isLikelyWrongAiWord
} from "../page-word-helpers.mjs";

function word(overrides = {}) {
  return {
    word: "complete",
    phonetic: "/kəmˈpliːt/",
    pos: "verb",
    meaning: "完成",
    definition: "to finish doing something",
    example: "Please complete the form.",
    exampleCn: "请完成这张表格。",
    collocations: [{ phrase: "complete a task", chinese: "完成任务" }],
    phraseCollocations: [{ phrase: "complete with", chinese: "配有" }],
    forms: [],
    wordFamily: [],
    difficulty: "基础高频",
    ...overrides
  };
}

test("normal Chinese 完成 and null terminology are not structure anomalies", () => {
  assert.equal(isLikelyWrongAiWord(word()), false);
  assert.equal(isLikelyWrongAiWord(word({
    word: "null",
    meaning: "无效的；空值的",
    definition: "having no legal or binding force",
    collocations: [{ phrase: "null hypothesis", chinese: "零假设" }]
  })), false);
});

test("exact placeholders remain repairable anomalies", () => {
  assert.equal(isLikelyWrongAiWord(word({ definition: "undefined" })), true);
  assert.deepEqual(getLikelyWrongAiWordReasons(word({ definition: "undefined" })), ["placeholder:definition"]);
});

test("only exact truncated relation headwords are flagged", () => {
  assert.equal(isLikelyWrongAiWord(word({
    word: "experience",
    forms: [{ word: "experienc", type: "broken" }]
  })), true);
  assert.equal(isLikelyWrongAiWord(word({
    word: "experience",
    forms: [{ word: "experiences", type: "plural" }],
    wordFamily: [{ word: "experienced", relation: "adjective-form" }]
  })), false);
});
''', encoding="utf-8")

# 6. Update local replacement instructions.
instructions = read("REPLACE_PACKAGE_INSTRUCTIONS_CN.md")
instructions = instructions.replace(
    "- “结构异常”改为字段级精准修复。",
    "- “结构异常”改为字段级精准修复，并移除“完成”、`null hypothesis` 等正常内容造成的误报。\n- 词头待修与结构异常彻底分开，页面数字与批量按钮使用同一队列。\n- 只有真正退出异常队列的词才计入修复成功。"
)
write("REPLACE_PACKAGE_INSTRUCTIONS_CN.md", instructions)

# Remove one-time materializer assets from the resulting source commit.
for relative in [
    "scripts/materialize-precise-repair-v3.py",
    ".github/workflows/materialize-precise-repair-v3.yml",
]:
    target = ROOT / relative
    if target.exists():
        target.unlink()
