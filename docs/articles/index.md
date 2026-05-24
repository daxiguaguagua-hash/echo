# 文章

以下是 Echo 知识库中的文章列表。

::: warning 骨架说明
当前为 VitePress 骨架阶段。文章列表在构建时从工作区数据目录自动生成。
实际文章存储在 `~/.echo-workspace/articles/`。
:::

## 示例

- [示例文章](./sample-article.md) — 展示 Echo 文章的 VitePress 渲染效果

## 文章格式

每篇文章包含以下结构：

- **YAML frontmatter** — 元数据（id、title、tags、summary、participants 等）
- **Turn 标记** — 对话轮次，标注发言者和回复关系
- **评论区** — 文内批注锚点 + 回复链

后续版本将自动扫描工作区目录生成此页面。
