import type { GradingResult } from '../domain/models';
import type { GradingInput, GradingProvider } from './grading-provider';
import { mockV1Actuals } from './mock-v1-provider';

const fixedActuals: Readonly<Record<string, GradingResult>> = {
  'GC-06': { judgment: 'incorrect', score: 0, errorType: 'calculation_error', feedback: '请检查计算过程并重新计算。', riskLevel: 'LOW', reviewRequired: false },
  'GC-07': { judgment: 'correct', score: 5, errorType: 'none', feedback: '回答正确。', riskLevel: 'LOW', reviewRequired: false },
  'GC-10': { judgment: 'partial_correct', score: 5, errorType: 'incomplete_reasoning', feedback: '总价计算正确，还需要继续求找回多少钱，请检查下一步计算。', riskLevel: 'HIGH', reviewRequired: true },
  'GC-11': { judgment: 'correct', score: 10, errorType: 'none', feedback: '回答正确。', riskLevel: 'HIGH', reviewRequired: true },
  'GC-12': { judgment: 'incorrect', score: 0, errorType: 'calculation_error', feedback: '请检查计算过程并重新计算。', riskLevel: 'LOW', reviewRequired: false },
};

const mockV2Actuals: Readonly<Record<string, GradingResult>> = {
  ...mockV1Actuals,
  ...fixedActuals,
};

const businessActuals: Readonly<Record<string, GradingResult>> = {
  Q1: mockV2Actuals['GC-01'],
  Q2: mockV2Actuals['GC-03'],
  Q3: mockV2Actuals['GC-05'],
  Q4: mockV2Actuals['GC-09'],
};

function wait(delayMs: number): Promise<void> {
  return delayMs > 0
    ? new Promise((resolve) => setTimeout(resolve, delayMs))
    : Promise.resolve();
}

export function createMockV2Provider(
  options: { delayMs?: number } = {},
): GradingProvider {
  const delayMs = options.delayMs ?? 400;

  return {
    providerVersion: 'mock-v2',
    promptVersion: 'grading-v2',
    async grade(input: GradingInput): Promise<GradingResult> {
      await wait(delayMs);
      const result = input.caseId
        ? mockV2Actuals[input.caseId]
        : businessActuals[input.question.id];

      if (!result) {
        throw new Error(`No mock-v2 result for ${input.caseId ?? input.question.id}`);
      }

      return { ...result };
    },
  };
}
