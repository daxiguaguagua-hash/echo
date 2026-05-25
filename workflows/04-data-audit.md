# 工作流 4: 数据审计与分类

通过 Echo MCP 查询工作区数据，Claude + Codex 各自独立分析，交叉验证结论。

## 触发条件

- 工作区数据状态不明
- 需要发现跨项目的数据问题
- 管线输出与预期不符
- 新功能上线前验证数据质量

## 流程

```
1. Echo MCP 查询数据（search_articles, list_recent, list_tags）
2. 读取 frontmatter、目录结构、registry 状态
3. Claude 分类分析（哪些属于当前项目、哪些属于其他项目）
4. Claude 将分析结果 + 原始数据发给 Codex
5. Codex 独立重新分析（可能读源码验证管线行为）
6. 交叉对比: 一致点、Codex 独有发现、Claude 独有发现
7. 生成数据清理/修复计划
```

## 实际案例

**Echo 工作区审计 (本次会话)**:
- Echo MCP 拉取 18 个文件
- Claude 分类：16 Echo + 2 非项目
- Codex 独立审查发现：template 被管线计为第 17 篇、project 功能已部分实现、评论数实际是 10 不是 9
- 交叉对比后，P0 清理立即执行

## 关键原则

- **以管线实际行为为准**，不以文档描述为准
- Codex 验证时**必须读源码**，不依赖 Claude 的代码解读
- 分类结果标注 **confidence level**（如路径编码的 "inferred"）
- 发现问题后**先清理再开发**，不在脏数据上建功能
