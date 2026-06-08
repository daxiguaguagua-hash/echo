# Issue 023 — 非聊天文档自动纳入项目站点

**日期**: 2026-05-30
**来源**: npm 发布流水线阶段提出

## 背景

Echo 当前只把聊天对话转成 VitePress 页面。但项目中有大量有价值的文档：

- `RELEASE.md` — 发布流水线文档
- `workflows/*.md` — 工作流指南
- `ENGINEERING_BOUNDARIES.md` — 工程边界
- `GETTING_STARTED.md` — 入门指南
- `ECHO_FORMAT.md` — 格式规范
- 各 `issues/*.md` — 设计决策记录

这些文档应该能在 VitePress 站点中和聊天文章一起浏览。

## 目标

让 `build-docs.js` 自动发现项目中的非聊天 `.md` 文件，生成对应的 VitePress 页面。

## 约束

- 不修改聊天文章正文（不可变原则）
- 文档独立于聊天文章，有自己的侧边栏分组
- 自动发现，不需要手动改 VitePress config

## 设计方向（待定）

- `build-docs.js` 按规则扫描 `docs/` 和 `echo-prototype/` 下的 `.md`
- 按目录自动生成侧边栏分组
- 排除 `articles/` 和 `session-buffer/`（这些走聊天管线）

## 状态

⏳ 待规划
