import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../../src/App';
import type { GradingProvider } from '../../src/providers/grading-provider';
import { createMockV1Provider } from '../../src/providers/mock-v1-provider';

type DeferredProvider = GradingProvider & {
  pendingCount: () => number;
  release: () => void;
};

function createDeferredProvider(): DeferredProvider {
  const baseProvider = createMockV1Provider({ delayMs: 0 });
  const resolvers: Array<() => void> = [];

  return {
    providerVersion: 'mock-v1',
    promptVersion: 'grading-v1',
    async grade(input) {
      await new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
      return baseProvider.grade(input);
    },
    pendingCount: () => resolvers.length,
    release: () => {
      const pendingResolvers = resolvers.splice(0);
      pendingResolvers.forEach((resolve) => resolve());
    },
  };
}

async function moveToAiGraded(
  provider: GradingProvider = createMockV1Provider({ delayMs: 0 }),
) {
  const user = userEvent.setup();
  render(<App provider={provider} />);

  await user.click(screen.getByRole('button', { name: '发布作业' }));
  await user.click(screen.getByRole('tab', { name: '学生端' }));
  await user.click(screen.getByRole('button', { name: '提交四题答案' }));
  await user.click(screen.getByRole('tab', { name: '教师端' }));
  await user.click(screen.getByRole('button', { name: '开始 AI 批改' }));
  await screen.findByText('AI 批改完成');

  return user;
}

function misreportingProvider(): GradingProvider {
  const provider = createMockV1Provider({ delayMs: 0 });

  return {
    providerVersion: 'mock-v1',
    promptVersion: 'grading-v1',
    async grade(input) {
      const result = await provider.grade(input);
      if (input.question.id === 'Q4') {
        return { ...result, riskLevel: 'LOW', reviewRequired: false };
      }
      return result;
    },
  };
}

function questionCard(questionId: string) {
  return screen.getByTestId(`question-card-${questionId}`);
}

async function approveQuestion(
  user: ReturnType<typeof userEvent.setup>,
  questionId: string,
) {
  const card = questionCard(questionId);
  await user.click(
    within(card).getByRole('button', { name: '认可 AI 结果' }),
  );
}

