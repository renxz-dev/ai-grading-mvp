import { describe, expect, it } from 'vitest';
import {
  demoAssignment,
  initialStudentAnswers,
  q4CorrectionAnswer,
} from '../../src/data/demo-assignment';
import {
  GOLDEN_DATASET_VERSION,
  goldenV1,
} from '../../src/data/golden-v1';
import { createMockV1Provider } from '../../src/providers/mock-v1-provider';
import { createMockV2Provider } from '../../src/providers/mock-v2-provider';
import { runEvaluation } from '../../src/evaluation/evaluation-run';

describe('frozen business demo data', () => {
  it('keeps the four demo questions and first answers unchanged', () => {
    expect(demoAssignment.questions).toHaveLength(4);
    expect(demoAssignment.questions).toEqual([
      {
        id: 'Q1',
        questionType: 'multiple_choice',
        prompt: '8 × 6 = ?',
        options: ['A. 42', 'B. 48', 'C. 54', 'D. 56'],
        standardAnswer: 'B',
        maxScore: 5,
      },
      {
        id: 'Q2',
        questionType: 'fill_blank',
        prompt: '1 ÷ 2 = ?',
        standardAnswer: '0.5',
        maxScore: 5,
      },
      {
        id: 'Q3',
        questionType: 'calculation',
        prompt: '7 × 8 = ?',
        standardAnswer: '56',
        maxScore: 5,
      },
      {
        id: 'Q4',
        questionType: 'word_problem',
        prompt: '一盒彩笔 8 元，买 3 盒，付 30 元，应找回多少钱？',
        standardAnswer: '8 × 3 = 24\n30 - 24 = 6\n应找回 6 元',
        maxScore: 10,
      },
    ]);
    expect(initialStudentAnswers).toEqual([
      { questionId: 'Q1', answer: 'B' },
      { questionId: 'Q2', answer: '1/2' },
      { questionId: 'Q3', answer: '54' },
      {
        questionId: 'Q4',
        answer: '8 × 3 = 24\n答：一共需要 24 元。',
      },
    ]);
    expect(q4CorrectionAnswer).toEqual({
      questionId: 'Q4',
      answer: '8 × 3 = 24\n30 - 24 = 6\n应找回 6 元。',
    });
  });
});

describe('golden-v1', () => {
  it('has the frozen version, order, size and immutable collection', () => {
    expect(GOLDEN_DATASET_VERSION).toBe('golden-v1');
    expect(Object.isFrozen(goldenV1)).toBe(true);
    expect(goldenV1).toHaveLength(12);
    expect(goldenV1.map(({ caseId }) => caseId)).toEqual([
      'GC-01',
      'GC-02',
      'GC-03',
      'GC-04',
      'GC-05',
      'GC-06',
      'GC-07',
      'GC-08',
      'GC-09',
      'GC-10',
      'GC-11',
      'GC-12',
    ]);
  });

  it('locks the critical expected values and GC-09 deterministic requirements', () => {
    const byId = Object.fromEntries(goldenV1.map((item) => [item.caseId, item]));

    expect(byId['GC-06'].expected).toEqual({
      judgment: 'incorrect',
      score: 0,
      errorType: 'calculation_error',
      riskLevel: 'LOW',
      reviewRequired: false,
    });
    expect(byId['GC-09'].expected).toEqual({
      judgment: 'partial_correct',
      score: 5,
      errorType: 'incomplete_reasoning',
      riskLevel: 'HIGH',
      reviewRequired: true,
    });
    expect(byId['GC-09'].feedbackRequirements).toEqual({
      mustMention: ['还需要'],
      mustNotRevealAnswer: true,
      shouldProvideNextStep: true,
    });
    expect(byId['GC-11'].expected).toMatchObject({
      riskLevel: 'HIGH',
      reviewRequired: true,
    });
  });
});

describe('mock providers', () => {
  it('exposes frozen V1 and V2 metadata through one provider contract', async () => {
    const v1 = createMockV1Provider({ delayMs: 0 });
    const v2 = createMockV2Provider({ delayMs: 0 });
    const gc06 = goldenV1.find(({ caseId }) => caseId === 'GC-06')!;

    expect([v1.providerVersion, v1.promptVersion]).toEqual([
      'mock-v1',
      'grading-v1',
    ]);
    expect([v2.providerVersion, v2.promptVersion]).toEqual([
      'mock-v2',
      'grading-v2',
    ]);

    const input = {
      caseId: gc06.caseId,
      question: {
        id: gc06.caseId,
        questionType: gc06.questionType,
        prompt: gc06.question,
        standardAnswer: gc06.standardAnswer,
        maxScore: gc06.maxScore,
      },
      studentAnswer: gc06.studentAnswer,
    };

    await expect(v1.grade(input)).resolves.toMatchObject({
      errorType: 'concept_error',
    });
    await expect(v2.grade(input)).resolves.toMatchObject({
      errorType: 'calculation_error',
    });
  });
});

describe('frozen V1/V2 regression', () => {
  it('computes the Mock V1 baseline from actual outputs', async () => {
    const run = await runEvaluation(
      createMockV1Provider({ delayMs: 0 }),
      goldenV1,
      '2026-08-26T00:00:00.000Z',
    );

    expect(run).toMatchObject({
      providerVersion: 'mock-v1',
      promptVersion: 'grading-v1',
      datasetVersion: 'golden-v1',
      totalCases: 12,
      passedCases: 7,
      failedCases: 5,
      criticalErrors: 4,
      gateResult: 'BLOCKED',
    });
    expect(
      run.results
        .filter(({ finalResult }) => finalResult === 'FAIL')
        .map(({ caseId }) => caseId),
    ).toEqual(['GC-06', 'GC-07', 'GC-10', 'GC-11', 'GC-12']);
    expect(run.metrics.reasonAccuracy).toBeCloseTo(4 / 6);
    expect(run.metrics.reviewPolicyPassRate).toBeCloseTo(11 / 12);
    expect(run.metrics.reviewRate).toBeCloseTo(6 / 12);
  });

  it('computes the Mock V2 regression against the same golden-v1', async () => {
    const run = await runEvaluation(
      createMockV2Provider({ delayMs: 0 }),
      goldenV1,
      '2026-08-26T00:00:00.000Z',
    );

    expect(run).toMatchObject({
      providerVersion: 'mock-v2',
      promptVersion: 'grading-v2',
      datasetVersion: 'golden-v1',
      totalCases: 12,
      passedCases: 12,
      failedCases: 0,
      criticalErrors: 0,
      gateResult: 'PASS',
    });
    expect(run.results.every(({ finalResult }) => finalResult === 'PASS')).toBe(
      true,
    );
  });
});
