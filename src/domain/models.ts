export type QuestionType =
  | 'multiple_choice'
  | 'fill_blank'
  | 'calculation'
  | 'word_problem';

export type Judgment = 'correct' | 'incorrect' | 'partial_correct';

export type ErrorType =
  | 'none'
  | 'calculation_error'
  | 'concept_error'
  | 'format_error'
  | 'incomplete_reasoning'
  | 'wrong_method';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReviewStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'MODIFIED';
export type CaseResult = 'PASS' | 'FAIL';
export type GateResult = 'PASS' | 'BLOCKED';

export type WorkflowState =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'SUBMITTED'
  | 'AI_GRADED'
  | 'CORRECTION_SUBMITTED'
  | 'TEACHER_REVIEWED'
  | 'COMPLETED';

export interface Question {
  id: 'Q1' | 'Q2' | 'Q3' | 'Q4' | string;
  questionType: QuestionType;
  prompt: string;
  options?: string[];
  standardAnswer: string;
  maxScore: number;
}

export interface Assignment {
  id: string;
  title: string;
  questions: Question[];
}

export interface StudentAnswer {
  questionId: string;
  answer: string;
}

export interface GradingResult {
  judgment: Judgment;
  score: number;
  errorType: ErrorType;
  feedback: string;
  riskLevel: RiskLevel;
  reviewRequired: boolean;
}

export interface FeedbackRequirements {
  mustMention?: string[];
  mustNotMention?: string[];
  mustNotRevealAnswer: boolean;
  shouldProvideNextStep: boolean;
}

export interface GoldenCase {
  caseId: `GC-${string}`;
  title: string;
  questionType: QuestionType;
  difficulty: string;
  question: string;
  options?: string[];
  standardAnswer: string;
  studentAnswer: string;
  maxScore: number;
  expected: Omit<GradingResult, 'feedback'>;
  feedbackRequirements?: FeedbackRequirements;
}

export interface EvaluationResult {
  caseId: string;
  judgmentPass: boolean;
  scorePass: boolean;
  reasonPass: boolean;
  feedbackPass: boolean;
  consistencyPass: boolean;
  riskPass: boolean;
  reviewPolicyPass: boolean;
  criticalError: boolean;
  failureReasons: string[];
  finalResult: CaseResult;
}

export interface DatasetEvaluation {
  actualResults: GradingResult[];
  evaluations: EvaluationResult[];
}

export interface TeacherPreReview {
  questionId: string;
  action: 'APPROVE' | 'MODIFY';
  originalAiScore: number;
  finalTeacherScore: number;
  originalAiFeedback: string;
  finalTeacherFeedback: string;
  reviewReason: string;
}

export interface TeacherFinalReview {
  action: 'PASS' | 'RETURN';
}

export type TeacherReview = TeacherPreReview | TeacherFinalReview;

export interface QuestionWorkflowResult {
  providerResult: GradingResult;
  publishedResult: GradingResult;
  reviewStatus: ReviewStatus;
}

export interface WorkflowContext {
  state: WorkflowState;
  assignment: Assignment;
  answers: StudentAnswer[];
  results: Record<string, QuestionWorkflowResult>;
  correction?: StudentAnswer;
  preReviews: Record<string, TeacherPreReview>;
  finalReview?: TeacherFinalReview;
}

export interface EvaluationMetrics {
  judgmentAccuracy: number;
  scoreAccuracy: number;
  reasonAccuracy: number;
  feedbackPassRate: number;
  consistencyPassRate: number;
  reviewPolicyPassRate: number;
  casePassRate: number;
  criticalErrorCount: number;
  reviewRate: number;
}

export interface EvaluationRun {
  runId: string;
  providerVersion: 'mock-v1' | 'mock-v2';
  promptVersion: 'grading-v1' | 'grading-v2';
  datasetVersion: 'golden-v1';
  startedAt: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  criticalErrors: number;
  metrics: EvaluationMetrics;
  gateResult: GateResult;
  results: EvaluationResult[];
}
