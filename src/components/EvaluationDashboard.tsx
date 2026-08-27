import { useState } from 'react';
import type {
  EvaluationResult,
  EvaluationRun,
  GoldenCase,
  GradingResult,
} from '../domain/models';
import { GOLDEN_DATASET_VERSION, goldenV1 } from '../data/golden-v1';
import { runEvaluation } from '../evaluation/evaluation-run';
import type { GradingProvider } from '../providers/grading-provider';
import { createMockV1Provider } from '../providers/mock-v1-provider';
import { createMockV2Provider } from '../providers/mock-v2-provider';

export type EvaluationRunner = typeof runEvaluation;

export interface EvaluationDashboardProps {
  evaluationRunner?: EvaluationRunner;
}

type ProviderVersion = 'mock-v1' | 'mock-v2';
type CaseFilter = 'ALL' | 'FAILED';

const providerOptions: Record<ProviderVersion, {
  label: string;
  create: () => GradingProvider;
}> = {
  'mock-v1': {
    label: 'Mock V1 · Baseline',
    create: () => createMockV1Provider({ delayMs: 0 }),
  },
  'mock-v2': {
    label: 'Mock V2 · Regression',
    create: () => createMockV2Provider({ delayMs: 0 }),
  },
};

const dimensionLabels: Array<{
  key: keyof Pick<EvaluationResult, 'judgmentPass' | 'scorePass' | 'reasonPass' | 'feedbackPass' | 'consistencyPass' | 'riskPass' | 'reviewPolicyPass'>;
  label: string;
}> = [
  { key: 'judgmentPass', label: 'Judgment' },
  { key: 'scorePass', label: 'Score' },
  { key: 'reasonPass', label: 'Reason' },
  { key: 'feedbackPass', label: 'Feedback' },
  { key: 'consistencyPass', label: 'Consistency' },
  { key: 'riskPass', label: 'Risk' },
  { key: 'reviewPolicyPass', label: 'Review Policy' },
];

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }

  const rounded = Number((value * 100).toFixed(1));
  return `${rounded}%`;
}

function displayReviewRequired(value: boolean): string {
  return value ? '是' : '否';
}

function getActualResult(run: EvaluationRun, index: number): GradingResult | undefined {
  return run.actualResults[index];
}

function getEvaluationResult(run: EvaluationRun, index: number): EvaluationResult | undefined {
  return run.results[index];
}

