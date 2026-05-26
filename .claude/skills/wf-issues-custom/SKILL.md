---
name: wf-issues-custom
description: "按 Codex 编写的 issue 文档执行多步骤任务。读取 issues/ 目录下的任务说明书，按 P0→P4 优先级顺序实现，必要时与 Codex 沟通测试变更，完成后过验证门并更新 STATUS。"
triggers:
  - /issue
  - 执行 issue
  - 开始干活
  - 按.*issue.*做
  - 按.*文档.*执行
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - Skill
  - TaskCreate
  - TaskUpdate
  - mcp__codegraph__codegraph_search
  - mcp__codegraph__codegraph_context
  - mcp__codegraph__codegraph_trace
  - mcp__codegraph__codegraph_callers
  - mcp__codegraph__codegraph_callees
  - mcp__codegraph__codegraph_impact
  - mcp__codegraph__codegraph_node
  - mcp__codegraph__codegraph_explore
  - mcp__codegraph__codegraph_files
  - mcp__codegraph__codegraph_status
---

# wf-issues-custom — Issue 驱动执行器

按 Codex 编写的 `issues/NNN-*.md` 文档执行多步骤任务。参考工作流文档：`workflows/06-issue-driven.md`。

## 工具优先级

**CodeGraph 第一。** 所有代码结构问题（查定义、追踪调用链、理解架构、影响分析）必须先走 `codegraph_*` MCP 工具，禁止以 grep/Read 起步。

如果不知道 CodeGraph 的具体用法，先运行 `codegraph --help` 查看命令说明。

## 执行流程

### 1. 解析 issue 文档

`Read` 用户指定的 `issues/NNN-*.md`，提取：
- 任务描述和背景
- 优先级排序（P0-P4）
- 关联的测试文件路径
- 设计决策和约束

### 2. 拆解任务

用 `TaskCreate` 按 P0→P4 顺序创建子任务。每个子任务含描述和 activeForm。

### 3. 查代码（CodeGraph 优先）

每开始一个子任务，先用 `codegraph_*` 理解相关代码结构，再动手改。

| 意图 | 工具 |
|------|------|
| 找符号定义/位置 | `codegraph_search` |
| 理解功能上下文 | `codegraph_context` |
| 追踪调用路径 | `codegraph_trace` |
| 看谁调用了 X | `codegraph_callers` |
| 看 X 调用了谁 | `codegraph_callees` |
| 分析修改影响 | `codegraph_impact` |
| 查看源码 | `codegraph_node` 或 `codegraph_explore` |
| 文件结构 | `codegraph_files` |

CodeGraph 查不到的（字符串字面量、注释、配置）才用 grep/Read 兜底。

### 4. 按优先级实现

- P0 → P1 → P2 → P3 → P4 严格顺序，不跳级
- 完成一个子任务 → 标记 `completed` → 开始下一个
- 不做范围外的重构，不动不可变文章正文

### 5. 测试变更沟通

测试用例基本都是 Codex 写的。需要改测试时：
- 用 `Skill` 工具调 `codex`，说明需要改的测试点和原因
- 与 Codex 达成共识后再修改
- 不单方面改动 Codex 的测试用例

### 6. 过验证门

全部实现后：
```bash
npm test && npm run all
```
必须全绿。

### 7. 更新 STATUS

`ECHO_STATUS.md` 中对应的 `- [ ]` 改为 `- [x]`，刷新日期。

### 8. Codex 审查

调 `/codex review` 对变更做最终审查。

### 9. 如果用户明确表示自动运行，或者把所有的issues都清理掉。那么就从头开始执行当前流程，直到所有issues都修复。
