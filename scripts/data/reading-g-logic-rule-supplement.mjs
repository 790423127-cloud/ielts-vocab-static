export const LOGIC_RULE_VERSION = "reading-g-logic-rule-supplement-v1";

export const LOGIC_RULE_CATEGORIES = Object.freeze([
  {
    id: "degree-quantity-scope",
    label: "程度、数量、比例与范围",
    description: "限定结论成立的程度、数量、比例或覆盖范围。"
  },
  {
    id: "modality-certainty",
    label: "义务、许可、禁止与确定性",
    description: "改变行为是否必须、允许、禁止，以及结论的确定程度。"
  },
  {
    id: "set-correlation",
    label: "集合范围与成对结构",
    description: "标记全称、部分、空集、两者并列或二选一关系。"
  },
  {
    id: "definition-composition",
    label: "定义、指代与组成",
    description: "建立名称、定义、所指对象或整体与组成部分之间的关系。"
  },
  {
    id: "feasibility-time-boundary",
    label: "可行条件、适用条件与时间边界",
    description: "限定行为只在可行、适当或指定时间范围内成立。"
  },
  {
    id: "hypothesis-topic-emphasis",
    label: "假设比较、话题转换与强调",
    description: "标记假设相似、切换讨论对象、目的或最重要信息。"
  }
]);

export const LOGIC_RULE_GATES = Object.freeze([
  "表达必须在真题题干、答案句或已审核的剑雅文章语料中真实出现。",
  "删除或替换表达后，必须会改变条件、范围、数量、程度、时间、真假、确定性或句间关系。",
  "表达必须能作为稳定学习单位；普通主题搭配、偶然词串和已有上位逻辑词的具体实例不重复建卡。"
]);

export const LOGIC_EXISTING_PHRASES = Object.freeze([
  { word: "a number of", category: "degree-quantity-scope", evidenceTerms: ["a number of"] },
  { word: "the majority of", category: "degree-quantity-scope", evidenceTerms: ["the majority of"] },
  { word: "as much as", category: "degree-quantity-scope", evidenceTerms: ["as much as"] },
  { word: "be required to", category: "modality-certainty", evidenceTerms: ["required to"] },
  { word: "be allowed to", category: "modality-certainty", evidenceTerms: ["allowed to"] },
  { word: "be likely to", category: "modality-certainty", evidenceTerms: ["likely to"] },
  { word: "not allowed", category: "modality-certainty", evidenceTerms: ["not allowed"] },
  { word: "not necessarily", category: "modality-certainty", evidenceTerms: ["not necessarily"] },
  {
    word: "either or",
    category: "set-correlation",
    evidencePatterns: ["\\beither\\b[^.!?;\\n]{0,100}\\bor\\b"],
    acceptedAnswers: ["either...or", "either ... or"]
  },
  {
    word: "neither nor",
    category: "set-correlation",
    evidencePatterns: ["\\bneither\\b[^.!?;\\n]{0,100}\\bnor\\b"],
    acceptedAnswers: ["neither...nor", "neither ... nor"]
  },
  { word: "known as", category: "definition-composition", evidenceTerms: ["known as"] },
  { word: "refer to", category: "definition-composition", evidenceTerms: ["refer to", "refers to"] },
  {
    word: "consist of",
    category: "definition-composition",
    evidenceTerms: ["consist of", "consists of", "consisting of"],
    acceptedAnswers: ["consists of", "consisting of"]
  },
  { word: "wherever possible", category: "feasibility-time-boundary", evidenceTerms: ["wherever possible"] },
  { word: "whenever possible", category: "feasibility-time-boundary", evidenceTerms: ["whenever possible"] },
  { word: "in advance", category: "feasibility-time-boundary", evidenceTerms: ["in advance"] },
  { word: "at all times", category: "feasibility-time-boundary", evidenceTerms: ["at all times"] },
  { word: "on a regular basis", category: "feasibility-time-boundary", evidenceTerms: ["on a regular basis"] },
  { word: "on a daily basis", category: "feasibility-time-boundary", evidenceTerms: ["on a daily basis"] },
  { word: "as though", category: "hypothesis-topic-emphasis", evidenceTerms: ["as though"] },
  { word: "as for", category: "hypothesis-topic-emphasis", evidenceTerms: ["as for"] },
  { word: "for the sake of", category: "hypothesis-topic-emphasis", evidenceTerms: ["for the sake of"] }
]);

