// sense-pair-contrast.mjs — Near-synonym contrast catalog for Meaning Mode.
// Array-based index supports multiple pairs per senseId.

export const SENSE_PAIR_CONTRAST = Object.freeze([
  // ── importance / dominance ──
  { pairId: "prime-dominant", senseA: { wordId: "prime", senseId: "prime-adj-primary", coreZh: "首要的；最重要的" }, senseB: { wordId: "dominant", senseId: "dominant-adj-controlling", coreZh: "占主导地位的；支配性的" }, contrastDimension: "importance-rank vs power-influence", learnerDistinctionZh: "prime 强调排第一、最重要；dominant 强调力量最强、最有控制力。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "prime-primary", senseA: { wordId: "prime", senseId: "prime-adj-primary", coreZh: "首要的；最重要的" }, senseB: { wordId: "primary", senseId: "primary-adj-main", coreZh: "主要的；基本的" }, contrastDimension: "supreme-rank vs foundational", learnerDistinctionZh: "prime 强调最高级别；primary 强调基础性和首要性。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "dominant-primary", senseA: { wordId: "dominant", senseId: "dominant-adj-controlling", coreZh: "占主导地位的；支配性的" }, senseB: { wordId: "primary", senseId: "primary-adj-main", coreZh: "主要的；基本的" }, contrastDimension: "power-control vs foundational", learnerDistinctionZh: "dominant 强调控制力；primary 强调基础性。", allowInSameQuestion: true, confidence: "high" },
  // ── experience family ──
  { pairId: "experience-expertise", senseA: { wordId: "experience", senseId: "experience-noun-knowledge", coreZh: "经验；亲身经历" }, senseB: { wordId: "expertise", senseId: "expertise-noun-skill", coreZh: "专门知识；专业技能" }, contrastDimension: "general-knowledge vs specialized-skill", learnerDistinctionZh: "experience 强调亲身经历获得的知识；expertise 强调专业领域的深度技能。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "experience-qualification", senseA: { wordId: "experience", senseId: "experience-noun-knowledge", coreZh: "经验；亲身经历" }, senseB: { wordId: "qualification", senseId: "qualification-noun-credential", coreZh: "资格；资历" }, contrastDimension: "lived-knowledge vs formal-credential", learnerDistinctionZh: "experience 是通过实践获得；qualification 是正式考试认证的资格。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "experience-practice", senseA: { wordId: "experience", senseId: "experience-noun-knowledge", coreZh: "经验；亲身经历" }, senseB: { wordId: "practice", senseId: "practice-noun-action", coreZh: "实践；练习" }, contrastDimension: "accumulated-knowledge vs repeated-action", learnerDistinctionZh: "experience 是积累的知识和感受；practice 是反复做的行为和过程。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "expertise-qualification", senseA: { wordId: "expertise", senseId: "expertise-noun-skill", coreZh: "专门知识；专业技能" }, senseB: { wordId: "qualification", senseId: "qualification-noun-credential", coreZh: "资格；资历" }, contrastDimension: "skill-capability vs formal-credential", learnerDistinctionZh: "expertise 是实际能力；qualification 是官方认可的证明。", allowInSameQuestion: true, confidence: "high" },
  // ── impression / perception ──
  { pairId: "impression-perception", senseA: { wordId: "impression", senseId: "impression-noun-idea", coreZh: "印象；感想" }, senseB: { wordId: "perception", senseId: "perception-noun-awareness", coreZh: "感知；看法；理解" }, contrastDimension: "surface-feeling vs deep-awareness", learnerDistinctionZh: "impression 是表面的初步感觉；perception 是深层的理解方式。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "impression-opinion", senseA: { wordId: "impression", senseId: "impression-noun-idea", coreZh: "印象；感想" }, senseB: { wordId: "opinion", senseId: "opinion-noun-view", coreZh: "意见；看法" }, contrastDimension: "feeling-based vs judgment-based", learnerDistinctionZh: "impression 基于感觉；opinion 基于判断和思考。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "attitude-opinion", senseA: { wordId: "attitude", senseId: "attitude-noun-disposition", coreZh: "态度；看法" }, senseB: { wordId: "opinion", senseId: "opinion-noun-view", coreZh: "意见；看法" }, contrastDimension: "disposition vs specific-judgment", learnerDistinctionZh: "attitude 是长期的心态倾向；opinion 是对具体事物的判断。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "attitude-perspective", senseA: { wordId: "attitude", senseId: "attitude-noun-disposition", coreZh: "态度；看法" }, senseB: { wordId: "perspective", senseId: "perspective-noun-viewpoint", coreZh: "视角；观点" }, contrastDimension: "disposition vs viewpoint", learnerDistinctionZh: "attitude 是内在心态；perspective 是看问题的角度。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "perception-perspective", senseA: { wordId: "perception", senseId: "perception-noun-awareness", coreZh: "感知；看法；理解" }, senseB: { wordId: "perspective", senseId: "perspective-noun-viewpoint", coreZh: "视角；观点" }, contrastDimension: "awareness-process vs standpoint", learnerDistinctionZh: "perception 是感知过程；perspective 是看待事物的角度。", allowInSameQuestion: true, confidence: "high" },
  // ── evaluation ──
  { pairId: "evaluation-assessment", senseA: { wordId: "evaluation", senseId: "evaluation-noun-judgment", coreZh: "评价；评估" }, senseB: { wordId: "assessment", senseId: "assessment-noun-judgment", coreZh: "评估；评定" }, contrastDimension: "quality-judgment vs formal-measurement", learnerDistinctionZh: "evaluation 强调对价值或质量的判断；assessment 强调正式的测量评定。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "evaluation-judgment", senseA: { wordId: "evaluation", senseId: "evaluation-noun-judgment", coreZh: "评价；评估" }, senseB: { wordId: "judgment", senseId: "judgment-noun-decision", coreZh: "判断；裁决" }, contrastDimension: "quality-assessment vs decision-ruling", learnerDistinctionZh: "evaluation 是对质量价值的评估；judgment 是做决定下结论。", allowInSameQuestion: true, confidence: "high" },
  // ── approach ──
  { pairId: "approach-method", senseA: { wordId: "approach", senseId: "approach-noun-way", coreZh: "方法；途径" }, senseB: { wordId: "method", senseId: "method-noun-system", coreZh: "方法；系统方式" }, contrastDimension: "general-way vs systematic-procedure", learnerDistinctionZh: "approach 是总体思路；method 是有明确步骤的系统方式。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "approach-strategy", senseA: { wordId: "approach", senseId: "approach-noun-way", coreZh: "方法；途径" }, senseB: { wordId: "strategy", senseId: "strategy-noun-plan", coreZh: "策略；战略" }, contrastDimension: "general-way vs planned-tactic", learnerDistinctionZh: "approach 是做事的一般方式；strategy 是有目的有计划的方法。", allowInSameQuestion: true, confidence: "high" },
  // ── consequence ──
  { pairId: "consequence-result", senseA: { wordId: "consequence", senseId: "consequence-noun-effect", coreZh: "后果；结果" }, senseB: { wordId: "result", senseId: "result-noun-outcome", coreZh: "结果；成果" }, contrastDimension: "negative-implication vs neutral-outcome", learnerDistinctionZh: "consequence 常带负面含义；result 是中性词。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "consequence-outcome", senseA: { wordId: "consequence", senseId: "consequence-noun-effect", coreZh: "后果；结果" }, senseB: { wordId: "outcome", senseId: "outcome-noun-result", coreZh: "结果；结局" }, contrastDimension: "negative-chain vs final-state", learnerDistinctionZh: "consequence 强调因果链中的负面；outcome 强调最终状态。", allowInSameQuestion: true, confidence: "high" },
  // ── assumption ──
  { pairId: "assumption-hypothesis", senseA: { wordId: "assumption", senseId: "assumption-noun-belief", coreZh: "假设；假定" }, senseB: { wordId: "hypothesis", senseId: "hypothesis-noun-theory", coreZh: "假说；假设" }, contrastDimension: "untested-belief vs testable-theory", learnerDistinctionZh: "assumption 是未经检验的日常假设；hypothesis 是可检验的科学假说。", allowInSameQuestion: true, confidence: "high" },
  // ── limited ──
  { pairId: "limited-restricted", senseA: { wordId: "limited", senseId: "limited-adj-bounded", coreZh: "有限的；受限的" }, senseB: { wordId: "restricted", senseId: "restricted-adj-limited", coreZh: "受限制的；受约束的" }, contrastDimension: "inherent-bounds vs imposed-limits", learnerDistinctionZh: "limited 强调本身有限；restricted 强调被外部规则限制。", allowInSameQuestion: true, confidence: "high" },
  // ── aggressive ──
  { pairId: "aggressive-assertive", senseA: { wordId: "aggressive", senseId: "aggressive-adj-forceful", coreZh: "好斗的；侵略性的" }, senseB: { wordId: "assertive", senseId: "assertive-adj-confident", coreZh: "自信的；坚定主张的" }, contrastDimension: "hostile-force vs confident-assertion", learnerDistinctionZh: "aggressive 带有攻击性敌意；assertive 是自信表达。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "aggressive-forceful", senseA: { wordId: "aggressive", senseId: "aggressive-adj-forceful", coreZh: "好斗的；侵略性的" }, senseB: { wordId: "forceful", senseId: "forceful-adj-powerful", coreZh: "强有力的；有说服力的" }, contrastDimension: "hostile vs powerful-persuasive", learnerDistinctionZh: "aggressive 含攻击性；forceful 强调力量说服力。", allowInSameQuestion: true, confidence: "high" },
  // ── drawback ──
  { pairId: "drawback-disadvantage", senseA: { wordId: "drawback", senseId: "drawback-noun-negative", coreZh: "缺点；不利条件" }, senseB: { wordId: "disadvantage", senseId: "disadvantage-noun-drawback", coreZh: "不利条件；劣势" }, contrastDimension: "specific-flaw vs general-inferiority", learnerDistinctionZh: "drawback 是具体方面的不足；disadvantage 是整体不利。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "drawback-weakness", senseA: { wordId: "drawback", senseId: "drawback-noun-negative", coreZh: "缺点；不利条件" }, senseB: { wordId: "weakness", senseId: "weakness-noun-flaw", coreZh: "弱点；缺点" }, contrastDimension: "external-condition vs internal-flaw", learnerDistinctionZh: "drawback 常指外部条件不利；weakness 指内在弱点。", allowInSameQuestion: true, confidence: "high" },
  // ── interpretation ──
  { pairId: "interpretation-explanation", senseA: { wordId: "interpretation", senseId: "interpretation-noun-meaning", coreZh: "解释；诠释" }, senseB: { wordId: "explanation", senseId: "explanation-noun-clarify", coreZh: "解释；说明" }, contrastDimension: "subjective-meaning vs factual-clarification", learnerDistinctionZh: "interpretation 是主观的诠释；explanation 是客观的说明。", allowInSameQuestion: true, confidence: "high" },
  // ── Stage 10: commitment ──
  { pairId: "commitment-obligation", senseA: { wordId: "word_f7866b0e49ec", senseId: "word_f7866b0e49ec-sense-1", coreZh: "承诺；郑重答应做某事" }, senseB: { wordId: "word_95b622c9554e", senseId: "word_95b622c9554e-sense-1", coreZh: "义务；必须履行的责任" }, contrastDimension: "personal-promise vs external-duty", learnerDistinctionZh: "commitment 强调个人主动做出的承诺；obligation 强调外部规则法律要求的义务。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "commitment-responsibility", senseA: { wordId: "word_f7866b0e49ec", senseId: "word_f7866b0e49ec-sense-1", coreZh: "承诺；郑重答应做某事" }, senseB: { wordId: "word_7c325cd983d3", senseId: "word_7c325cd983d3-sense-1", coreZh: "责任；负责" }, contrastDimension: "personal-promise vs expected-accountability", learnerDistinctionZh: "commitment 强调个人主动作出的承诺；responsibility 强调被期望承担的职责。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "obligation-responsibility", senseA: { wordId: "word_95b622c9554e", senseId: "word_95b622c9554e-sense-1", coreZh: "义务；必须履行的责任" }, senseB: { wordId: "word_7c325cd983d3", senseId: "word_7c325cd983d3-sense-1", coreZh: "责任；负责" }, contrastDimension: "formal-legal-duty vs general-accountability", learnerDistinctionZh: "obligation 通常指法律合同规定的义务；responsibility 更广泛。", allowInSameQuestion: true, confidence: "high" },
  // ── Stage 11: more commitment near-synonyms ──
  { pairId: "commitment-promise", senseA: { wordId: "word_f7866b0e49ec", senseId: "word_f7866b0e49ec-sense-1", coreZh: "承诺；郑重答应" }, senseB: { wordId: "word_2f7db9e9f4e0", senseId: "word_2f7db9e9f4e0-sense-1", coreZh: "承诺；许诺" }, contrastDimension: "active-longterm vs verbal-declaration", learnerDistinctionZh: "commitment 强调实际行动和长期投入；promise 侧重于口头的许诺。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "commitment-trust", senseA: { wordId: "word_f7866b0e49ec", senseId: "word_f7866b0e49ec-sense-1", coreZh: "承诺；郑重答应" }, senseB: { wordId: "word_d12c1e4e6266", senseId: "word_d12c1e4e6266-sense-1", coreZh: "信任；信赖" }, contrastDimension: "active-promise vs interpersonal-belief", learnerDistinctionZh: "commitment 是自己作出并履行的承诺；trust 是对他人可靠性的相信。", allowInSameQuestion: true, confidence: "high" },
  { pairId: "commitment-consent", senseA: { wordId: "word_f7866b0e49ec", senseId: "word_f7866b0e49ec-sense-1", coreZh: "承诺；郑重答应" }, senseB: { wordId: "word_558130567ab5", senseId: "word_558130567ab5-sense-1", coreZh: "同意；允许" }, contrastDimension: "self-initiated-promise vs permission-granted", learnerDistinctionZh: "commitment 是自己主动做出的；consent 是对他人提议的同意。", allowInSameQuestion: true, confidence: "high" },
]);

// ── Indexes ──
let _byPairId = null, _bySenseIdA = null, _bySenseIdB = null, _byWordIdA = null, _byWordIdB = null;

function _ensureIndex() {
  if (_byPairId) return;
  _byPairId = new Map(); _bySenseIdA = new Map(); _bySenseIdB = new Map(); _byWordIdA = new Map(); _byWordIdB = new Map();
  for (const entry of SENSE_PAIR_CONTRAST) {
    _byPairId.set(entry.pairId, entry);
    if (!_bySenseIdA.has(entry.senseA.senseId)) _bySenseIdA.set(entry.senseA.senseId, []);
    _bySenseIdA.get(entry.senseA.senseId).push(entry);
    if (!_bySenseIdB.has(entry.senseB.senseId)) _bySenseIdB.set(entry.senseB.senseId, []);
    _bySenseIdB.get(entry.senseB.senseId).push(entry);
    if (!_byWordIdA.has(entry.senseA.wordId)) _byWordIdA.set(entry.senseA.wordId, []);
    _byWordIdA.get(entry.senseA.wordId).push(entry);
    if (!_byWordIdB.has(entry.senseB.wordId)) _byWordIdB.set(entry.senseB.wordId, []);
    _byWordIdB.get(entry.senseB.wordId).push(entry);
  }
}

export function checkSensePairContrast(senseIdA, senseIdB) {
  _ensureIndex();
  for (const entry of (_bySenseIdA.get(senseIdA) || [])) {
    if (entry.senseB.senseId === senseIdB) return { hasContrast: true, entry, direction: "AB", allowInSameQuestion: entry.allowInSameQuestion };
  }
  for (const entry of (_bySenseIdB.get(senseIdA) || [])) {
    if (entry.senseA.senseId === senseIdB) return { hasContrast: true, entry, direction: "BA", allowInSameQuestion: entry.allowInSameQuestion };
  }
  return { hasContrast: false };
}

export function getContrastEntriesForWord(wordId) { _ensureIndex(); return _byWordIdA.get(wordId) || []; }

export function checkWordPairContrast(wordIdA, wordIdB) {
  _ensureIndex();
  for (const entry of (_byWordIdA.get(wordIdA) || [])) { if (entry.senseB.wordId === wordIdB) return { hasContrast: true, entry, direction: "AB" }; }
  for (const entry of (_byWordIdB.get(wordIdA) || [])) { if (entry.senseA.wordId === wordIdB) return { hasContrast: true, entry, direction: "BA" }; }
  return { hasContrast: false };
}

export function getContrastCatalogStats() {
  return { totalPairs: SENSE_PAIR_CONTRAST.length, uniqueSenseAWords: new Set(SENSE_PAIR_CONTRAST.map(e => e.senseA.wordId)).size, uniqueSenseBWords: new Set(SENSE_PAIR_CONTRAST.map(e => e.senseB.wordId)).size, highConfidence: SENSE_PAIR_CONTRAST.filter(e => e.confidence === "high").length };
}
