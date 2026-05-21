---
id: ARTICLE-ID
title: "文章标题"
created_at: YYYY-MM-DDTHH:MM:SS+08:00
updated_at: YYYY-MM-DDTHH:MM:SS+08:00
tags: [tag1, tag2]
summary: "一句话描述"
participants:
  - id: vincent
    role: human
  - id: claude
    role: ai
    model: claude-opus-4-7
source_session: session-uuid-here
---

<!--
  格式规范 v2 — convert.js 和 import-sessions.js 必须遵守。

  ## Frontmatter 字段

  | 字段 | 必填 | 说明 |
  |------|------|------|
  | id | 是 | 唯一标识，全小写 + 数字 + 连字符 |
  | title | 是 | 文章标题，双引号包裹 |
  | created_at | 是 | ISO 8601 + 时区偏移（+08:00），精确到秒 |
  | updated_at | 是 | 同上，每次修改时更新 |
  | tags | 是 | YAML 数组，可为空 [] |
  | summary | 是 | 不超过 80 字，双引号包裹 |
  | participants | 是 | 结构化数组，每项含 id / role / model（AI 必须写 model） |
  | source_session | 否 | 仅 JSONL 导入的文章有此字段，记录原始 session UUID |

  ## 废弃字段

  - ai_models（扁平数组）→ 改用 participants
  - ai_model（单数字段）→ 同上

  ## Turn 格式

  - 每个 turn 以 <!-- turn: tNNN speaker=xxx [reply_to=tMMM] --> 开头
  - turn ID 递增：t001, t002, t003...
  - reply_to：AI turn 必须指向它回复的 user turn ID
  - 用户发言：以"我："开头，后面是原始发言
  - AI 发言：以"## ai 的回复"开头，正文完整 markdown
  - 每个 turn 之间空一行
  - 不在正文中写 inline CSS，样式由渲染器统一处理
-->

<!-- turn: t001 speaker=vincent -->
我：用户的原始发言，不润色、不总结。

<!-- turn: t002 speaker=claude reply_to=t001 -->
## ai 的回复

AI 回复正文。支持完整 markdown 格式。

- 列表项
- **加粗**
- `行内代码`

> 引用文字

```js
console.log("hello");
```

<!-- turn: t003 speaker=vincent -->
我：第二轮用户发言。

<!-- turn: t004 speaker=claude reply_to=t003 -->
## ai 的回复（第二轮）

继续回复。

<!-- ECHO_COMMENTS_START -->

<!-- ECHO_COMMENTS_END -->
