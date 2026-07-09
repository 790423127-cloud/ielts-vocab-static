export function createDiagnosticPayload(question, selectedOption, result) {
  if (!question) return null;
  return {
    mode: "meaning-en",
    target: {
      targetWordId: question.targetWordId,
      targetHeadword: question.targetHeadword,
      targetSenseKey: question.targetSenseKey,
      chinesePromptZh: question.chinesePromptZh,
      canonicalAnswer: question.canonicalAnswer,
      posFamily: question.posFamily
    },
    options: question.options.map((option, index) => ({
      index,
      isCorrect: option.isCorrect,
      sourceWordId: option.sourceWordId,
      headword: option.headword,
      posFamily: option.posFamily,
      senseKey: option.senseKey,
      quizMeaningZh: option.quizMeaningZh,
      relationType: option.relationType,
      notAnswerReasonZh: option.notAnswerReasonZh,
      learnerDistinctionZh: option.learnerDistinctionZh,
      relationEvidence: option.relationEvidence,
      qualityClass: option.qualityClass,
      qualityTier: option.qualityTier
    })),
    selected: selectedOption
      ? {
          sourceWordId: selectedOption.sourceWordId,
          headword: selectedOption.headword,
          senseKey: selectedOption.senseKey,
          isCorrect: selectedOption.isCorrect
        }
      : null,
    result: result
      ? {
          correct: result.correct,
          confusedWithWordId: result.confusedWithWordId,
          confusedWithSenseKey: result.confusedWithSenseKey,
          reviewStage: result.reviewStage
        }
      : null,
    optionHash: question.optionHash,
    correctOptionIndex: question.correctOptionIndex,
    combinationHash: question.combinationHash,
    combinationScore: question.combinationScore,
    combinationStrategy: question.combinationStrategy,
    audit: question.questionAuditSnapshot
  };
}
