# Echo 项目协作工作流

从 16 篇 Echo 文章 + 当前会话中提炼的实际合作模式。不是理论设计，是从已经跑通的协作中归纳出来的。

## 工作流总览

| # | 工作流 | 触发场景 | 关键特征 |
|---|--------|---------|---------|
| 1 | [跨模型审查](01-cross-model-review.md) | 设计决策、架构方案、高风险变更 | Claude + Codex 独立审查 → 交叉对比 |
| 2 | [TDD + Codex 测试生成](02-tdd-with-codex.md) | 新模块、新功能 | Codex 写测试 → Claude 实现 → 绿灯 |
| 3 | [自主执行](03-autonomous-execution.md) | 用户给方向后离开 | Claude + Codex 自组织、自决策 |
| 4 | [数据审计](04-data-audit.md) | 工作区分析、数据质量 | Echo MCP 查询 → 分类 → 跨模型验证 |
| 5 | [框架优先](05-framework-first.md) | 多任务规划 | P0 清理 → P1 框架 → P2 发布 → P3 功能 |
| 6 | [Issue 驱动](06-issue-driven.md) | 所有非 trivial 变更 | Issue 文档 → STATUS 追踪 → TDD → 提交 |

## 选择指南

```
新想法/设计方案？
  → 跨模型审查 (1)

新模块/新功能？
  → TDD + Codex 测试 (2)，必要时先跨模型审查 (1)

用户给大方向后离开？
  → 自主执行 (3)，内部自动组合 (1)(2)(5)(6)

发现数据不一致？
  → 数据审计 (4)

多个任务需要排序？
  → 框架优先 (5)

任何实现工作？
  → Issue 驱动 (6) 作为追踪骨架
```

## 实际案例

| 工作流 | 案例 |
|--------|------|
| 跨模型审查 | Issue 008 多项目导入设计（Claude + Codex 各自独立审查，交叉对比） |
| TDD + Codex | import 框架（Codex 106 测试 → Claude 实现 → 251 全绿） |
| 自主执行 | 用户"所有决策你和codex自主完成，我先离开" → P0 清理 + import 框架 + CLI |
| 数据审计 | Echo 工作区 18 文件分类（Echo MCP 查询 → Claude 分析 → Codex 独立验证） |
| 框架优先 | Issue 008 优先级：P0 数据清理 → P1 import 框架 → P2 npm 发布 → P3 评论 UI |
| Issue 驱动 | 每个 feature 都有 issue/ 文档 + ECHO_STATUS.md 进度追踪 |

## 旧工作流 (已废弃)

`workflow-claude-deepseek-codex` — 六步线性流程，太简单，不反映实际的多模型并行、自主决策、跨模型审查模式。
