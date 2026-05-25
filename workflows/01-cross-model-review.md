# 工作流 1: 跨模型审查

Claude (DeepSeek) 和 Codex (OpenAI) 各自独立审查同一个设计/代码，然后交叉对比。

## 触发条件

- 新架构设计
- 高风险代码变更
- 数据模型设计
- 发布路径决策
- 用户明确要求"你们两个都看看"

## 流程

```
1. Claude 完成初步分析/设计
2. Claude 将分析结果 + 上下文打包发送给 Codex
3. Codex 独立审查（不依赖 Claude 的结论）
4. Claude 展示双方结论的交叉对比
5. 标注一致点和分歧点
6. 用户（或自主）决定最终方案
```

## 实际案例

**Issue 008 设计**: Claude 分析了 Echo 工作区 18 个文件 → Codex 独立审查，发现了 Claude 漏掉的 template 污染问题、project 功能已部分实现的代码事实、import 覆盖风险。

**MCP Server 审查 (session-2026-05-23)**: Claude 重构 MCP server → Codex 审查发现 3 P1 项，GATE PASS 后全部修复。

## 关键原则

- Codex 必须看到**完整上下文**，不能只给摘要
- Codex 的结论**必须原样展示**，不能总结/过滤
- 交叉对比表格必须标注**一致点和分歧点**
- Claude 漏掉的问题要**明确指出**，不粉饰
