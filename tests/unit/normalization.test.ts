import { describe, expect, it } from 'vitest';
import {
  areEquivalentAnswers,
  normalizeAnswer,
} from '../../src/rules/normalization';

describe('answer normalization', () => {
  it('normalizes whitespace, punctuation and the frozen unit format', () => {
    expect(normalizeAnswer(' 20 厘米。 ')).toBe('20cm');
    expect(areEquivalentAnswers('20 cm', '20厘米')).toBe(true);
  });

  it('treats the frozen fraction and decimal as equivalent', () => {
    expect(areEquivalentAnswers('0.5', '1/2')).toBe(true);
  });

  it('does not treat different ordinary answers as equivalent', () => {
    expect(areEquivalentAnswers('56', '54')).toBe(false);
  });
});
