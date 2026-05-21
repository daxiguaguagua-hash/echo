# 003: 共享 article 渲染模块

发现日期: 2026-05-20 | 状态: 方案已确定 | 来源: 用户审查 convert.js + import-sessions.js

## 问题

`convert.js` 和 `import-sessions.js` 各自独立构建 `article` 字符串（YAML frontmatter + turn body），约 40 行重复的模板字面量。这就是 001-format-alignment 中 5 项格式差异的根因。

## 确定方案: JSON template + 单序列化器

用户提出、Codex + Claude 确认。比“多个 render 函数”更好。

**核心原则:** 脚本只负责“读源数据”，共享模块负责“Echo 格式”。一个出口，脚本不碰 Markdown 拼接。

```
convert.js parseBuffer    →
                              →  createArticle(JSON)  →  toMarkdown()  →  统一 .md
import-sessions.js parseSession →
```

### 新模块: `scripts/lib/echo-format.js`

导出:

| 函数 | 职责 |
|------|------|
| `createArticle({ id, created_at, updated_at, tags, summary, participants, turns, speakers?, source_session? })` | 返回 JSON 样板 |
| `createTurn({ speaker, content, reply_to?, model? })` | 归一化单个 turn，**幂等** (strip 已有前缀) |
| `createParticipant({ id, role, model? })` | 返回标准 participant 对象 |
| `toMarkdown(article)` | **唯一** 序列化出口: JSON → Markdown 字符串 |
| `inferTitle(turns)` | 统一 60 chars |
| `inferSummary(turns)` | 统一 80 chars |
| `extractSessionDate(sessionName)` | 剥离版本后缀 |
| `DEFAULT_SPEAKERS` | `{ human: { id: "vincent", role: "human" }, ai: { id: "ai", role: "ai", model: "unknown" } }` |

### Article JSON 形状

```js
{
  id: "session-2026-05-20",
  title: "...",
  created_at: "2026-05-20T00:00:00+08:00",
  updated_at: "2026-05-20T14:01:48+08:00",
  tags: [],
  summary: "...",
  participants: [
    { id: "vincent", role: "human" },
    { id: "ai", role: "ai", model: "deepseek-v4-pro" }
  ],
  source_session: "optional-session-id",
  turns: [
    { id: "t001", speaker: "vincent", role: "human", content: "原始内容，不含 我：", reply_to: null },
    { id: "t002", speaker: "ai", role: "ai", model: "deepseek-v4-pro", content: "AI 正文，不含 ## ai 的回复", reply_to: "t001" }
  ]
}
```

### 调用方式

```js
const article = echoFormat.createArticle({
  id,
  created_at,
  updated_at: new Date().toISOString(),
  source_session: sessionId,
  turns: rawTurns,
  participants: rawParticipants,
});

const markdown = echoFormat.toMarkdown(article);
fs.writeFileSync(path, markdown);
```

脚本不再手写任何 `---`、`<!-- turn: -->`、`我：`。

## 关键设计决策

### 归一化放共享模块

`createTurn()` 在共享模块里 strip `我：` 和 `## ai 的回复` 前缀，且幂等（已 strip 的不再 strip）。

### YAML 用库，不手搓

项目已有 `gray-matter`，用它做 frontmatter 序列化。手搓 YAML 会遇到: 引号转义、中文、冒号边界、tags 特殊字符、model 名含 `:` 或 `#`。

| 部分 | 做法 |
|---|---|
| frontmatter YAML | `gray-matter` stringify |
| turn body (markdown) | 手写 serializer |
| HTML comment marker | 手写 serializer |
| comments marker | `toMarkdown()` 统一输出 `ECHO_COMMENTS_START/END` |

> 语义正确优先于视觉完全一致。需要视觉一致时加快照测试。

### DEFAULT_SPEAKERS 可覆盖

```js
createArticle({
  speakers: {
    human: { id: "张三", role: "human" },
    ai: { id: "gpt", role: "ai", model: "gpt-5.1" }
  }
})
```

默认值: `ECHO_USER_SPEAKER` env > `echo.json` > `"vincent"` / `"ai"`。

### 重构后各文件职责

| 文件 | 保留内容 |
|------|---------|
| `convert.js` | 读取 buffer、parse 已有 turn marker、调用 createArticle/toMarkdown、写文件 |
| `import-sessions.js` | 读取 JSONL、过滤 noise、提取 raw turns/models/timestamp、调用 createArticle/toMarkdown、写文件 |
| `echo-format.js` | **唯一** 负责 Echo article 输出格式 |

### turn ID 处理

| 来源 | 处理 |
|------|------|
| convert.js (已有 id) | 保留，不重新编号 |
| import-sessions.js (无 id) | `createArticle()` 自动补 `t001, t002...` |

## Gotchas

| 问题 | 建议 |
|------|------|
| convert.js content 已含 `我：` 前缀 | `createTurn()` 幂等 strip |
| JSONL 可能 assistant 先出现 | 允许 `reply_to=null` 或跳过 leading AI turn |
| `created_at` 时区语义错误 | `toISOString()` UTC 伪装 +08:00，模块里统一用正确时区转换 |
| speaker 命名不统一 | 通过 `speakers` 参数覆盖 |
| `ECHO:COMMENT_LIST` legacy | `toMarkdown()` 只输出 `ECHO_COMMENTS_START/END` |
| summary/title 长度不一致 | title 60, summary 80, 统一在共享模块 |
| **Snapshots 防漂移** | 给 `toMarkdown(createArticle(...))` 做快照测试，格式再分叉会直接红 |

## 与旧方案的差异

| | 旧方案 (render functions) | 新方案 (JSON template) |
|---|---|---|
| 出口数 | N 个函数，各自输出字符串 | 1 个 `toMarkdown()` |
| 中间格式 | 无（直接拼字符串） | JSON 对象 |
| 可测试性 | 需要 parse 输出 Markdown | 断言 JSON 结构即可 |
| 脚本职责 | 拼字符串 | 只传数据 |
| 格式漂移风险 | 高（调用方可绕过） | 低（只有一条路径） |

## 参考

- `issues/001-format-alignment.md` — 已修复的 5 项格式差异
- `echo-prototype/ECHO_FORMAT.md` — 格式规范
