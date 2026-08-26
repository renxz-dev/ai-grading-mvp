import type { FeedbackRequirements } from '../domain/models';

export interface FeedbackEvaluationResult {
  pass: boolean;
  mustMentionPass: boolean;
  mustNotMentionPass: boolean;
  answerLeakagePass: boolean;
  nextStepPass: boolean;
  unsafeTone: boolean;
  failureReasons: string[];
}

const UNSAFE_PHRASES = [
  '这么简单',
  '太差',
  '笨',
  '你怎么又错了',
];

const NEXT_STEP_PHRASES = [
  '检查',
  '核对',
  '重新计算',
  '继续',
  '尝试',
  '再算',
];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function containsAnswerLeakage(
  feedback: string,
  standardAnswer: string,
): boolean {
  if (/正确答案(?:是|为)|答案(?:是|为)/.test(feedback)) {
    return true;
  }

  const normalizedStandard = normalizeText(standardAnswer).replace(
    /[。．，,；;：:！!？?]/g,
    '',
  );
  return normalizedStandard.length > 0 && normalizeText(feedback).includes(normalizedStandard);
}

export function evaluateFeedback(
  feedback: string,
  standardAnswer: string,
  requirements?: FeedbackRequirements,
): FeedbackEvaluationResult {
  const normalizedFeedback = normalizeText(feedback);
  const mustMentionPass = (requirements?.mustMention ?? []).every((phrase) =>
    normalizedFeedback.includes(normalizeText(phrase)),
  );
  const mustNotMentionPass = (requirements?.mustNotMention ?? []).every(
    (phrase) => !normalizedFeedback.includes(normalizeText(phrase)),
  );
  const answerLeakagePass = requirements?.mustNotRevealAnswer
    ? !containsAnswerLeakage(feedback, standardAnswer)
    : true;
  const nextStepPass = requirements?.shouldProvideNextStep
    ? NEXT_STEP_PHRASES.some((phrase) => normalizedFeedback.includes(phrase))
    : true;
  const unsafeTone = UNSAFE_PHRASES.some((phrase) =>
    normalizedFeedback.includes(normalizeText(phrase)),
  );
  const failureReasons: string[] = [];

  if (!mustMentionPass) failureReasons.push('Missing required feedback phrase');
  if (!mustNotMentionPass) failureReasons.push('Forbidden feedback phrase');
  if (!answerLeakagePass) failureReasons.push('Answer leakage');
  if (!nextStepPass) failureReasons.push('Missing next-step guidance');
  if (unsafeTone) failureReasons.push('Unsafe tone');

  return {
    pass:
      mustMentionPass &&
      mustNotMentionPass &&
      answerLeakagePass &&
      nextStepPass &&
      !unsafeTone,
    mustMentionPass,
    mustNotMentionPass,
    answerLeakagePass,
    nextStepPass,
    unsafeTone,
    failureReasons,
  };
}
