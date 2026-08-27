import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { GOLDEN_DATASET_VERSION, goldenV1 } from '../../src/data/golden-v1';
import type { EvaluationRun } from '../../src/domain/models';
import { runEvaluation } from '../../src/evaluation/evaluation-run';
import { createMockV1Provider } from '../../src/providers/mock-v1-provider';

async function openDashboard() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'AI 质量控制台' }));
  return user;
}

async function runSelectedEvaluation(
  user: ReturnType<typeof userEvent.setup>,
  providerVersion: 'mock-v1' | 'mock-v2',
) {
  await user.selectOptions(screen.getByRole('combobox', { name: 'Provider 版本' }), providerVersion);
  await user.click(screen.getByRole('button', { name: '运行评测' }));
  await screen.findByText('评测完成');
}

describe('Phase 6 AI quality dashboard', () => {
  afterEach(() => {
    cleanup();
  });

  it('runs Mock V1 through the real Evaluation Engine and shows dynamic baseline results', async () => {
    const user = await openDashboard();
    await runSelectedEvaluation(user, 'mock-v1');

    expect(screen.getByTestId('summary-total')).toHaveTextContent('12');
    expect(screen.getByTestId('summary-passed')).toHaveTextContent('7');
    expect(screen.getByTestId('summary-failed')).toHaveTextContent('5');
    expect(screen.getByTestId('summary-critical')).toHaveTextContent('4');
    expect(screen.getByTestId('gate-result')).toHaveTextContent('BLOCKED');
    expect(screen.getByText('Provider：mock-v1')).toBeInTheDocument();
    expect(screen.getByText('Prompt：grading-v1')).toBeInTheDocument();
    expect(screen.getByText('Dataset：golden-v1')).toBeInTheDocument();

    for (const caseId of ['GC-06', 'GC-07', 'GC-10', 'GC-11', 'GC-12']) {
      expect(screen.getByTestId(`case-row-${caseId}`)).toHaveTextContent('FAIL');
    }
    expect(screen.getByText('golden-v1 是 Challenge MVP 的 12 条风险导向 Demo Golden Cases。')).toBeInTheDocument();
    expect(screen.getByText('当前结果用于回归与质量门禁，不代表生产环境统计准确率。')).toBeInTheDocument();
    expect(screen.getByText('Mock V1 / V2 用于复现固定 AI Quality Failure 与 Regression 修复效果。')).toBeInTheDocument();
  });

  it('filters failed cases and explains GC-06 as a non-critical quality failure', async () => {
    const user = await openDashboard();
    await runSelectedEvaluation(user, 'mock-v1');

    await user.click(screen.getByRole('button', { name: '仅失败' }));
    expect(screen.queryByTestId('case-row-GC-01')).not.toBeInTheDocument();
    expect(screen.getByTestId('case-row-GC-06')).toBeInTheDocument();

    await user.click(screen.getByTestId('case-row-GC-06'));
    const detail = screen.getByTestId('case-detail');
    expect(within(detail).getByText('GC-06')).toBeInTheDocument();
    expect(within(detail).getByTestId('dimension-reason')).toHaveTextContent('FAIL');
    expect(within(detail).getByTestId('dimension-feedback')).toHaveTextContent('FAIL');
    expect(within(detail).getByTestId('detail-critical')).toHaveTextContent('NO');
    expect(within(detail).getByTestId('detail-final-result')).toHaveTextContent('FAIL');
  });

  it('shows consistency, review-policy, and unsafe feedback failures with Critical status', async () => {
    const user = await openDashboard();
    await runSelectedEvaluation(user, 'mock-v1');

    await user.click(screen.getByTestId('case-row-GC-07'));
    let detail = screen.getByTestId('case-detail');
    expect(within(detail).getByTestId('dimension-consistency')).toHaveTextContent('FAIL');
    expect(within(detail).getByTestId('detail-critical')).toHaveTextContent('YES');

    await user.click(screen.getByTestId('case-row-GC-11'));
    detail = screen.getByTestId('case-detail');
    expect(within(detail).getByTestId('dimension-review-policy')).toHaveTextContent('FAIL');
    expect(within(detail).getByTestId('detail-critical')).toHaveTextContent('YES');

    await user.click(screen.getByTestId('case-row-GC-12'));
    detail = screen.getByTestId('case-detail');
    expect(within(detail).getByTestId('dimension-feedback')).toHaveTextContent('FAIL');
    expect(within(detail).getByTestId('detail-critical')).toHaveTextContent('YES');
    expect(within(detail).getByText('Unsafe feedback tone')).toBeInTheDocument();
    expect(within(detail).getByText('Feedback leaked the answer')).toBeInTheDocument();
  });

  it('runs Mock V2 through the same golden-v1 and shows a passing regression', async () => {
    const user = await openDashboard();
    await runSelectedEvaluation(user, 'mock-v1');
    await runSelectedEvaluation(user, 'mock-v2');

    expect(screen.getByTestId('summary-total')).toHaveTextContent('12');
    expect(screen.getByTestId('summary-passed')).toHaveTextContent('12');
    expect(screen.getByTestId('summary-failed')).toHaveTextContent('0');
    expect(screen.getByTestId('summary-critical')).toHaveTextContent('0');
    expect(screen.getByTestId('gate-result')).toHaveTextContent('PASS');
    expect(screen.getByText('Provider：mock-v2')).toBeInTheDocument();
    expect(screen.getByText('Prompt：grading-v2')).toBeInTheDocument();
    expect(screen.getByTestId('regression-comparison')).toHaveTextContent('mock-v1 / grading-v1');
    expect(screen.getByTestId('regression-comparison')).toHaveTextContent('mock-v2 / grading-v2');
  });

  it('renders summary numbers returned by the supplied Evaluation Runner', async () => {
    const baseline = await runEvaluation(
      createMockV1Provider({ delayMs: 0 }),
      goldenV1,
      GOLDEN_DATASET_VERSION,
      '2026-08-27T00:00:00.000Z',
    );
    const customRun: EvaluationRun = {
      ...baseline,
      totalCases: 99,
      passedCases: 88,
      failedCases: 11,
      criticalErrors: 2,
      gateResult: 'BLOCKED',
      metrics: { ...baseline.metrics, casePassRate: 88 / 99 },
    };
    const evaluationRunner = vi.fn().mockResolvedValue(customRun);
    const user = userEvent.setup();
    render(<App evaluationRunner={evaluationRunner} />);
    await user.click(screen.getByRole('tab', { name: 'AI 质量控制台' }));
    await user.click(screen.getByRole('button', { name: '运行评测' }));
    await screen.findByText('评测完成');

    expect(evaluationRunner).toHaveBeenCalledOnce();
    expect(screen.getByTestId('summary-total')).toHaveTextContent('99');
    expect(screen.getByTestId('summary-passed')).toHaveTextContent('88');
    expect(screen.getByTestId('summary-failed')).toHaveTextContent('11');
    expect(screen.getByTestId('summary-critical')).toHaveTextContent('2');
  });
});
