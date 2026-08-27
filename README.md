# AI 智能作业批改 MVP

这是一个面向 AI 测试工程师 Challenge 的小学数学作业批改 MVP：用固定 Demo 题和 Mock AI Provider 演示“AI 批改 → 风险兜底 → 教师接管 → 学生订正 → 教师确认”的业务闭环，并用可重复的 Golden Regression 验证 AI 质量。

## 为什么做这个 MVP

作业批改不只是判断对错。AI 还可能错误计分、误判部分正确答案、泄露最终答案或在高风险结果上绕过人工复核。本项目把业务闭环和质量控制拆成两条职责清晰的链路：低风险结果可以自动发布；MEDIUM/HIGH 结果先由教师认可或修改，学生再看到反馈；内部质量控制台则用 Golden Dataset、Evaluation、Critical Error 和 Release Gate 判断 Provider/Prompt 版本是否可以发布。

## 已实现范围

- 固定一份小学数学作业，包含选择题、填空题、计算题和应用题四类题型。
- 教师端：发布作业、查看 AI 原始结果、按风险进行 APPROVE/MODIFY、查看 Human Override Audit Trail、执行最终 PASS/RETURN。
- 学生端：提交四题答案、查看已允许发布的 Feedback、完成 Q4 一次订正。
- 固定 Workflow：`DRAFT → PUBLISHED → SUBMITTED → AI_GRADED → CORRECTION_SUBMITTED → TEACHER_REVIEWED → COMPLETED`。
- AI 质量控制台：运行 Mock V1/V2，查看 Metrics、12 条 Golden Case、Failure Analysis、Regression Compare 和 Release Gate。
- 所有核心 Domain、Workflow、Runtime Risk Policy、Evaluation 和 Gate 逻辑均可脱离 React 测试。

## 核心业务闭环

```text
Business UI
→ Workflow
→ Runtime Risk Policy
→ Grading Provider
→ Published Result
→ Student Feedback / Correction
→ Teacher Final Review
```

业务演示主线：

1. 教师端点击“发布作业”。
2. 切换学生端，提交四道固定答案。
3. 切换教师端，点击“开始 AI 批改”。
4. LOW 结果自动可见；Q2 MEDIUM、Q4 HIGH 处于“待教师复核”。
5. 学生端不会看到 PENDING 结果的 Provider Feedback。
6. 教师可以认可 Q2，也可以修改 Q4 的分数、反馈和修改原因。
7. 学生查看最终 Published Feedback，并提交一次 Q4 订正。
8. 教师执行“通过并完成”，Workflow 进入 `COMPLETED`。
9. 点击“重置演示”可重新创建 DRAFT Context。
10. 也可以在一次订正后选择“退回订正”，验证受限 RETURN 分支；该分支不允许第二次订正或再次最终复核。

## AI Quality 机制

质量链路如下：

```text
Golden Dataset
→ Provider
→ Evaluation Engine
→ Metrics / Critical Error
→ Release Gate
→ AI Quality Dashboard
```

Dashboard 只调用真实 `runEvaluation()`，不在 React 中复制 Evaluation、Critical 或 Gate 规则。Gate Detail API 与既有 `evaluateReleaseGate()` 共享同一套五条规则。

### Mock Provider

当前使用固定 Mock AI Provider，不接真实 LLM：

| 版本 | Provider | Prompt | Dataset | 用途 |
| --- | --- | --- | --- | --- |
| Mock V1 | `mock-v1` | `grading-v1` | `golden-v1` | Baseline、失败分析、BLOCKED |
| Mock V2 | `mock-v2` | `grading-v2` | `golden-v1` | Regression 修复效果、PASS |

V1/V2 用于复现固定的 AI Quality Failure 与 Regression 效果，不代表真实模型版本升级，也不代表生产环境模型准确率。

### Golden Dataset 边界

`golden-v1` 固定包含 12 条风险导向 Demo Golden Cases，用于验证典型风险、回归机制和发布门禁，不是生产统计样本。Mock V2 的 `12 / 12 PASS` 只表示 `golden-v1 Regression PASS`，不能表述为“模型准确率 100%”。

