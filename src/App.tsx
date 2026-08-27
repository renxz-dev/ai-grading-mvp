import { useMemo, useRef, useState } from 'react';
import type {
  GradingResult,
  ReviewStatus,
  WorkflowContext,
} from './domain/models';
import {
  demoAssignment,
  initialStudentAnswers,
  q4CorrectionAnswer,
} from './data/demo-assignment';
import type { GradingProvider } from './providers/grading-provider';
import { createMockV2Provider } from './providers/mock-v2-provider';
import EvaluationDashboard from './components/EvaluationDashboard';
import type { EvaluationRunner } from './components/EvaluationDashboard';
import { runEvaluation } from './evaluation/evaluation-run';
import {
  completeWorkflow,
  createWorkflowContext,
  getFinalReviewNotice,
  getStudentFeedback,
  gradeSubmission,
  publishAssignment,
  reviewAiResult,
  submitAnswers,
  submitCorrection,
  submitFinalReview,
} from './workflow/workflow';
import './styles.css';

export interface AppProps {
  provider?: GradingProvider;
  evaluationRunner?: EvaluationRunner;
}

type Role = 'TEACHER' | 'STUDENT' | 'QUALITY';
type ReviewDraftField = 'score' | 'feedback' | 'reason';

type ReviewDraft = {
  score: string;
  feedback: string;
  reason: string;
};

const reviewStatusLabels: Record<ReviewStatus, string> = {
  NOT_REQUIRED: '无需复核',
  PENDING: '待教师复核',
  APPROVED: '已认可',
  MODIFIED: '已修改发布',
};

const workflowHints: Record<WorkflowContext['state'], string> = {
  DRAFT: '教师还可以调整作业内容，准备好后发布给学生。',
  PUBLISHED: '作业已发布，等待学生提交四道题的答案。',
  SUBMITTED: '学生答案已提交，教师可以启动 Mock AI 批改。',
  AI_GRADED: 'AI 已完成批改；低风险结果可见，高风险结果等待教师接管。',
  CORRECTION_SUBMITTED: '学生已提交一次订正，等待教师完成最终复核。',
  TEACHER_REVIEWED: '教师已通过订正，可以完成本次演示闭环。',
  COMPLETED: '本次作业演示已完成。',
};

function displayAnswer(context: WorkflowContext, questionId: string): string {
  return (
    context.answers.find((answer) => answer.questionId === questionId)?.answer ??
    '尚未提交'
  );
}

function resultMetric(result: GradingResult | undefined, key: keyof GradingResult): string {
  if (!result) {
    return '—';
  }

  const value = result[key];
  return typeof value === 'boolean' ? (value ? '是' : '否') : String(value);
}

function ErrorNotice({ message }: { message: string | undefined }) {
  if (!message) {
    return null;
  }

  return (
    <p className="notice notice-info" role="status">
      {message}
    </p>
  );
}