describe('Phase 5 business workflow UI', () => {
  afterEach(() => {
    cleanup();
  });

  it('supports the teacher-to-student happy path through Q4 completion', async () => {
    const user = await moveToAiGraded();

    expect(screen.getByText('当前状态：AI_GRADED')).toBeInTheDocument();
    expect(within(questionCard('Q2')).getAllByText('待教师复核').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('tab', { name: '学生端' }));
    expect(within(questionCard('Q1')).getByText('回答正确。')).toBeInTheDocument();
    expect(within(questionCard('Q1')).queryByText('待订正')).not.toBeInTheDocument();
    expect(within(questionCard('Q3')).queryByText('待订正')).not.toBeInTheDocument();
    expect(
      within(questionCard('Q2')).getByText('该题正在由教师复核，完成后可查看反馈。'),
    ).toBeInTheDocument();
    expect(within(questionCard('Q2')).queryByText('回答正确。')).not.toBeInTheDocument();
    expect(
      within(questionCard('Q4')).getByText('该题正在由教师复核，完成后可查看反馈。'),
    ).toBeInTheDocument();
    expect(
      within(questionCard('Q4')).getByText('教师复核完成后，才能提交一次订正。'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '教师端' }));
    await approveQuestion(user, 'Q2');
    await approveQuestion(user, 'Q4');

    await user.click(screen.getByRole('tab', { name: '学生端' }));
    expect(
      within(questionCard('Q4')).getByText(
        '总价计算正确，还需要继续求找回多少钱，请检查下一步计算。',
      ),
    ).toBeInTheDocument();
    await user.click(within(questionCard('Q4')).getByRole('button', { name: '提交订正' }));

    expect(screen.getByText('当前状态：CORRECTION_SUBMITTED')).toBeInTheDocument();
    expect(
      within(questionCard('Q4')).getByRole('button', { name: '提交订正' }),
    ).toBeDisabled();

    await user.click(screen.getByRole('tab', { name: '教师端' }));
    await user.click(screen.getByRole('button', { name: '通过并完成' }));

    expect(screen.getByText('当前状态：COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('作业闭环完成')).toBeInTheDocument();
  });

  it('keeps Q4 correction unavailable while another required review is pending', async () => {
    const user = await moveToAiGraded();

    await approveQuestion(user, 'Q4');
    await user.click(screen.getByRole('tab', { name: '学生端' }));

    const q4 = questionCard('Q4');
    expect(within(q4).getByRole('button', { name: '提交订正' })).toBeDisabled();
    expect(
      within(q4).getByText('请先完成所有待教师复核结果，再提交订正。'),
    ).toBeInTheDocument();
  });

  it('shows an explicit Mock AI loading state while grading is in flight', async () => {
    const user = userEvent.setup();
    render(<App provider={createMockV1Provider({ delayMs: 30 })} />);

    await user.click(screen.getByRole('button', { name: '发布作业' }));
    await user.click(screen.getByRole('tab', { name: '学生端' }));
    await user.click(screen.getByRole('button', { name: '提交四题答案' }));
    await user.click(screen.getByRole('tab', { name: '教师端' }));
    await user.click(screen.getByRole('button', { name: '开始 AI 批改' }));

    expect(screen.getByText('AI 正在批改...')).toBeInTheDocument();
    await screen.findByText('AI 批改完成');
  });

  it('does not let a stale grading response overwrite a reset demo', async () => {
    const user = userEvent.setup();
    render(<App provider={createMockV1Provider({ delayMs: 40 })} />);

    await user.click(screen.getByRole('button', { name: '发布作业' }));
    await user.click(screen.getByRole('tab', { name: '学生端' }));
    await user.click(screen.getByRole('button', { name: '提交四题答案' }));
    await user.click(screen.getByRole('tab', { name: '教师端' }));
    await user.click(screen.getByRole('button', { name: '开始 AI 批改' }));
    await user.click(screen.getByRole('button', { name: '重置演示' }));

    expect(screen.getByText('当前状态：DRAFT')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.getByText('当前状态：DRAFT')).toBeInTheDocument();
    expect(screen.queryByText('AI 批改完成')).not.toBeInTheDocument();
  });

  it('keeps the current grading lock until a post-reset request finishes', async () => {
    const providerA = createDeferredProvider();
    const providerB = createDeferredProvider();
    const user = userEvent.setup();
    const { rerender } = render(<App provider={providerA} />);

    await user.click(screen.getByRole('button', { name: '发布作业' }));
    await user.click(screen.getByRole('tab', { name: '学生端' }));
    await user.click(screen.getByRole('button', { name: '提交四题答案' }));
    await user.click(screen.getByRole('tab', { name: '教师端' }));
    await user.click(screen.getByRole('button', { name: '开始 AI 批改' }));
    await waitFor(() => expect(providerA.pendingCount()).toBe(4));

    await user.click(screen.getByRole('button', { name: '重置演示' }));
    rerender(<App provider={providerB} />);
    await user.click(screen.getByRole('button', { name: '发布作业' }));
    await user.click(screen.getByRole('tab', { name: '学生端' }));
    await user.click(screen.getByRole('button', { name: '提交四题答案' }));
    await user.click(screen.getByRole('tab', { name: '教师端' }));
    await user.click(screen.getByRole('button', { name: '开始 AI 批改' }));
    await waitFor(() => expect(providerB.pendingCount()).toBe(4));

    await act(async () => {
      providerA.release();
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'AI 正在批改...' })).toBeDisabled();
    expect(screen.queryByText('AI 批改完成')).not.toBeInTheDocument();

    await act(async () => {
      providerB.release();
      await Promise.resolve();
    });
    await screen.findByText('AI 批改完成');
  });

  it('publishes teacher overrides while retaining the AI audit trail', async () => {
    const user = await moveToAiGraded();
    const card = questionCard('Q4');

    await user.clear(within(card).getByLabelText('Q4 最终分数'));
    await user.type(within(card).getByLabelText('Q4 最终分数'), '4');
    await user.clear(within(card).getByLabelText('Q4 教师反馈'));
    await user.type(
      within(card).getByLabelText('Q4 教师反馈'),
      '总价计算正确，请继续完成找回金额的计算。',
    );
    await user.type(within(card).getByLabelText('Q4 修改原因'), '补充下一步引导');
    await user.click(within(card).getByRole('button', { name: '修改后发布' }));

    expect(within(card).getByText('已修改发布')).toBeInTheDocument();
    expect(within(card).getByText('AI 原始分数：5')).toBeInTheDocument();
    expect(within(card).getByText('教师最终分数：4')).toBeInTheDocument();
    expect(within(card).getByText('AI 原始反馈')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '学生端' }));
    expect(
      within(questionCard('Q4')).getByText(
        '总价计算正确，请继续完成找回金额的计算。',
      ),
    ).toBeInTheDocument();
    expect(
      within(questionCard('Q4')).queryByText(
        '总价计算正确，还需要继续求找回多少钱，请检查下一步计算。',
      ),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '教师端' }));
    await approveQuestion(user, 'Q2');
    await user.click(screen.getByRole('tab', { name: '学生端' }));
    await user.click(within(questionCard('Q4')).getByRole('button', { name: '提交订正' }));
    await user.click(screen.getByRole('tab', { name: '教师端' }));

    const finalReviewPanel = screen.getByTestId('final-review-panel');
    expect(within(finalReviewPanel).getByText('总价计算正确，请继续完成找回金额的计算。')).toBeInTheDocument();
    expect(within(finalReviewPanel).queryByText('总价计算正确，还需要继续求找回多少钱，请检查下一步计算。')).not.toBeInTheDocument();
  });

  it('keeps final RETURN as a bounded branch without another correction or review', async () => {
    const user = await moveToAiGraded();
    await approveQuestion(user, 'Q4');
    await approveQuestion(user, 'Q2');
    await user.click(screen.getByRole('tab', { name: '学生端' }));
    await user.click(within(questionCard('Q4')).getByRole('button', { name: '提交订正' }));

    await user.click(screen.getByRole('tab', { name: '教师端' }));
    await user.click(screen.getByRole('button', { name: '退回订正' }));

    expect(screen.getByText('当前状态：CORRECTION_SUBMITTED')).toBeInTheDocument();
    expect(
      screen.getByText('已退回；Challenge MVP 不继续模拟第二轮订正。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '通过并完成' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '退回订正' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '学生端' }));
    expect(
      within(questionCard('Q4')).getByText('已退回；Challenge MVP 不继续模拟第二轮订正。'),
    ).toBeInTheDocument();
    expect(within(questionCard('Q4')).getByRole('button', { name: '提交订正' })).toBeDisabled();
  });

  it('resets the demo by creating a fresh DRAFT context', async () => {
    const user = await moveToAiGraded();

    await user.click(screen.getByRole('button', { name: '重置演示' }));

    expect(screen.getByText('当前状态：DRAFT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布作业' })).toBeInTheDocument();
    expect(screen.queryByText('AI 批改完成')).not.toBeInTheDocument();
  });

  it('uses Runtime Risk Policy visibility even when Provider reports Q4 as LOW', async () => {
    const user = await moveToAiGraded(misreportingProvider());

    await user.click(screen.getByRole('tab', { name: '学生端' }));

    const q4 = questionCard('Q4');
    expect(
      within(q4).getByText('该题正在由教师复核，完成后可查看反馈。'),
    ).toBeInTheDocument();
    expect(
      within(q4).queryByText(
        '总价计算正确，还需要继续求找回多少钱，请检查下一步计算。',
      ),
    ).not.toBeInTheDocument();
    expect(within(q4).queryByText('LOW')).not.toBeInTheDocument();
  });

  it('uses Mock V2 for the default business provider while the quality console keeps its own selector', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('Mock AI Provider · mock-v2')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'AI 质量控制台' }));
    const providerSelect = screen.getByRole('combobox', { name: 'Provider 版本' });
    expect(providerSelect).toHaveValue('mock-v1');
    expect(within(providerSelect).getByRole('option', { name: 'Mock V1 · Baseline' })).toBeInTheDocument();
    expect(within(providerSelect).getByRole('option', { name: 'Mock V2 · Regression' })).toBeInTheDocument();
  });
});
