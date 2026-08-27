import type {
  GradingResult,
  Question,
  ReviewStatus,
  RiskLevel,
} from '../domain/models';
import { checkGradingConsistency } from './consistency';

export interface RuntimeDecision {
  riskLevel: RiskLevel;
  reviewRequired: boolean;
  reviewStatus: ReviewStatus;
}

export function classifyRuntimeRisk(
  question: Question,
  _studentAnswer: string,
  result: GradingResult,
): RiskLevel {
  if (question.questionType === 'word_problem') {
    return 'HIGH';
  }

  if (result.judgment === 'partial_correct') {
    return 'HIGH';
  }

  if (!checkGradingConsistency(result).pass) {
    return 'HIGH';
  }

  if (question.questionType === 'fill_blank') {
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