export const LOGIC_NEW_PHRASES = Object.freeze([
  {
    word: "a range of",
    category: "degree-quantity-scope",
    primaryMeaningZh: "一系列；多种",
    definition: "several different things of the same general type",
    meaningDetailZh: "表示同一大类中包含多个不同项目，用来扩大对象范围。它说明的是种类或覆盖面，不等于每一项都成立。",
    example: "The centre offers a range of courses for adult learners.",
    exampleCn: "该中心为成人学习者提供一系列课程。",
    evidenceTerms: ["a range of"]
  },
  {
    word: "a degree of",
    category: "degree-quantity-scope",
    primaryMeaningZh: "某种程度的；一定程度的",
    definition: "a limited or unspecified amount of a quality",
    meaningDetailZh: "把后接性质限制为某种或一定程度，而不是完全、绝对成立。判断题中忽略它，容易把有限结论误读成全称结论。",
    example: "Participants must accept a degree of responsibility for their own safety.",
    exampleCn: "参与者必须为自身安全承担一定程度的责任。",
    evidenceTerms: ["a degree of"]
  },
  {
    word: "to some extent",
    category: "degree-quantity-scope",
    primaryMeaningZh: "在某种程度上",
    definition: "partly, but not completely",
    meaningDetailZh: "表示陈述只在部分范围内成立，不代表完全正确。它常用于弱化结论，是判断题中区分部分成立与完全成立的重要边界。",
    example: "The new system improved ventilation to some extent.",
    exampleCn: "新系统在一定程度上改善了通风。",
    evidenceTerms: ["to some extent"]
  },
  {
    word: "as many as",
    category: "degree-quantity-scope",
    primaryMeaningZh: "多达",
    definition: "used to emphasize that a number is surprisingly large",
    meaningDetailZh: "强调实际或可能数量达到后接数字，通常带有数量较大的语气。它给出的是上达数量，不能自动理解为每次都达到该数值。",
    example: "As many as five applicants may be invited to interview.",
    exampleCn: "可能会有多达五名申请者获邀参加面试。",
    evidenceTerms: ["as many as"]
  },
  {
    word: "have to",
    category: "modality-certainty",
    primaryMeaningZh: "必须；不得不",
    definition: "to be required or obliged to do something",
    meaningDetailZh: "表示由规则、情况或外部要求产生的义务，后接动词原形。它的强制程度高于一般建议，阅读时不能弱化成 should。",
    example: "Visitors have to show identification at reception.",
    exampleCn: "访客必须在接待处出示身份证明。",
    evidenceTerms: ["have to"]
  },
  {
    word: "not permitted",
    category: "modality-certainty",
    primaryMeaningZh: "不被允许；禁止",
    definition: "not allowed by a rule or authority",
    meaningDetailZh: "表示规则或管理方明确不允许某行为或对象，后面可接 to do、介词短语或地点范围。它是禁止，不只是“不建议”。",
    example: "Heavy vehicles are not permitted at the site.",
    exampleCn: "该场地禁止重型车辆进入。",
    evidenceTerms: ["not permitted"],
    acceptedAnswers: ["not permitted to"]
  },
  {
    word: "be thought to",
    category: "modality-certainty",
    primaryMeaningZh: "被认为；据认为",
    definition: "used to report a belief that is not stated as certain fact",
    meaningDetailZh: "用于转述普遍看法或推断，后接动词原形或完成式。它保留不确定性，不能改写为已经证实的事实。",
    example: "The objects are thought to have been used for keeping records.",
    exampleCn: "这些物品被认为曾用于记录信息。",
    evidenceTerms: ["is thought to", "are thought to", "was thought to", "were thought to", "be thought to", "been thought to"]
  },
  {
    word: "both...and",
    category: "set-correlation",
    primaryMeaningZh: "既……又……；两者都",
    definition: "used to include two people, things, qualities, or actions",
    meaningDetailZh: "把两个对象同时纳入结论，表示两项都成立。判断题中若题目只保留其中一项，不能据此推断另一项也被排除。",
    example: "The course develops both practical skills and theoretical knowledge.",
    exampleCn: "这门课程既培养实践技能，也教授理论知识。",
    evidencePatterns: ["\\bboth\\b[^.!?;\\n]{0,100}\\band\\b"],
    acceptedAnswers: ["both ... and", "both and"]
  },
  {
    word: "all of",
    category: "set-correlation",
    primaryMeaningZh: "全部；所有",
    definition: "the whole number or amount of a specified group",
    meaningDetailZh: "表示后接集合中的成员或数量全部被纳入，是强全称范围。只要原文存在例外，就不能把部分或多数改写为 all of。",
    example: "All of the documents must be submitted before Friday.",
    exampleCn: "所有文件都必须在星期五之前提交。",
    evidenceTerms: ["all of"]
  },
  {
    word: "some of",
    category: "set-correlation",
    primaryMeaningZh: "其中一些；部分",
    definition: "an unspecified part of a particular group or amount",
    meaningDetailZh: "只把集合中的一部分纳入结论，不说明其余成员是否成立。阅读时不能把 some of 扩大成 most of 或 all of。",
    example: "Some of the workshops are available online.",
    exampleCn: "其中一些工作坊可以在线参加。",
    evidenceTerms: ["some of"]
  },
  {
    word: "none of",
    category: "set-correlation",
    primaryMeaningZh: "没有一个；全都不",
    definition: "not one or not any of a specified group",
    meaningDetailZh: "表示指定集合中没有成员满足后述条件，是否定全称范围。它比 not all 更强，后者只表示并非全部。",
    example: "None of the applicants met every requirement.",
    exampleCn: "申请者中没有一人满足全部要求。",
    evidenceTerms: ["none of"]
  },
  {
    word: "be referred to as",
    category: "definition-composition",
    primaryMeaningZh: "被称为；被叫作",
    definition: "to be named or described using a particular term",
    meaningDetailZh: "把对象与后接名称或术语建立同一指称关系，常用于解释专业名称。它表示命名，不一定说明该对象的完整定义。",
    example: "This meeting is often referred to as a toolbox talk.",
    exampleCn: "这种会议通常被称为工具箱会议。",
    evidenceTerms: ["is referred to as", "are referred to as", "was referred to as", "were referred to as", "be referred to as", "referred to as"]
  },
  {
    word: "be defined as",
    category: "definition-composition",
    primaryMeaningZh: "被定义为",
    definition: "to be given a precise meaning or scope",
    meaningDetailZh: "明确规定术语、类别或资格的含义和范围，后项是当前语境采用的定义。阅读时应按该定义判断，不能随意套用日常含义。",
    example: "Life writing is defined as non-fiction based on personal experience.",
    exampleCn: "人生写作被定义为以个人经历为基础的非虚构作品。",
    evidenceTerms: ["is defined as", "are defined as", "was defined as", "were defined as", "be defined as", "defined as"]
  },
  {
    word: "be made up of",
    category: "definition-composition",
    primaryMeaningZh: "由……组成",
    definition: "to consist of particular parts or members",
    meaningDetailZh: "说明整体由后接的部分或成员构成，建立整体与组成项之间的关系。它不表示这些部分在数量或重要性上完全相同。",
    example: "The judging panel is made up of three experienced writers.",
    exampleCn: "评审小组由三位经验丰富的作家组成。",
    evidenceTerms: ["is made up of", "are made up of", "was made up of", "were made up of", "be made up of", "made up of"]
  },
  {
    word: "when appropriate",
    category: "feasibility-time-boundary",
    primaryMeaningZh: "适当时；在合适的情况下",
    definition: "when it is suitable for the situation",
    meaningDetailZh: "把行为限制在符合情境、时机或专业判断的情况下，不要求每次都执行。它比固定时间频率更依赖具体条件。",
    example: "Managers should set new goals when appropriate.",
    exampleCn: "管理者应在适当时设定新目标。",
    evidenceTerms: ["when appropriate"]
  },
  {
    word: "as if",
    category: "hypothesis-topic-emphasis",
    primaryMeaningZh: "仿佛；好像",
    definition: "in a way that suggests an appearance or hypothetical comparison",
    meaningDetailZh: "引出基于表象或假设的比较，后接从句。它通常不保证后项是真实事实，判断题中不能把比喻或推测当成已证实结论。",
    example: "It looked as if the door had never been opened.",
    exampleCn: "看起来仿佛那扇门从未被打开过。",
    evidenceTerms: ["as if"]
  },
  {
    word: "above all",
    category: "hypothesis-topic-emphasis",
    primaryMeaningZh: "最重要的是；尤其",
    definition: "more importantly than anything else",
    meaningDetailZh: "从多个事实或理由中突出最重要的一项，表示重要性排序。它不是空间意义上的“在上方”，也不表示时间先后。",
    example: "Above all, applicants must provide accurate information.",
    exampleCn: "最重要的是，申请者必须提供准确信息。",
    evidenceTerms: ["above all"]
  },
  {
    word: "similar to",
    category: "hypothesis-topic-emphasis",
    primaryMeaningZh: "与……相似",
    definition: "resembling something without being exactly the same",
    meaningDetailZh: "建立相似关系，但不表示两个对象完全相同。判断题中 similar to 不能直接改写为 identical to 或 the same as。",
    example: "The new process is similar to the method used previously.",
    exampleCn: "新流程与以前使用的方法相似。",
    evidenceTerms: ["similar to"]
  }
]);

export const LOGIC_RULE_EXCLUSIONS = Object.freeze([
  {
    word: "subject to availability",
    reason: "上位逻辑表达 subject to 已在 logic120；具体搭配保留在高频短语层作为实例，不重复建逻辑卡。"
  },
  {
    word: "not only",
    reason: "完整结构 not only but also 已在 logic120；不把不完整前半段重复建卡。"
  },
  {
    word: "make sure / find out / responsible for",
    reason: "属于普通高频搭配，本身不稳定承担句间逻辑或答案边界功能。"
  },
  {
    word: "following / regarding / must / may / should",
    reason: "本轮按用户要求先补词组；这些单词存在多义或句法差异，保留到词义级人工审核。"
  }
]);
