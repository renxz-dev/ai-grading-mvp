import { describe, expect, it } from 'vitest';
import { goldenV1 } from '../../src/data/golden-v1';
import {
  mockV1Actuals,
  createMockV1Provider,
} from '../../src/providers/mock-v1-provider';
import {
  mockV2Actuals,
  createMockV2Provider,
} from '../../src/providers/mock-v2-provider';

const gradingInput = {
  caseId: 'GC-01',
  question: {
    id: 'GC-01',
    questionType: goldenV1[0].questionType,
    prompt: goldenV1[0].question,
    options: goldenV1[0].options,
    standardAnswer: goldenV1[0].standardAnswer,
    maxScore: goldenV1[0].maxScore,
  },
  studentAnswer: goldenV1[0].studentAnswer,
};

describe('mock provider regression data immutability', () => {
  it('deep-freezes V1 and V2 maps and their result objects', () => {
    expect(Object.isFrozen(mockV1Actuals)).toBe(true);
    expect(Object.isFrozen(mockV1Actuals['GC-01'])).toBe(true);
    expect(Object.isFrozen(mockV2Actuals)).toBe(true);
    expect(Object.isFrozen(mockV2Actuals['GC-01'])).toBe(true);
  });

  it('does not share mutable result references between V1 and V2', () => {
    expect(mockV1Actuals['GC-01']).not.toBe(mockV2Actuals['GC-01']);
  });

  it('returns a mutable copy without allowing callers to mutate canonical data', async () => {
    const v1 = createMockV1Provider({ delayMs: 0 });
    const result = await v1.grade(gradingInput);

    result.feedback = 'caller mutation';

    await expect(v1.grade(gradingInput)).resolves.toMatchObject({
      feedback: '回答正确。',
    });
    expect(mockV1Actuals['GC-01'].feedback).toBe('回答正确。');
  });
});
