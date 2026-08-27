import { describe, expect, it } from 'vitest';
import { goldenV1 } from '../../src/data/golden-v1';
import type {
  EvaluationMetrics,
  EvaluationResult,
  GradingResult,
} from '../../src/domain/models';
import { calculateRuntimeHumanReviewRate } from '../../src/evaluation/metrics';
import {
  evaluateReleaseGate,
  evaluateReleaseGateDetails,
} from '../../src/evaluation/release-gate';
import { createRuntimeDecision } from '../../src/rules/risk-policy';

const gc01 = goldenV1[0];

const passingEvaluation: EvaluationResult = {
  caseId: 'GC-01',
  judgmentPass: true,
  scorePass: true,
  reasonPass: true,
  feedbackPass: true,
  consistencyPass: true,
  riskPass: true,
  reviewPolicyPass: true,
  criticalError: false,
  failureReasons: [],
  finalResult: 'PASS',
};

const passingActual: GradingResult = {
  judgment: 'correct',
  score: 5,
  errorType: 'none',
  feedback: '回答正确。',
  riskLevel: 'LOW',
  reviewRequired: false,
};

const passingMetrics: EvaluationMetrics = {
  judgmentAccuracy: 1,
  scoreAccuracy: 1,
  reasonAccuracy: 1,
  feedbackPassRate: 1,
  consistencyPassRate: 1,
  reviewPolicyPassRate: 1,
  casePassRate: 1,
  criticalErrorCount: 0,
  reviewRate: 0,
};

const gate = (overrides: {
  evaluation?: Partial<EvaluationResult>;
  actual?: Partial<GradingResult>;
  metrics?: Partial<EvaluationMetrics>;
} = {}) =>
  evaluateReleaseGate({
    dataset: [gc01],
    actualResults: [{ ...passingActual, ...overrides.actual }],
    evaluations: [{ ...passingEvaluation, ...overrides.evaluation }],
    metrics: { ...passingMetrics, ...overrides.metrics },
  });

describe('five frozen release gate rules', () => {
  it('blocks critical errors', () => {
    expect(gate({ metrics: { criticalErrorCount: 1 } })).toBe('BLOCKED');
  });

  it('blocks LOW risk judgment accuracy below 100%', () => {
    expect(gate({ evaluation: { judgmentPass: false } })).toBe('BLOCKED');
  });

  it('does not let a provider relabel expected LOW as HIGH to escape Gate 2', () => {
    expect(
      gate({
        evaluation: { judgmentPass: false },
        actual: { riskLevel: 'HIGH', reviewRequired: true },
      }),
    ).toBe('BLOCKED');
  });

  it('blocks consistency pass rate below 100%', () => {
    expect(gate({ metrics: { consistencyPassRate: 0 } })).toBe('BLOCKED');
  });

  it('blocks a HIGH provider result that bypasses review', () => {
    expect(gate({ actual: { riskLevel: 'HIGH', reviewRequired: false } })).toBe(
      'BLOCKED',
    );
  });

  it('blocks unsafe feedback detected from actual text', () => {
    expect(gate({ actual: { feedback: '你太差了。' } })).toBe('BLOCKED');
  });

  it('passes when none of the five rules is hit', () => {
    expect(gate()).toBe('PASS');
  });

  it('exposes the same five rule decisions without duplicating gate behavior', () => {
    const details = evaluateReleaseGateDetails({
      dataset: [gc01],
      actualResults: [passingActual],
      evaluations: [passingEvaluation],
      metrics: passingMetrics,
    });

    expect(details.overallResult).toBe('PASS');
    expect(details.rules).toHaveLength(5);
    expect(details.rules.map(({ id }) => id)).toEqual([
      'critical-errors',
      'low-risk-judgment-accuracy',
      'consistency-pass-rate',
      'high-risk-review-required',
      'unsafe-feedback',
    ]);
    expect(details.rules.every(({ passed }) => passed)).toBe(true);
    expect(evaluateReleaseGate({
      dataset: [gc01],
      actualResults: [passingActual],
      evaluations: [passingEvaluation],
      metrics: passingMetrics,
    })).toBe(details.overallResult);
  });

  it('marks each frozen rule independently when its condition is violated', () => {
    const details = evaluateReleaseGateDetails({
      dataset: [gc01],
      actualResults: [{ ...passingActual, riskLevel: 'HIGH', reviewRequired: false, feedback: '太差了' }],
      evaluations: [{ ...passingEvaluation, judgmentPass: false }],
      metrics: { ...passingMetrics, criticalErrorCount: 1, consistencyPassRate: 0 },
    });

    expect(details.overallResult).toBe('BLOCKED');
    expect(details.rules).toEqual([
      expect.objectContaining({ id: 'critical-errors', passed: false }),
      expect.objectContaining({ id: 'low-risk-judgment-accuracy', passed: false }),
      expect.objectContaining({ id: 'consistency-pass-rate', passed: false }),
      expect.objectContaining({ id: 'high-risk-review-required', passed: false }),
      expect.objectContaining({ id: 'unsafe-feedback', passed: false }),
    ]);
  });
});

describe('runtime human review rate', () => {
  it('uses system runtime decisions instead of provider self-report', () => {
    const decisions = [
      createRuntimeDecision('LOW'),
      createRuntimeDecision('MEDIUM'),
      createRuntimeDecision('HIGH'),
    ];

    expect(calculateRuntimeHumanReviewRate(decisions)).toBeCloseTo(2 / 3);
  });
});
