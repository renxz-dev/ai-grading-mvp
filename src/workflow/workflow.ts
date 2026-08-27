import type {
  Assignment,
  GradingResult,
  Question,
  StudentAnswer,
  TeacherFinalReview,
  TeacherPreReview,
  WorkflowContext,
  WorkflowState,
} from '../domain/models';
import type { GradingProvider } from '../providers/grading-provider';
import {
  canStudentViewFeedback,
  classifyRuntimeRisk,
  createRuntimeDecision,
} from '../rules/risk-policy';

type PreReviewInput = {
  action: 'APPROVE' | 'MODIFY';
  finalTeacherScore?: number;
  finalTeacherFeedback?: string;
  reviewReason?: string;
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }

    Object.freeze(value);
  }

  return value;
}

function copyAssignment(assignment: Assignment): Assignment {
  return {
    ...assignment,
    questions: assignment.questions.map((question) => ({
      ...question,
      ...(question.options ? { options: [...question.options] } : {}),
    })),
  };
}

function requireState(
  context: WorkflowContext,
  expectedState: WorkflowState,
): void {
  if (context.state !== expectedState) {
    throw new Error(`requires state ${expectedState}`);
  }
}

function getQuestion(assignment: Assignment, questionId: string): Question {
  const question = assignment.questions.find(({ id }) => id === questionId);

  if (!question) {
    throw new Error(`unknown question ${questionId}`);
  }

  return question;
}

function validateSubmittedAnswers(
  assignment: Assignment,
  answers: readonly StudentAnswer[],
): void {
  if (answers.length !== assignment.questions.length) {
    throw new Error('requires one answer for every assignment question');
  }

  const submittedQuestionIds = new Set<string>();
  for (const answer of answers) {
    getQuestion(assignment, answer.questionId);

    if (submittedQuestionIds.has(answer.questionId)) {
      throw new Error(`duplicate answer for ${answer.questionId}`);
    }

    submittedQuestionIds.add(answer.questionId);
  }
}

function copyResult(result: GradingResult): GradingResult {
  return { ...result };
}

function finalizeContext(context: WorkflowContext): WorkflowContext {
  const results: WorkflowContext['results'] = {};
  for (const [questionId, result] of Object.entries(context.results)) {
    results[questionId] = {
      ...result,
      providerResult: copyResult(result.providerResult),
      publishedResult: copyResult(result.publishedResult),
    };
  }

  const preReviews: WorkflowContext['preReviews'] = {};
  for (const [questionId, review] of Object.entries(context.preReviews)) {
    preReviews[questionId] = { ...review };
  }

  return deepFreeze({
    ...context,
    assignment: copyAssignment(context.assignment),
    answers: context.answers.map((answer) => ({ ...answer })),
    results,
    correction: context.correction ? { ...context.correction } : undefined,
    preReviews,
    finalReview: context.finalReview ? { ...context.finalReview } : undefined,
  });
}

export function createWorkflowContext(assignment: Assignment): WorkflowContext {
  return finalizeContext({
    state: 'DRAFT',
    assignment,
    answers: [],
    results: {},
    preReviews: {},
  });
}

export function publishAssignment(context: WorkflowContext): WorkflowContext {
  requireState(context, 'DRAFT');

  return finalizeContext({
    ...context,
    state: 'PUBLISHED',
  });
}

export function submitAnswers(
  context: WorkflowContext,
  answers: readonly StudentAnswer[],
): WorkflowContext {
  requireState(context, 'PUBLISHED');
  validateSubmittedAnswers(context.assignment, answers);

  return finalizeContext({
    ...context,
    state: 'SUBMITTED',
    answers: answers.map((answer) => ({ ...answer })),
  });
}

export async function gradeSubmission(
  context: WorkflowContext,
  provider: GradingProvider,
): Promise<WorkflowContext> {
  requireState(context, 'SUBMITTED');

  const results = await Promise.all(
    context.answers.map(async (answer) => {
      const question = getQuestion(context.assignment, answer.questionId);
      const providerResult = await provider.grade({
        question,
        studentAnswer: answer.answer,
      });
      const runtimeRisk = classifyRuntimeRisk(question, answer.answer, providerResult);
      const runtimeDecision = createRuntimeDecision(runtimeRisk);
      const publishedResult: GradingResult = {
        ...providerResult,
        riskLevel: runtimeDecision.riskLevel,
        reviewRequired: runtimeDecision.reviewRequired,
      };

      return [
        question.id,
        {
          providerResult: copyResult(providerResult),
          publishedResult,
          reviewStatus: runtimeDecision.reviewStatus,
        },
      ] as const;
    }),
  );

  return finalizeContext({
    ...context,
    state: 'AI_GRADED',
    results: Object.fromEntries(results),
  });
}

