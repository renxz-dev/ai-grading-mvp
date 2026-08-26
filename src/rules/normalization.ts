const TRAILING_PUNCTUATION = /[。．，,；;：:！!？?]+$/g;

export function normalizeAnswer(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/厘米/g, 'cm')
    .replace(/\s+/g, '')
    .replace(TRAILING_PUNCTUATION, '');

  return normalized === '1/2' ? '0.5' : normalized;
}

export function areEquivalentAnswers(
  standardAnswer: string,
  studentAnswer: string,
): boolean {
  return normalizeAnswer(standardAnswer) === normalizeAnswer(studentAnswer);
}
