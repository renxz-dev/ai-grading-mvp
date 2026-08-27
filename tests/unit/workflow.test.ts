import { describe, expect, it } from 'vitest';
import {
  demoAssignment,
  initialStudentAnswers,
  q4CorrectionAnswer,
} from '../../src/data/demo-assignment';
import type { GradingProvider } from '../../src/providers/grading-provider';
import { createMockV1Provider } from '../../src/providers/mock-v1-provider';
import {
  completeWorkflow,
  createWorkflowContext,
  getFinalReviewNotice,
  getStudentFeedback,
  gradeSubmission,
  publishAssignment,
  reviewAiResult,
  submitAnswers,
  submitCorrection,
  submitFinalReview,
} from '../../src/workflow/workflow';

async function gradeInitialSubmission(
  provider: GradingProvider = createMockV1Provider({ delayMs: 0 }),
) {
  let context = createWorkflowContext(demoAssignment);
  context = publishAssignment(context);
  context = submitAnswers(context, initialStudentAnswers);
  return gradeSubmission(context, provider);
}

function createProviderThatMisreportsRuntimeReview(): GradingProvider {
  const provider = createMockV1Provider({ delayMs: 0 });

  return {
    providerVersion: 'mock-v1',
    promptVersion: 'grading-v1',
    async grade(input) {
      const result = await provider.grade(input);
      return {
        ...result,
        riskLevel: 'LOW',
        reviewRequired: false,
      };
    },
  };
}

