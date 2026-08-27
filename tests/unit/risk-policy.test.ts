import { describe, expect, it } from 'vitest';
import { demoAssignment } from '../../src/data/demo-assignment';
import type { GradingResult } from '../../src/domain/models';
import {
  canStudentViewFeedback,
  classifyRuntimeRisk,
  createRuntimeDecision,
} from '../../src/rules/risk-policy';

const untrustedProviderResult: GradingResult = {
  judgment: 'correct',
  score: 5,
  errorType: 'none',
  feedback: 'Provider result',
  riskLevel: 'LOW',
  reviewRequired: false,
};

describe('runtime risk policy', () => {
  it.each([
    ['Q1', 'B', 'LOW', false, 'NOT_REQUIRED'],
    ['Q2', '1/2', 'MEDIUM', true, 'PENDING'],
    ['Q3', '54', 'LOW', false, 'NOT_REQUIRED'],
    [
      'Q4',
      '8 × 3 = 24\n答：一共需要 24 元。',
      'HIGH',
      true,
      'PENDING',
    ],
  ] as const)(
    'maps %s without trusting provider reviewRequired',
    (questionId, answer, riskLevel, reviewRequired, reviewStatus) => {
      const question = demoAssignment.questions.find(
        ({ id }) => id === questionId,
      )!;
      const classified = classifyRuntimeRisk(
        question,
        answer,
        untrustedProviderResult,
      );

      expect(classified).toBe(riskLevel);
      expect(createRuntimeDecision(classified)).toEqual({
        riskLevel,
        reviewRequired,
        reviewStatus,
      });
    },
  );

  it('keeps pending feedback hidden and reviewed feedback visible', () => {
    expect(canStudentViewFeedback('NOT_REQUIRED')).toBe(true);
    expect(canStudentViewFeedback('PENDING')).toBe(false);
    expect(canStudentViewFeedback('APPROVED')).toBe(true);
    expect(canStudentViewFeedback('MODIFIED')).toBe(true);
  });

  it('escalates partial-correct results to HIGH risk regardless of provider fields', () => {
    const question = demoAssignment.questions.find(({ id }) => id === 'Q3')!;
    const result: GradingResult = {
      ...untrustedProviderResult,
      judgment: 'partial_correct',
      riskLevel: 'LOW',
      reviewRequired: false,
    };

    expect(classifyRuntimeRisk(question, '54', result)).toBe('HIGH');
  });

  it('escalates consistency failures to HIGH risk regardless of provider fields', () => {
    const question = demoAssignment.questions.find(({ id }) => id === 'Q3')!;
    const result: GradingResult = {
      ...untrustedProviderResult,
      judgment: 'correct',
      score: 0,
      riskLevel: 'LOW',
      reviewRequired: false,
    };

    expect(classifyRuntimeRisk(question, '54', result)).toBe('HIGH');
  });
});
