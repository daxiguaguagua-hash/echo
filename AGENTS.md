# Echo — 本地优先的 AI 对话知识论坛

你正在帮助用户开发 Echo 项目。这是一个基于 Markdown + VitePress + MCP 的本地优先知识论坛。

## 会话启动

**每次会话启动时**，自动执行以下操作：
1. 读取 `ECHO_STATUS.md` 了解项目进度（hook 已将摘要注入你的上下文）
2. 使用 Skill 工具调用 gstack 了解项目全貌
3. 向用户简要汇报：当前进度、进行中的任务、下一步做什么

## 核心设计约束：文章不可变

Echo 的文章是 **不可变** 的 AI 对话转写。文章正文一旦创建，用户、agent、importer、validator、MCP 工具均不得修改。文章等同于已发表的源记录。所有后续解读通过外部层实现：评论、标注、标签、链接、摘要、派生文章。

Echo 不是 Wiki、CMS 或协作文档编辑器。它是本地优先的对话归档与注释论坛。

### 关键后果

- 不得实现文章正文编辑功能。
- 不得在 validate 阶段"修正"文章文字。
- 锚点锚定不可变文本，`quote + prefix + suffix + occurrence` 已足够。锚点解析失败 = bug，不是漂移。
- 需要纠正内容 → 加 annotation。需要重新解读 → 创建派生笔记。需要组织结构 → 加 tags/links。
- 需要处理隐私信息 → 走显式删除/脱敏路径，不走常规编辑。

### 禁止动作

| 场景 | 禁止 | 正确 |
|------|------|------|
| validate 报错 | 改正文 | 报错，不改原文 |
| 格式不统一 | 格式化正文 | 展示层容错 |
| 补 frontmatter | 改正文 | 只改 `---` 以内 |
| 正文有错字 | 改掉 | 加 annotation |
| 隐私泄漏 | 删那段 | 独立删除/脱敏脚本 |
| 标题是命令 | 改标题 | 用 `alias` 字段 |

## 项目结构

```
echo-prototype/          — Node.js 原型（数据管线）
  scripts/               — convert.js, validate.js, index.js, resolve.js, annotate.js, import-sessions.js
  scripts/lib/           — workspace.js（统一路径解析）
~/.echo-workspace/       — 工作区（默认路径，可通过 ECHO_WORKSPACE 环境变量覆盖）
  echo.json              — 配置文件
  session-buffer/        — hook 实时捕获的会话 buffer（~/.Codex/hooks/echo-capture.sh）
  articles/              — 正式文章 (.md)
  comments/              — 文内标注评论 (ann-NNN.md)
  index/                 — 搜索索引（未来）
ECHO_STATUS.md           — 项目进度表（活的，随时更新）
~/.gstack/projects/echo-prototype/  — gstack 设计文档
```

## 路径解析

所有脚本通过 `scripts/lib/workspace.js` 的 `resolveWorkspace()` 解析工作区路径。
优先级：`ECHO_WORKSPACE` 环境变量 > `echo.json` 配置 > `~/.echo-workspace/` 默认值。

## 关键命令

- `npm run all` — 跑通完整管线（convert → validate → index → resolve）
- `npm run convert` — 将 buffer 中的原始对话转为正式文章
- `npm run validate` — 校验所有文章和评论
- `npm run import` — 从 `~/.Codex/projects/<project>/*.jsonl` 导入历史会话
- `npm run annotate -- --article <id> --quote "..." --comment "..."` — 添加评论

## 做完任何事后

1. **更新 ECHO_STATUS.md** — 把对应的 `- [ ]` 改成 `- [x]`，保持进度表不过时
2. **跑 `npm run all`** — 验证全管线通过（convert → validate → index → resolve）
3. **来不及修的问题记到 ECHO_STATUS.md** — 放在「后期改进」或「待做」中

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
