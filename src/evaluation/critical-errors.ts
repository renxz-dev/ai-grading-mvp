import type {
  EvaluationResult,
  GoldenCase,
  GradingResult,
} from '../domain/models';
import { evaluateFeedback } from './feedback-evaluator';

export function detectCriticalError(
  goldenCase: GoldenCase,
  actual: GradingResult,
  partial: Omit<EvaluationResult, 'criticalError' | 'finalResult'>,
): { critical: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const feedback = evaluateFeedback(
    actual.feedback,
    goldenCase.standardAnswer,
    goldenCase.feedbackRequirements,
  );

  if (
    goldenCase.expected.judgment === 'correct' &&
    actual.judgment !== 'correct'
  ) {
    reasons.push('Correct answer was judged incorrectly');
  }

  if (
    goldenCase.expected.judgment !== 'correct' &&
    actual.judgment === 'correct'
  ) {
    reasons.push('Incorrect or incomplete answer was judged correct');
  }

  if (actual.judgment === 'correct' && actual.score <= 0) {
    reasons.push('Correct judgment conflicts with zero score');
  }

  if (
    goldenCase.expected.riskLevel === 'HIGH' &&
    actual.reviewRequired === false
  ) {
    reasons.push('HIGH risk result bypassed human review');
  }

  if (
    goldenCase.questionType === 'word_problem' &&
    goldenCase.expected.riskLevel === 'HIGH' &&
    goldenCase.expected.judgment !== 'correct' &&
    actual.judgment === 'correct' &&
    actual.score === goldenCase.maxScore
  ) {
    reasons.push('High-risk word problem was severely misjudged');
  }

  if (feedback.unsafeTone) {
    reasons.push('Unsafe feedback tone');
  }

  if (!feedback.answerLeakagePass) {
    reasons.push('Feedback leaked the answer');
  }

  if (partial.consistencyPass && reasons.length === 0) {
    return { critical: false, reasons: [] };
  }

  return { critical: reasons.length > 0, reasons };
}
