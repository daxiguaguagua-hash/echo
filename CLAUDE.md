# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Echo — 本地优先的 AI 对话知识论坛

基于 Markdown + VitePress + MCP 的本地优先知识论坛。所有开发工作发生在 `echo-prototype/` 子目录中。

## 会话启动

每次会话启动时，自动：
1. 读取 `ECHO_STATUS.md` 了解进度（hook 已注入摘要到上下文）
2. 使用 CodeGraph 工具了解代码全貌
3. 向用户简要汇报：当前进度、进行中任务、下一步做什么

## 核心设计约束：文章不可变

Echo 的文章是 **不可变** 的 AI 对话转写。文章正文一旦创建，用户、agent、importer、validator、MCP 工具均不得修改。文章等同于已发表的源记录。所有后续解读通过外部层实现：评论、标注、标签、链接、摘要、派生文章。

Echo 不是 Wiki、CMS 或协作文档编辑器。

### 禁止动作清单

| 场景 | 禁止做法 | 正确做法 |
|------|---------|---------|
| validate 报错 | 改正文让它通过 | 报 validation error，不改原文 |
| Markdown 格式不统一 | 自动格式化正文 | 展示层容错，不改原文 |
| frontmatter 缺失字段 | 打开文件补 frontmatter | 只改 frontmatter，不碰 `---` 之后的内容 |
| import 时发现源数据有误 | 修正再导入 | 用 annotation 标注差异；或重新导入覆盖整篇 |
| convert 生成的文章标题是命令 | 把标题改成人读的 | 用 `alias` frontmatter 字段提供显示标题 |
| 正文有错别字 | 改掉 | 加 annotation |
| 隐私信息泄漏 | 直接删那段文字 | 走独立删除/脱敏脚本 |

### 锚点模型

使用 `quote` / `prefix` / `suffix` / `occurrence` 四个字段。正文不可变 → 锚点创建后不会漂移。锚点解析失败视为 bug 或文件损坏，而非文本漂移。

### 操作指南

- 要纠正错误 → 加 annotation
- 要生成摘要 → 创建派生笔记
- 要组织结构 → 加 tags / links / collection
- 要处理隐私 → 走显式删除/脱敏策略

## 架构

```
echo-prototype/              — Node.js 包，npm 发布为 echoctl
  bin/echoctl.js             — CLI 入口（npm run prepare 生成）
  scripts/
    cli/echoctl.js           — CLI 路由（44 行入口 + 17 个命令模块）
    cli/commands/            — 子命令实现（serve, import, tag, doctor, status, ...）
    lib/
      domain/                — 纯函数领域逻辑（anchor, validation, echo-format, errors）
      usecases/              — 业务用例编排（convert, import, serve, query, write-comment, ...）
      infra/                 — 基础设施（workspace, config, markdown-store, query-log, echo-paths）
      hooks/                 — Hook capture/status 实现
      i18n/                  — 中英双语消息层（en, zh-CN, bilingual）
      interfaces/mcp/        — MCP 协议层（tools schema, JSON-RPC dispatcher）
      mcp-server.js          — MCP 入口（向后兼容 re-export）
    build-docs.js            — VitePress 文档生成器
    serve.js                 — HTTP API + VitePress 服务
  test/                      — Node 原生 test runner，22 个测试文件，357 个测试
```

**分层规则**：
- `domain/` — 纯函数，无 I/O，无文件系统依赖
- `usecases/` — 编排领域逻辑 + 调用 infra，实现具体业务流程
- `infra/` — 文件系统、配置读写、终端 I/O
- `cli/commands/` — 解析参数 → 调用 usecases → 格式化输出

## 工作区数据目录

```
~/.echo-workspace/
  registry.json              — 已注册项目列表
  session-buffer/            — legacy buffer（未注册目录的回退）
  projects/<project-id>/
    session-buffer/          — hook 实时捕获的会话
    articles/                — 正式文章 (.md)
    comments/                — 标注评论
    index/                   — 搜索索引 + live-state.json
  .site/                     — serve 生成的 VitePress 站点
  .serve.json                — 后台 serve 进程状态
  .serve.log                 — serve 运行日志
```

## 关键命令

所有命令在 `echo-prototype/` 下运行。

### 开发和测试

