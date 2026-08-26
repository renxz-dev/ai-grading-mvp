import type {
  GradingResult,
  Question,
  ReviewStatus,
  RiskLevel,
} from '../domain/models';

export interface RuntimeDecision {
  riskLevel: RiskLevel;
  reviewRequired: boolean;
  reviewStatus: ReviewStatus;
}

export function classifyRuntimeRisk(
  question: Question,
  _studentAnswer: string,
  _result: GradingResult,
): RiskLevel {
  if (question.id === 'Q4' || question.questionType === 'word_problem') {
    return 'HIGH';
  }

  if (question.id === 'Q2' || question.questionType === 'fill_blank') {
    return 'MEDIUM';
  }

  return 'LOW';
}

export function createRuntimeDecision(riskLevel: RiskLevel): RuntimeDecision {
  if (riskLevel === 'LOW') {
    return {
      riskLevel,
      reviewRequired: false,
      reviewStatus: 'NOT_REQUIRED',
    };
  }

  return {
    riskLevel,
    reviewRequired: true,
    reviewStatus: 'PENDING',
  };
}

export function canStudentViewFeedback(reviewStatus: ReviewStatus): boolean {
  return reviewStatus !== 'PENDING';
}
