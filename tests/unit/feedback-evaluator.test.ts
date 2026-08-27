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

  it('allows Q4 guidance that mentions the known subtotal without revealing the final answer', () => {
    const gc09 = goldenCase('GC-09');
    const result = evaluateFeedback(
      '总价计算正确，还需要继续求找回多少钱，请检查下一步计算。',
      gc09.standardAnswer,
      gc09.feedbackRequirements,
    );

    expect(result.answerLeakagePass).toBe(true);
  });

  it('rejects Q4 feedback that reveals the final conclusion', () => {
    const gc09 = goldenCase('GC-09');
    const result = evaluateFeedback(
      '还需要继续计算，最后应找回 6 元。',
      gc09.standardAnswer,
      gc09.feedbackRequirements,
    );

    expect(result.answerLeakagePass).toBe(false);
  });

  it('rejects Q4 feedback that states the final answer using a generic answer phrase', () => {
    const gc09 = goldenCase('GC-09');
    const result = evaluateFeedback(
      '答案是 6 元，请检查一下。',
      gc09.standardAnswer,
      gc09.feedbackRequirements,
    );

    expect(result.answerLeakagePass).toBe(false);
  });

  it.each([
    '最终结果是 6 元，还需要检查计算。',
    '最终结果：6元，还需要检查计算。',
    '计算结果：6元，还需要检查计算。',
    '最终答案：6元，还需要检查计算。',
    '应找回 6 块钱，还需要检查计算。',
    '最后找回 6 块钱。',
    '最终应找回六元。',
    '最后应找回 6.00 元。',
  ])('rejects an equivalent rewritten Q4 final answer: %s', (feedback) => {
    const gc09 = goldenCase('GC-09');

    expect(
      evaluateFeedback(
        feedback,
        gc09.standardAnswer,
        gc09.feedbackRequirements,
      ).answerLeakagePass,
    ).toBe(false);
  });

  it.each([
    ['B', 'Because 需要核对计算过程。'],
    ['9', '请检查第 9 步的格式。'],
    ['56', '答案是需要你自己检查的，不要着急。'],
  ])(
    'does not treat an unrelated short-answer substring as leakage',
    (standardAnswer, feedback) => {
      expect(
        evaluateFeedback(feedback, standardAnswer, {
          mustNotRevealAnswer: true,
          shouldProvideNextStep: false,
        }).answerLeakagePass,
      ).toBe(true);
    },
  );

  it.each(['下一步请填入 6 元。', '把 6 元写在横线上。'])(
    'rejects direct instructions that supply the final value: %s',
    (feedback) => {
      const gc09 = goldenCase('GC-09');

      expect(
        evaluateFeedback(
          feedback,
          gc09.standardAnswer,
          gc09.feedbackRequirements,
        ).answerLeakagePass,
      ).toBe(false);
    },
  );

  it.each([
    '最后，请检查第 6 步的计算过程。',
    '请检查第 6 步的计算结果。',
    '还剩一个步骤没有完成，请检查第 6 步的格式。',
    '还需要继续求找回多少钱，题目中共有 6 个信息，请逐项检查。',
    '最终结果是 -6 元，还需要检查计算。',
  ])('does not confuse a step number with the final answer: %s', (feedback) => {
    const gc09 = goldenCase('GC-09');

    expect(
      evaluateFeedback(
        feedback,
        gc09.standardAnswer,
        gc09.feedbackRequirements,
      ).answerLeakagePass,
    ).toBe(true);
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
