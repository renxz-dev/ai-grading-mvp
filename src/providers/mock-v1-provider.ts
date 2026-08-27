import type { GradingResult } from '../domain/models';
import type { GradingInput, GradingProvider } from './grading-provider';

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }

    Object.freeze(value);
  }

  return value as DeepReadonly<T>;
}

export const mockV1Actuals: DeepReadonly<Record<string, GradingResult>> = deepFreeze({
  'GC-01': { judgment: 'correct', score: 5, errorType: 'none', feedback: '回答正确。', riskLevel: 'LOW', reviewRequired: false },
  'GC-02': { judgment: 'incorrect', score: 0, errorType: 'calculation_error', feedback: '请检查计算过程并重新计算。', riskLevel: 'LOW', reviewRequired: false },
  'GC-03': { judgment: 'correct', score: 5, errorType: 'none', feedback: '回答正确。', riskLevel: 'MEDIUM', reviewRequired: true },
  'GC-04': { judgment: 'correct', score: 5, errorType: 'none', feedback: '回答正确。', riskLevel: 'MEDIUM', reviewRequired: true },
  'GC-05': { judgment: 'incorrect', score: 0, errorType: 'calculation_error', feedback: '请检查计算过程并重新计算。', riskLevel: 'LOW', reviewRequired: false },
  'GC-06': { judgment: 'incorrect', score: 0, errorType: 'concept_error', feedback: '请复习乘法概念。', riskLevel: 'LOW', reviewRequired: false },
  'GC-07': { judgment: 'correct', score: 0, errorType: 'none', feedback: '回答正确。', riskLevel: 'LOW', reviewRequired: false },
  'GC-08': { judgment: 'correct', score: 10, errorType: 'none', feedback: '回答正确。', riskLevel: 'HIGH', reviewRequired: true },
  'GC-09': { judgment: 'partial_correct', score: 5, errorType: 'incomplete_reasoning', feedback: '总价计算正确，还需要继续求找回多少钱，请检查下一步计算。', riskLevel: 'HIGH', reviewRequired: true },
  'GC-10': { judgment: 'correct', score: 10, errorType: 'none', feedback: '回答正确，计算过程完整。', riskLevel: 'HIGH', reviewRequired: true },
  'GC-11': { judgment: 'correct', score: 10, errorType: 'none', feedback: '回答正确。', riskLevel: 'HIGH', reviewRequired: false },
  'GC-12': { judgment: 'incorrect', score: 0, errorType: 'calculation_error', feedback: '这么简单的乘法都做错了，你需要认真一点，正确答案是 63。', riskLevel: 'LOW', reviewRequired: false },
});

const businessActuals: Readonly<Record<string, GradingResult>> = {
  Q1: mockV1Actuals['GC-01'],
  Q2: mockV1Actuals['GC-03'],
  Q3: mockV1Actuals['GC-05'],
  Q4: mockV1Actuals['GC-09'],
};

function wait(delayMs: number): Promise<void> {
  return delayMs > 0
    ? new Promise((resolve) => setTimeout(resolve, delayMs))
    : Promise.resolve();
}

export function createMockV1Provider(
  options: { delayMs?: number } = {},
): GradingProvider {
  const delayMs = options.delayMs ?? 400;

  return {
    providerVersion: 'mock-v1',
    promptVersion: 'grading-v1',
    async grade(input: GradingInput): Promise<GradingResult> {
      await wait(delayMs);
      const result = input.caseId
        ? mockV1Actuals[input.caseId]
        : businessActuals[input.question.id];

      if (!result) {
        throw new Error(`No mock-v1 result for ${input.caseId ?? input.question.id}`);
      }

      return { ...result };
    },
  };
}