export default function App({ provider, evaluationRunner: evaluationRunnerProp }: AppProps = {}) {
  const activeProvider = useMemo(
    () => provider ?? createMockV2Provider(),
    [provider],
  );
  const evaluationRunner = evaluationRunnerProp ?? runEvaluation;
  const [context, setContext] = useState<WorkflowContext>(() =>
    createWorkflowContext(demoAssignment),
  );
  const [role, setRole] = useState<Role>('TEACHER');
  const [studentAnswerDrafts, setStudentAnswerDrafts] = useState<Record<string, string>>(
    () => Object.fromEntries(initialStudentAnswers.map(({ questionId, answer }) => [questionId, answer])),
  );
  const [correctionDraft, setCorrectionDraft] = useState(q4CorrectionAnswer.answer);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
  const [isGrading, setIsGrading] = useState(false);
  const [notice, setNotice] = useState<string>();
  const demoGeneration = useRef(0);

  function showError(error: unknown) {
    setNotice(error instanceof Error ? error.message : '操作未完成，请稍后重试。');
  }

  function transition(
    operation: (current: WorkflowContext) => WorkflowContext,
    successMessage?: string,
  ) {
    try {
      setContext(operation(context));
      setNotice(successMessage);
    } catch (error) {
      showError(error);
    }
  }

  function handlePublish() {
    transition(publishAssignment, '作业已发布给学生。');
  }

  function handleSubmitAnswers() {
    transition(
      (current) =>
        submitAnswers(
          current,
          demoAssignment.questions.map((question) => ({
            questionId: question.id,
            answer: studentAnswerDrafts[question.id] ?? '',
          })),
        ),
      '四道题答案已提交。',
    );
  }

  async function handleGrade() {
    if (isGrading) {
      return;
    }

    setIsGrading(true);
    setNotice(undefined);
    const gradingGeneration = demoGeneration.current;
    try {
      const gradedContext = await gradeSubmission(context, activeProvider);
      if (gradingGeneration !== demoGeneration.current) {
        return;
      }
      setContext(gradedContext);
      setNotice('AI 批改完成');
    } catch (error) {
      if (gradingGeneration === demoGeneration.current) {
        showError(error);
      }
    } finally {
      if (gradingGeneration === demoGeneration.current) {
        setIsGrading(false);
      }
    }
  }

  function updateReviewDraft(
    questionId: string,
    field: ReviewDraftField,
    value: string,
    result: GradingResult,
  ) {
    setReviewDrafts((current) => ({
      ...current,
      [questionId]: {
        score: current[questionId]?.score ?? String(result.score),
        feedback: current[questionId]?.feedback ?? result.feedback,
        reason: current[questionId]?.reason ?? '',
        [field]: value,
      },
    }));
  }

  function handlePreReview(questionId: string, action: 'APPROVE' | 'MODIFY') {
    const result = context.results[questionId];
    if (!result) {
      return;
    }

    const draft = reviewDrafts[questionId] ?? {
      score: String(result.providerResult.score),
      feedback: result.providerResult.feedback,
      reason: '',
    };

    transition(
      (current) =>
        reviewAiResult(current, questionId, {
          action,
          reviewReason:
            action === 'APPROVE' ? '教师确认 AI 结果' : draft.reason,
          ...(action === 'MODIFY'
            ? {
                finalTeacherScore: Number(draft.score),
                finalTeacherFeedback: draft.feedback,
              }
            : {}),
        }),
      action === 'APPROVE'
        ? '已认可 AI 结果，Feedback 已发布。'
        : '已使用教师修改结果发布 Feedback。',
    );
  }

  function handleCorrection() {
    transition(
      (current) =>
        submitCorrection(current, {
          questionId: q4CorrectionAnswer.questionId,
          answer: correctionDraft,
        }),
      '订正已提交，等待教师最终复核。',
    );
  }

  function handleFinalReview(action: 'PASS' | 'RETURN') {
    try {
      const reviewed = submitFinalReview(context, action);
      if (action === 'PASS') {
        setContext(completeWorkflow(reviewed));
        setNotice('教师已通过订正，作业闭环完成。');
      } else {
        setContext(reviewed);
        // The bounded RETURN notice is rendered beside the final-review controls
        // (and in the student's Q4 card), so it is not duplicated globally.
        setNotice(undefined);
      }
    } catch (error) {
      showError(error);
    }
  }

  function resetDemo() {
    demoGeneration.current += 1;
    setContext(createWorkflowContext(demoAssignment));
    setRole('TEACHER');
    setStudentAnswerDrafts(
      Object.fromEntries(
        initialStudentAnswers.map(({ questionId, answer }) => [questionId, answer]),
      ),
    );
    setCorrectionDraft(q4CorrectionAnswer.answer);
    setReviewDrafts({});
    setIsGrading(false);
    setNotice('演示已重置。');
  }

  const finalReviewNotice = getFinalReviewNotice(context);
  const hasPendingPreReviews = Object.values(context.results).some(
    ({ reviewStatus }) => reviewStatus === 'PENDING',
  );

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">CHALLENGE MVP · BUSINESS WORKFLOW</p>
          <h1>AI 智能作业批改 MVP</h1>
          <p className="hero-copy">
            用一条可重复演示的作业链路，展示 AI 批改、风险兜底与教师接管如何协作。
          </p>
        </div>
        <div className="hero-meta">
          <span className="provider-chip">Mock AI Provider · {activeProvider.providerVersion}</span>
          <span>固定教师 · 固定学生</span>
        </div>
      </header>

      <section className="control-bar" aria-label="演示控制">
        <div className="role-tabs" role="tablist" aria-label="角色视图">
          <button
            className={role === 'TEACHER' ? 'tab is-active' : 'tab'}
            type="button"
            role="tab"
            aria-selected={role === 'TEACHER'}
            onClick={() => setRole('TEACHER')}
          >
            教师端
          </button>
          <button
            className={role === 'STUDENT' ? 'tab is-active' : 'tab'}
            type="button"
            role="tab"
            aria-selected={role === 'STUDENT'}
            onClick={() => setRole('STUDENT')}
          >
            学生端
          </button>
          <button
            className={role === 'QUALITY' ? 'tab is-active' : 'tab'}
            type="button"
            role="tab"
            aria-selected={role === 'QUALITY'}
            onClick={() => setRole('QUALITY')}
          >
            AI 质量控制台
          </button>
        </div>
        <div className="control-actions">
          {role !== 'QUALITY' && <span className="state-pill">当前状态：{context.state}</span>}
          <button className="button button-quiet" type="button" onClick={resetDemo}>
            重置演示
          </button>
        </div>
      </section>

      {role !== 'QUALITY' && (
        <section className="workflow-banner" aria-label="当前流程">
          <div>
            <span className="section-kicker">WORKFLOW CONTEXT</span>
            <p>{workflowHints[context.state]}</p>
          </div>
          <div className="workflow-track" aria-label="状态流转">
            <span className={context.state === 'DRAFT' ? 'track-step is-current' : 'track-step'}>DRAFT</span>
            <span className="track-arrow">→</span>
            <span className={context.state === 'PUBLISHED' ? 'track-step is-current' : 'track-step'}>PUBLISHED</span>
            <span className="track-arrow">→</span>
            <span className={context.state === 'SUBMITTED' ? 'track-step is-current' : 'track-step'}>SUBMITTED</span>
            <span className="track-arrow">→</span>
            <span className={context.state === 'AI_GRADED' ? 'track-step is-current' : 'track-step'}>AI_GRADED</span>
            <span className="track-arrow">→</span>
            <span className={context.state === 'CORRECTION_SUBMITTED' ? 'track-step is-current' : 'track-step'}>CORRECTION_SUBMITTED</span>
            <span className="track-arrow">→</span>
            <span className={context.state === 'TEACHER_REVIEWED' ? 'track-step is-current' : 'track-step'}>TEACHER_REVIEWED</span>
            <span className="track-arrow">→</span>
            <span className={context.state === 'COMPLETED' ? 'track-step is-current' : 'track-step'}>COMPLETED</span>
          </div>
        </section>
      )}

      {role !== 'QUALITY' && <ErrorNotice message={notice} />}

      {role === 'QUALITY' ? (
        <EvaluationDashboard evaluationRunner={evaluationRunner} />
      ) : role === 'TEACHER' ? (
        <section aria-labelledby="teacher-view-title">
          <div className="view-heading">
            <div>
              <span className="section-kicker">TEACHER VIEW</span>
              <h2 id="teacher-view-title">教师工作台</h2>
              <p>查看 AI 原始结果，按风险决定是否接管，再确认学生订正。</p>
            </div>
            {context.state === 'DRAFT' && (
              <button className="button button-primary" type="button" onClick={handlePublish}>
                发布作业
              </button>
            )}
            {context.state === 'SUBMITTED' && (
              <button className="button button-primary" type="button" onClick={handleGrade} disabled={isGrading}>
                {isGrading ? 'AI 正在批改...' : '开始 AI 批改'}
              </button>
            )}
          </div>

          <section className="assignment-summary" aria-label="作业信息">
            <div>
              <span className="summary-label">作业标题</span>
              <strong>{context.assignment.title}</strong>
            </div>
            <div>
              <span className="summary-label">题目数量</span>
              <strong>{context.assignment.questions.length} 道</strong>
            </div>
            <div>
              <span className="summary-label">当前角色</span>
              <strong>固定教师</strong>
            </div>
          </section>

          <div className="question-list">
            {context.assignment.questions.map((question) => {
              const result = context.results[question.id];
              const preReview = context.preReviews[question.id];
              const draft = reviewDrafts[question.id] ?? {
                score: result ? String(result.providerResult.score) : '',
                feedback: result?.providerResult.feedback ?? '',
                reason: '',
              };

              return (
                <article className="question-card" data-testid={`question-card-${question.id}`} key={question.id}>
                  <div className="question-card-header">
                    <div>
                      <span className="question-id">{question.id}</span>
                      <h3>{question.prompt}</h3>
                    </div>
                    <span className="type-label">{question.questionType}</span>
                  </div>
                  {question.options && (
                    <ul className="options-list">
                      {question.options.map((option) => <li key={option}>{option}</li>)}
                    </ul>
                  )}
                  <div className="answer-block">
                    <span className="field-label">学生原始答案</span>
                    <pre>{displayAnswer(context, question.id)}</pre>
                  </div>

                  {result ? (
                    <>
                      <div className="metric-grid">
                        <div className="metric"><span>AI Judgment</span><strong>{resultMetric(result.providerResult, 'judgment')}</strong></div>
                        <div className="metric"><span>AI Score</span><strong>{resultMetric(result.providerResult, 'score')} / {question.maxScore}</strong></div>
                        <div className="metric"><span>Error Type</span><strong>{resultMetric(result.providerResult, 'errorType')}</strong></div>
                        <div className="metric"><span>Runtime Risk Level</span><strong className={`risk risk-${result.publishedResult.riskLevel.toLowerCase()}`}>{result.publishedResult.riskLevel}</strong></div>
                        <div className="metric"><span>是否需要人工复核</span><strong>{result.publishedResult.reviewRequired ? '是' : '否'}</strong></div>
                        <div className="metric"><span>Review Status</span><strong className={`review-status review-${result.reviewStatus.toLowerCase()}`}><span>{result.reviewStatus}</span><span className="status-label">{reviewStatusLabels[result.reviewStatus]}</span></strong></div>
                      </div>
                      <div className="provider-comparison">
                        <span>Provider 自报风险：{result.providerResult.riskLevel}</span>
                        <span>Runtime 决策风险：{result.publishedResult.riskLevel}</span>
                      </div>
                      <div className="feedback-panel feedback-panel-ai">
                        <span className="field-label">AI Feedback</span>
                        <p>{result.providerResult.feedback}</p>
                      </div>

                      {result.reviewStatus === 'PENDING' && (
                        <div className="review-panel">
                          <div className="review-panel-heading">
                            <div>
                              <span className="review-status review-pending">待教师复核</span>
                              <p>MEDIUM / HIGH 结果在教师确认前不会触达学生。</p>
                            </div>
                            <button className="button button-secondary" type="button" onClick={() => handlePreReview(question.id, 'APPROVE')}>
                              认可 AI 结果
                            </button>
                          </div>
                          <div className="override-fields">
                            <label htmlFor={`${question.id}-score`}>{question.id} 最终分数</label>
                            <input
                              id={`${question.id}-score`}
                              type="number"
                              min={0}
                              max={question.maxScore}
                              value={draft.score}
                              onChange={(event) => updateReviewDraft(question.id, 'score', event.target.value, result.providerResult)}
                            />
                            <label htmlFor={`${question.id}-feedback`}>{question.id} 教师反馈</label>
                            <textarea
                              id={`${question.id}-feedback`}
                              rows={3}
                              value={draft.feedback}
                              onChange={(event) => updateReviewDraft(question.id, 'feedback', event.target.value, result.providerResult)}
                            />
                            <label htmlFor={`${question.id}-reason`}>{question.id} 修改原因</label>
                            <textarea
                              id={`${question.id}-reason`}
                              rows={2}
                              value={draft.reason}
                              onChange={(event) => updateReviewDraft(question.id, 'reason', event.target.value, result.providerResult)}
                            />
                            <button className="button button-primary" type="button" onClick={() => handlePreReview(question.id, 'MODIFY')}>
                              修改后发布
                            </button>
                          </div>
                        </div>
                      )}

                      {preReview && (
                        <div className="audit-trail">
                          <div className="audit-heading">
                            <span className="section-kicker">HUMAN OVERRIDE AUDIT TRAIL</span>
                            <strong>{preReview.action === 'APPROVE' ? '教师认可 AI 结果' : '教师修改后发布'}</strong>
                          </div>
                          <div className="audit-grid">
                            <div><span>AI 原始分数</span><strong>AI 原始分数：{preReview.originalAiScore}</strong></div>
                            <div><span>教师最终分数</span><strong>教师最终分数：{preReview.finalTeacherScore}</strong></div>
                            <div><span>AI 原始反馈</span><p>{preReview.originalAiFeedback}</p></div>
                            <div><span>教师最终反馈</span><p>{preReview.finalTeacherFeedback}</p></div>
                            <div><span>Review Reason</span><p>{preReview.reviewReason}</p></div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="empty-result">AI 结果将在学生提交后生成。</p>
                  )}
                </article>
              );
            })}
          </div>

          {context.state === 'CORRECTION_SUBMITTED' && context.correction && (
            <section className="final-review-panel" aria-labelledby="final-review-title" data-testid="final-review-panel">
              <div className="view-heading compact-heading">
                <div>
                  <span className="section-kicker">FINAL REVIEW</span>
                  <h2 id="final-review-title">教师最终复核 · Q4</h2>
                  <p>确认学生订正结果，PASS 后完成业务闭环；RETURN 仅保留受限演示分支。</p>
                </div>
                {!finalReviewNotice && (
                  <div className="final-review-actions">
                    <button className="button button-primary" type="button" onClick={() => handleFinalReview('PASS')}>
                      通过并完成
                    </button>
                    <button className="button button-danger" type="button" onClick={() => handleFinalReview('RETURN')}>
                      退回订正
                    </button>
                  </div>
                )}
              </div>
              <div className="final-review-grid">
                <div><span className="field-label">原始答案</span><pre>{displayAnswer(context, 'Q4')}</pre></div>
                <div><span className="field-label">已发布 Feedback</span><p>{context.results.Q4?.publishedResult.feedback}</p></div>
                <div><span className="field-label">学生一次订正</span><pre>{context.correction.answer}</pre></div>
              </div>
              {finalReviewNotice && <p className="notice notice-warning">{finalReviewNotice}</p>}
            </section>
          )}

          {context.state === 'COMPLETED' && (
            <section className="completion-panel" aria-label="完成状态">
              <span className="completion-mark">✓</span>
              <div><strong>作业闭环完成</strong><p>教师已确认学生订正，状态已进入 COMPLETED。</p></div>
            </section>
          )}
        </section>
      ) : (
        <section aria-labelledby="student-view-title">
          <div className="view-heading">
            <div>
              <span className="section-kicker">STUDENT VIEW</span>
              <h2 id="student-view-title">学生作业</h2>
              <p>只查看经过 Workflow 发布的结果；等待教师复核时不会提前看到批改反馈。</p>
            </div>
            {context.state === 'PUBLISHED' && (
              <button className="button button-primary" type="button" onClick={handleSubmitAnswers}>
                提交四题答案
              </button>
            )}
          </div>

          <section className="assignment-summary student-summary" aria-label="学生作业信息">
            <div><span className="summary-label">作业标题</span><strong>{context.assignment.title}</strong></div>
            <div><span className="summary-label">当前角色</span><strong>固定学生</strong></div>
            <div><span className="summary-label">订正次数</span><strong>{context.correction ? '1 / 1' : '0 / 1'}</strong></div>
          </section>

          <div className="question-list">
            {context.assignment.questions.map((question) => {
              const result = context.results[question.id];
              const feedback = result ? getStudentFeedback(context, question.id) : undefined;
              const hasSubmitted = context.answers.some((answer) => answer.questionId === question.id);

              return (
                <article className="question-card student-card" data-testid={`question-card-${question.id}`} key={question.id}>
                  <div className="question-card-header">
                    <div><span className="question-id">{question.id}</span><h3>{question.prompt}</h3></div>
                    {result && <span className={`risk risk-${result.publishedResult.riskLevel.toLowerCase()}`}>{result.publishedResult.riskLevel}</span>}
                  </div>
                  {question.options && <ul className="options-list">{question.options.map((option) => <li key={option}>{option}</li>)}</ul>}
                  {context.state === 'PUBLISHED' && !hasSubmitted ? (
                    <label className="student-answer-field" htmlFor={`student-${question.id}`}>
                      <span className="field-label">你的答案</span>
                      <textarea
                        id={`student-${question.id}`}
                        rows={question.id === 'Q4' ? 4 : 2}
                        value={studentAnswerDrafts[question.id] ?? ''}
                        onChange={(event) => setStudentAnswerDrafts((current) => ({ ...current, [question.id]: event.target.value }))}
                      />
                    </label>
                  ) : (
                    <div className="answer-block"><span className="field-label">学生答案</span><pre>{displayAnswer(context, question.id)}</pre></div>
                  )}

                  {result && feedback ? (
                    <>
                      <div className="metric-grid student-metrics">
                        <div className="metric"><span>Judgment</span><strong>{feedback.judgment}</strong></div>
                        <div className="metric"><span>Score</span><strong>{feedback.score} / {question.maxScore}</strong></div>
                        {question.id === 'Q4' && (
                          <div className="metric"><span>订正状态</span><strong>{context.correction ? '已提交' : '待订正'}</strong></div>
                        )}
                      </div>
                      <div className="feedback-panel feedback-panel-published">
                        <span className="field-label">Feedback</span>
                        <p>{feedback.feedback}</p>
                      </div>
                      {question.id === 'Q4' && (
                        <div className="correction-panel">
                          <div>
                            <span className="section-kicker">Q4 CORRECTION</span>
                            <h4>一次订正机会</h4>
                            <p>完成订正后将交给教师最终复核，Challenge MVP 不支持第二次提交。</p>
                          </div>
                          <label htmlFor="q4-correction">Q4 订正答案</label>
                          <textarea
                            id="q4-correction"
                            rows={4}
                            value={context.correction?.answer ?? correctionDraft}
                            disabled={Boolean(context.correction) || context.state !== 'AI_GRADED' || hasPendingPreReviews}
                            onChange={(event) => setCorrectionDraft(event.target.value)}
                          />
                          <button className="button button-primary" type="button" onClick={handleCorrection} disabled={Boolean(context.correction) || context.state !== 'AI_GRADED' || hasPendingPreReviews}>
                            提交订正
                          </button>
                          {hasPendingPreReviews && (
                            <p className="notice notice-info">请先完成所有待教师复核结果，再提交订正。</p>
                          )}
                        </div>
                      )}
                    </>
                  ) : result ? (
                    <div className="visibility-gate">
                      <span className="gate-icon">◌</span>
                      <div><strong>该题正在由教师复核</strong><p>该题正在由教师复核，完成后可查看反馈。</p>{question.id === 'Q4' && <p>教师复核完成后，才能提交一次订正。</p>}</div>
                    </div>
                  ) : (
                    <p className="empty-result">{context.state === 'DRAFT' ? '请等待教师发布作业。' : '提交后即可查看批改结果。'}</p>
                  )}

                  {question.id === 'Q4' && finalReviewNotice && (
                    <p className="notice notice-warning">{finalReviewNotice}</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <footer className="app-footer">
        <span>
          当前产品：AI 智能作业批改 MVP · {role === 'QUALITY' ? 'AI Quality Console' : 'Business Workflow'}
        </span>
      </footer>
    </main>
  );
}
