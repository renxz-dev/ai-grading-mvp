import { describe, expect, it } from 'vitest';
import { goldenV1 } from '../../src/data/golden-v1';
import { runEvaluation } from '../../src/evaluation/evaluation-run';
import { createMockV2Provider } from '../../src/providers/mock-v2-provider';

describe('evaluation run traceability', () => {
  it('records the dataset version supplied by the caller', async () => {
    const run = await runEvaluation(
      createMockV2Provider({ delayMs: 0 }),
      [goldenV1[0]],
      'traceability-fixture-v2',
      '2026-08-27T00:00:00.000Z',
    );

    expect(run.datasetVersion).toBe('traceability-fixture-v2');
  });
});
