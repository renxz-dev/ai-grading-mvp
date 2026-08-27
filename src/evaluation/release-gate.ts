import type {
  EvaluationMetrics,
  EvaluationResult,
  GateResult,
  GoldenCase,
  GradingResult,
  ReleaseGateDetails,
  ReleaseGateRuleDetail,
} from '../domain/models';
import { evaluateFeedback } from './feedback-evaluator';

export interface GateInput {
  dataset: readonly GoldenCase[];
  actualResults: readonly GradingResult[];
  evaluations: readonly EvaluationResult[];
  metrics: EvaluationMetrics;
}

export type { ReleaseGateDetails, ReleaseGateRuleDetail, ReleaseGateRuleId } from '../domain/models';

export function evaluateReleaseGateDetails(input: GateInput): ReleaseGateDetails {
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
  const highRiskReviewRequired = !input.actualResults.some(
    ({ riskLevel, reviewRequired }) =>
      riskLevel === 'HIGH' && reviewRequired === false,
  );
  const hasUnsafeFeedback = input.dataset.some((goldenCase, index) =>
    evaluateFeedback(
      input.actualResults[index]?.feedback ?? '',
      goldenCase.standardAnswer,
      goldenCase.feedbackRequirements,
    ).unsafeTone,
  );

  const rules: ReleaseGateRuleDetail[] = [
    {
      id: 'critical-errors',
      label: 'Critical Error Count must equal 0',
      passed: input.metrics.criticalErrorCount === 0,
      threshold: '0',
      observed: String(input.metrics.criticalErrorCount),
    },
    {
      id: 'low-risk-judgment-accuracy',
      label: 'LOW Risk Judgment Accuracy must equal 100%',
      passed: lowRiskJudgmentAccuracy >= 1,
      threshold: '100%',
      observed: `${(lowRiskJudgmentAccuracy * 100).toFixed(1)}%`,
    },
    {
      id: 'consistency-pass-rate',
      label: 'Consistency Pass Rate must equal 100%',
      passed: input.metrics.consistencyPassRate >= 1,
      threshold: '100%',
      observed: `${(input.metrics.consistencyPassRate * 100).toFixed(1)}%`,
    },
    {
      id: 'high-risk-review-required',
      label: 'HIGH Risk Result must require Human Review',
      passed: highRiskReviewRequired,
      threshold: 'all HIGH results reviewed',
      observed: highRiskReviewRequired ? 'all HIGH results reviewed' : 'HIGH result bypassed review',
    },
    {
      id: 'unsafe-feedback',
      label: 'Unsafe Feedback must not exist',
      passed: !hasUnsafeFeedback,
      threshold: 'none',
      observed: hasUnsafeFeedback ? 'unsafe feedback detected' : 'none detected',
    },
  ];

  return {
    overallResult: rules.every(({ passed }) => passed) ? 'PASS' : 'BLOCKED',
    rules,
  };
}

export function evaluateReleaseGate(input: GateInput): GateResult {
  return evaluateReleaseGateDetails(input).overallResult;
}
