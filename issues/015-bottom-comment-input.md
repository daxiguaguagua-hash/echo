# Issue 015: 底部评论输入框

**优先级**: P1  
**状态**: 已完成  
**日期**: 2026-05-27

## 问题描述

`EchoArticleActions.vue` 已有文章级评论表单骨架（textarea + 提交按钮），但缺少三项关键能力：

1. **作者身份未从 echo.json 读取** — 前端 `postComment()` 不传 `author`，后端 `write-comment.js` 硬编码默认 `"vincent"`
2. **不支持回复链** — 后端 `writeComment` 已支持 `evolutionOf`/`evolutionKind`，但前端没有回复入口
3. **提交后全页刷新** — `location.reload()` 体验差

## 实际实现

### Phase 1: 作者身份从 echo.json 读取

- `lib/infra/config.js` — 新增 `getAuthor()`，读取 `echo.json` 的 `author` 字段，默认 `"vincent"`
- `scripts/serve.js` — `/api/status` 响应新增 `author: getAuthor()`；import 新增 `getAuthor`
- `docs/.vitepress/theme/lib/echo-api.ts` — `EchoStatus` interface 新增 `author: string`
- `EchoArticleActions.vue` — `submitComment()` 传 `author: status.value?.author`
- `EchoSelectionComment.vue` — 新增 `useEchoStatus` import + hook call，`startComment()` 传 `author: status.value?.author`
- `test/serve-api.test.js` — status 测试新增 author 断言

### Phase 2: 评论回复链 UI

- `scripts/build-docs.js` — `renderComments()` 每个 `<section class="echo-comment">` 新增 `data-comment-id` 属性
- 新建 `docs/.vitepress/theme/components/EchoCommentReplies.vue` — 扫描静态评论卡片、注入"回复"按钮、内联回复表单、提交时设置 `evolutionOf`
- `docs/.vitepress/theme/index.ts` — 注册 `EchoCommentReplies` 组件
- `docs/.vitepress/theme/Layout.vue` — doc-bottom 插槽添加 `<EchoCommentReplies />`
- `docs/.vitepress/theme/custom.css` — 新增 `.echo-reply-btn`、`.echo-reply-form`、`.echo-reply-btns` 样式

### Phase 3: 提交流程优化

- `EchoArticleActions.vue` — 成功后显示"评论已提交，即将刷新..."，1.2 秒后 reload
- `EchoSelectionComment.vue` — 成功后 0.8 秒延迟 reload
- `EchoCommentReplies.vue` — 成功后显示"回复已提交，即将刷新..."，1.2 秒后 reload

## 涉及文件

| 文件 | 改动 |
|------|------|
| `lib/infra/config.js` | 新增 `getAuthor()` |
| `scripts/serve.js` | `/api/status` 返回 author；import getAuthor |
| `scripts/build-docs.js` | 评论卡片加 `data-comment-id` |
| `docs/.vitepress/theme/lib/echo-api.ts` | `EchoStatus` 新增 author 字段 |
| `docs/.vitepress/theme/components/EchoArticleActions.vue` | 读取 author、成功提示、延迟刷新 |
| `docs/.vitepress/theme/components/EchoSelectionComment.vue` | 读取 author、延迟刷新 |
| `docs/.vitepress/theme/components/EchoCommentReplies.vue` | **新建** — 回复按钮注入 + 内联回复表单 |
| `docs/.vitepress/theme/index.ts` | 注册 EchoCommentReplies |
| `docs/.vitepress/theme/Layout.vue` | doc-bottom 添加 EchoCommentReplies |
| `docs/.vitepress/theme/custom.css` | 回复按钮和表单样式 |
| `test/serve-api.test.js` | status 测试新增 author 断言 |

## 验证

- [x] `npm test` 全绿 (299 pass, 0 fail)
- [x] `npm run all` 通过
- [x] `npm run docs:build` 通过
- [x] build-docs 测试 8/8 通过
