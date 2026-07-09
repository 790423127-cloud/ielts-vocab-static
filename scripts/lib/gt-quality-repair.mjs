import { VALID_DIFFICULTIES } from "../core-vocab-quality-audit.mjs";
import { resolvePronunciation } from "./gt-ipa.mjs";

const DIFFICULTY_MAP = new Map([
  ["低级认识即可", "低频认识即可"],
  ["低级高频", "基础高频"]
]);

const TEMPLATE_MEANING = /^IELTS G类实用词\s*[：:]\s*/i;

export async function repairExistingWords(words, ledger, manualReview) {
  const stats = {
    invalidDifficultyFixed: 0,
    ipaFilled: 0,
    templateMeaningFixed: 0,
    posExampleConflictFixed: 0,
    manualReviewCount: 0
  };

  for (let i = 0; i < words.length; i += 1) {
    const entry = words[i];
    const id = String(entry.id || entry.wordId || "");
    const word = String(entry.word || "");

    if (DIFFICULTY_MAP.has(entry.difficulty)) {
      const oldValue = entry.difficulty;
      const newValue = DIFFICULTY_MAP.get(oldValue);
      entry.difficulty = newValue;
      stats.invalidDifficultyFixed += 1;
      ledger.push({
        id, word, modifiedField: "difficulty", oldValue, newValue,
        repairType: "invalid_difficulty_mapping",
        evidence: "VALID_DIFFICULTIES mapping in core-vocab-quality-audit.mjs",
        evidenceDate: new Date().toISOString().slice(0, 10),
        sourceTier: "internal-rule",
        riskLevel: "low",
        reason: "非法 difficulty 标签映射到合法标签",
        rollbackAvailable: true,
        testReference: "core-vocab-quality-audit"
      });
    } else if (!VALID_DIFFICULTIES.has(entry.difficulty)) {
      manualReview.push({
        id, word, issue: "invalid_difficulty_unmapped",
        currentDifficulty: entry.difficulty,
        reason: "无明确映射，保留原值"
      });
      stats.manualReviewCount += 1;
    }

    if (TEMPLATE_MEANING.test(String(entry.meaning || ""))) {
      const oldValue = entry.meaning;
      const newValue = String(entry.definition || entry.meaning || "").trim().slice(0, 40) || `${word} 的实用含义`;
      entry.meaning = newValue.includes("；") ? newValue : `${newValue}`;
      stats.templateMeaningFixed += 1;
      ledger.push({
        id, word, modifiedField: "meaning", oldValue, newValue: entry.meaning,
        repairType: "template_meaning_cleanup",
        evidence: "TEMPLATE_MEANING regex match",
        evidenceDate: new Date().toISOString().slice(0, 10),
        sourceTier: "internal-editorial",
        riskLevel: "medium",
        reason: "移除模板占位释义",
        rollbackAvailable: true,
        testReference: "vocab-quality-repair-v5"
      });
    }

    if (!String(entry.phonetic || "").trim()) {
      const resolved = await resolvePronunciation(word, words);
      if (resolved?.phonetic) {
        const oldValue = entry.phonetic || "";
        entry.phonetic = resolved.phonetic;
        entry.pronunciationSourceTier = resolved.pronunciationSourceTier;
        entry.pronunciationVariant = resolved.pronunciationVariant;
        stats.ipaFilled += 1;
        ledger.push({
          id, word, modifiedField: "phonetic", oldValue, newValue: entry.phonetic,
          repairType: "missing_ipa_fill",
          evidence: resolved.pronunciationTool,
          evidenceDate: new Date().toISOString().slice(0, 10),
          sourceTier: resolved.pronunciationSourceTier,
          riskLevel: "low",
          reason: `补齐 IPA (${resolved.pronunciationVariant})`,
          rollbackAvailable: true,
          testReference: "gt-ipa.mjs"
        });
      } else {
        manualReview.push({ id, word, issue: "missing_ipa_unresolved", reason: "Tier A-D 均无法确认" });
        stats.manualReviewCount += 1;
      }
    }

    const pos = String(entry.pos || "").toLowerCase();
    const example = String(entry.example || "").toLowerCase();
    if (pos.includes("verb") && /\b(is|are|was|were)\s+\w+ing\b/.test(example) && !example.includes(word.toLowerCase())) {
      manualReview.push({ id, word, issue: "pos_example_possible_mismatch", pos, example: entry.example });
      stats.manualReviewCount += 1;
    }
  }

  return stats;
}