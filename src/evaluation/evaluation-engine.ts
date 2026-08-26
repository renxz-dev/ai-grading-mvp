import type {
  DatasetEvaluation,
  EvaluationResult,
  GoldenCase,
  GradingResult,
} from '../domain/models';
import type { GradingProvider } from '../providers/grading-provider';
import { checkGradingConsistency } from '../rules/consistency';
import { detectCriticalError } from './critical-errors';
import { evaluateFeedback } from './feedback-evaluator';

export { calculateMetrics } from './metrics';

export function evaluateCase(
  goldenCase: GoldenCase,
  actual: GradingResult,
): EvaluationResult {
  const judgmentPass = actual.judgment === goldenCase.expected.judgment;
  const scorePass = actual.score === goldenCase.expected.score;
  const reasonPass = actual.errorType === goldenCase.expected.errorType;
  const feedbackEvaluation = evaluateFeedback(
    actual.feedback,
    goldenCase.standardAnswer,
    goldenCase.feedbackRequirements,
  );
  const consistency = checkGradingConsistency(actual);
  const riskPass = actual.riskLevel === goldenCase.expected.riskLevel;
  const reviewPolicyPass =
    actual.reviewRequired === goldenCase.expected.reviewRequired;
  const failureReasons: string[] = [];

  if (!judgmentPass) failureReasons.push('Judgment mismatch');
  if (!scorePass) failureReasons.push('Score mismatch');
  if (!reasonPass) failureReasons.push('Reason mismatch');
  if (!feedbackEvaluation.pass) {
    failureReasons.push(...feedbackEvaluation.failureReasons);
  }
  if (!consistency.pass) failureReasons.push(...consistency.reasons);
  if (!riskPass) failureReasons.push('Risk mismatch');
  if (!reviewPolicyPass) failureReasons.push('Review policy mismatch');

  const partial: Omit<EvaluationResult, 'criticalError' | 'finalResult'> = {
    caseId: goldenCase.caseId,
    judgmentPass,
    scorePass,
    reasonPass,
    feedbackPass: feedbackEvaluation.pass,
    consistencyPass: consistency.pass,
    riskPass,
    reviewPolicyPass,
    failureReasons,
  };
  const critical = detectCriticalError(goldenCase, actual, partial);
  const finalResult =
    judgmentPass &&
    scorePass &&
    reasonPass &&
    feedbackEvaluation.pass &&
    consistency.pass &&
    riskPass &&
    reviewPolicyPass
      ? 'PASS'
      : 'FAIL';

  return {
    ...partial,
    criticalError: critical.critical,
    failureReasons: [...failureReasons, ...critical.reasons],
    finalResult,
  };
}

export async function evaluateDataset(
  dataset: readonly GoldenCase[],
  provider: GradingProvider,
): Promise<DatasetEvaluation> {
  const actualResults = await Promise.all(
    dataset.map((goldenCase) =>
      provider.grade({
        caseId: goldenCase.caseId,
        question: {
          id: goldenCase.caseId,
          questionType: goldenCase.questionType,
          prompt: goldenCase.question,
          options: goldenCase.options,
          standardAnswer: goldenCase.standardAnswer,
          maxScore: goldenCase.maxScore,
        },
        studentAnswer: goldenCase.studentAnswer,
      }),
    ),
  );

  return {
    actualResults,
    evaluations: dataset.map((goldenCase, index) =>
      evaluateCase(goldenCase, actualResults[index]),
    ),
  };
}
