---
layout: home

hero:
  name: "Echo 知识库"
  text: "本地优先的 AI 对话知识论坛"
  tagline: 将 AI 对话转化为结构化、可检索、可标注的知识资产
  actions:
    - theme: brand
      text: 浏览文章
      link: /articles/
    - theme: alt
      text: 按标签检索
      link: /tags/

features:
  - icon: "📝"
    title: 自动捕获
    details: Hook 实时捕获 Claude Code 对话，零手动操作
  - icon: "🔍"
    title: 全文搜索
    details: 本地搜索索引，关键词 + 标签过滤
  - icon: "💬"
    title: 批注链
    details: 对文章任意片段追加评论，支持回复链和引用追踪
  - icon: "🔗"
    title: 进化追踪
    details: 文章间的 evolution 引用，追踪知识演进路径
---

## 最近文章

*文章列表将在构建时从 `~/.echo-workspace/articles/` 自动生成。*

> 提示：运行 `npm run all` 确保管线通过，然后 `npm run docs:build` 构建站点。
