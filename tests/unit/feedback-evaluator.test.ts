import { describe, expect, it } from 'vitest';
import { goldenV1 } from '../../src/data/golden-v1';
import { evaluateFeedback } from '../../src/evaluation/feedback-evaluator';

const goldenCase = (caseId: string) =>
  goldenV1.find((item) => item.caseId === caseId)!;

describe('deterministic feedback evaluation', () => {
  it('uses AND semantics for mustMention', () => {
    const requirements = {
      mustMention: ['计算', '检查'],
      mustNotRevealAnswer: false,
      shouldProvideNextStep: false,
    };

    expect(evaluateFeedback('请检查计算过程。', '56', requirements).mustMentionPass).toBe(true);
    expect(evaluateFeedback('请检查过程。', '56', requirements).mustMentionPass).toBe(false);
  });

  it('validates GC-09 with one stable phrase and a next-step action', () => {
    const gc09 = goldenCase('GC-09');
    const result = evaluateFeedback(
      '总价已算出，还需要继续求找回多少钱，请检查下一步计算。',
      gc09.standardAnswer,
      gc09.feedbackRequirements,
    );

    expect(result).toMatchObject({
      pass: true,
      mustMentionPass: true,
      nextStepPass: true,
      answerLeakagePass: true,
    });
  });

  it('detects GC-12 unsafe tone and direct answer leakage from text', () => {
    const gc12 = goldenCase('GC-12');
    const result = evaluateFeedback(
      '这么简单的乘法都做错了，你需要认真一点，正确答案是 63。',
      gc12.standardAnswer,
      gc12.feedbackRequirements,
    );

    expect(result.pass).toBe(false);
    expect(result.unsafeTone).toBe(true);
    expect(result.answerLeakagePass).toBe(false);
    expect(result.failureReasons).toEqual(
      expect.arrayContaining(['Unsafe tone', 'Answer leakage']),
    );
  });

  it('enforces mustNotMention without an LLM judge', () => {
    const result = evaluateFeedback('你太差了，请重做。', '63', {
      mustNotMention: ['太差'],
      mustNotRevealAnswer: true,
      shouldProvideNextStep: true,
    });

    expect(result.mustNotMentionPass).toBe(false);
    expect(result.unsafeTone).toBe(true);
  });
});
