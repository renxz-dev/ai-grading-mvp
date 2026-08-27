import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../../src/App';
import { createMockV1Provider } from '../../src/providers/mock-v1-provider';

function questionCard(questionId: string) {
  return screen.getByTestId(`question-card-${questionId}`);
}

async function reachAiGraded() {
  const user = userEvent.setup();
  render(<App provider={createMockV1Provider({ delayMs: 0 })} />);

  await user.click(screen.getByRole('button', { name: '发布作业' }));
  await user.click(screen.getByRole('tab', { name: '学生端' }));
  await user.click(screen.getByRole('button', { name: '提交四题答案' }));
  await user.click(screen.getByRole('tab', { name: '教师端' }));
  await user.click(screen.getByRole('button', { name: '开始 AI 批改' }));
  await screen.findByText('AI 批改完成');

  return user;
}

describe('Phase 7 delivery E2E integration', () => {
  afterEach(() => {
    cleanup();
  });

  it('completes the teacher-to-student business loop, then resets to a fresh draft', async () => {
    const user = await reachAiGraded();

    await user.click(screen.getByRole('tab', { name: '学生端' }));
    expect(within(questionCard('Q1')).getByText('回答正确。')).toBeInTheDocument();
    expect(within(questionCard('Q2')).getByText('该题正在由教师复核，完成后可查看反馈。')).toBeInTheDocument();
    expect(within(questionCard('Q4')).queryByText('总价计算正确，还需要继续求找回多少钱，请检查下一步计算。')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '教师端' }));
    await user.click(within(questionCard('Q2')).getByRole('button', { name: '认可 AI 结果' }));

    const q4 = questionCard('Q4');
    await user.clear(within(q4).getByLabelText('Q4 最终分数'));
    await user.type(within(q4).getByLabelText('Q4 最终分数'), '4');
    await user.clear(within(q4).getByLabelText('Q4 教师反馈'));
    await user.type(within(q4).getByLabelText('Q4 教师反馈'), '总价计算正确，请继续完成找回金额的计算。');
    await user.type(within(q4).getByLabelText('Q4 修改原因'), '教师补充下一步引导');
    await user.click(within(q4).getByRole('button', { name: '修改后发布' }));

    await user.click(screen.getByRole('tab', { name: '学生端' }));
    expect(within(questionCard('Q2')).getByText('回答正确。')).toBeInTheDocument();
    expect(within(questionCard('Q4')).getByText('总价计算正确，请继续完成找回金额的计算。')).toBeInTheDocument();
    expect(within(questionCard('Q4')).queryByText('总价计算正确，还需要继续求找回多少钱，请检查下一步计算。')).not.toBeInTheDocument();
    await user.click(within(questionCard('Q4')).getByRole('button', { name: '提交订正' }));

    expect(screen.getByText('当前状态：CORRECTION_SUBMITTED')).toBeInTheDocument();
    expect(within(questionCard('Q4')).getByRole('button', { name: '提交订正' })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: '教师端' }));
    await user.click(screen.getByRole('button', { name: '通过并完成' }));

    expect(screen.getByText('当前状态：COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('作业闭环完成')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重置演示' }));
    expect(screen.getByText('当前状态：DRAFT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布作业' })).toBeInTheDocument();
  });

  it('runs the real evaluation regression from V1 failure analysis to V2 gate pass', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: 'AI 质量控制台' }));

    await user.click(screen.getByRole('button', { name: '运行评测' }));
    await screen.findByText('评测完成');
    expect(screen.getByTestId('gate-result')).toHaveTextContent('BLOCKED');
    expect(screen.getByTestId('summary-total')).toHaveTextContent('12');
    expect(screen.getByTestId('summary-passed')).toHaveTextContent('7');
    expect(screen.getByTestId('summary-failed')).toHaveTextContent('5');
    expect(screen.getByTestId('summary-critical')).toHaveTextContent('4');

    await user.click(screen.getByTestId('case-row-GC-06'));
    const gc06 = screen.getByTestId('case-detail');
    expect(within(gc06).getByTestId('dimension-reason')).toHaveTextContent('FAIL');
    expect(within(gc06).getByTestId('dimension-feedback')).toHaveTextContent('FAIL');
    expect(within(gc06).getByTestId('detail-critical')).toHaveTextContent('NO');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Provider 版本' }), 'mock-v2');
    await user.click(screen.getByRole('button', { name: '运行评测' }));
    await screen.findByText('评测完成');
    expect(screen.getByTestId('gate-result')).toHaveTextContent('PASS');
    expect(screen.getByTestId('summary-total')).toHaveTextContent('12');
    expect(screen.getByTestId('summary-passed')).toHaveTextContent('12');
    expect(screen.getByTestId('summary-failed')).toHaveTextContent('0');
    expect(screen.getByTestId('summary-critical')).toHaveTextContent('0');
    expect(screen.getByTestId('regression-comparison')).toHaveTextContent('mock-v1 / grading-v1');
    expect(screen.getByTestId('regression-comparison')).toHaveTextContent('mock-v2 / grading-v2');
  });
});