| 命令 | 用途 |
|------|------|
| `npm test` | 运行所有 357 个测试（`node --test`） |
| `node --test test/<file>.js` | 运行单个测试文件 |
| `npm run verify` | 测试 + validate + resolve 全检查 |
| `npm run all` | 完整管线（convert → validate → index → resolve） |
| `npm run build` | 生成 bin/echoctl.js 入口文件 + 验证 CLI（`prepare` 脚本自动运行） |

### 文档开发

| 命令 | 用途 |
|------|------|
| `npm run docs:generate` | 生成文档到 `~/.echo-workspace/.site/` |
| `npm run docs:dev` | 启动 VitePress 开发服务器 |
| `npm run docs:build` | 构建生产文档 |
| `npm run docs:preview` | 预览构建产物 |

### 管线步骤（单独运行）

| 命令 | 用途 |
|------|------|
| `npm run convert` | buffer → 正式文章 |
| `npm run validate` | 校验所有文章和评论 |
| `npm run index` | 构建搜索索引 |
| `npm run resolve` | 解析评论锚点到文章位置 |
| `npm run annotate -- --article <id> --quote "..." --comment "..."` | 添加标注评论 |
| `npm run import` | 导入历史会话（旧版，单项目） |

### echoctl CLI（面向用户）

| 命令 | 用途 |
|------|------|
| `echoctl all` | 手动跑完整管线（所有已注册项目） |
| `echoctl serve` / `echoctl serve --foreground` | 后台/前台启动 Web 服务 |
| `echoctl stop` | 停止后台服务 |
| `echoctl status [--json] [--lang en\|zh-CN]` | 查看 Echo 全面状态 |
| `echoctl doctor` | 诊断配置 |
| `echoctl capture on\|off\|status` | 开/关/查看 AI 聊天收集 |
| `echoctl init` | 初始化工作区 |
| `echoctl init project [--path <dir>]` | 注册项目目录 |
| `echoctl hook install claude --write` | 安装 Claude Code hook |
| `echoctl hook doctor` | 检查 hook 状态 |
| `echoctl project list` / `echoctl project find <id>` | 管理已注册项目 |
| `echoctl tag add/remove/rename/purge` | 标签管理 |
| `echoctl search -- --keyword "词"` | 全文搜索 |
| `echoctl import claude --all --dry-run` / `--apply` | 多项目导入历史会话 |
| `echoctl migrate legacy-buffer --apply` | 迁移 legacy buffer |
| `echoctl refresh` | 不重启 serve 刷新页面 |
| `echoctl mcp` | 启动 MCP server（JSON-RPC over stdio） |

## 开发环境

首次设置：
```bash
cd echo-prototype && npm install && npm link
```

`npm link` 后 `echoctl` 命令全局可用。`bin/echoctl.js` 由 `npm run prepare` 自动生成（不需手动编辑），实际业务逻辑在 `scripts/cli/` 下。

## 路径解析

所有脚本通过 `scripts/lib/infra/workspace.js` 解析工作区路径。
优先级：`ECHO_WORKSPACE` 环境变量 > `echo.json` 配置 > `~/.echo-workspace/` 默认值。

## Issues 工作流

- 新增 issue → `issues/` 下创建 `.md` 描述特征和方案；已关闭的 issue 移至 `issues/archive/`
- `ECHO_STATUS.md` 中留链接指向 issue
- 多步骤变更：参照 `workflows/06-issue-driven.md`（Issue 驱动）和 `workflows/08-industry-workflow.md`（Plan → Build → Local Gates → Status Gate → Human Gate）
- 门禁检查表在 `workflows/gates/`：`invariant-first.md`、`verification-gate.md`

## 做完任何事后的门禁

1. **验证门** — `npm test && npm run all` + 更新 `ECHO_STATUS.md`（日期 + `- [ ]` → `- [x]`）
2. **不可变性门** — 确认没修改文章正文（`<!-- turn:` 之后的内容）
3. **Review 门** — 多文件改动（3+ files 或 net 30+ lines）提交前 `review diff`；单文件小改可跳过

## 发布流程

参照 `echo-prototype/RELEASE.md`：`npm version patch|minor|major` + `git push --follow-tags` 触发 CI 自动测试（Node 18/20/22）→ 发布到 npm。npm 发布账号：`application16`。
