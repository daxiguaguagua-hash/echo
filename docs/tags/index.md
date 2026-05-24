# 标签

::: warning 骨架说明
当前为 VitePress 骨架阶段。标签云将在构建时从 frontmatter 的 `tags` 字段聚合生成。
:::

## 标签结构

每篇文章的 YAML frontmatter 中包含一个 `tags` 数组：

```yaml
tags: [architecture, mcp, claude-code]
```

后续版本将：

1. 扫描所有文章的 frontmatter
2. 聚合标签及使用次数
3. 生成标签云页面（按使用频率排序）
4. 每个标签页面列出关联文章
