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
  '蠢',
  '真蠢',
  '不会',
  '连这个都不会',
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

const CHINESE_DIGITS: Readonly<Record<string, number>> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function parseChineseNumeral(value: string): number {
  if (!value.includes('十')) {
    return Number([...value].map((digit) => CHINESE_DIGITS[digit]).join(''));
  }

  const [tensPart, onesPart] = value.split('十');
  const tens = tensPart ? CHINESE_DIGITS[tensPart] : 1;
  const ones = onesPart ? CHINESE_DIGITS[onesPart] : 0;
  return tens * 10 + ones;
}

function normalizeAnswerFragment(value: string): string {
  return normalizeText(value)
    .replace(/[零〇一二三四五六七八九十]+/g, (numeral) =>
      String(parseChineseNumeral(numeral)),
    )
    .replace(/块钱|人民币/g, '元')
    .replace(/厘米/g, 'cm')
    .replace(/[＋﹢]/g, '+')
    .replace(/[－﹣−]/g, '-')
    .replace(/[\uff1a:]/g, '是')
    .replace(/[\u3002．，,；;！!？?]/g, '');
}

function extractFinalConclusion(standardAnswer: string): string {
  const answerSteps = standardAnswer
    .split(/[\r\n；;，,]+/)
    .map(normalizeAnswerFragment)
    .filter(Boolean);

  return answerSteps.at(-1) ?? '';
}

function extractNumericValues(value: string): number[] {
  return [...value.matchAll(/-?\d+(?:\.\d+)?/g)].map(([match]) =>
    Number(match),
  );
}

function containsConclusionCue(value: string): boolean {
  return /(?:正确答案|最终答案|答案)(?:是|为)?|(?:最终|计算)?结果(?:是|为)|(?:应|最后|最终)?找回(?:金额)?(?:是|为)?|还剩|剩余|可得|填入|填写|写在|写为/.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsNumericConclusion(value: string, finalNumber: number): boolean {
  const serializedNumber = escapeRegExp(String(finalNumber));
  const equivalentNumber = Number.isInteger(finalNumber)
    ? `${serializedNumber}(?:\\.0+)?`
    : serializedNumber;
  const leadingBoundary = finalNumber >= 0 ? '(?<![\\d.-])' : '(?<![\\d.])';
  const numberToken = `${leadingBoundary}${equivalentNumber}(?![\\d.])`;
  const cueBeforeValue = [
    '(?:正确答案|最终答案|答案)(?:是|为)?',
    '(?:最终|计算)?结果(?:是|为)?',
    '(?:应|最后|最终)?找回(?:的)?(?:金额)?(?:是|为)?',
    '(?:最后|最终)?(?:还剩|剩余)(?:是|为)?',
    '(?:试试|试着|尝试)(?:用|写|填)',
    '(?:改(?:成|为)|换成|写成|填成)',
    '(?:应该?|应当?)(?:会|能)?(?:得到|得出|拿到|获得|是)',
    '(?:最后|最终)(?:会|将)?(?:得到|得出|拿到|获得)',
    '(?:这样|这才|那才)(?:才)?(?:是|对)(?:答案)?',
    '可得',
    '填入',
    '填写',
  ].join('|');

  // A final-value cue and the value must be part of the same short expression.
  // This avoids coupling an instructional cue with an unrelated step or count
  // elsewhere in the feedback.
  const valueAfterCue = new RegExp(
    `(?:${cueBeforeValue})[^\\d.]{0,4}${numberToken}`,
  );
  const directWriteInstruction = new RegExp(
    `${numberToken}(?:元|个|cm)?[^\\d.]{0,4}(?:写在|写为)`,
  );
  const arithmeticConclusion = new RegExp(
    `(?<![\\d.])-?\\d+(?:[+\\-×*÷/]\\d+)+=${numberToken}(?:元|个|cm)?`,
  );

  return (
    valueAfterCue.test(value) ||
    directWriteInstruction.test(value) ||
    arithmeticConclusion.test(value)
  );
}

function containsAnswerLeakage(
  feedback: string,
  standardAnswer: string,
): boolean {
  const normalizedFeedback = normalizeAnswerFragment(feedback);
  const normalizedStandard = normalizeAnswerFragment(standardAnswer);
  const finalConclusion = extractFinalConclusion(standardAnswer);
  const finalNumbers = extractNumericValues(finalConclusion);
  const finalNumber = finalNumbers.at(-1);

  if (normalizedFeedback === normalizedStandard) {
    return true;
  }

  if (finalNumber !== undefined) {
    return containsNumericConclusion(normalizedFeedback, finalNumber);
  }

  const finalText = finalConclusion.replace(/^(?:正确)?答案(?:是|为)?/, '');

  return (
    finalText.length > 0 &&
    containsConclusionCue(normalizedFeedback) &&
    normalizedFeedback.includes(finalText)
  );
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
