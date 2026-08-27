import { describe, expect, it } from 'vitest';
import type { GoldenCase, GradingResult } from '../../src/domain/models';
import { runEvaluation } from '../../src/evaluation/evaluation-run';
import type { GradingProvider } from '../../src/providers/grading-provider';

const runtimePolicyMismatchCase: GoldenCase = {
  caseId: 'GC-RUNTIME-MISMATCH',
  title: 'Runtime review-rate source fixture',
  questionType: 'word_problem',
  difficulty: 'fixture',
  question: '一道应用题',
  standardAnswer: '6',
  studentAnswer: '6',
  maxScore: 1,
  expected: {
    judgment: 'correct',
    score: 1,
    errorType: 'none',
    riskLevel: 'LOW',
    reviewRequired: false,
  },
  feedbackRequirements: {
    mustNotRevealAnswer: false,
    shouldProvideNextStep: false,
  },
};

const providerResult: GradingResult = {
  judgment: 'correct',
  score: 1,
  errorType: 'none',
  feedback: '回答正确。',
  riskLevel: 'LOW',
  reviewRequired: false,
};

const provider: GradingProvider = {
  providerVersion: 'mock-v1',
  promptVersion: 'grading-v1',
  async grade() {
    return { ...providerResult };
  },
};

describe('evaluation metric data sources', () => {
  it('calculates reviewRate from Runtime Risk Policy, not Expected reviewRequired', async () => {
    const run = await runEvaluation(
      provider,
      [runtimePolicyMismatchCase],
      'runtime-policy-fixture-v1',
      '2026-08-27T00:00:00.000Z',
    );

    expect(run.metrics.reviewPolicyPassRate).toBe(1);
    expect(run.metrics.reviewRate).toBe(1);
  });
});