function SummaryCard({
  label,
  value,
  testId,
  tone,
}: {
  label: string;
  value: string | number;
  testId: string;
  tone?: 'positive' | 'negative' | 'neutral';
}) {
  return (
    <div className={`quality-summary-card quality-summary-${tone ?? 'neutral'}`} data-testid={testId}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RunSummary({ run }: { run: EvaluationRun }) {
  return (
    <>
      <div className="quality-run-meta">
        <span>Provider：{run.providerVersion}</span>
        <span>Prompt：{run.promptVersion}</span>
        <span>Dataset：{run.datasetVersion}</span>
        <span>Run ID：{run.runId}</span>
      </div>
      <div className="quality-summary-grid">
        <SummaryCard label="Total Cases" value={run.totalCases} testId="summary-total" />
        <SummaryCard label="Passed Cases" value={run.passedCases} testId="summary-passed" tone="positive" />
        <SummaryCard label="Failed Cases" value={run.failedCases} testId="summary-failed" tone={run.failedCases > 0 ? 'negative' : 'positive'} />
        <SummaryCard label="Critical Errors" value={run.criticalErrors} testId="summary-critical" tone={run.criticalErrors > 0 ? 'negative' : 'positive'} />
        <div className={`quality-gate-summary gate-${run.gateResult.toLowerCase()}`} data-testid="gate-result">
          <span>Release Gate</span>
          <strong>{run.gateResult}</strong>
        </div>
      </div>
    </>
  );
}

function MetricsSection({ run }: { run: EvaluationRun }) {
  const groups = [
    {
      title: 'Model Quality',
      subtitle: '模型输出本身的判断与解释质量',
      metrics: [
        ['Judgment Accuracy', formatPercent(run.metrics.judgmentAccuracy)],
        ['Score Accuracy', formatPercent(run.metrics.scoreAccuracy)],
        ['Reason Accuracy', formatPercent(run.metrics.reasonAccuracy)],
        ['Feedback Pass Rate', formatPercent(run.metrics.feedbackPassRate)],
      ],
    },
    {
      title: 'AI System Quality',
      subtitle: '跨字段一致性、策略遵循和安全门禁',
      metrics: [
        ['Consistency Pass Rate', formatPercent(run.metrics.consistencyPassRate)],
        ['Review Policy Pass Rate', formatPercent(run.metrics.reviewPolicyPassRate)],
        ['Critical Error Count', String(run.metrics.criticalErrorCount)],
        ['Case Pass Rate', formatPercent(run.metrics.casePassRate)],
      ],
    },
    {
      title: 'Business / Runtime Policy',
      subtitle: '按 Runtime Risk Policy 实际进入人工复核的比例',
      metrics: [['Runtime Human Review Rate', formatPercent(run.metrics.reviewRate)]],
    },
  ];

  return (
    <section className="quality-section" aria-labelledby="metrics-title">
      <div className="quality-section-heading">
        <div>
          <span className="section-kicker">METRICS</span>
          <h3 id="metrics-title">分层质量指标</h3>
          <p>模型质量 ≠ 系统质量 ≠ 业务运行指标。</p>
        </div>
      </div>
      <div className="metric-groups">
        {groups.map((group) => (
          <section className="metric-group" key={group.title}>
            <div className="metric-group-heading">
              <strong>{group.title}</strong>
              <span>{group.subtitle}</span>
            </div>
            <div className="quality-metric-grid">
              {group.metrics.map(([label, value]) => (
                <div className="quality-metric" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function GateSection({ run }: { run: EvaluationRun }) {
  return (
    <section className="quality-section gate-section" aria-labelledby="gate-title">
      <div className="quality-section-heading">
        <div>
          <span className="section-kicker">RELEASE GATE</span>
          <h3 id="gate-title">发布门禁</h3>
          <p>五条规则来自同一套 Release Gate Details，未在页面中复制判定逻辑。</p>
        </div>
        <span className={`large-gate-badge gate-${run.gateResult.toLowerCase()}`}>{run.gateResult}</span>
      </div>
      <div className="gate-rule-list">
        {run.gateDetails.rules.map((rule) => (
          <div className={`gate-rule ${rule.passed ? 'rule-passed' : 'rule-failed'}`} data-testid={`gate-rule-${rule.id}`} key={rule.id}>
            <span className="gate-rule-icon">{rule.passed ? '✓' : '!'}</span>
            <div>
              <strong>{rule.label}</strong>
              <p>阈值：{rule.threshold} · 当前：{rule.observed}</p>
            </div>
            <span className="gate-rule-status">{rule.passed ? 'PASS' : 'TRIGGERED'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RegressionComparison({ runs }: { runs: Partial<Record<ProviderVersion, EvaluationRun>> }) {
  const orderedVersions: ProviderVersion[] = ['mock-v1', 'mock-v2'];
  const visibleRuns = orderedVersions
    .map((version) => runs[version])
    .filter((run): run is EvaluationRun => Boolean(run));

  if (visibleRuns.length === 0) {
    return null;
  }

  return (
    <section className="quality-section" aria-labelledby="regression-title" data-testid="regression-comparison">
      <div className="quality-section-heading">
        <div>
          <span className="section-kicker">REGRESSION</span>
          <h3 id="regression-title">V1 → V2 回归对比</h3>
          <p>每一行均来自对应 Provider 的真实 runEvaluation() 结果。</p>
        </div>
      </div>
      <div className="regression-grid">
        {visibleRuns.map((run) => (
          <div className="regression-card" key={run.providerVersion}>
            <div className="regression-card-heading">
              <strong>{run.providerVersion} / {run.promptVersion}</strong>
              <span className={`gate-chip gate-${run.gateResult.toLowerCase()}`}>{run.gateResult}</span>
            </div>
            <div className="regression-values">
              <span>{run.passedCases} / {run.totalCases} PASS</span>
              <span>{run.criticalErrors} Critical</span>
              <span>{run.failedCases} Failed</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CaseResultRow({
  goldenCase,
  actual,
  evaluation,
  onSelect,
}: {
  goldenCase: GoldenCase;
  actual: GradingResult;
  evaluation: EvaluationResult;
  onSelect: () => void;
}) {
  return (
    <button className={`case-result-row ${evaluation.finalResult === 'FAIL' ? 'case-row-failed' : ''}`} data-testid={`case-row-${goldenCase.caseId}`} type="button" onClick={onSelect}>
      <span className="case-cell case-id-cell"><strong>{goldenCase.caseId}</strong><small>{goldenCase.title}</small></span>
      <span className="case-cell"><small>{goldenCase.questionType}</small></span>
      <span className="case-cell pair-cell"><small>Expected</small><strong>{goldenCase.expected.judgment}</strong><small>Actual</small><strong>{actual.judgment}</strong></span>
      <span className="case-cell pair-cell"><small>Expected</small><strong>{goldenCase.expected.score}</strong><small>Actual</small><strong>{actual.score}</strong></span>
      <span className="case-cell"><strong className={`risk risk-${actual.riskLevel.toLowerCase()}`}>{actual.riskLevel}</strong><small>复核：{displayReviewRequired(actual.reviewRequired)}</small></span>
      <span className="case-cell result-cell"><strong className={evaluation.finalResult === 'PASS' ? 'text-pass' : 'text-fail'}>{evaluation.finalResult}</strong>{evaluation.criticalError && <small className="critical-label">CRITICAL</small>}</span>
    </button>
  );
}

function CaseDetail({
  goldenCase,
  actual,
  evaluation,
}: {
  goldenCase: GoldenCase;
  actual: GradingResult;
  evaluation: EvaluationResult;
}) {
  return (
    <section className="case-detail" data-testid="case-detail" aria-labelledby="case-detail-title">
      <div className="case-detail-heading">
        <div>
          <span className="section-kicker">CASE DETAIL</span>
          <h3 id="case-detail-title">
            <span className="case-detail-id">{goldenCase.caseId}</span>
            <span aria-hidden="true"> · </span>
            <span>{goldenCase.title}</span>
          </h3>
        </div>
        <div className="case-detail-result">
          <span data-testid="detail-final-result">Final {evaluation.finalResult}</span>
          <span data-testid="detail-critical">Critical Error：{evaluation.criticalError ? 'YES' : 'NO'}</span>
        </div>
      </div>
      <div className="case-detail-copy-grid">
        <div><span>Question</span><p>{goldenCase.question}</p></div>
        <div><span>Standard Answer</span><pre>{goldenCase.standardAnswer}</pre></div>
        <div><span>Student Answer</span><pre>{goldenCase.studentAnswer}</pre></div>
        <div><span>Actual Feedback</span><p>{actual.feedback}</p></div>
      </div>
      <div className="expected-actual-grid">
        <div>
          <h4>Expected Result</h4>
          <p>Judgment：{goldenCase.expected.judgment}</p>
          <p>Score：{goldenCase.expected.score}</p>
          <p>Error Type：{goldenCase.expected.errorType}</p>
          <p>Risk：{goldenCase.expected.riskLevel}</p>
          <p>Review Required：{displayReviewRequired(goldenCase.expected.reviewRequired)}</p>
        </div>
        <div>
          <h4>Actual Result</h4>
          <p>Judgment：{actual.judgment}</p>
          <p>Score：{actual.score}</p>
          <p>Error Type：{actual.errorType}</p>
          <p>Risk：{actual.riskLevel}</p>
          <p>Review Required：{displayReviewRequired(actual.reviewRequired)}</p>
        </div>
      </div>
      <div className="dimension-section">
        <h4>Evaluation Dimensions</h4>
        <div className="dimension-grid">
          {dimensionLabels.map(({ key, label }) => (
            <div className={`dimension-result ${evaluation[key] ? 'dimension-pass' : 'dimension-fail'}`} data-testid={`dimension-${key.replace('Pass', '').replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^-/, '')}`} key={key}>
              <span>{label}</span>
              <strong>{evaluation[key] ? 'PASS' : 'FAIL'}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="failure-reasons">
        <h4>Failure Reasons</h4>
        {evaluation.failureReasons.length > 0 ? (
          <ul>{evaluation.failureReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        ) : (
          <p>无失败原因。</p>
        )}
      </div>
    </section>
  );
}

function CaseResults({ run }: { run: EvaluationRun }) {
  const [filter, setFilter] = useState<CaseFilter>('ALL');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('GC-06');
  const selectedIndex = goldenV1.findIndex(({ caseId }) => caseId === selectedCaseId);
  const selectedGoldenCase = selectedIndex >= 0 ? goldenV1[selectedIndex] : undefined;
  const selectedActual = selectedIndex >= 0 ? getActualResult(run, selectedIndex) : undefined;
  const selectedEvaluation = selectedIndex >= 0 ? getEvaluationResult(run, selectedIndex) : undefined;

  const rows = goldenV1.map((goldenCase, index) => ({
    goldenCase,
    actual: getActualResult(run, index),
    evaluation: getEvaluationResult(run, index),
  })).filter(({ evaluation }) => filter === 'ALL' || evaluation?.finalResult === 'FAIL');

  return (
    <section className="quality-section case-results-section" aria-labelledby="case-results-title">
      <div className="quality-section-heading case-results-heading">
        <div>
          <span className="section-kicker">GOLDEN DATASET</span>
          <h3 id="case-results-title">Golden Case Results</h3>
          <p>golden-v1 · 12 条风险导向 Demo Cases</p>
        </div>
        <div className="filter-buttons" aria-label="Case 过滤">
          <button className={filter === 'ALL' ? 'filter-button is-active' : 'filter-button'} type="button" aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')}>全部</button>
          <button className={filter === 'FAILED' ? 'filter-button is-active' : 'filter-button'} type="button" aria-pressed={filter === 'FAILED'} onClick={() => setFilter('FAILED')}>仅失败</button>
        </div>
      </div>
      <div className="case-table-header" aria-hidden="true">
        <span>Case / Title</span><span>Type</span><span>Judgment</span><span>Score</span><span>Risk / Review</span><span>Result</span>
      </div>
      <div className="case-table" role="list">
        {rows.map(({ goldenCase, actual, evaluation }) => actual && evaluation ? (
          <CaseResultRow goldenCase={goldenCase} actual={actual} evaluation={evaluation} onSelect={() => setSelectedCaseId(goldenCase.caseId)} key={goldenCase.caseId} />
        ) : null)}
      </div>
      {selectedGoldenCase && selectedActual && selectedEvaluation && (
        <CaseDetail goldenCase={selectedGoldenCase} actual={selectedActual} evaluation={selectedEvaluation} />
      )}
    </section>
  );
}

export default function EvaluationDashboard({ evaluationRunner = runEvaluation }: EvaluationDashboardProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderVersion>('mock-v1');
  const [runs, setRuns] = useState<Partial<Record<ProviderVersion, EvaluationRun>>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>();

  async function handleRunEvaluation() {
    if (isRunning) {
      return;
    }

    setIsRunning(true);
    setStatusMessage('正在运行 Golden Dataset...');
    try {
      const run = await evaluationRunner(
        providerOptions[selectedProvider].create(),
        goldenV1,
        GOLDEN_DATASET_VERSION,
      );
      setRuns((current) => ({ ...current, [selectedProvider]: run }));
      setStatusMessage('评测完成');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '评测运行失败。');
    } finally {
      setIsRunning(false);
    }
  }

  const selectedRun = runs[selectedProvider];

  return (
    <section className="quality-console" aria-labelledby="quality-console-title">
      <div className="quality-console-heading">
        <div>
          <span className="section-kicker">INTERNAL AI QUALITY</span>
          <h2 id="quality-console-title">AI 质量控制台</h2>
          <p>用真实 Golden Regression 结果回答：这个版本能不能发布？</p>
        </div>
        <div className="quality-controls">
          <label htmlFor="provider-version">Provider 版本</label>
          <select id="provider-version" value={selectedProvider} onChange={(event) => setSelectedProvider(event.target.value as ProviderVersion)}>
            <option value="mock-v1">{providerOptions['mock-v1'].label}</option>
            <option value="mock-v2">{providerOptions['mock-v2'].label}</option>
          </select>
          <button className="button button-primary" type="button" onClick={handleRunEvaluation} disabled={isRunning}>
            {isRunning ? '正在运行...' : '运行评测'}
          </button>
        </div>
      </div>
      <div className="quality-disclaimers">
        <p>golden-v1 是 Challenge MVP 的 12 条风险导向 Demo Golden Cases。</p>
        <p>当前结果用于回归与质量门禁，不代表生产环境统计准确率。</p>
        <p>Mock V1 / V2 用于复现固定 AI Quality Failure 与 Regression 修复效果。</p>
      </div>
      {statusMessage && <p className="notice notice-info" role="status">{statusMessage}</p>}
      {selectedRun ? (
        <>
          <RunSummary run={selectedRun} />
          <MetricsSection run={selectedRun} />
          <GateSection run={selectedRun} />
          <RegressionComparison runs={runs} />
          <CaseResults run={selectedRun} />
        </>
      ) : (
        <section className="quality-empty-state">
          <span className="section-kicker">READY TO RUN</span>
          <h3>选择一个 Mock Provider 开始评测</h3>
          <p>运行后将展示 Summary、Metrics、12 条 Case、Failure Analysis 和 Release Gate。</p>
        </section>
      )}
    </section>
  );
}
