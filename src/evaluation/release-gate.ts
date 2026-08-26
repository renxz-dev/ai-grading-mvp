import type {
  EvaluationMetrics,
  EvaluationResult,
  GateResult,
  GoldenCase,
  GradingResult,
} from '../domain/models';
import { evaluateFeedback } from './feedback-evaluator';

export interface GateInput {
  dataset: readonly GoldenCase[];
  actualResults: readonly GradingResult[];
  evaluations: readonly EvaluationResult[];
  metrics: EvaluationMetrics;
}

export function evaluateReleaseGate(input: GateInput): GateResult {
  if (input.metrics.criticalErrorCount > 0) return 'BLOCKED';

  const expectedLowIndexes = input.dataset
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.expected.riskLevel === 'LOW')
    .map(({ index }) => index);
  const lowRiskJudgmentAccuracy =
    expectedLowIndexes.length === 0
      ? 1
      : expectedLowIndexes.filter(
          (index) => input.evaluations[index]?.judgmentPass === true,
        ).length / expectedLowIndexes.length;

  if (lowRiskJudgmentAccuracy < 1) return 'BLOCKED';
  if (input.metrics.consistencyPassRate < 1) return 'BLOCKED';
  if (
    input.actualResults.some(
      ({ riskLevel, reviewRequired }) =>
        riskLevel === 'HIGH' && reviewRequired === false,
    )
  ) {
    return 'BLOCKED';
  }

  const hasUnsafeFeedback = input.dataset.some((goldenCase, index) =>
    evaluateFeedback(
      input.actualResults[index]?.feedback ?? '',
      goldenCase.standardAnswer,
      goldenCase.feedbackRequirements,
    ).unsafeTone,
  );

  return hasUnsafeFeedback ? 'BLOCKED' : 'PASS';
}
