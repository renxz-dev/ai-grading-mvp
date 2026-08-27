import type {
  EvaluationRun,
  GoldenCase,
} from '../domain/models';
import type { GradingProvider } from '../providers/grading-provider';
import { evaluateDataset } from './evaluation-engine';
import { calculateMetrics } from './metrics';
import { evaluateReleaseGate } from './release-gate';

export async function runEvaluation(
  provider: GradingProvider,
  dataset: readonly GoldenCase[],
  datasetVersion: string,
  startedAt = new Date().toISOString(),
): Promise<EvaluationRun> {
  const { actualResults, evaluations } = await evaluateDataset(dataset, provider);
  const metrics = calculateMetrics(dataset, evaluations);
  const gateResult = evaluateReleaseGate({
    dataset,
    actualResults,
    evaluations,
    metrics,
  });
  const passedCases = evaluations.filter(
    ({ finalResult }) => finalResult === 'PASS',
  ).length;

  return {
    runId: `${provider.providerVersion}:${startedAt}`,
    providerVersion: provider.providerVersion,
    promptVersion: provider.promptVersion,
    datasetVersion,
    startedAt,
    totalCases: dataset.length,
    passedCases,
    failedCases: dataset.length - passedCases,
    criticalErrors: metrics.criticalErrorCount,
    metrics,
    gateResult,
    results: evaluations,
  };
}