export function reviewAiResult(
  context: WorkflowContext,
  questionId: string,
  review: PreReviewInput,
): WorkflowContext {
  requireState(context, 'AI_GRADED');
  if (review.action !== 'APPROVE' && review.action !== 'MODIFY') {
    throw new Error('pre-review action must be APPROVE or MODIFY');
  }

  const questionResult = context.results[questionId];

  if (!questionResult) {
    throw new Error(`no AI result for ${questionId}`);
  }

  if (questionResult.reviewStatus !== 'PENDING') {
    throw new Error(`pre-review is not required for ${questionId}`);
  }

  const originalAiScore = questionResult.providerResult.score;
  const originalAiFeedback = questionResult.providerResult.feedback;
  const question = getQuestion(context.assignment, questionId);
  const reviewReason = review.reviewReason ?? '';
  let finalTeacherScore = originalAiScore;
  let finalTeacherFeedback = originalAiFeedback;

  if (review.action === 'MODIFY') {
    if (
      typeof review.finalTeacherScore !== 'number' ||
      !review.finalTeacherFeedback?.trim() ||
      !review.reviewReason?.trim()
    ) {
      throw new Error(
        'MODIFY requires finalTeacherScore, finalTeacherFeedback and reviewReason',
      );
    }

    if (
      !Number.isFinite(review.finalTeacherScore) ||
      review.finalTeacherScore < 0 ||
      review.finalTeacherScore > question.maxScore
    ) {
      throw new Error(
        'finalTeacherScore must be finite and within the question score range',
      );
    }

    finalTeacherScore = review.finalTeacherScore;
    finalTeacherFeedback = review.finalTeacherFeedback;
  }

  const preReview: TeacherPreReview = {
    questionId,
    action: review.action,
    originalAiScore,
    finalTeacherScore,
    originalAiFeedback,
    finalTeacherFeedback,
    reviewReason,
  };

  const publishedResult: GradingResult = {
    ...questionResult.publishedResult,
    score: finalTeacherScore,
    feedback: finalTeacherFeedback,
  };

  return finalizeContext({
    ...context,
    results: {
      ...context.results,
      [questionId]: {
        ...questionResult,
        publishedResult,
        reviewStatus: review.action === 'APPROVE' ? 'APPROVED' : 'MODIFIED',
      },
    },
    preReviews: {
      ...context.preReviews,
      [questionId]: preReview,
    },
  });
}

export function getStudentFeedback(
  context: WorkflowContext,
  questionId: string,
): GradingResult | undefined {
  const questionResult = context.results[questionId];

  if (!questionResult || !canStudentViewFeedback(questionResult.reviewStatus)) {
    return undefined;
  }

  return copyResult(questionResult.publishedResult);
}

export function submitCorrection(
  context: WorkflowContext,
  correction: StudentAnswer,
): WorkflowContext {
  if (context.state === 'COMPLETED' || context.state === 'TEACHER_REVIEWED') {
    requireState(context, 'AI_GRADED');
  }

  if (context.correction) {
    throw new Error('Challenge MVP allows only one correction');
  }

  requireState(context, 'AI_GRADED');

  if (correction.questionId !== 'Q4') {
    throw new Error('Challenge MVP correction only supports Q4');
  }

  if (!getStudentFeedback(context, correction.questionId)) {
    throw new Error('Q4 feedback must be visible before correction');
  }

  return finalizeContext({
    ...context,
    state: 'CORRECTION_SUBMITTED',
    correction: { ...correction },
  });
}

export function submitFinalReview(
  context: WorkflowContext,
  action: TeacherFinalReview['action'],
): WorkflowContext {
  if (context.state === 'CORRECTION_SUBMITTED' && context.finalReview) {
    throw new Error('final review has already been recorded');
  }

  requireState(context, 'CORRECTION_SUBMITTED');

  if (action !== 'PASS' && action !== 'RETURN') {
    throw new Error('final review action must be PASS or RETURN');
  }

  if (!context.correction) {
    throw new Error('requires a submitted correction');
  }

  const finalReview: TeacherFinalReview = { action };

  return finalizeContext({
    ...context,
    state: action === 'PASS' ? 'TEACHER_REVIEWED' : 'CORRECTION_SUBMITTED',
    finalReview,
  });
}

export function completeWorkflow(context: WorkflowContext): WorkflowContext {
  requireState(context, 'TEACHER_REVIEWED');

  if (context.finalReview?.action !== 'PASS') {
    throw new Error('requires final review PASS');
  }

  return finalizeContext({
    ...context,
    state: 'COMPLETED',
  });
}

export function getFinalReviewNotice(context: WorkflowContext): string | undefined {
  return context.finalReview?.action === 'RETURN'
    ? '已退回；Challenge MVP 不继续模拟第二轮订正。'
    : undefined;
}
