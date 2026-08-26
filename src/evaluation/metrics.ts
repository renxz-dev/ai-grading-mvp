import type {
  EvaluationMetrics,
  EvaluationResult,
  GoldenCase,
} from '../domain/models';
import type { RuntimeDecision } from '../rules/risk-policy';

function ratio(passed: number, total: number): number {
  return total === 0 ? 1 : passed / total;
}

function countPassing(
  evaluations: readonly EvaluationResult[],
  key:
    | 'judgmentPass'
    | 'scorePass'
    | 'feedbackPass'
    | 'consistencyPass'
    | 'reviewPolicyPass',
): number {
  return evaluations.filter((item) => item[key]).length;
}

export function calculateMetrics(
  dataset: readonly GoldenCase[],
  evaluations: readonly EvaluationResult[],
): EvaluationMetrics {
  const reasonEvaluationIndexes = dataset
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.expected.errorType !== 'none')
    .map(({ index }) => index);
  const reasonPasses = reasonEvaluationIndexes.filter(
    (index) => evaluations[index]?.reasonPass === true,
  ).length;
  const total = dataset.length;

  return {
    judgmentAccuracy: ratio(countPassing(evaluations, 'judgmentPass'), total),
    scoreAccuracy: ratio(countPassing(evaluations, 'scorePass'), total),
    reasonAccuracy: ratio(reasonPasses, reasonEvaluationIndexes.length),
    feedbackPassRate: ratio(countPassing(evaluations, 'feedbackPass'), total),
    consistencyPassRate: ratio(
      countPassing(evaluations, 'consistencyPass'),
      total,
    ),
    reviewPolicyPassRate: ratio(
      countPassing(evaluations, 'reviewPolicyPass'),
      total,
    ),
    casePassRate: ratio(
      evaluations.filter(({ finalResult }) => finalResult === 'PASS').length,
      total,
    ),
    criticalErrorCount: evaluations.filter(({ criticalError }) => criticalError)
      .length,
    reviewRate: ratio(
      dataset.filter(({ expected }) => expected.reviewRequired).length,
      total,
    ),
  };
}

export function calculateRuntimeHumanReviewRate(
  decisions: readonly RuntimeDecision[],
): number {
  return ratio(
    decisions.filter(({ reviewRequired }) => reviewRequired).length,
    decisions.length,
  );
}
