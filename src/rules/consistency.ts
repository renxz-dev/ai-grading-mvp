import type { GradingResult } from '../domain/models';

export interface ConsistencyCheck {
  pass: boolean;
  reasons: string[];
}

export function checkGradingConsistency(
  result: GradingResult,
): ConsistencyCheck {
  const reasons: string[] = [];

  if (result.judgment === 'correct' && result.score <= 0) {
    reasons.push('Correct judgment must have a positive score');
  }

  if (result.judgment === 'correct' && result.errorType !== 'none') {
    reasons.push('Correct judgment must have errorType none');
  }

  if (result.judgment === 'incorrect' && result.score > 0) {
    reasons.push('Incorrect judgment cannot have a positive score');
  }

  if (result.riskLevel === 'HIGH' && !result.reviewRequired) {
    reasons.push('HIGH risk must require review');
  }

  return { pass: reasons.length === 0, reasons };
}
