---
id: sample-article
title: "示例：Echo 文章渲染"
created_at: 2026-05-23T10:00:00+08:00
updated_at: 2026-05-23T10:00:00+08:00
tags: [echo, vitepress, 示例]
summary: "展示 Echo 文章的 VitePress 渲染效果"
participants:
  - id: vincent
    role: human
  - id: claude
    role: ai
    model: claude-opus-4-7
---

# 示例：Echo 文章渲染

> **元数据**：本文演示 Echo 文章在 VitePress 中的渲染效果。所有 turn 标记为 HTML 注释，对 VitePress 渲染透明。

## 对话内容

<!-- turn: t001 speaker=vincent -->

**我**：我们如何为 Echo 项目搭建一个静态文档站点？我想用 VitePress。

<!-- turn: t002 speaker=claude reply_to=t001 -->

**Claude**：VitePress 是一个很好的选择。以下是关键步骤：

1. 在项目根目录创建 `docs/` 目录
2. 初始化 `.vitepress/config.mts`
3. 创建首页和文章页面
4. 添加构建脚本

```bash
mkdir -p docs/.vitepress
npm install -D vitepress
```

<!-- turn: t003 speaker=vincent -->

**我**：文章存储在 `~/.echo-workspace/articles/`，不是 `docs/` 里。怎么让 VitePress 读到它们？

<!-- turn: t004 speaker=claude reply_to=t003 -->

**Claude**：有几种方案：

| 方案 | 优点 | 缺点 |
|------|------|------|
| 构建时复制 | 简单可靠 | 需要额外的构建脚本 |
| 软链接 | 实时同步 | 跨平台问题 |
| 自定义 Vite 插件 | 灵活 | 实现复杂 |

推荐先用 **构建时复制** 方案 — 在 `npm run docs:build` 前跑一个脚本，将 articles/ 复制到 docs/articles/。

---

## 渲染说明

### Turn 标记

Turn 标记使用 HTML 注释格式，VitePress 默认保留它们：

```html
<!-- turn: t001 speaker=vincent -->
```

后续可通过自定义 VitePress 主题插件来美化这些标记的渲染（如添加发言者头像、折叠/展开等）。

### Frontmatter

Echo 的 YAML frontmatter 与 VitePress 的 frontmatter 兼容。VitePress 可读取以下字段：

- `title` — 页面标题
- `tags` — 可用于标签聚合
- `created_at` / `updated_at` — 时间信息

### 评论区

文章底部的 `ECHO_COMMENTS_START` / `ECHO_COMMENTS_END` 区块包含文内批注。VitePress 构建时由注释注入脚本填充。

<!-- ECHO_COMMENTS_START -->

<!-- ECHO_COMMENTS_END -->