### Release Gate 五条规则

任一规则触发即为 `BLOCKED`：

1. Critical Error Count 必须为 0。
2. Expected LOW Risk Judgment Accuracy 必须为 100%。
3. Consistency Pass Rate 必须为 100%。
4. 所有 HIGH Risk Result 必须要求人工复核。
5. 不得存在 Unsafe Feedback。

Release Gate 是 Provider/Prompt 版本级门禁；Runtime Risk Policy 是单次批改结果级发布控制，两者职责独立。

## 技术栈与运行方式

- TypeScript
- React 19
- Vite
- Vitest
- Testing Library + jsdom
- 原生 CSS，无后端、数据库、Router 或大型状态管理框架

干净环境运行：

```bash
npm ci
npm run dev
```

打开 Vite 输出的本地地址即可演示。Mock Provider 默认用于演示交互链路；Dashboard 使用 `delayMs: 0` 避免 12 条 Case 产生不必要等待，业务批改仍保留短暂 Mock Loading 体验。

## 测试方式

```bash
npm test
npm run build
git diff --check
```

测试分层：

- **Unit**：Normalization、Risk Policy、Feedback Evaluator、Consistency、Evaluation Engine、Metrics、Critical Error、Release Gate、Workflow。
- **Regression**：同一份 `golden-v1` 上运行 Mock V1/V2。
- **Integration/UI**：教师/学生业务流程、可见性控制、教师 Override、Q4 Correction、RETURN、Reset、Evaluation Dashboard。
- **E2E Integration**：`tests/e2e/phase7-delivery.test.tsx` 从用户操作视角覆盖业务闭环和 V1→V2 质量回归。

当前回归证据：

```text
Mock V1: Total 12 / Passed 7 / Failed 5 / Critical 4 / Gate BLOCKED
Failed: GC-06, GC-07, GC-10, GC-11, GC-12

Mock V2: Total 12 / Passed 12 / Failed 0 / Critical 0 / Gate PASS
```

## 目录结构

```text
src/
├── App.tsx                         # 教师端、学生端、AI 质量控制台入口
├── components/EvaluationDashboard.tsx
├── domain/models.ts                # Domain 与 EvaluationRun 类型
├── data/demo-assignment.ts         # 4 道业务 Demo 题
├── data/golden-v1.ts               # 12 条不可变 Golden Cases
├── providers/                      # GradingProvider、Mock V1/V2
├── rules/                          # Normalization、Risk、Consistency
├── workflow/workflow.ts            # 业务状态与人工作业复核
└── evaluation/                     # Feedback、Evaluation、Metrics、Gate

tests/
├── unit/                           # 规则与核心模块测试
├── regression/                     # Mock V1/V2 冻结回归
├── ui/                             # React 业务与 Dashboard 集成测试
└── e2e/                            # Phase 7 用户视角交付测试
```

## 当前未实现范围

本 Challenge MVP 不实现：

- 真实 LLM API、Prompt 管理或模型管理；
- OCR、图片上传、数据库、后端服务、登录和真实权限；
- 多用户、班级、多作业和复杂审批；
- 第二次订正或无限多轮 Workflow；
- Production Monitoring、线上 A/B 测试和生产级 Dataset；
- Phase 7 之后的额外产品功能。

## 关键假设与后续扩展

当前 Demo 假设固定教师、固定学生、固定作业和离线 Mock Provider。接入真实 LLM/OCR 时，需要保留 Provider 与 Runtime Rules 的边界，并重新验证 P50/P95 Latency、Timeout Rate、Error Rate、Retry、降级以及 OCR/LLM/端到端延迟。当前 Mock 交互速度不能推导真实模型性能。

Feedback Evaluation 使用确定性规则，不引入 LLM-as-a-Judge。Golden Dataset 的结果用于质量门禁和回归，不替代真实线上用户数据。
