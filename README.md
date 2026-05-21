# Echo — 本地优先的 AI 对话知识论坛

将 Claude Code 会话自动转为可搜索、可标注的 Markdown 知识库。

## 安装

```bash
cd echo-prototype
npm install
```

## 快速开始

```bash
# 跑通全管线（buffer → 文章 → 校验 → 评论索引 → 锚点解析）
npm run all

# 搜索
npm run search -- --keyword "你的搜索词" --tag "标签"

# 添加评论
npm run annotate -- --article <id> --quote "原文片段" --comment "你的评论"
```

## CLI

```bash
node bin/echo-mcp.js hook capture     # stdin → session-buffer
node bin/echo-mcp.js hook status      # SessionStart 状态输出
node bin/echo-mcp.js convert          # buffer → 文章
node bin/echo-mcp.js validate         # 校验
node bin/echo-mcp.js resolve          # 锚点解析
```

## 命令

| 命令 | 说明 |
|------|------|
| `npm run convert` | Buffer → 正式文章（加 frontmatter） |
| `npm run validate` | 校验 ID、必填字段、引用完整性 |
| `npm run index` | 评论 → 文章底部评论区 |
| `npm run resolve` | 锚点定位验证 |
| `npm run test` | 23 个单元测试 |
| `npm run verify` | test + validate + resolve |
| `npm run all` | convert → validate → index → resolve |
| `npm run import` | 从 JSONL 导入历史会话 |
| `npm run search -- --keyword "x"` | 全文搜索 |

## 项目结构

```
echo-prototype/
  bin/echo-mcp.js            — CLI 入口
  scripts/
    cli/                     — CLI 层
    lib/
      domain/                — 纯函数（echo-format、anchor）
      usecases/              — 业务编排
      infra/                 — workspace、config
      hooks/                 — capture、status
    convert.js               — Buffer → 文章
    validate.js              — 数据校验
    annotate.js              — 评论工具
    resolve.js               — 锚点解析
    index.js                 — 评论区生成
    search.js                — 全文搜索
  test/                      — 23 个单元测试
```

## 配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `ECHO_WORKSPACE` | `~/.echo-workspace` | 工作区根目录 |
| `ECHO_CAPTURE` | `on` | Hook 捕获开关 |
| `ECHO_USER_SPEAKER` | `vincent` | 用户 speaker 名 |
| `ECHO_AI_SPEAKER` | `ai` | AI speaker 名 |

## 数据流

```
Claude Code hooks → session-buffer/ → convert.js → articles/*.md
                                                     ↓
                                            validate / index / resolve
```
