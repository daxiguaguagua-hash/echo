# 工作流 6: Issue 驱动开发

所有非 trivial 变更通过 issue 文档追踪，配合 ECHO_STATUS.md 进度表。

## 触发条件

- 任何需要多个步骤的变更
- 新功能、重构、bug 修复
- 跨模型审查后的设计落地

## 流程

```
1. 设计/审查完成后，创建 issue 文档
   issues/NNN-short-description.md
2. Issue 包含:
   - 背景: 为什么做
   - 问题: 当前状态和不足
   - 设计决策: 怎么做，有哪些备选方案被否决
   - 实施优先级: P0-P4
   - 跨模型审查记录
3. 在 ECHO_STATUS.md 中添加对应的 - [ ] 条目
4. TDD 实现:
   - Codex 写测试
   - Claude 实现
   - 全绿
5. 实现完成后:
   - ECHO_STATUS.md: - [ ] 改为 - [x]
   - 更新"最后更新"时间戳
   - git commit
6. 未完成或延后的内容记到"后期改进"或"待做"

## 实际案例

**Issue 008** (`issues/008-multi-project-import-and-npm-publishing.md`):
- 背景: Echo 工作区审查暴露多项目导入和 npm 发布问题
- 设计决策: provider adapter 模式、import manifest、write-once 语义
- 实施: P0 数据清理 → P1 import 框架 → P2 npm 准备
- ECHO_STATUS.md: 新增 4 个 - [ ] → 全部改为 - [x]

## Issue 文档模板

```markdown
# Issue NNN: 简短标题

**日期**: YYYY-MM-DD
**来源**: 对话/审查/用户需求
**状态**: 设计完成 / 实施中 / 已完成

## 背景
...

## 问题
| # | 问题 | 严重度 | 详情 |
|---|------|--------|------|

## 设计决策
...

## 实施优先级
| 优先级 | 任务 | 类型 |
|--------|------|------|

## 跨模型审查记录
一致点、分歧点、各自发现
```

## 关键原则

- **Issue 是设计文档，不是 TODO list**：包含 WHY 和设计决策
- **ECHO_STATUS.md 是进度表，不是 Issue 的替代品**：Issue 有细节，STATUS 有状态
- **完成后立即更新 STATUS**：不攒着
- **跨模型审查记录必须写入 Issue**：未来的自己需要知道当时为什么做这个决定
