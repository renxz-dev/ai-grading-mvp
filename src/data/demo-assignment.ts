import type { Assignment, StudentAnswer } from '../domain/models';

export const demoAssignment: Assignment = {
  id: 'ai-grading-demo',
  title: 'AI 智能作业批改 MVP',
  questions: [
    {
      id: 'Q1',
      questionType: 'multiple_choice',
      prompt: '8 × 6 = ?',
      options: ['A. 42', 'B. 48', 'C. 54', 'D. 56'],
      standardAnswer: 'B',
      maxScore: 5,
    },
    {
      id: 'Q2',
      questionType: 'fill_blank',
      prompt: '1 ÷ 2 = ?',
      standardAnswer: '0.5',
      maxScore: 5,
    },
    {
      id: 'Q3',
      questionType: 'calculation',
      prompt: '7 × 8 = ?',
      standardAnswer: '56',
      maxScore: 5,
    },
    {
      id: 'Q4',
      questionType: 'word_problem',
      prompt: '一盒彩笔 8 元，买 3 盒，付 30 元，应找回多少钱？',
      standardAnswer: '8 × 3 = 24\n30 - 24 = 6\n应找回 6 元',
      maxScore: 10,
    },
  ],
};

export const initialStudentAnswers: StudentAnswer[] = [
  { questionId: 'Q1', answer: 'B' },
  { questionId: 'Q2', answer: '1/2' },
  { questionId: 'Q3', answer: '54' },
  {
    questionId: 'Q4',
    answer: '8 × 3 = 24\n答：一共需要 24 元。',
  },
];

export const q4CorrectionAnswer: StudentAnswer = {
  questionId: 'Q4',
  answer: '8 × 3 = 24\n30 - 24 = 6\n应找回 6 元。',
};
