import type { GradingResult, Question } from '../domain/models';

export interface GradingInput {
  caseId?: string;
  question: Question;
  studentAnswer: string;
}

export interface GradingProvider {
  readonly providerVersion: 'mock-v1' | 'mock-v2';
  readonly promptVersion: 'grading-v1' | 'grading-v2';
  grade(input: GradingInput): Promise<GradingResult>;
}
