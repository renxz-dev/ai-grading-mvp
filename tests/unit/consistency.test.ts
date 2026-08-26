import { describe, expect, it } from 'vitest';
import { checkGradingConsistency } from '../../src/rules/consistency';

describe('grading cross-field consistency', () => {
  it('rejects correct judgment with zero score', () => {
    expect(
      checkGradingConsistency({
        judgment: 'correct',
        score: 0,
        errorType: 'none',
        feedback: '回答正确。',
        riskLevel: 'LOW',
        reviewRequired: false,
      }),
    ).toMatchObject({ pass: false });
  });

  it('rejects HIGH risk when provider reviewRequired is false', () => {
    const result = checkGradingConsistency({
      judgment: 'correct',
      score: 10,
      errorType: 'none',
      feedback: '回答正确。',
      riskLevel: 'HIGH',
      reviewRequired: false,
    });

    expect(result.pass).toBe(false);
    expect(result.reasons).toContain('HIGH risk must require review');
  });

  it('accepts a consistent correct result', () => {
    expect(
      checkGradingConsistency({
        judgment: 'correct',
        score: 5,
        errorType: 'none',
        feedback: '回答正确。',
        riskLevel: 'LOW',
        reviewRequired: false,
      }),
    ).toEqual({ pass: true, reasons: [] });
  });
});