describe('Phase 4 workflow state transitions', () => {
  it('moves through publish, submit and AI grading states', async () => {
    const draft = createWorkflowContext(demoAssignment);
    expect(draft.state).toBe('DRAFT');

    const published = publishAssignment(draft);
    expect(published.state).toBe('PUBLISHED');

    const submitted = submitAnswers(published, initialStudentAnswers);
    expect(submitted.state).toBe('SUBMITTED');

    const graded = await gradeSubmission(
      submitted,
      createMockV1Provider({ delayMs: 0 }),
    );
    expect(graded.state).toBe('AI_GRADED');
    expect(Object.keys(graded.results)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });

  it('rejects illegal state transitions', async () => {
    const draft = createWorkflowContext(demoAssignment);

    expect(() => submitAnswers(draft, initialStudentAnswers)).toThrow(
      'requires state PUBLISHED',
    );
    expect(() => gradeSubmission(draft, createMockV1Provider())).rejects.toThrow(
      'requires state SUBMITTED',
    );

    const published = publishAssignment(draft);
    expect(() => publishAssignment(published)).toThrow(
      'requires state DRAFT',
    );
  });

  it('publishes LOW feedback automatically but hides MEDIUM/HIGH pending feedback', async () => {
    const graded = await gradeInitialSubmission();

    expect(graded.results.Q1.reviewStatus).toBe('NOT_REQUIRED');
    expect(graded.results.Q2.reviewStatus).toBe('PENDING');
    expect(graded.results.Q4.reviewStatus).toBe('PENDING');
    expect(getStudentFeedback(graded, 'Q1')).toMatchObject({
      feedback: '回答正确。',
    });
    expect(getStudentFeedback(graded, 'Q2')).toBeUndefined();
    expect(getStudentFeedback(graded, 'Q4')).toBeUndefined();
  });

  it('uses Runtime Risk Policy instead of provider reviewRequired for publication control', async () => {
    const graded = await gradeInitialSubmission(
      createProviderThatMisreportsRuntimeReview(),
    );

    expect(graded.results.Q4.providerResult).toMatchObject({
      riskLevel: 'LOW',
      reviewRequired: false,
    });
    expect(graded.results.Q4).toMatchObject({
      reviewStatus: 'PENDING',
      publishedResult: {
        riskLevel: 'HIGH',
        reviewRequired: true,
      },
    });
    expect(getStudentFeedback(graded, 'Q4')).toBeUndefined();
    expect(() => {
      (graded.results.Q4 as any).reviewStatus = 'APPROVED';
    }).toThrow(TypeError);
    expect(() => {
      (graded as any).state = 'COMPLETED';
    }).toThrow(TypeError);
    expect(getStudentFeedback(graded, 'Q4')).toBeUndefined();
  });
});

describe('teacher pre-review and feedback publication', () => {
  it('supports APPROVE and keeps the original AI score and feedback', async () => {
    const graded = await gradeInitialSubmission();
    const reviewed = reviewAiResult(graded, 'Q4', {
      action: 'APPROVE',
      reviewReason: '确认 AI 反馈可发布',
    });

    expect(reviewed.results.Q4.reviewStatus).toBe('APPROVED');
    expect(reviewed.preReviews.Q4).toMatchObject({
      action: 'APPROVE',
      originalAiScore: 5,
      finalTeacherScore: 5,
      originalAiFeedback: '总价计算正确，还需要继续求找回多少钱，请检查下一步计算。',
      finalTeacherFeedback: '总价计算正确，还需要继续求找回多少钱，请检查下一步计算。',
    });
    expect(getStudentFeedback(reviewed, 'Q4')).toMatchObject({
      score: 5,
      feedback: '总价计算正确，还需要继续求找回多少钱，请检查下一步计算。',
    });
  });

  it('supports MODIFY and publishes teacher score and feedback while retaining AI originals', async () => {
    const graded = await gradeInitialSubmission();
    const reviewed = reviewAiResult(graded, 'Q4', {
      action: 'MODIFY',
      finalTeacherScore: 4,
      finalTeacherFeedback: '总价计算正确，请继续完成找回金额的计算。',
      reviewReason: '补充下一步引导',
    });

    expect(reviewed.results.Q4.reviewStatus).toBe('MODIFIED');
    expect(reviewed.results.Q4.publishedResult).toMatchObject({
      score: 4,
      feedback: '总价计算正确，请继续完成找回金额的计算。',
    });
    expect(reviewed.preReviews.Q4).toMatchObject({
      originalAiScore: 5,
      originalAiFeedback: '总价计算正确，还需要继续求找回多少钱，请检查下一步计算。',
      finalTeacherScore: 4,
      finalTeacherFeedback: '总价计算正确，请继续完成找回金额的计算。',
      reviewReason: '补充下一步引导',
    });
    expect(getStudentFeedback(reviewed, 'Q4')).toMatchObject({
      score: 4,
      feedback: '总价计算正确，请继续完成找回金额的计算。',
    });
  });

  it('requires final fields when MODIFY is selected', async () => {
    const graded = await gradeInitialSubmission();

    expect(() =>
      reviewAiResult(graded, 'Q4', { action: 'MODIFY' }),
    ).toThrow('MODIFY requires finalTeacherScore, finalTeacherFeedback and reviewReason');
  });

  it('rejects invalid pre-review actions and scores outside the question range', async () => {
    const graded = await gradeInitialSubmission();

    expect(() =>
      reviewAiResult(graded, 'Q4', { action: 'REJECT' } as any),
    ).toThrow('pre-review action must be APPROVE or MODIFY');

    for (const score of [Number.NaN, Number.POSITIVE_INFINITY, -1, 11]) {
      expect(() =>
        reviewAiResult(graded, 'Q4', {
          action: 'MODIFY',
          finalTeacherScore: score,
          finalTeacherFeedback: '修正后的反馈',
          reviewReason: '修正原因',
        }),
      ).toThrow('finalTeacherScore must be finite and within the question score range');
    }
  });
});

describe('Q4 single-correction and final review boundary', () => {
  it('allows one correction only after Q4 feedback becomes visible', async () => {
    const graded = await gradeInitialSubmission();

    expect(() => submitCorrection(graded, q4CorrectionAnswer)).toThrow(
      'Q4 feedback must be visible before correction',
    );

    const preReviewed = reviewAiResult(graded, 'Q4', {
      action: 'APPROVE',
      reviewReason: '确认反馈',
    });
    const corrected = submitCorrection(preReviewed, q4CorrectionAnswer);

    expect(corrected.state).toBe('CORRECTION_SUBMITTED');
    expect(corrected.correction).toEqual(q4CorrectionAnswer);
    expect(() => submitCorrection(corrected, q4CorrectionAnswer)).toThrow(
      'Challenge MVP allows only one correction',
    );
  });

  it('completes the normal PASS path through TEACHER_REVIEWED', async () => {
    const graded = await gradeInitialSubmission();
    const preReviewed = reviewAiResult(graded, 'Q4', {
      action: 'APPROVE',
      reviewReason: '确认反馈',
    });
    const corrected = submitCorrection(preReviewed, q4CorrectionAnswer);
    const teacherReviewed = submitFinalReview(corrected, 'PASS');

    expect(teacherReviewed).toMatchObject({
      state: 'TEACHER_REVIEWED',
      finalReview: { action: 'PASS' },
    });
    const completed = completeWorkflow(teacherReviewed);
    expect(completed.state).toBe('COMPLETED');
    expect(() => completeWorkflow(completed)).toThrow(
      'requires state TEACHER_REVIEWED',
    );
  });

  it('keeps RETURN in CORRECTION_SUBMITTED and blocks another correction or final review', async () => {
    const graded = await gradeInitialSubmission();
    const preReviewed = reviewAiResult(graded, 'Q4', {
      action: 'APPROVE',
      reviewReason: '确认反馈',
    });
    const corrected = submitCorrection(preReviewed, q4CorrectionAnswer);
    const returned = submitFinalReview(corrected, 'RETURN');

    expect(returned).toMatchObject({
      state: 'CORRECTION_SUBMITTED',
      finalReview: { action: 'RETURN' },
    });
    expect(getFinalReviewNotice(returned)).toBe(
      '已退回；Challenge MVP 不继续模拟第二轮订正。',
    );
    expect(() => submitCorrection(returned, q4CorrectionAnswer)).toThrow(
      'Challenge MVP allows only one correction',
    );
    expect(() => submitFinalReview(returned, 'PASS')).toThrow(
      'final review has already been recorded',
    );
    expect(() => completeWorkflow(returned)).toThrow(
      'requires state TEACHER_REVIEWED',
    );
  });

  it('rejects invalid final review actions', async () => {
    const graded = await gradeInitialSubmission();
    const preReviewed = reviewAiResult(graded, 'Q4', {
      action: 'APPROVE',
      reviewReason: '确认反馈',
    });
    const corrected = submitCorrection(preReviewed, q4CorrectionAnswer);

    expect(() => submitFinalReview(corrected, 'REJECT' as any)).toThrow(
      'final review action must be PASS or RETURN',
    );
  });

  it('rejects changes after COMPLETED', async () => {
    const graded = await gradeInitialSubmission();
    const preReviewed = reviewAiResult(graded, 'Q4', {
      action: 'APPROVE',
      reviewReason: '确认反馈',
    });
    const corrected = submitCorrection(preReviewed, q4CorrectionAnswer);
    const teacherReviewed = submitFinalReview(corrected, 'PASS');
    const completed = completeWorkflow(teacherReviewed);

    expect(() =>
      reviewAiResult(completed, 'Q4', {
        action: 'MODIFY',
        finalTeacherScore: 3,
        finalTeacherFeedback: '不能修改',
        reviewReason: '已完成',
      }),
    ).toThrow('requires state AI_GRADED');
    expect(() => submitCorrection(completed, q4CorrectionAnswer)).toThrow(
      'requires state AI_GRADED',
    );
    expect(() => submitFinalReview(completed, 'RETURN')).toThrow(
      'requires state CORRECTION_SUBMITTED',
    );
  });
});
