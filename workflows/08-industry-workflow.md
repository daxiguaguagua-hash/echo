# 业界共识工作流

Claude + Codex 各自搜索业界多 AI agent 协作模式后独立推演，交叉对比。受 10 项业界模式启发，针对 Echo 项目约束（不可变文章、本地优先、2 模型）做了项目化适配。

**启发来源**: Anthropic 3-Agent Harness, CCGX, Swarms, MoAI-ADK, Agent Loop, Microsoft Conductor, Zenflow, mabl, TENET, Agentic-QE

> **诚实标注**: "原则采纳"不代表严格复刻外部项目，而是取其核心思想，按 Echo 实际约束落地。

## 核心流程

```
User Goal
  │
  ▼
┌─────────────────────────────────┐
│ Planner Gate                     │
│ 明确: 目标/范围/不变量/验收命令    │
│ (Codex 参与规划时，后续 Review     │
│  阶段不看 Builder 自评和修复解释)   │
└─────────────┬───────────────────┘
              ▼
┌─────────────────────────────────┐
│ Builder                          │
│ Claude 主实现                     │
│ 子 agent 做独立闭环（可选）        │
└─────────────┬───────────────────┘
              ▼
┌─────────────────────────────────┐
│ Local Gates                      │
│ cd echo-prototype &&             │
│   npm test && npm run all        │
│ (改 serve/UI 时加 docs:build)     │
└─────────────┬───────────────────┘
              ▼
┌─────────────────────────────────┐
│ Independent Review               │
│ Codex 独立审查                    │
│ 不看 Builder 自评和修复解释        │
│ 返回 Gate + P0/P1/P2 + 测试缺口   │
└─────────────┬───────────────────┘
              ▼
┌─────────────────────────────────┐
│ Fix Loop (最多 3 轮)              │
│ 一轮 = Claude 修复 + Local Gate   │
│        + Codex 重审               │
│ 3 轮仍未解决 → 升级给用户           │
└─────────────┬───────────────────┘
              ▼
┌─────────────────────────────────┐
│ Status Gate                      │
│ 更新 ECHO_STATUS.md              │
└─────────────┬───────────────────┘
              ▼
┌─────────────────────────────────┐
│ Human Gate                       │
│ 用户: 合并 / 延期 / 重做           │
└─────────────────────────────────┘
```

**小改动豁免**: 文案/单点修复/STATUS 更新可走"直接改 + Local Gate + Status Gate"，不强制跨模型审查。

## 采纳的业界模式

| # | 模式 | 启发来源 | Echo 落地方式 |
|---|------|---------|-------------|
| 1 | **Independence Pattern** | Zenflow | 原则采纳: Claude 和 Codex 独立产出，不互看结论 |
| 2 | **3-Agent Harness** | Anthropic | 项目化: Planner→Builder→Evaluator，1-3 轮 |
| 3 | **Circuit Breakers** | mabl | 原则采纳: 同问题 3 轮修不好就升级；连续 2 次修复引入新失败就停 |
| 4 | **Human Gate** | mabl | 原则采纳: 用户最终批准合并、删除、隐私操作 |
| 5 | **Wave Parallelism** | Swarms | 局部: 依赖清楚的独立任务可并行（UI+API+test+doc） |
| 6 | **SPEC-First 轻量版** | MoAI-ADK | 项目化: issue 文档 + 不变量检查清单，不上大规格文档 |
| 7 | **Deterministic Orchestration** | Conductor | 项目化: Markdown checklist + 门禁，不上 YAML 引擎 |
| 8 | **TENET 测试选择** | arXiv 2509.24148 | 局部: 大测试集时只跑相关测试，不全量跑 |

## 不采纳（过重）

| 模式 | 原因 |
|------|------|
| CCGX 19 sub-agents | 编排成本高于 Echo 功能复杂度 |
| MoAI 24 agents / 52 skills | 企业级平台，不适合 solo dev |
| Agentic-QE 12 subagent TDD pipeline | 会拖慢小功能迭代 |
| Agent Loop "Orchestrator never codes" | Echo 速度优先，Claude 可以直接写代码 |

## Agent 角色

| 角色 | 负责 | 禁止 |
|------|------|------|
| **Claude Main / Builder** | 实现、重构、跑测试、集成、更新 STATUS | 自己宣布质量通过无外部 gate |
| **Codex Reviewer / Tester** | 独立审查、补测试建议、找不变量破坏 | 直接重写架构（除非用户要求） |
| **Claude Sub-agents** | 并行做局部：UI、测试、文档、调查 | 修改同一文件造成冲突 |
| **User** | 产品判断、合并批准、复杂取舍 | — |

## Handoff Contract

Claude → Codex 审查时必须带:

```
目标: 一句话
改动范围: 文件路径列表
关键不变量: 哪些不能破坏
风险点: 最可能出错的地方
测试命令: 验证步骤
期望审查重点: 让 Codex 重点看什么
```

Codex → Claude 返回:

```
Gate: PASS / PASS_WITH_NOTES / BLOCK
P0: 阻塞性问题
P1: 应修复（默认修）
P2: 建议（可延期，记入 STATUS 后期改进）
测试缺口: 缺什么测试
建议下一步: 一句话
```

## 质量门禁

| Gate | 触发条件 |
|------|---------|
| Unit | 任何改动: `cd echo-prototype && npm test` |
| Pipeline | 任何改动: `cd echo-prototype && npm run all` |
| Status | 任意完成/延期: 更新 `ECHO_STATUS.md` |
| Docs/UI | 改 VitePress/serve: `npm run docs:build`，必要时浏览器验证 |
| MCP | 改 MCP tools: MCP E2E |
| Import | 改 importer: 验证 manifest 防重、不可变文章不覆盖 |
| Article Invariant | 任何脚本不得修改正文，只能改 frontmatter 或外部层 |

## Circuit Breaker 规则

```
同一问题修复 3 轮仍失败 → 停止，写明 blocker
连续 2 次修复都引入新失败 → 停止
涉及正文修改、导入覆盖、隐私删除 → 必须用户确认
架构分歧无法收敛 → Claude + Codex 各自独立写方案，交叉比较
```

## 交叉对比记录

Claude 和 Codex 在 7/12 项判断上一致:

| 判断 | 一致? |
|------|------|
| Independence = 最重要 | ✅ |
| 3-Agent Harness 改造 1-3 轮 | ✅ |
| Wave Parallelism 局部采用 | ✅ |
| CCGX/MoAI/Agentic-QE 过重 | ✅ |
| Orchestrator never codes 不适合 Echo | ✅ |
| SPEC-First 轻量化 | ✅ |
| Circuit Breakers + Human Gate | ✅ |

Codex 补充: Handoff Contract 格式、12→4 agent 精简、Status Gate 必须进流程
Claude 补充: TENET 测试选择、mabl circuit breaker 细节

## Codex 审查记录

**审查 1** (设计阶段): 方向基本现实，Claude 主 agent 必须是调度 owner
**审查 2** (本文档): Gate PASS_WITH_NOTES — P1 已全部修复（AS-IS→原则采纳、Status Gate、命令路径、小改动豁免、Planner/Reviewer 隔离、Fix Loop 粒度）
