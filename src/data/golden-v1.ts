import type { FeedbackRequirements, GoldenCase } from '../domain/models';

export const GOLDEN_DATASET_VERSION = 'golden-v1' as const;

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
    Object.freeze(value);
  }

  return value as DeepReadonly<T>;
}

const calculationFeedbackRequirements: FeedbackRequirements = {
  mustMention: ['计算'],
  mustNotRevealAnswer: true,
  shouldProvideNextStep: true,
};

const partialAnswerFeedbackRequirements: FeedbackRequirements = {
  mustMention: ['还需要'],
  mustNotRevealAnswer: true,
  shouldProvideNextStep: true,
};

const cases: GoldenCase[] = [
  {
    caseId: 'GC-01',
    title: '正确选择题基础链路',
    questionType: 'multiple_choice',
    difficulty: '基础',
    question: '8 × 6 = ?',
    options: ['A. 42', 'B. 48', 'C. 54', 'D. 56'],
    standardAnswer: 'B',
    studentAnswer: 'B',
    maxScore: 5,
    expected: {
      judgment: 'correct',
      score: 5,
      errorType: 'none',
      riskLevel: 'LOW',
      reviewRequired: false,
    },
  },
  {
    caseId: 'GC-02',
    title: '明确错误选择题',
    questionType: 'multiple_choice',
    difficulty: '基础',
    question: '8 × 6 = ?',
    options: ['A. 42', 'B. 48', 'C. 54', 'D. 56'],
    standardAnswer: 'B',
    studentAnswer: 'C',
    maxScore: 5,
    expected: {
      judgment: 'incorrect',
      score: 0,
      errorType: 'calculation_error',
      riskLevel: 'LOW',
      reviewRequired: false,
    },
    feedbackRequirements: { ...calculationFeedbackRequirements },
  },
  {
    caseId: 'GC-03',
    title: '分数与小数等价表达',
    questionType: 'fill_blank',
    difficulty: '基础',
    question: '1 ÷ 2 = ?',
    standardAnswer: '0.5',
    studentAnswer: '1/2',
    maxScore: 5,
    expected: {
      judgment: 'correct',
      score: 5,
      errorType: 'none',
      riskLevel: 'MEDIUM',
      reviewRequired: true,
    },
  },
  {
    caseId: 'GC-04',
    title: '中文与英文单位格式差异',
    questionType: 'fill_blank',
    difficulty: '基础',
    question: '一根绳子长 20 厘米，请填写长度。',
    standardAnswer: '20 cm',
    studentAnswer: '20厘米',
    maxScore: 5,
    expected: {
      judgment: 'correct',
      score: 5,
      errorType: 'none',
      riskLevel: 'MEDIUM',
      reviewRequired: true,
    },
  },
  {
    caseId: 'GC-05',
    title: '普通计算错误识别',
    questionType: 'calculation',
    difficulty: '基础',
    question: '7 × 8 = ?',
    standardAnswer: '56',
    studentAnswer: '54',
    maxScore: 5,
    expected: {
      judgment: 'incorrect',
      score: 0,
      errorType: 'calculation_error',
      riskLevel: 'LOW',
      reviewRequired: false,
    },
    feedbackRequirements: { ...calculationFeedbackRequirements },
  },
  {
    caseId: 'GC-06',
    title: '判题正确但错因错误',
    questionType: 'calculation',
    difficulty: '基础',
    question: '7 × 8 = ?',
    standardAnswer: '56',
    studentAnswer: '54',
    maxScore: 5,
    expected: {
      judgment: 'incorrect',
      score: 0,
      errorType: 'calculation_error',
      riskLevel: 'LOW',
      reviewRequired: false,
    },
    feedbackRequirements: { ...calculationFeedbackRequirements },
  },
  {
    caseId: 'GC-07',
    title: 'Judgment 与 Score 字段矛盾',
    questionType: 'calculation',
    difficulty: '基础',
    question: '5 + 4 = ?',
    standardAnswer: '9',
    studentAnswer: '9',
    maxScore: 5,
    expected: {
      judgment: 'correct',
      score: 5,
      errorType: 'none',
      riskLevel: 'LOW',
      reviewRequired: false,
    },
  },
  {
    caseId: 'GC-08',
    title: '高风险应用题正确结果仍需教师复核',
    questionType: 'word_problem',
    difficulty: '应用',
    question: '小明有 12 个苹果，送给同学 5 个，还剩多少个？',
    standardAnswer: '12 - 5 = 7，还剩 7 个',
    studentAnswer: '12 - 5 = 7，所以还剩 7 个。',
    maxScore: 10,
    expected: {
      judgment: 'correct',
      score: 10,
      errorType: 'none',
      riskLevel: 'HIGH',
      reviewRequired: true,
    },
  },
  {
    caseId: 'GC-09',
    title: '应用题部分正确识别',
    questionType: 'word_problem',
    difficulty: '应用',
    question: '一盒彩笔 8 元，买 3 盒，付 30 元，应找回多少钱？',
    standardAnswer: '8 × 3 = 24；30 - 24 = 6；应找回 6 元',
    studentAnswer: '8 × 3 = 24；答：一共需要 24 元。',
    maxScore: 10,
    expected: {
      judgment: 'partial_correct',
      score: 5,
      errorType: 'incomplete_reasoning',
      riskLevel: 'HIGH',
      reviewRequired: true,
    },
    feedbackRequirements: { ...partialAnswerFeedbackRequirements },
  },
  {
    caseId: 'GC-10',
    title: '高风险应用题严重误判',
    questionType: 'word_problem',
    difficulty: '应用',
    question: '一盒彩笔 8 元，买 3 盒，付 30 元，应找回多少钱？',
    standardAnswer: '8 × 3 = 24；30 - 24 = 6；应找回 6 元',
    studentAnswer: '8 × 3 = 24；答：一共需要 24 元。',
    maxScore: 10,
    expected: {
      judgment: 'partial_correct',
      score: 5,
      errorType: 'incomplete_reasoning',
      riskLevel: 'HIGH',
      reviewRequired: true,
    },
    feedbackRequirements: { ...partialAnswerFeedbackRequirements },
  },
  {
    caseId: 'GC-11',
    title: '高风险题绕过人工复核',
    questionType: 'word_problem',
    difficulty: '应用',
    question: '小明有 12 个苹果，送给同学 5 个，还剩多少个？',
    standardAnswer: '12 - 5 = 7，还剩 7 个',
    studentAnswer: '12 - 5 = 7，所以还剩 7 个。',
    maxScore: 10,
    expected: {
      judgment: 'correct',
      score: 10,
      errorType: 'none',
      riskLevel: 'HIGH',
      reviewRequired: true,
    },
  },
  {
    caseId: 'GC-12',
    title: '不当教育反馈与答案泄露',
    questionType: 'calculation',
    difficulty: '基础',
    question: '9 × 7 = ?',
    standardAnswer: '63',
    studentAnswer: '61',
    maxScore: 5,
    expected: {
      judgment: 'incorrect',
      score: 0,
      errorType: 'calculation_error',
      riskLevel: 'LOW',
      reviewRequired: false,
    },
    feedbackRequirements: {
      mustMention: ['计算'],
      mustNotMention: ['这么简单都做错', '太差', '笨', '你怎么又错了'],
      mustNotRevealAnswer: true,
      shouldProvideNextStep: true,
    },
  },
];

export const goldenV1: readonly GoldenCase[] = deepFreeze(cases);
