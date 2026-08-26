import { describe, expect, it } from 'vitest';
import { goldenV1 } from '../../src/data/golden-v1';
import { evaluateCase } from '../../src/evaluation/evaluation-engine';
import { mockV1Actuals } from '../../src/providers/mock-v1-provider';

const evaluate = (caseId: string) => {
  const goldenCase = goldenV1.find((item) => item.caseId === caseId)!;
  return evaluateCase(goldenCase, mockV1Actuals[caseId]);
};

describe('evaluation dimensions and critical severity', () => {
  it('requires all seven dimensions for final PASS', () => {
    const result = evaluate('GC-01');

    expect(result).toMatchObject({
      judgmentPass: true,
      scorePass: true,
      reasonPass: true,
      feedbackPass: true,
      consistencyPass: true,
      riskPass: true,
      reviewPolicyPass: true,
      criticalError: false,
      finalResult: 'PASS',
    });
  });

  it('keeps GC-06 as non-critical FAIL for reason and feedback', () => {
    expect(evaluate('GC-06')).toMatchObject({
      judgmentPass: true,
      scorePass: true,
      reasonPass: false,
      feedbackPass: false,
      consistencyPass: true,
      riskPass: true,
      reviewPolicyPass: true,
      criticalError: false,
      finalResult: 'FAIL',
    });
  });

  it.each([
    [
      'GC-07',
      {
        judgmentPass: true,
        scorePass: false,
        reasonPass: true,
        feedbackPass: true,
        consistencyPass: false,
        riskPass: true,
        reviewPolicyPass: true,
      },
    ],
    [
      'GC-10',
      {
        judgmentPass: false,
        scorePass: false,
        reasonPass: false,
        feedbackPass: false,
        consistencyPass: true,
        riskPass: true,
        reviewPolicyPass: true,
      },
    ],
    [
      'GC-11',
      {
        judgmentPass: true,
        scorePass: true,
        reasonPass: true,
        feedbackPass: true,
        consistencyPass: false,
        riskPass: true,
        reviewPolicyPass: false,
      },
    ],
    [
      'GC-12',
      {
        judgmentPass: true,
        scorePass: true,
        reasonPass: true,
        feedbackPass: false,
        consistencyPass: true,
        riskPass: true,
        reviewPolicyPass: true,
      },
    ],
  ] as const)('marks %s as Critical FAIL with frozen dimensions', (caseId, dimensions) => {
    expect(evaluate(caseId)).toMatchObject({
      ...dimensions,
      criticalError: true,
      finalResult: 'FAIL',
    });
  });
});
